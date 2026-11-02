import { ROUTE_COLORS, routeFamily } from "../routes.js";
import {
  currentNewYorkSecond,
  gtfsSecond,
  tripIdStartSecond,
  tripStartTimestamp,
} from "../time.js";
import { getRealtime, getStatic } from "./feeds.js";
import {
  compatibleStopTime,
  connectedStopIds,
  displayTripRouteId,
  realtimeRouteIdsByStop,
  stopObject,
} from "./helpers.js";
import { getStationMetadata } from "./metadata.js";
import { stationStopId, tripLookupId } from "./stopIds.js";

function transferRoutesAtStop(stopId, baseStopId, routesByStop) {
  const baseRoutes = [...(routesByStop.get(baseStopId) || [])];
  return [...new Set([...(routesByStop.get(stopId) || [])].map(routeFamily))]
    .filter((routeId) => (
      !baseRoutes.some((baseRouteId) => routeFamily(baseRouteId) === routeFamily(routeId))
    ))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function getStop(id) {
  const [data, entities, metadata] = await Promise.all([
    getStatic(),
    getRealtime(),
    getStationMetadata(),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const serviceStart = now - currentNewYorkSecond();
  const routesByStop = realtimeRouteIdsByStop(entities, now);
  const stopTimes = [];
  const baseStopId = stationStopId(id);
  const baseStopName = stopObject(baseStopId, data.stopsById).name.trim().toLocaleLowerCase();
  const connectedIds = connectedStopIds(baseStopId, data);
  const stationStopIds = new Set(
    [...connectedIds].filter((stopId) => (
      stopObject(stopId, data.stopsById).name.trim().toLocaleLowerCase() === baseStopName
    ))
  );
  stationStopIds.add(baseStopId);
  const services = [...stationStopIds]
    .map((stopId) => ({
      id: stopId,
      routes: [...(data.routeIdsByStop.get(stopId) || [])]
        .map(routeFamily)
        .filter(Boolean)
        .filter((routeId, index, routeIds) => routeIds.indexOf(routeId) === index)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }))
    .filter((service) => service.routes.length);

  for (const entity of entities) {
    const update = entity.tripUpdate;
    if (!update?.trip) continue;

    const match = update.stopTimeUpdate?.find(
      (item) => stationStopIds.has(stationStopId(item.stopId))
    );
    if (!match) continue;

    const item = compatibleStopTime(match, update, data.stopsById, now);
    if (!item.future) continue;

    const staticTrip = data.tripsByRealtimeId.get(tripLookupId(update.trip.tripId));
    const routeId = displayTripRouteId(
      update.trip.routeId,
      staticTrip,
      update.stopTimeUpdate,
      data
    );
    const tripStopTimes = data.stopTimesByTrip.get(staticTrip?.trip_id) || [];
    const matchedStationId = stationStopId(match.stopId);
    const scheduledStop = tripStopTimes.find(
      (stop) => stationStopId(stop.stop_id) === matchedStationId
    );
    const firstScheduledStop = tripStopTimes[0];
    const staticStartSecond = gtfsSecond(
      firstScheduledStop?.departure_time || firstScheduledStop?.arrival_time
    );
    const realtimeStartSecond = gtfsSecond(update.trip.startTime);
    const encodedStartSecond = tripIdStartSecond(update.trip.tripId);
    const tripStartSecond = realtimeStartSecond ?? encodedStartSecond ?? staticStartSecond;
    const tripStart = tripStartTimestamp(update.trip.startDate, tripStartSecond)
      ?? (tripStartSecond === null ? null : serviceStart + tripStartSecond);
    const scheduledSecond = gtfsSecond(
      scheduledStop?.arrival_time || scheduledStop?.departure_time
    );
    const realtimeTimestamp = Number(item.arrival?.time || item.departure?.time);
    const reportedDelay = Number(
      match.arrival?.delay ?? match.departure?.delay ?? update.delay
    );
    const calculatedDelay = scheduledSecond === null
      ? NaN
      : realtimeTimestamp - (serviceStart + scheduledSecond);
    const delaySeconds = Number.isFinite(reportedDelay) ? reportedDelay : calculatedDelay;

    stopTimes.push({
      ...item,
      notDeparted: tripStart !== null && tripStart > now,
      delayMinutes: Number.isFinite(delaySeconds) && delaySeconds >= 180 && delaySeconds < 7200
        ? Math.round(delaySeconds / 60)
        : undefined,
      trip: { id: update.trip.tripId, route: { id: routeId, color: ROUTE_COLORS[routeId] } },
      destination: {
        ...item.destination,
        borough: metadata.boroughByStopId.get(stationStopId(item.destination.id)) || null,
      },
      headsign: item.destination.name,
    });
  }

  stopTimes.sort(
    (a, b) => (a.arrival?.time || a.departure?.time) - (b.arrival?.time || b.departure?.time)
  );

  const transfers = [...connectedIds]
    .filter((stopId) => !stationStopIds.has(stopId))
    .map((transferStopId) => ({
      stop: stopObject(transferStopId, data.stopsById),
      routes: transferRoutesAtStop(transferStopId, baseStopId, routesByStop),
    }))
    .filter((transfer) => transfer.routes.length);

  return {
    id,
    name: stopObject(id, data.stopsById).name,
    borough: metadata.boroughByStopId.get(stationStopId(id)) || null,
    accessible: metadata.accessibleIds.has(stationStopId(id)),
    stopTimes,
    services,
    transfers,
    generatedAt: now,
  };
}
