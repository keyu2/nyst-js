import { ROUTE_ALIASES, ROUTE_COLORS, routeFamily } from "./routes.js";
import { isPublicStopId, stationStopId } from "./mta/stopIds.js";
import { getRealtime, getStatic } from "./mta/feeds.js";
import {
  activeServiceIds,
  interchangeRouteIds,
  realtimeRouteIdsByStop,
  stopObject,
  tripsNearCurrentTime,
} from "./mta/helpers.js";
import { getStationMetadata } from "./mta/metadata.js";
import {
  applyRealtimeDetour,
  alertSectionStopIds,
  countActiveRuns,
  extendShortTurnPattern,
  isSplitServiceAlert,
  mostCompletePattern,
  offRouteTerminalBranches,
} from "./mta/routePattern.js";
import { buildARouteBranches, buildFiveRouteBranches } from "./mta/routeBranches.js";
import { currentNewYorkMinute, unixSeconds } from "./time.js";
import { getRouteAlerts } from "./mta/alerts.js";

export { getRouteAlerts, getRouteStatuses } from "./mta/alerts.js";
export {
  getRoutes,
  getRouteServiceAvailability,
  getStations,
} from "./mta/stations.js";
export { getStop } from "./mta/stop.js";
export { getTrip } from "./mta/trip.js";

function collectTripPatterns(trips, stopTimesByTrip, directionId) {
  const patterns = new Map();

  for (const trip of trips) {
    if (trip.direction_id !== directionId) continue;

    const stopIds = (stopTimesByTrip.get(trip.trip_id) || []).map((item) =>
      stationStopId(item.stop_id)
    );
    if (!stopIds.length) continue;

    const key = stopIds.join(",");
    const pattern = patterns.get(key) || { count: 0, stopIds };
    pattern.count += 1;
    patterns.set(key, pattern);
  }

  return [...patterns.values()];
}

function mostFrequentPattern(patterns) {
  return [...patterns].sort(
    (left, right) =>
      right.count - left.count || right.stopIds.length - left.stopIds.length
  )[0];
}

