import Link from "next/link";
import BackButton from "../../../components/BackButton";
import HomeButton from "../../../components/HomeButton";
import RouteBullet from "../../../components/RouteBullet";
import { serviceAlertStatus } from "../../../lib/alertClassification";
import { getRouteAlerts, getTrip } from "../../../lib/mta";
import { buildTripProgress } from "../../../lib/tripProgress";
import TripMap from "./TripMap";
import TripTimeline from "./TripTimeline";

const ALERT_APPEARANCE = {
  suspended: {
    color: "#991b1b",
    border: "#dc2626",
    background: "#fff0f0",
  },
  delay: {
    color: "#92400e",
    border: "#d97706",
    background: "#fff6e8",
  },
};

function currentTripAlerts(alerts) {
  return alerts.flatMap((alert) => {
    const appearance = ALERT_APPEARANCE[serviceAlertStatus(alert)];
    if (!appearance) return [];
    return [{
      alert,
      appearance,
      label: String(alert.alertType || "").trim() || "Service Alert",
    }];
  });
}

export default async function TripPage({ params, searchParams }) {
  const { routeId, tripId } = await params;
  const { from } = await searchParams;
  const [trip, alerts] = await Promise.all([
    getTrip(routeId, tripId),
    getRouteAlerts(routeId),
  ]);
  const stopTimes = trip.stopTimes || [];
  const firstStop = trip.origin || stopTimes[0]?.stop;
  const lastStop = stopTimes.at(-1)?.stop;
  const progress = buildTripProgress(stopTimes, from);
  const routeColor = trip.route?.color ? `#${trip.route.color}` : "#666";
  const tripAlerts = currentTripAlerts(alerts);

  return (
    <main className="page-shell trip-page" style={{ "--trip-route-color": routeColor }}>
      <BackButton href={`/route/${routeId}`} />
      <HomeButton />

      <TripMap
        coordinates={trip.mapCoordinates || []}
        nextStop={progress.nextStop}
        routeColor={routeColor}
        routeId={routeId}
        stopTimes={stopTimes}
        vehicle={trip.vehicle}
      />

      <div className="trip-header">
        <Link
          className="trip-route-link"
          href={`/route/${encodeURIComponent(routeId)}`}
          aria-label={`View ${routeId} train route`}
        >
          <RouteBullet
            routeId={routeId}
            size={90}
            alt={routeId}
            className="trip-route-bullet"
          />
        </Link>

        <div className="trip-heading-text">
          <div className="trip-terminal">{firstStop?.name || `${routeId} Train`}</div>
          <div className="trip-heading-separator">to</div>
          <div className="trip-terminal">{lastStop?.name || "Unknown destination"}</div>
        </div>

        {tripAlerts.length > 0 && (
          <div aria-label="Current service alerts" className="trip-alerts">
            {tripAlerts.map(({ alert, appearance, label }, index) => (
              <Link
                key={alert.id || index}
                href={`/route/${encodeURIComponent(routeId)}/alerts`}
                title={alert.header || label}
                className="trip-alert-link"
                style={{
                  "--trip-alert-border": appearance.border,
                  "--trip-alert-background": appearance.background,
                  "--trip-alert-color": appearance.color,
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {progress.nextStop && (
        <div className="trip-next-stop">
          <span>Next stop:</span>{" "}
          <strong>{progress.nextStop.name}</strong>
        </div>
      )}

      <TripTimeline
        initialTimestamp={trip.updatedAt}
        progress={progress}
        routeId={routeId}
        stopTimes={stopTimes}
      />

      <footer className="trip-footer">
        <div>Trip ID: {trip.id}</div>
      </footer>
    </main>
  );
}
