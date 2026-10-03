import Image from "next/image";
import { TriangleAlert } from "lucide-react";
import RouteBullet from "./RouteBullet";
import { serviceAlertLabel, serviceAlertTone } from "../lib/alertClassification";
import { normalizeRouteId } from "../lib/routes";

const ALERT_ROUTE_IDS = new Set([
  "1", "2", "3", "4", "5", "6", "6X", "7", "7X",
  "A", "C", "E", "B", "D", "F", "FX", "M", "G",
  "J", "Z", "L", "N", "Q", "R", "W", "S", "GS", "FS", "H", "SI",
]);

const ALERT_ICONS = [
  {
    pattern: /accessib|wheelchair/i,
    src: "/icons/accessible.svg",
    label: "Accessible station",
    size: 20,
    offset: "-4px",
  },
  {
    pattern: /elevator/i,
    src: "/icons/elevator.svg",
    label: "Elevator",
    size: 20,
    offset: "-4px",
  },
  {
    pattern: /shuttle\s*bus/i,
    src: "/icons/shuttle-bus.svg",
    label: "Shuttle bus",
    size: 21,
    offset: "-5px",
  },
  {
    pattern: /\bbus\b/i,
    src: "/icons/bus.svg",
    label: "Bus",
    size: 21,
    offset: "-5px",
  },
];

export function RichAlertText({ text }) {
  return String(text || "").split(/(\[[^\]]+\])/g).map((part, index) => {
    const bracketed = part.match(/^\[([^\]]+)\]$/);
    if (!bracketed) return part;
    const value = bracketed[1].trim();
    const upper = value.toUpperCase();
    const routeId = normalizeRouteId(upper);
    if (ALERT_ROUTE_IDS.has(routeId)) {
      return (
        <RouteBullet
          key={`${part}-${index}`}
          routeId={routeId}
          title={`${upper} train`}
          size={21}
          className="rich-alert-inline"
        />
      );
    }
    const icon = ALERT_ICONS.find(({ pattern }) => pattern.test(value));
    if (icon) {
      return (
        <Image
          key={`${part}-${index}`}
          src={icon.src}
          alt={icon.label}
          title={icon.label}
          width={icon.size}
          height={icon.size}
          unoptimized
          className="rich-alert-inline"
          style={{ "--rich-alert-offset": icon.offset }}
        />
      );
    }
    return part;
  });
}

const ALERT_TONE_PRIORITY = {
  planned: 1,
  warning: 2,
  critical: 3,
};

function primaryAlert(alerts) {
  return alerts.reduce((primary, alert) => {
    if (!primary) return alert;
    const alertPriority = ALERT_TONE_PRIORITY[serviceAlertTone(alert)];
    const primaryPriority = ALERT_TONE_PRIORITY[serviceAlertTone(primary)];
    return alertPriority > primaryPriority ? alert : primary;
  }, null);
}

export function StationServiceAlerts({ alerts }) {
  if (!alerts.length) return null;

  const primary = primaryAlert(alerts);
  const tone = serviceAlertTone(primary);
  const label = serviceAlertLabel(primary);

  return (
    <details className={`station-service-alert station-service-alert--${tone}`}>
      <summary className="station-service-alert__summary">
        <TriangleAlert aria-hidden="true" />
        <span>{label}</span>
        {alerts.length > 1 && <span className="station-service-alert__count">+{alerts.length - 1}</span>}
      </summary>
      <div className="station-service-alert__details">
        {alerts.map((alert, index) => (
          <article className="station-service-alert__item" key={alert.id || index}>
            {alert.alertType && (
              <h3>{serviceAlertLabel(alert)}</h3>
            )}
            {alert.timeLabel && <div className="station-service-alert__time">{alert.timeLabel}</div>}
            {alert.header && <strong><RichAlertText text={alert.header} /></strong>}
            {alert.description && alert.description !== alert.header && (
              <div className="station-service-alert__description">
                <RichAlertText text={alert.description} />
              </div>
            )}
          </article>
        ))}
      </div>
    </details>
  );
}

function AlertCard({ alert }) {
  const tone = serviceAlertTone(alert);
  const label = serviceAlertLabel(alert, "Service Alert");

  return (
    <details className={`alert-card alert-card--${tone}`}>
      <summary className="alert-card__summary">
        <span className="alert-card__type">{label}</span>
      </summary>
      <div className="alert-card__details">
        {alert.timeLabel && (
          <div className="alert-card__time">{alert.timeLabel}</div>
        )}
        {alert.header && (
          <strong className="alert-card__heading">
            <RichAlertText text={alert.header} />
          </strong>
        )}
        {alert.description && alert.description !== alert.header && (
          <div className="alert-card__description">
            <RichAlertText text={alert.description} />
          </div>
        )}
      </div>
    </details>
  );
}

export function AlertGroup({ title, alerts }) {
  if (!alerts.length) return null;
  return (
    <section className="alert-group">
      <h2>{title}</h2>
      <div className="alert-group__list">
        {alerts.map((alert, index) => <AlertCard key={alert.id || index} alert={alert} />)}
      </div>
    </section>
  );
}

export function GroupedServiceAlerts({ alerts }) {
  const happeningNow = alerts.filter((alert) => alert.category === "happening");
  const plannedChanges = alerts.filter((alert) => alert.category === "planned");
  return (
    <>
      <AlertGroup title="Happening Now" alerts={happeningNow} />
      <AlertGroup title="Planned Service Changes" alerts={plannedChanges} />
    </>
  );
}

function groupRouteAlerts(alerts) {
  const groups = new Map();

  for (const alert of alerts) {
    const title = serviceAlertLabel(alert, "Service Alert");
    const key = title.trim().toLowerCase();
    const group = groups.get(key);

    if (group) {
      group.alerts.push(alert);
    } else {
      groups.set(key, {
        alerts: [alert],
        title,
        tone: serviceAlertTone(alert),
      });
    }
  }

  return [...groups.values()];
}

function RouteAlertItem({ alert }) {
  return (
    <article className="route-service-alert__item">
      {alert.timeLabel && (
        <div className="route-service-alert__time">{alert.timeLabel}</div>
      )}
      {alert.header && <strong><RichAlertText text={alert.header} /></strong>}
      {alert.description && alert.description !== alert.header && (
        <div className="route-service-alert__description">
          <RichAlertText text={alert.description} />
        </div>
      )}
    </article>
  );
}

export function RouteServiceAlerts({ alerts }) {
  if (!alerts.length) return null;
  const groups = groupRouteAlerts(alerts);

  return (
    <section className="route-service-alerts" aria-labelledby="route-service-alerts-title">
      <h2 id="route-service-alerts-title">Service Alerts</h2>
      <div className="route-service-alerts__list">
        {groups.map((group) => (
          <details
            className={`route-service-alert route-service-alert--${group.tone}`}
            key={group.title}
          >
            <summary>
              <span className="route-service-alert__label">
                <span>{group.title}</span>
                {group.alerts.length > 1 && (
                  <span className="route-service-alert__count">
                    +{group.alerts.length - 1}
                  </span>
                )}
              </span>
            </summary>
            <div className="route-service-alert__details">
              {group.alerts.map((alert, index) => (
                <RouteAlertItem
                  alert={alert}
                  key={alert.id || index}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
