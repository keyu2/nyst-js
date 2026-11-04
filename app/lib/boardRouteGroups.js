import { routeFamily } from "./routes.js";

function uniqueRouteIds(routeIds) {
  return [...new Set(routeIds.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function createBoardRouteGroups(routeIds, stationServices = []) {
  const groups = [];
  const groupedFamilies = new Set();
  const availableFamilies = new Set(routeIds.map(routeFamily));

  for (const service of stationServices) {
    const members = uniqueRouteIds(
      (service.routes || []).filter((routeId) => availableFamilies.has(routeFamily(routeId)))
    );
    const families = uniqueRouteIds(members.map(routeFamily));
    if (!families.length || families.every((family) => groupedFamilies.has(family))) continue;

    groups.push({ id: families.join("-"), members });
    for (const family of families) groupedFamilies.add(family);
  }

  for (const family of uniqueRouteIds(routeIds.map(routeFamily))) {
    if (groupedFamilies.has(family)) continue;
    const members = uniqueRouteIds(routeIds.filter((routeId) => routeFamily(routeId) === family));
    groups.push({ id: family, members });
    groupedFamilies.add(family);
  }

  return groups;
}

export function createStationRouteFamilies(
  realtimeRouteIds,
  stationServices = [],
  requestedRouteId = ""
) {
  const fallbackRouteIds = stationServices
    .flatMap((service) => service.routes || [])
    .concat(requestedRouteId);
  const routeIds = uniqueRouteIds(
    realtimeRouteIds.length ? realtimeRouteIds : fallbackRouteIds
  );
  const routeFamilies = new Map();

  for (const routeId of routeIds) {
    const familyId = routeFamily(routeId);
    const members = routeFamilies.get(familyId) || [];
    members.push(routeId);
    routeFamilies.set(familyId, members);
  }

  return { routeIds, routeFamilies, familyIds: [...routeFamilies.keys()] };
}

export function createStationRouteGroups(familyIds) {
  const trunks = [
    ["1", "2", "3"], ["4", "5", "6"], ["7"],
    ["A", "C", "E"], ["B", "D", "F", "M"],
    ["J", "Z"], ["N", "Q", "R", "W"],
  ];
  const groups = [];
  for (const family of familyIds) {
    const trunk = trunks.find((members) => members.includes(family)) || [family];
    if (groups.some((members) => members.includes(family))) continue;
    groups.push(trunk.filter((member) => familyIds.includes(member)));
  }
  return groups;
}
