import { normalizeRouteId, ROUTE_COLORS, routeFamily } from "../routes.js";
import { gtfsMinute, gtfsSecond } from "../time.js";
import { getRealtime, getStatic } from "./feeds.js";
import {
  activeServiceIds,
  tripHasDeparted,
  compatibleStopTime,
  displayTripRouteId,
  interchangeRouteIds,
  realtimeRouteIdsByStop,
  stopObject,
} from "./helpers.js";
import { isPublicStopId } from "./stopIds.js";
import {
  realtimePathDiffersFromStatic,
  trimStaticPathToRealtimeTerminal,
  tripOriginStopId,
} from "./tripPath.js";
import { buildRealtimeStationVehicles, snapVehiclesToLines } from "./map.js";

const MAX_TRIP_MAP_POINTS = 700;

function stopCoordinates(stopTimes) {
  return stopTimes
    .map((stopTime) => [
      Number(stopTime.stop?.longitude),
      Number(stopTime.stop?.latitude),
    ])
    .filter(([longitude, latitude]) => (
      Number.isFinite(longitude) && Number.isFinite(latitude)
    ));
}

function tripMapCoordinates(data, staticTrip, stopTimes, realtimePathIsAuthoritative) {
  if (realtimePathIsAuthoritative || !staticTrip?.shape_id) {
    return stopCoordinates(stopTimes);
  }

  const shapePoints = data.shapes
    .filter((point) => point.shape_id === staticTrip.shape_id)
    .sort((left, right) => (
      Number(left.shape_pt_sequence) - Number(right.shape_pt_sequence)
    ));
  const stride = Math.max(1, Math.ceil(shapePoints.length / MAX_TRIP_MAP_POINTS));
  const coordinates = shapePoints
    .filter((_, index) => index % stride === 0 || index === shapePoints.length - 1)
    .map((point) => [Number(point.shape_pt_lon), Number(point.shape_pt_lat)])
    .filter(([longitude, latitude]) => (
      Number.isFinite(longitude) && Number.isFinite(latitude)
    ));

  return coordinates.length >= 2 ? coordinates : stopCoordinates(stopTimes);
}

