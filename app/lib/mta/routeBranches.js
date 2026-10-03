import { gtfsMinute } from "../time.js";
import { routeFamily } from "../routes.js";
import { hasServiceAtStops } from "./routePattern.js";
import { stationStopId } from "./stopIds.js";

const A_BRANCHES = [
  { terminalId: "A65", id: "lefferts", name: "Lefferts Blvd" },
  { terminalId: "H11", id: "far-rockaway", name: "Far Rockaway" },
  { terminalId: "H15", id: "rockaway-park", name: "Rockaway Park" },
];
const ROCKAWAY_PARK_STOPS = new Set(["H12", "H13", "H14", "H15"]);
const NEREID_STOP_IDS = ["204", "205", "206", "207", "208", "209", "210", "211", "212"];

function overlayRealtimeStops(staticStopIds, realtimeStopIds) {
  const staticIndex = new Map(
    staticStopIds.map((stopId, index) => [stopId, index])
  );
  const sharedStops = realtimeStopIds.filter((stopId) => staticIndex.has(stopId));
  if (sharedStops.length < 2) return staticStopIds;

  const runsForward =
    staticIndex.get(sharedStops[0]) < staticIndex.get(sharedStops.at(-1));
  const orderedRealtimeStops = runsForward
    ? realtimeStopIds
    : [...realtimeStopIds].reverse();
  const firstSharedIndex = orderedRealtimeStops.findIndex((stopId) =>
    staticIndex.has(stopId)
  );
  const lastSharedIndex = orderedRealtimeStops.findLastIndex((stopId) =>
    staticIndex.has(stopId)
  );
  const firstStaticIndex = staticIndex.get(
    orderedRealtimeStops[firstSharedIndex]
  );
  const lastStaticIndex = staticIndex.get(
    orderedRealtimeStops[lastSharedIndex]
  );

  if (firstStaticIndex >= lastStaticIndex) return staticStopIds;

  return [
    ...staticStopIds.slice(0, firstStaticIndex),
    ...orderedRealtimeStops.slice(firstSharedIndex, lastSharedIndex + 1),
    ...staticStopIds.slice(lastStaticIndex + 1),
  ].filter((stopId, index, values) => stopId !== values[index - 1]);
}

function restoreActiveCanonicalStops(stopIds, canonicalStopIds, activeStopIds) {
  const result = [...stopIds];

  for (let index = 0; index < canonicalStopIds.length; index += 1) {
    const stopId = canonicalStopIds[index];
    if (!activeStopIds.has(stopId) || result.includes(stopId)) continue;

    const nextStopId = canonicalStopIds
      .slice(index + 1)
      .find((candidate) => result.includes(candidate));
    if (nextStopId) {
      result.splice(result.indexOf(nextStopId), 0, stopId);
      continue;
    }

    const previousStopId = canonicalStopIds
      .slice(0, index)
      .reverse()
      .find((candidate) => result.includes(candidate));
    const insertAt = previousStopId ? result.indexOf(previousStopId) + 1 : result.length;
    result.splice(insertAt, 0, stopId);
  }

  return result;
}

function completeATrunk(candidates, stopTimesByTrip) {
  const patterns = candidates
    .map((trip) => {
      let stopIds = (stopTimesByTrip.get(trip.trip_id) || []).map((item) =>
        stationStopId(item.stop_id)
      );
      if (!stopIds.includes("A02") || !stopIds.includes("A61")) return [];
      if (stopIds.indexOf("A02") > stopIds.indexOf("A61")) {
        stopIds = [...stopIds].reverse();
      }
      return stopIds.slice(0, stopIds.indexOf("A61") + 1);
    })
    .filter((stopIds) => stopIds.length);

  return patterns.sort((left, right) => right.length - left.length)[0] || [];
}

function operatesNearMinute(trip, stopTimesByTrip, nowMinute) {
  const stopTimes = stopTimesByTrip.get(trip.trip_id) || [];
  const firstMinute = gtfsMinute(
    stopTimes[0]?.departure_time || stopTimes[0]?.arrival_time
  );
  const lastMinute = gtfsMinute(
    stopTimes.at(-1)?.arrival_time || stopTimes.at(-1)?.departure_time
  );
  if (firstMinute === null || lastMinute === null) return false;

  return [nowMinute, nowMinute + 1440].some(
    (minute) => minute >= firstMinute - 30 && minute <= lastMinute + 30
  );
}

