import { normalizeRouteId, ROUTE_COLORS, routeFamily } from "../routes.js";
import { gtfsMinute, gtfsSecond } from "../time.js";
import { getRealtime, getStatic } from "./feeds.js";
import {
  activeServiceIds,
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

  return {
    id: tripId,
    updatedAt: now,
    origin: stopObject(
      tripOriginStopId(staticStopTimes, realtimeStopTimes),
      data.stopsById
    ),
    route: { id: displayRouteId, color: ROUTE_COLORS[routeId] },
    stopTimes,
  };
}
