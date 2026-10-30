"use client";

import RouteBullet from "../RouteBullet";
import { RichAlertText } from "../ServiceAlerts";
import { useSubwayPreferences } from "../../lib/preferences";
import { MOBILE_LINE_SECTIONS, ROUTE_FAMILIES } from "./config";

function alertsForRoutes(routes, routeAlerts) {
  const unique = new Map();
  for (const routeId of routes) {
    for (const alert of routeAlerts[routeId] || []) {
      const key = alert.id || `${alert.header}:${alert.description}`;
      if (!unique.has(key)) unique.set(key, { ...alert, id: key, routes: [] });
      unique.get(key).routes.push(routeId);
    }
  }
  return [...unique.values()];
}

export function StatusAlertList({
  available,
  groups,
  onSelect,
  routeAlerts,
  showEmptyFavorites = false,
}) {
  const { mobileLineLayout } = useSubwayPreferences();
  const entries = groups.map((group) => {
    const routes = group.filter((routeId) => available.has(routeId));
    if (!routes.length) return null;
    const familyIndex = ROUTE_FAMILIES.findIndex(({ routes: familyRoutes }) => (
      routes.some((routeId) => familyRoutes.includes(routeId))
    ));
    const family = ROUTE_FAMILIES[familyIndex];
    const alerts = alertsForRoutes(routes, routeAlerts);
    const label = alerts.length > 1
      ? `${alerts.length} alerts`
      : alerts[0]?.alertType || (alerts.length ? "1 alert" : "No alerts");
    return { alerts, family, familyIndex, label, routes };
  }).filter(Boolean);

  return (
    <>
      <section
        className={`status-alert-list status-alert-list--desktop${mobileLineLayout === "rows" ? " status-alert-list--mobile-selected" : ""}`}
        aria-label="Service alerts"
      >
        {entries.map(({ alerts, family, label, routes }) => (
            <button
              className="status-alert-row"
              disabled={!alerts.length}
              onClick={() => onSelect({ routes, alerts })}
              key={routes.join("-")}
              style={{ "--route-family-color": family?.color || "#808183" }}
            >
              <span className="status-alert-family">{family?.name || "Subway"}</span>
              <span className="status-alert-bullets">
                {routes.map((routeId) => (
                  <RouteBullet key={routeId} routeId={routeId} size={40} />
                ))}
              </span>
              <span className="status-alert-label">{label}</span>
            </button>
        ))}
        {showEmptyFavorites && !groups.length && <p>No favorite lines yet.</p>}
      </section>

      <section
        className={`status-alert-list status-alert-list--mobile-bands${mobileLineLayout === "grouped" ? " status-alert-list--mobile-selected" : ""}`}
        aria-label="Service alerts"
      >
        {MOBILE_LINE_SECTIONS.map((section) => {
          const sectionEntries = section.families
            .map((familyIndex) => entries.find((entry) => entry.familyIndex === familyIndex))
            .filter(Boolean);
          if (!sectionEntries.length) return null;

          return (
            <div
              className={`new-line-mobile-section new-line-mobile-section--${sectionEntries.length} new-line-mobile-section--${section.layout} status-alert-mobile-section`}
              key={section.families.join("-")}
            >
              {sectionEntries.map(({ alerts, family, familyIndex, label, routes }) => (
                <button
                  className="new-line-mobile-family status-alert-mobile-family"
                  disabled={!alerts.length}
                  onClick={() => onSelect({ routes, alerts })}
                  key={routes.join("-")}
                  style={{ "--route-family-color": family?.color || "#808183" }}
                >
                  <span className="new-line-mobile-heading">
                    <strong>{section.labels?.[familyIndex] || family?.name || "Subway"}</strong>
                    <small className="status-alert-mobile-label">{label}</small>
                  </span>
                  <span className="new-line-mobile-bullets">
                    {routes.map((routeId) => (
                      <RouteBullet key={routeId} routeId={routeId} size={46} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
        {showEmptyFavorites && !groups.length && <p>No favorite lines yet.</p>}
      </section>
    </>
  );
}

export function StatusAlertDetail({ group, onBack }) {
  return (
    <section className="status-alert-detail">
      <button className="new-manage-favorites" onClick={onBack}>Back</button>
      <h2>
        Alerts for {group.routes.map((routeId) => (
          <RouteBullet key={routeId} routeId={routeId} size={32} />
        ))}
      </h2>
      {group.alerts.map((alert) => (
        <article key={alert.id}>
          <h3>
            {alert.routes.map((routeId) => (
              <RouteBullet key={routeId} routeId={routeId} size={28} />
            ))}
            {alert.alertType || "Service alert"}
          </h3>
          <p className="status-alert-summary">
            <RichAlertText text={alert.header || alert.description} />
          </p>
          {(alert.timeLabel || (alert.description && alert.description !== alert.header)) && (
            <details>
              <summary>Show more details</summary>
              {alert.timeLabel && <p className="status-alert-time">{alert.timeLabel}</p>}
              {alert.description !== alert.header && (
                <p className="status-alert-description">
                  <RichAlertText text={alert.description} />
                </p>
              )}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