function representativeABranches({ candidates, nowMinute, scheduledToday, stopTimesByTrip }) {
  const patterns = new Map();

  for (const trip of scheduledToday.length ? scheduledToday : candidates) {
    let stopIds = (stopTimesByTrip.get(trip.trip_id) || [])
      .map((item) => stationStopId(item.stop_id));
    if (!stopIds.includes("A61") || !stopIds.includes("A02")) continue;
    if (stopIds[0] !== "A02") stopIds = [...stopIds].reverse();

    for (const definition of A_BRANCHES) {
      if (stopIds.at(-1) !== definition.terminalId) continue;
      if (
        definition.id === "rockaway-park"
        && !operatesNearMinute(trip, stopTimesByTrip, nowMinute)
      ) {
        continue;
      }

      const key = `${definition.id}:${stopIds.join(",")}`;
      const pattern = patterns.get(key) || { ...definition, stopIds, count: 0 };
      pattern.count += 1;
      patterns.set(key, pattern);
    }
  }

  return A_BRANCHES.map((definition) => (
    [...patterns.values()]
      .filter((pattern) => pattern.id === definition.id)
      .sort((left, right) => (
        right.count - left.count || right.stopIds.length - left.stopIds.length
      ))[0]
  )).filter(Boolean);
}

function hasRealtimeRockawayParkService(realtimeEntities) {
  return realtimeEntities.some((entity) => {
    const update = entity.tripUpdate;
    if (routeFamily(update?.trip?.routeId) !== "A") return false;
    return (update.stopTimeUpdate || []).some((item) => (
      ROCKAWAY_PARK_STOPS.has(stationStopId(item.stopId))
    ));
  });
}

export function buildARouteBranches({
  candidates,
  normalStopIds,
  nowMinute,
  realtimeEntities,
  realtimePatterns = [],
  routeStop,
  scheduledToday,
  stopTimesByTrip,
}) {
  const selectedBranches = representativeABranches({
    candidates,
    nowMinute,
    scheduledToday,
    stopTimesByTrip,
  });

  if (
    hasRealtimeRockawayParkService(realtimeEntities)
    && !selectedBranches.some((branch) => branch.id === "rockaway-park")
  ) {
    selectedBranches.push({
      ...A_BRANCHES.find((branch) => branch.id === "rockaway-park"),
      stopIds: [...ROCKAWAY_PARK_STOPS],
      count: 1,
    });
  }

  const staticPattern = selectedBranches[0]?.stopIds || normalStopIds;
  const junctionIndex = staticPattern.indexOf("A61");
  if (junctionIndex < 0) return { normalStopIds, branches: [] };

  const staticTrunk = staticPattern.slice(0, junctionIndex + 1);
  const activeStopIds = new Set([
    ...staticTrunk,
    ...normalStopIds,
    ...realtimePatterns.flatMap((pattern) => pattern.stopIds || []),
  ]);
  const localTrunk = completeATrunk(candidates, stopTimesByTrip);
  const combinedTrunk = localTrunk.length
    ? localTrunk.filter((stopId) => activeStopIds.has(stopId))
    : staticTrunk;
  const realtimeTrunk = overlayRealtimeStops(combinedTrunk, normalStopIds);
  const activeTrunk = restoreActiveCanonicalStops(
    realtimeTrunk,
    localTrunk,
    activeStopIds
  );

  return {
    normalStopIds: activeTrunk,
    branches: selectedBranches.map((branch) => {
      const branchStart = branch.id === "rockaway-park"
        ? branch.stopIds.indexOf("H12")
        : branch.stopIds.indexOf("A61") + 1;
      let branchStopIds = branch.stopIds.slice(branchStart);

      // Aqueduct Racetrack is served in one direction and may be absent from
      // the representative Far Rockaway-bound trip pattern.
      if (branch.id === "far-rockaway" && !branchStopIds.includes("H01")) {
        branchStopIds = ["H01", ...branchStopIds];
      }

      return {
        id: branch.id,
        name: branch.name,
        stops: branchStopIds.map(routeStop),
      };
    }),
  };
}

export function buildFiveRouteBranches({ normalStopIds, realtimeRoutesByStop, routeStop }) {
  const orderedStopIds = normalStopIds[0] === "501"
    ? normalStopIds
    : [...normalStopIds].reverse();
  const branches = hasServiceAtStops(realtimeRoutesByStop, NEREID_STOP_IDS, "5")
    ? [{
        id: "nereid",
        name: "Nereid Av",
        stops: NEREID_STOP_IDS.map(routeStop),
      }]
    : [];

  return { normalStopIds: orderedStopIds, branches };
}
