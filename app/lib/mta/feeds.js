import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { normalizeRouteId } from "../routes.js";
import { STATION_COMPLEX_STOP_IDS } from "../stationComplexes.js";
import { stationStopId, tripLookupId } from "./stopIds.js";

const STATIC_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";
const REALTIME_BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds";
const ALERTS_URL = `${REALTIME_BASE}/camsys%2Fsubway-alerts.json`;
const STATIC_CACHE_MS = 6 * 60 * 60 * 1000;
const REALTIME_CACHE_MS = 15 * 1000;
const ALERTS_CACHE_MS = 30 * 1000;
const STATIC_TIMEOUT_MS = 15 * 1000;
const LIVE_TIMEOUT_MS = 6 * 1000;
const REGULAR_STOP_MINIMUM_TRIP_SHARE = 0.05;
const REALTIME_FEEDS = [
  "gtfs", "gtfs-ace", "gtfs-bdfm", "gtfs-g", "gtfs-jz",
  "gtfs-l", "gtfs-nqrw", "gtfs-si",
];

const feedCache = new Map();
const pendingFeeds = new Map();

async function cachedFeed(key, ttl, load) {
  const previous = feedCache.get(key);
  if (previous && Date.now() - previous.loadedAt < ttl) return previous.data;

  if (!pendingFeeds.has(key)) {
    const request = load()
      .then((data) => {
        feedCache.set(key, { loadedAt: Date.now(), data });
        return data;
      })
      .finally(() => pendingFeeds.delete(key));
    pendingFeeds.set(key, request);
  }

  try {
    return await pendingFeeds.get(key);
  } catch (error) {
    if (previous) return previous.data;
    throw error;
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = LIVE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function csv(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return [];
  return parse(entry.getData().toString("utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });
}

export function buildRegularRouteIdsByStop(trips, stopTimesByTrip) {
  const tripCountsByRoute = new Map();
  const stopTripCounts = new Map();

  for (const trip of trips) {
    const routeId = normalizeRouteId(trip.route_id);
    if (!routeId) continue;
    tripCountsByRoute.set(routeId, (tripCountsByRoute.get(routeId) || 0) + 1);

    const visitedStops = new Set(
      (stopTimesByTrip.get(trip.trip_id) || []).map((stop) => stationStopId(stop.stop_id))
    );
    for (const stopId of visitedStops) {
      const routeCounts = stopTripCounts.get(stopId) || new Map();
      routeCounts.set(routeId, (routeCounts.get(routeId) || 0) + 1);
      stopTripCounts.set(stopId, routeCounts);
    }
  }

  return new Map([...stopTripCounts].map(([stopId, routeCounts]) => [
    stopId,
    new Set([...routeCounts]
      .filter(([routeId, stopTrips]) => (
        stopTrips / tripCountsByRoute.get(routeId) >= REGULAR_STOP_MINIMUM_TRIP_SHARE
      ))
      .map(([routeId]) => routeId)),
  ]));
}

export async function getStatic() {
  return cachedFeed("static", STATIC_CACHE_MS, loadStatic);
}

async function loadStatic() {
  // The GTFS zip exceeds Next.js's 2 MB data-cache limit, so this module uses
  // a six-hour in-memory cache and also merges concurrent refresh requests.
  const response = await fetchWithTimeout(
    STATIC_URL,
    { cache: "no-store" },
    STATIC_TIMEOUT_MS
  );
  if (!response.ok) throw new Error(`MTA static GTFS failed: ${response.status}`);
  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const routes = csv(zip, "routes.txt");
  const stops = csv(zip, "stops.txt");
  const trips = csv(zip, "trips.txt");
  const stopTimes = csv(zip, "stop_times.txt");
  const calendar = csv(zip, "calendar.txt");
  const calendarDates = csv(zip, "calendar_dates.txt");
  const transfers = csv(zip, "transfers.txt");
  const shapes = csv(zip, "shapes.txt");
  const shapesById = new Map();
  for (const point of shapes) {
    const shapePoints = shapesById.get(point.shape_id) || [];
    shapePoints.push(point);
    shapesById.set(point.shape_id, shapePoints);
  }
  for (const shapePoints of shapesById.values()) {
    shapePoints.sort((left, right) => (
      Number(left.shape_pt_sequence) - Number(right.shape_pt_sequence)
    ));
  }

  const stopsById = new Map(stops.map((stop) => [stop.stop_id, stop]));
  const tripsById = new Map(trips.map((trip) => [trip.trip_id, trip]));
  const tripsByRealtimeId = new Map();
  for (const trip of trips) {
    const separator = trip.trip_id.indexOf("_");
    const realtimeId = separator >= 0 ? trip.trip_id.slice(separator + 1) : trip.trip_id;
    tripsByRealtimeId.set(tripLookupId(realtimeId), trip);
  }

  const stopTimesByTrip = new Map();
  for (const stopTime of stopTimes) {
    const tripStopTimes = stopTimesByTrip.get(stopTime.trip_id) || [];
    tripStopTimes.push(stopTime);
    stopTimesByTrip.set(stopTime.trip_id, tripStopTimes);

  }
  for (const tripStopTimes of stopTimesByTrip.values()) {
    tripStopTimes.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }
  // A few planned-work trips may use a station temporarily. Station bullets
  // represent regular service, while those trips still remain in realtime data.
  const routeIdsByStop = buildRegularRouteIdsByStop(trips, stopTimesByTrip);

  const sirLocalStopIds = trips
    .filter((trip) => normalizeRouteId(trip.route_id) === "SI")
    .map((trip) => (stopTimesByTrip.get(trip.trip_id) || []).map((item) => stationStopId(item.stop_id)))
    .sort((a, b) => b.length - a.length)[0] || [];

  const transferStopIdsByStop = new Map();
  const connectStops = (firstId, secondId) => {
    const first = stationStopId(firstId);
    const second = stationStopId(secondId);
    if (!first || !second || first === second) return;
    const firstConnections = transferStopIdsByStop.get(first) || new Set();
    const secondConnections = transferStopIdsByStop.get(second) || new Set();
    firstConnections.add(second);
    secondConnections.add(first);
    transferStopIdsByStop.set(first, firstConnections);
    transferStopIdsByStop.set(second, secondConnections);
  };
  for (const transfer of transfers) {
    connectStops(transfer.from_stop_id, transfer.to_stop_id);
  }
  for (const memberIds of STATION_COMPLEX_STOP_IDS) {
    for (let index = 1; index < memberIds.length; index += 1) {
      connectStops(memberIds[0], memberIds[index]);
    }
  }

  const data = {
    routes,
    stopsById,
    trips,
    tripsById,
    tripsByRealtimeId,
    stopTimesByTrip,
    sirLocalStopIds,
    calendar,
    calendarDates,
    transfers,
    shapes,
    shapesById,
    routeIdsByStop,
    transferStopIdsByStop,
  };
  return data;
}

export async function getRealtime() {
  return cachedFeed("realtime", REALTIME_CACHE_MS, loadRealtime);
}

async function loadRealtime() {
  const results = await Promise.allSettled(REALTIME_FEEDS.map(async (feed) => {
    const response = await fetchWithTimeout(
      `${REALTIME_BASE}/nyct%2F${feed}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`MTA realtime ${feed} failed: ${response.status}`);
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(await response.arrayBuffer())
    );
  }));
  const entities = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value.entity || [] : []
  );
  if (!entities.length) throw new Error("All MTA realtime feeds failed");

  const preferredByTrip = new Map();
  const vehicleByTrip = new Map();
  for (const entity of entities) {
    const tripId = entity.tripUpdate?.trip?.tripId;
    if (tripId) {
      const current = preferredByTrip.get(tripId);
      const stopCount = entity.tripUpdate.stopTimeUpdate?.length || 0;
      const currentStopCount = current?.tripUpdate?.stopTimeUpdate?.length || 0;
      if (!current || stopCount > currentStopCount) preferredByTrip.set(tripId, entity);
    }
    const vehicleTripId = entity.vehicle?.trip?.tripId;
    if (vehicleTripId) vehicleByTrip.set(vehicleTripId, entity);
  }
  return [...preferredByTrip.values(), ...vehicleByTrip.values()];
}

export async function getAlertsFeed() {
  return cachedFeed("alerts", ALERTS_CACHE_MS, loadAlertsFeed);
}

async function loadAlertsFeed() {
  const response = await fetchWithTimeout(ALERTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`MTA alerts failed: ${response.status}`);
  const feed = await response.json();
  const data = (feed.entity || []).map((entity) => {
    const raw = entity.alert || {};
    return {
      id: entity.id,
      alert: {
        activePeriod: raw.active_period || [],
        informedEntity: (raw.informed_entity || []).map((item) => ({ routeId: item.route_id })),
        cause: raw.cause,
        headerText: raw.header_text,
        descriptionText: raw.description_text,
        mercury: raw["transit_realtime.mercury_alert"],
      },
    };
  });
  return data;
}