function reportedTripVehicle(entities, tripId, routeId, color) {
  const vehicle = entities.find((item) => item.vehicle?.trip?.tripId === tripId)?.vehicle;
  const longitude = Number(vehicle?.position?.longitude);
  const latitude = Number(vehicle?.position?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const directionBearing = Number(vehicle.position.bearing);
  return {
    id: tripId,
    routeId,
    color,
    longitude,
    latitude,
    directionBearing: Number.isFinite(directionBearing) ? directionBearing : 0,
  };
}

function findStaticTrip(data, update, tripId, routeId, activeServices) {
  const realtimeStopIds = new Set((update.stopTimeUpdate || []).map((item) => item.stopId));
  let matches = data.trips.filter(
    (trip) => trip.trip_id === tripId || trip.trip_id.endsWith(`_${tripId}`)
  );
  const encodedStart = Number(tripId.split("_")[0]);
  const scheduledStartMinute = Number.isFinite(encodedStart) ? encodedStart / 100 : null;
  const realtimeDirection = update.stopTimeUpdate?.[0]?.stopId?.match(/[NS]$/)?.[0];

  if (!matches.length && scheduledStartMinute !== null) {
    matches = data.trips.filter((trip) => {
      if (routeFamily(trip.route_id) !== routeFamily(routeId)) return false;
      if (!activeServices.has(trip.service_id)) return false;

      const firstStop = data.stopTimesByTrip.get(trip.trip_id)?.[0];
      const firstMinute = gtfsMinute(firstStop?.departure_time || firstStop?.arrival_time);
      const directionMatches = !realtimeDirection || firstStop?.stop_id?.endsWith(realtimeDirection);
      return directionMatches && firstMinute !== null && Math.abs(firstMinute - scheduledStartMinute) <= 10;
    });
  }

  return matches
    .map((trip) => {
      const stops = data.stopTimesByTrip.get(trip.trip_id) || [];
      const matchingStops = stops.filter((stop) => realtimeStopIds.has(stop.stop_id)).length;
      const firstMinute = gtfsMinute(stops[0]?.departure_time || stops[0]?.arrival_time);
      const timeDifference = scheduledStartMinute !== null && firstMinute !== null
        ? Math.abs(firstMinute - scheduledStartMinute)
        : 0;
      return {
        trip,
        score: (
          matchingStops * 1000 +
          (activeServices.has(trip.service_id) ? 100 : 0) -
          timeDifference * 10 +
          stops.length
        ),
      };
    })
    .sort((a, b) => b.score - a.score)[0]?.trip;
}

function mergeScheduledAndRealtimeStops({
  displayedStaticStopTimes,
  exactStaticMatch,
  now,
  realtimeStopTimes,
  staticTrip,
  update,
  stopsById,
}) {
  const realtimeBySequence = new Map(
    realtimeStopTimes
      .filter((item) => item.stopSequence != null)
      .map((item) => [Number(item.stopSequence), item])
  );
  const realtimeByStop = new Map(realtimeStopTimes.map((item) => [item.stopId, item]));
  const merged = displayedStaticStopTimes.map((staticStopTime, index) => {
    const realtimeStopTime = realtimeByStop.get(staticStopTime.stop_id) || (
      exactStaticMatch
        ? realtimeBySequence.get(Number(staticStopTime.stop_sequence))
        : undefined
    );
    const scheduledSecond = gtfsSecond(
      staticStopTime.arrival_time || staticStopTime.departure_time
    );
    const realtimeItem = realtimeStopTime
      ? compatibleStopTime(realtimeStopTime, update, stopsById, now)
      : null;
    return {
      index,
      scheduledSecond,
      realtimeTimestamp: realtimeItem?.arrival?.time || realtimeItem?.departure?.time,
      item: realtimeItem || { stop: stopObject(staticStopTime.stop_id, stopsById) },
    };
  });
  const anchors = merged
    .filter((entry) => entry.realtimeTimestamp && entry.scheduledSecond !== null)
    .map((entry) => ({
      index: entry.index,
      offset: Number(entry.realtimeTimestamp) - entry.scheduledSecond,
    }));

  return merged.map((entry) => {
    if (entry.realtimeTimestamp || entry.scheduledSecond === null || !anchors.length) {
      return {
        ...entry.item,
        future: entry.realtimeTimestamp ? Number(entry.realtimeTimestamp) >= now : false,
      };
    }
    const anchor = anchors.reduce((nearest, candidate) => (
      Math.abs(candidate.index - entry.index) < Math.abs(nearest.index - entry.index)
        ? candidate
        : nearest
    ));
    const estimatedTime = entry.scheduledSecond + anchor.offset;
    return {
      ...entry.item,
      arrival: { time: estimatedTime },
      departure: { time: estimatedTime },
      future: estimatedTime >= now,
      estimated: true,
    };
  });
}

export async function getTrip(requestedRouteId, tripId) {
  const [data, entities] = await Promise.all([getStatic(), getRealtime()]);
  const entity = entities.find((item) => item.tripUpdate?.trip?.tripId === tripId);
  if (!entity?.tripUpdate) throw new Error("MTA realtime trip not found");

  const now = Math.floor(Date.now() / 1000);
  const update = entity.tripUpdate;
  const routeId = normalizeRouteId(update.trip.routeId || requestedRouteId);
  const routesByStop = realtimeRouteIdsByStop(entities, now);
  const staticTrip = findStaticTrip(data, update, tripId, routeId, activeServiceIds(data));
  const staticStopTimes = data.stopTimesByTrip.get(staticTrip?.trip_id) || [];
  const realtimeStopTimes = (update.stopTimeUpdate || []).filter(
    (stopTime) => isPublicStopId(stopTime.stopId, data.stopsById)
  );
  const displayedStaticStopTimes = trimStaticPathToRealtimeTerminal(
    realtimeStopTimes,
    staticStopTimes
  );
  const realtimePathIsAuthoritative = realtimePathDiffersFromStatic(
    realtimeStopTimes,
    displayedStaticStopTimes
  );
  const exactStaticMatch = (
    staticTrip?.trip_id === tripId || staticTrip?.trip_id?.endsWith(`_${tripId}`)
  );

  let stopTimes = displayedStaticStopTimes.length && !realtimePathIsAuthoritative
    ? mergeScheduledAndRealtimeStops({
        displayedStaticStopTimes,
        exactStaticMatch,
        now,
        realtimeStopTimes,
        staticTrip,
        update,
        stopsById: data.stopsById,
      })
    : realtimeStopTimes.map((item) => compatibleStopTime(item, update, data.stopsById, now));

  const displayRouteId = displayTripRouteId(
    staticTrip?.route_id || routeId,
    staticTrip,
    update.stopTimeUpdate,
    data
  );
  stopTimes = stopTimes.map((stopTime) => ({
    ...stopTime,
    transferRoutes: interchangeRouteIds(
      stopTime.stop?.id,
      data,
      displayRouteId,
      routesByStop
    ),
  }));

  const mapCoordinates = tripMapCoordinates(
    data,
    staticTrip,
    stopTimes,
    realtimePathIsAuthoritative
  );
  const routeColor = `#${ROUTE_COLORS[routeId] || "808183"}`;
  const reportedVehicle = reportedTripVehicle(
    entities,
    tripId,
    displayRouteId,
    routeColor
  );
  const vehicle = tripHasDeparted(update, data, now) ? snapVehiclesToLines(
    reportedVehicle
      ? [reportedVehicle]
      : buildRealtimeStationVehicles([entity], data.stopsById, [displayRouteId], now, data),
    mapCoordinates.length >= 2 ? [{
      type: "Feature",
      properties: {
        color: routeColor,
        offset: 0,
        routeId: displayRouteId,
      },
      geometry: { type: "LineString", coordinates: mapCoordinates },
    }] : []
  )[0] || null : null;

  return {
    id: tripId,
    updatedAt: now,
    origin: stopObject(
      tripOriginStopId(staticStopTimes, realtimeStopTimes),
      data.stopsById
    ),
    route: { id: displayRouteId, color: ROUTE_COLORS[routeId] },
    mapCoordinates,
    vehicle,
    stopTimes,
  };
}