export async function getRoute(id) {
  const [data, metadata, routeAlerts] = await Promise.all([
    getStatic(),
    getStationMetadata(),
    getRouteAlerts(id).catch(() => []),
  ]);
  let realtimeEntities = [];
  try {
    realtimeEntities = await getRealtime();
  } catch {
    realtimeEntities = [];
  }
  const realtimeRoutesByStop = realtimeRouteIdsByStop(
    realtimeEntities,
    Math.floor(Date.now() / 1000)
  );
  let activeRouteStopIds = new Set();
  let hasRealtimeRouteService = false;
  const routeStop = (stopId) => {
    const transferRoutes = interchangeRouteIds(stopId, data, id, realtimeRoutesByStop);
    return {
      ...stopObject(stopId, data.stopsById),
      accessible: metadata.accessibleIds.has(stationStopId(stopId)),
      borough: metadata.boroughByStopId.get(stationStopId(stopId)) || null,
      transferRoutes,
      hasService: hasRealtimeRouteService
        ? activeRouteStopIds.has(stationStopId(stopId))
        : null,
    };
  };
  const staticRouteIds = new Set(
    Object.entries(ROUTE_ALIASES)
      .filter(([, alias]) => alias === id)
      .map(([routeId]) => routeId)
      .concat(id)
  );
  const services = activeServiceIds(data);
  const candidates = data.trips.filter((trip) =>
    staticRouteIds.has(trip.route_id)
  );
  const scheduledToday = candidates.filter((trip) => services.has(trip.service_id));
  const nowMinute = currentNewYorkMinute();
  const scheduledNearNow = tripsNearCurrentTime(
    scheduledToday,
    data.stopTimesByTrip,
    nowMinute
  );
  const patternCandidates = scheduledNearNow.length
    ? scheduledNearNow
    : scheduledToday.length
      ? scheduledToday
      : candidates;
  const directionCounts = new Map();
  for (const trip of patternCandidates) {
    directionCounts.set(trip.direction_id, (directionCounts.get(trip.direction_id) || 0) + 1);
  }
  const preferredDirection = [...directionCounts.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))
  )[0]?.[0];
  const currentPatterns = collectTripPatterns(
    patternCandidates,
    data.stopTimesByTrip,
    preferredDirection
  );
  let normalPattern = mostFrequentPattern(currentPatterns);
  // Build the route-page backbone from the complete static feed, not only
  // today's schedule. On planned split-service days the GTFS trips can each
  // contain just one operating section; using those trips as the backbone
  // deletes the other sections from the map before realtime service can be
  // applied. A normal full-route pattern from the feed keeps every station
  // visible, while realtime data below marks the non-operating gaps inactive.
  const canonicalPatterns = collectTripPatterns(
    candidates,
    data.stopTimesByTrip,
    preferredDirection
  );
  const hasSplitService = routeAlerts.some(isSplitServiceAlert);
  normalPattern = hasSplitService
    ? mostFrequentPattern(canonicalPatterns) || normalPattern
    : extendShortTurnPattern(normalPattern, canonicalPatterns);
  let normalStopIds = normalPattern?.stopIds || [];
  let branches = [];
  let temporaryBranches = [];

  // Realtime trip updates reflect temporary local service, reroutes, and
  // skipped stops. Prefer the most complete active trip pattern over the
  // static schedule, which only describes the normal service pattern.
  const currentRealtimePatterns = [];
  const routeFamilyId = routeFamily(id);
  const now = Math.floor(Date.now() / 1000);
  for (const entity of realtimeEntities) {
    const update = entity.tripUpdate;
    if (
      !update?.trip ||
      routeFamily(update.trip.routeId) !== routeFamilyId ||
      update.trip.scheduleRelationship === 3
    ) {
      continue;
    }
    const stopUpdates = update.stopTimeUpdate || [];
    const hasUpcomingStop = stopUpdates.some((item) =>
      (unixSeconds(item.arrival?.time || item.departure?.time) || 0) >= now
    );
    if (!hasUpcomingStop) continue;

    const stopIds = stopUpdates
      .map((item) => item.stopId)
      .filter((stopId) => isPublicStopId(stopId, data.stopsById))
      .map(stationStopId)
      .filter((stopId, index, values) => stopId !== values[index - 1]);
    if (stopIds.length >= 2) currentRealtimePatterns.push({ stopIds });
  }
  activeRouteStopIds = new Set(
    currentRealtimePatterns.flatMap((pattern) => pattern.stopIds)
  );
  const canonicalStops = normalStopIds.map((stopId) => ({
    id: stopId,
    name: stopObject(stopId, data.stopsById).name,
  }));
  for (const stopId of alertSectionStopIds(routeAlerts, canonicalStops)) {
    activeRouteStopIds.add(stopId);
  }
  hasRealtimeRouteService = activeRouteStopIds.size > 0;
  const realtimePattern = mostCompletePattern(currentRealtimePatterns);
  const detouredStopIds = applyRealtimeDetour(normalStopIds, currentRealtimePatterns);
  const hasRealtimeDetour = detouredStopIds !== normalStopIds;
  if (hasRealtimeDetour) normalStopIds = detouredStopIds;
  const activeRuns = countActiveRuns(normalStopIds, activeRouteStopIds);
  if (realtimePattern && activeRuns <= 1 && !hasSplitService && !hasRealtimeDetour) {
    normalStopIds = realtimePattern.stopIds;
  } else if (activeRuns > 1 && id !== "A" && id !== "5") {
    // A and 5 already have explicit permanent branch topology below. Their
    // normal branches must not be mistaken for temporary off-route service.
    temporaryBranches = offRouteTerminalBranches(normalStopIds, currentRealtimePatterns);
  }

  // SIR express trips are frequent around ferry connections and can otherwise
  // become the representative pattern. The route page should always show the
  // complete local line; express service is indicated on individual arrivals.
  if (id === "SI" && data.sirLocalStopIds.length) {
    normalStopIds = [...data.sirLocalStopIds];
    if (normalStopIds[0] !== "S31") normalStopIds.reverse();
  }

  if (id === "A") {
    ({ normalStopIds, branches } = buildARouteBranches({
      candidates,
      normalStopIds,
      nowMinute,
      realtimeEntities,
      realtimePatterns: currentRealtimePatterns,
      routeStop,
      scheduledToday,
      stopTimesByTrip: data.stopTimesByTrip,
    }));
  }

  if (id === "5") {
    ({ normalStopIds, branches } = buildFiveRouteBranches({
      normalStopIds,
      realtimeRoutesByStop,
      routeStop,
    }));
  }

  branches.push(...temporaryBranches.map((branch) => ({
    id: `temporary-${branch.junctionId}-${branch.terminalId}`,
    name: stopObject(branch.terminalId, data.stopsById).name,
    junctionId: branch.junctionId,
    placement: branch.placement,
    temporary: true,
    stops: branch.stopIds.map(routeStop),
  })));

  const stops = normalStopIds.map(routeStop);
  return { id, color: ROUTE_COLORS[id], serviceMaps: [{ configId: "alltimes", stops }], branches };
}
