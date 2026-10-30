import BackButton from "../../components/BackButton";
import HomeButton from "../../components/HomeButton";
import RouteBullet from "../../components/RouteBullet";
import { RouteServiceAlerts } from "../../components/ServiceAlerts";
import { getRoute, getRouteServiceAvailability } from "../../lib/mta";
import RouteStops from "./RouteStops";

export default async function RoutePage({ params }) {
  const { id } = await params;
  const [route, serviceAvailable] = await Promise.all([
    getRoute(id),
    getRouteServiceAvailability(id),
  ]);
  const alerts = route.alerts || [];
  const serviceMap =
    route.serviceMaps?.find((map) => map.configId === "alltimes") ||
    route.serviceMaps?.[0];
  const stops = serviceMap?.stops || [];

  return (
    <main className="page-shell route-page">
      <BackButton href="/subway" />
      <HomeButton />

      <div className="route-page-header">
        <RouteBullet routeId={id} size={64} className="route-page-bullet" loading="eager" />
        {serviceAvailable === false && (
          <span className="route-no-service">No service right now</span>
        )}
      </div>

      {alerts.length > 0 && (
        <RouteServiceAlerts alerts={alerts} />
      )}

      <RouteStops
        stops={stops}
        branches={route.branches}
        routeId={id}
        noService={serviceAvailable === false}
      />
    </main>
  );
}
