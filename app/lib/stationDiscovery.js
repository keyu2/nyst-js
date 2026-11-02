import { routeFamily } from "./routes.js";

export function distanceMiles(origin, station) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(station.latitude - origin.latitude);
  const longitudeDelta = radians(station.longitude - origin.longitude);
  const latitude1 = radians(origin.latitude);
  const latitude2 = radians(station.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function stationRouteIds(station) {
  return [...new Set(
    station.services.flatMap((service) => [
      ...(service.routes || []),
      ...(service.realtimeRoutes || []),
    ].map(routeFamily))
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function stationActiveRouteIds(station) {
  const availabilityKnown = station.services.some((service) => (
    Array.isArray(service.scheduledRoutes) || Array.isArray(service.realtimeRoutes)
  ));
  if (!availabilityKnown) return stationRouteIds(station);

  const realtimeRoutes = [...new Set(
    station.services.flatMap((service) => (
      service.realtimeRoutes || []
    ).map(routeFamily))
  )];
  const activeRoutes = realtimeRoutes.length
    ? realtimeRoutes
    : [...new Set(
        station.services.flatMap((service) => (
          service.scheduledRoutes || []
        ).map(routeFamily))
      )];

  return activeRoutes.sort((a, b) => (
    a.localeCompare(b, undefined, { numeric: true })
  ));
}

export function nearestStations(stations, origin, limit = 3) {
  if (!origin) return [];
  return stations
    .map((station) => ({ ...station, distance: distanceMiles(origin, station) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function searchDiscovery(stations, routeIds, query, limit = 12) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return { stations: [], routes: [] };

  const availableRoutes = [...new Set(routeIds.map(routeFamily))];
  const routeByLowercaseId = new Map(
    availableRoutes.map((id) => [id.toLowerCase(), id])
  );
  const tokens = normalized.split(/\s+/);
  const requestedRoutes = tokens.map((token) => routeByLowercaseId.get(token)).filter(Boolean);
  const stationTerms = tokens.filter((token) => !routeByLowercaseId.has(token));
  const routes = availableRoutes
    .filter((id) => id.toLowerCase() === normalized)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const matchingStations = stations.filter((station) => {
    if (stationTerms.length === 0) return requestedRoutes.length === 0;
    const name = station.name.toLowerCase();
    if (!stationTerms.every((term) => name.includes(term))) return false;
    if (!requestedRoutes.length) return true;
    const stationRoutes = new Set(stationRouteIds(station));
    return requestedRoutes.every((id) => stationRoutes.has(id));
  });

  return { stations: matchingStations.slice(0, limit), routes };
}
