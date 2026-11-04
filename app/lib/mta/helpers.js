import { normalizeRouteId, routeFamily } from "../routes.js";
import { currentNewYorkSecond, gtfsMinute, gtfsSecond, tripIdStartSecond, tripStartTimestamp, unixSeconds } from "../time.js";
import { isPublicStopId, stationStopId, tripLookupId } from "./stopIds.js";

const NEW_YORK_SERVICE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "long",
});

export function activeServiceIds(data) {
  const parts = NEW_YORK_SERVICE_DATE.formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const date = `${part("year")}${part("month")}${part("day")}`;
  const weekday = part("weekday")?.toLowerCase();
  const active = new Set(
    data.calendar
      .filter((service) => (
        service.start_date <= date &&
        service.end_date >= date &&
        service[weekday] === "1"
      ))
      .map((service) => service.service_id)
  );

  for (const exception of data.calendarDates.filter((item) => item.date === date)) {
    if (exception.exception_type === "1") active.add(exception.service_id);
    if (exception.exception_type === "2") active.delete(exception.service_id);
  }

  return active;
}

export function realtimeRouteIdsByStop(entities, now) {
  const routesByStop = new Map();

  for (const entity of entities) {
    const update = entity.tripUpdate;
    if (!update?.trip?.routeId) continue;

    const routeId = normalizeRouteId(update.trip.routeId);
    for (const stopTime of update.stopTimeUpdate || []) {
      const timestamp = unixSeconds(stopTime.arrival?.time || stopTime.departure?.time);
      if (!timestamp || timestamp < now) continue;

      const stopId = stationStopId(stopTime.stopId);
      if (!stopId) continue;

      const routes = routesByStop.get(stopId) || new Set();
      routes.add(routeId);
      routesByStop.set(stopId, routes);
    }
  }

  return routesByStop;
}

export function stopObject(stopId, stopsById) {
  const stop = stopsById.get(stopId) || stopsById.get(stationStopId(stopId));
  return {
    id: stopId,
    name: stop?.stop_name || stopId,
    latitude: stop?.stop_lat ? Number(stop.stop_lat) : null,
    longitude: stop?.stop_lon ? Number(stop.stop_lon) : null,
    accessible: stop?.wheelchair_boarding === "1",
  };
}

export function displayTripRouteId(baseRouteId, trip, stopTimes, data) {
  const routeId = normalizeRouteId(baseRouteId);
  if (routeId !== "SI") return routeId;

  const staticTrip = trip || data.tripsByRealtimeId.get(trip?.trip_id);
  const pattern = staticTrip
    ? data.stopTimesByTrip.get(staticTrip.trip_id) || []
    : stopTimes || [];
  const indexes = pattern
    .map((item) => item.stop_id || item.stopId)
    .filter(Boolean)
    .map((stopId) => data.sirLocalStopIds.indexOf(stationStopId(stopId)))
    .filter((index) => index >= 0);
  const express = indexes.some(
    (index, position) => position > 0 && Math.abs(index - indexes[position - 1]) > 1
  );
  return express ? "SIX" : "SI";
}

export function connectedStopIds(stopId, data) {
  const baseStopId = stationStopId(stopId);
  const connectedStops = new Set([baseStopId]);
  const queue = [baseStopId];

  while (queue.length) {
    const currentStopId = queue.shift();
    for (const nextId of data.transferStopIdsByStop.get(currentStopId) || []) {
      if (connectedStops.has(nextId)) continue;
      connectedStops.add(nextId);
      queue.push(nextId);
    }
  }

  return connectedStops;
}

export function interchangeRouteIds(stopId, data, currentRouteId, routesByStop) {
  const routes = new Set();
  for (const connectedStopId of connectedStopIds(stopId, data)) {
    for (const connectedRouteId of routesByStop.get(connectedStopId) || []) {
      if (routeFamily(connectedRouteId) !== routeFamily(currentRouteId)) {
        routes.add(routeFamily(connectedRouteId));
      }
    }
  }
  return [...routes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function compatibleStopTime(update, trip, stopsById, now) {
  const arrival = unixSeconds(update.arrival?.time);
  const departure = unixSeconds(update.departure?.time);
  const timestamp = arrival || departure;
  const destinationId = [...(trip.stopTimeUpdate || [])]
    .reverse()
    .find((item) => isPublicStopId(item.stopId, stopsById))?.stopId || "";

  return {
    stop: stopObject(update.stopId, stopsById),
    arrival: arrival ? { time: arrival } : undefined,
    departure: departure ? { time: departure } : undefined,
    future: timestamp ? timestamp >= now : false,
    destination: stopObject(destinationId, stopsById),
  };
}

export function tripsNearCurrentTime(trips, stopTimesByTrip, nowMinute, windowMinutes = 120) {
  return trips.filter((trip) => {
    const firstStop = stopTimesByTrip.get(trip.trip_id)?.[0];
    const departureMinute = gtfsMinute(firstStop?.departure_time || firstStop?.arrival_time);
    if (departureMinute === null) return false;
    return Math.min(
      Math.abs(departureMinute - nowMinute),
      Math.abs(departureMinute - (nowMinute + 1440))
    ) <= windowMinutes;
  });
}

export function tripHasDeparted(update, data, now) {
  if (!update?.trip || update.trip.scheduleRelationship === 3) return false;
  const staticTrip = data?.tripsByRealtimeId.get(tripLookupId(update.trip.tripId));
  const scheduledStops = data?.stopTimesByTrip.get(staticTrip?.trip_id) || [];
  const origin = scheduledStops[0];
  const startSecond = gtfsSecond(update.trip.startTime)
    ?? tripIdStartSecond(update.trip.tripId)
    ?? gtfsSecond(origin?.departure_time || origin?.arrival_time);
  const start = tripStartTimestamp(update.trip.startDate, startSecond)
    ?? (startSecond === null ? null : now - currentNewYorkSecond() + startSecond);
  if (start !== null && start > now) return false;
  const originUpdate = origin && update.stopTimeUpdate?.find((item) => item.stopId === origin.stop_id);
  const departure = unixSeconds(originUpdate?.departure?.time ?? originUpdate?.arrival?.time);
  return !(departure > now);
}
