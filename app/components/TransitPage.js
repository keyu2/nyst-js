import {
  getRoute,
  getRouteAlertSnapshot,
  getRoutes,
  getRouteServiceAvailability,
  getStations,
} from "../lib/mta";
import StatusHome from "./home/StatusHome";

export default async function TransitPage({ view, section, requestedRouteId }) {
  const [{ routes }, stations] = await Promise.all([getRoutes(), getStations()]);
  const availableRoutes = new Set(routes.map((route) => route.id));
  const activeRouteId = availableRoutes.has(requestedRouteId)
    ? requestedRouteId
    : availableRoutes.has("1")
      ? "1"
      : routes[0]?.id;
  const [{ routeAlerts, routeStatuses }, focusedRoute, focusedRouteAvailable] = await Promise.all([
    getRouteAlertSnapshot([...availableRoutes]),
    activeRouteId ? getRoute(activeRouteId) : null,
    activeRouteId ? getRouteServiceAvailability(activeRouteId) : null,
  ]);

  return (
    <StatusHome
      key={`${view}/${section}`}
      view={view}
      section={section}
      stations={stations}
      routeIds={[...availableRoutes]}
      routeStatuses={routeStatuses}
      routeAlerts={routeAlerts}
      focusedRouteId={activeRouteId}
      focusedRoute={focusedRoute}
      focusedRouteAvailable={focusedRouteAvailable}
    />
  );
}
