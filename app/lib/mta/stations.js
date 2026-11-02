import { normalizeRouteId } from "../routes.js";
import { STATION_COMPLEX_STOP_IDS } from "../stationComplexes.js";
import { unixSeconds } from "../time.js";
import { getRealtime, getStatic } from "./feeds.js";
import { activeServiceIds, realtimeRouteIdsByStop } from "./helpers.js";
import { stationStopId } from "./stopIds.js";

let stationComplexCache;

export function buildScheduledRouteIdsByStop(trips, stopTimesByTrip, activeServices) {
  const routesByStop = new Map();

  for (const trip of trips) {
    if (!activeServices.has(trip.service_id)) continue;
    const routeId = normalizeRouteId(trip.route_id);
    if (!routeId) continue;

    const visitedStops = new Set(
      (stopTimesByTrip.get(trip.trip_id) || [])
        .map((stopTime) => stationStopId(stopTime.stop_id))
        .filter(Boolean)
    );
    for (const stopId of visitedStops) {
      const routes = routesByStop.get(stopId) || new Set();
      routes.add(routeId);
      routesByStop.set(stopId, routes);
    }
  }

  return routesByStop;
}

function stationIdFor(stopId, data, stationsById) {
  const baseId = stationStopId(stopId);
  const stop = data.stopsById.get(baseId);
  return stop?.parent_station || (stationsById.has(baseId) ? baseId : null);
}

function createDisjointSet(ids) {
  const parent = new Map(ids.map((id) => [id, id]));

  function root(id) {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current);
    while (parent.get(id) !== id) {
      const next = parent.get(id);
      parent.set(id, current);
      id = next;
    }
    return current;
  }

  function join(firstId, secondId) {
    if (!parent.has(firstId) || !parent.has(secondId)) return;
    const firstRoot = root(firstId);
    const secondRoot = root(secondId);
    if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
  }

  return { has: (id) => parent.has(id), join, root };
}

export async function getRoutes() {
  const { routes } = await getStatic();
  const ids = new Set(routes.map((route) => normalizeRouteId(route.route_id)));
  return { routes: [...ids].map((id) => ({ id })) };
}

export async function getRouteServiceAvailability(requestedRouteId) {
  try {
    const entities = await getRealtime();
    const routeId = normalizeRouteId(requestedRouteId);
    const now = Math.floor(Date.now() / 1000);

    return entities.some(({ tripUpdate: update }) => {
      if (!update?.trip || normalizeRouteId(update.trip.routeId) !== routeId) return false;
      if (update.trip.scheduleRelationship === 3) return false;
      return (update.stopTimeUpdate || []).some((stopTime) => {
        const timestamp = unixSeconds(stopTime.arrival?.time || stopTime.departure?.time);
        return timestamp && timestamp >= now - 60;
      });
    });
  } catch {
    return null;
  }
}

export async function getStations() {
  const [data, realtimeEntities] = await Promise.all([
    getStatic(),
    getRealtime().catch(() => []),
  ]);
  if (
    stationComplexCache?.source === data &&
    stationComplexCache.realtimeSource === realtimeEntities
  ) {
    return stationComplexCache.value;
  }

  const scheduledRoutesByStop = buildScheduledRouteIdsByStop(
    data.trips,
    data.stopTimesByTrip,
    activeServiceIds(data)
  );
  const realtimeRoutesByStop = realtimeRouteIdsByStop(
    realtimeEntities,
    Math.floor(Date.now() / 1000)
  );

  const stations = [...data.stopsById.values()]
    .filter((stop) => stop.location_type === "1")
    .map((stop) => ({
      id: stop.stop_id,
      name: stop.stop_name,
      latitude: Number(stop.stop_lat),
      longitude: Number(stop.stop_lon),
      routes: [...(data.routeIdsByStop.get(stop.stop_id) || [])]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }))
    .filter((station) => (
      station.name &&
      station.routes.length &&
      Number.isFinite(station.latitude) &&
      Number.isFinite(station.longitude)
    ));

  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const sets = createDisjointSet(stations.map((station) => station.id));
  const resolveStationId = (stopId) => stationIdFor(stopId, data, stationsById);

  for (const transfer of data.transfers) {
    const fromId = resolveStationId(transfer.from_stop_id);
    const toId = resolveStationId(transfer.to_stop_id);
    if (fromId && toId) sets.join(fromId, toId);
  }

  for (const memberIds of STATION_COMPLEX_STOP_IDS) {
    const stationIds = memberIds.map(resolveStationId).filter(Boolean);
    const firstId = stationIds.find(sets.has);
    if (!firstId) continue;
    for (const stationId of stationIds) sets.join(firstId, stationId);
  }

  const complexes = new Map();
  for (const station of stations) {
    const key = sets.root(station.id);
    const members = complexes.get(key) || [];
    members.push(station);
    complexes.set(key, members);
  }

  const value = [...complexes.values()]
    .map((members) => {
      const name = [...members].sort(
        (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)
      )[0].name;
      return {
        id: members[0].id,
        name,
        latitude: members.reduce((sum, station) => sum + station.latitude, 0) / members.length,
        longitude: members.reduce((sum, station) => sum + station.longitude, 0) / members.length,
        services: members.map(({ id, routes }) => ({
          id,
          routes,
          scheduledRoutes: [...(scheduledRoutesByStop.get(id) || [])]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
          realtimeRoutes: [...(realtimeRoutesByStop.get(id) || [])]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  stationComplexCache = { source: data, realtimeSource: realtimeEntities, value };
  return value;
}
