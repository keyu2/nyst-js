import { isPlannedServiceAlert, serviceAlertStatus } from "../alertClassification.js";
import { normalizeRouteId } from "../routes.js";
import { unixSeconds } from "../time.js";
import { getAlertsFeed } from "./feeds.js";

const STATUS_SEVERITY = { planned: 1, delay: 2, suspended: 3 };

function translatedText(value) {
  const translations = value?.translation || [];
  return (
    translations.find((item) => item.language === "en")?.text ||
    translations.find((item) => item.language?.startsWith("en"))?.text ||
    translations[0]?.text ||
    ""
  );
}

function isActiveAlert(alert, now) {
  if (!(alert.activePeriod || []).length) return true;
  return alert.activePeriod.some((period) => {
    const start = unixSeconds(period.start);
    const end = unixSeconds(period.end);
    return (!start || start <= now) && (!end || end >= now);
  });
}

function routeAlert(entity) {
  const alert = entity.alert;
  const alertType = alert.mercury?.alert_type || "";
  const planned = isPlannedServiceAlert({ cause: alert.cause, alertType });

  return {
    id: entity.id,
    header: translatedText(alert.headerText),
    description: translatedText(alert.descriptionText),
    alertType,
    timeLabel: translatedText(alert.mercury?.human_readable_active_period),
    category: planned ? "planned" : "happening",
  };
}

export function buildRouteAlertSnapshot(entities, routeIds, now = Math.floor(Date.now() / 1000)) {
  const requestedRoutes = new Map(
    routeIds.map((routeId) => [normalizeRouteId(routeId), routeId])
  );
  const routeAlerts = Object.fromEntries(routeIds.map((routeId) => [routeId, []]));
  const routeStatuses = {};

  for (const entity of entities) {
    const alert = entity.alert;
    if (!alert || !isActiveAlert(alert, now)) continue;

    const informedRoutes = new Set(
      (alert.informedEntity || [])
        .map((item) => requestedRoutes.get(normalizeRouteId(item.routeId)))
        .filter(Boolean)
    );
    if (!informedRoutes.size) continue;

    const normalizedAlert = routeAlert(entity);
    if (!normalizedAlert.header && !normalizedAlert.description) continue;
    const status = serviceAlertStatus(normalizedAlert);

    for (const routeId of informedRoutes) {
      routeAlerts[routeId].push(normalizedAlert);
      if (
        !routeStatuses[routeId] ||
        STATUS_SEVERITY[status] > STATUS_SEVERITY[routeStatuses[routeId]]
      ) {
        routeStatuses[routeId] = status;
      }
    }
  }

  return { routeAlerts, routeStatuses };
}

export async function getRouteAlertSnapshot(routeIds) {
  const entities = await getAlertsFeed();
  return buildRouteAlertSnapshot(entities, routeIds);
}

export async function getRouteAlerts(routeId) {
  const { routeAlerts } = await getRouteAlertSnapshot([routeId]);
  return routeAlerts[routeId];
}

export async function getRouteStatuses(routeIds) {
  const { routeStatuses } = await getRouteAlertSnapshot(routeIds);
  return routeStatuses;
}
