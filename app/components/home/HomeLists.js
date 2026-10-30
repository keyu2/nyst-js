"use client";

import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { useMemo } from "react";
import RouteBullet from "../RouteBullet";
import { stationRouteIds } from "../../lib/stationDiscovery";
import { useSubwayPreferences } from "../../lib/preferences";
import { MOBILE_LINE_SECTIONS, ROUTE_FAMILIES, ROUTE_STATUS } from "./config";

function RouteButtons({ group, available, routeStatuses, size = 40 }) {
  return group.map((routeId) => {
    if (!available.has(routeId)) return null;
    const status = ROUTE_STATUS[routeStatuses[routeId]];
    const statusLabel = status ? `, ${status.label}` : "";
    return (
      <Link
        className="new-route-button"
        href={`/route/${routeId}`}
        aria-label={`${routeId} train${statusLabel}`}
        key={routeId}
      >
        <RouteBullet routeId={routeId} size={size} />
        {status && <span title={status.label} style={{ background: status.color }} />}
      </Link>
    );
  });
}

export function StationItem({ station, distance, preferredStopId, preferredRoute }) {
  const routes = stationRouteIds(station);
  const primaryService = station.services.find((service) => service.id === preferredStopId)
    || station.services[0];
  if (!primaryService) return null;

  const routeId = (
    preferredRoute ||
    stationRouteIds({ services: [primaryService] })[0] ||
    primaryService.routes?.[0] ||
    ""
  );

  return (
    <Link
      className="new-station-result"
      href={`/stop/${primaryService.id}?route=${encodeURIComponent(routeId)}`}
    >
      <span>
        <strong>{station.name}</strong>
        {Number.isFinite(distance) && <small>{distance.toFixed(2)} mi away</small>}
      </span>
      <span>
        {routes.map((id) => (
          <RouteBullet key={id} routeId={id} size={25} />
        ))}
        <ChevronRight aria-hidden="true" />
      </span>
    </Link>
  );
}

export function LineList({ groups, available, routeStatuses }) {
  const { mobileLineLayout } = useSubwayPreferences();

  return (
    <>
      <section
        className={`new-line-list new-line-list--desktop${mobileLineLayout === "rows" ? " new-line-list--mobile-selected" : ""}`}
        aria-label="Subway lines"
      >
        {groups.map((group) => {
          const family = ROUTE_FAMILIES.find(({ routes }) => (
            group.some((routeId) => routes.includes(routeId))
          ));

          return (
            <div
              className="new-line-row"
              key={group.join("-")}
              style={{ "--route-family-color": family?.color || "#808183" }}
            >
              <span className="new-line-family">{family?.name || "Subway"}</span>
              <div className="new-line-bullets">
                <RouteButtons
                  group={group}
                  available={available}
                  routeStatuses={routeStatuses}
                />
              </div>
            </div>
          );
        })}
      </section>

      <section
        className={`new-line-list new-line-list--mobile-bands${mobileLineLayout === "grouped" ? " new-line-list--mobile-selected" : ""}`}
        aria-label="Subway lines"
      >
        {MOBILE_LINE_SECTIONS.map((section) => {
          const sectionGroups = section.families.map((familyIndex) => ({
            family: ROUTE_FAMILIES[familyIndex],
            familyIndex,
            group: groups[familyIndex] || [],
            label: section.labels?.[familyIndex] || ROUTE_FAMILIES[familyIndex]?.name,
          }));
          const familyCount = sectionGroups.length;

          return (
            <div
              className={`new-line-mobile-section new-line-mobile-section--${familyCount} new-line-mobile-section--${section.layout || "standard"}`}
              key={section.families.join("-")}
            >
              {sectionGroups.map(({ family, group, label }) => (
                <div
                  className="new-line-mobile-family"
                  key={group.join("-") || family?.name}
                  style={{ "--route-family-color": family?.color || "#808183" }}
                >
                  <span className="new-line-mobile-heading">
                    <strong>{label || "Subway"}</strong>
                  </span>
                  <span className="new-line-mobile-bullets">
                    <RouteButtons
                      group={group}
                      available={available}
                      routeStatuses={routeStatuses}
                      size={46}
                    />
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </>
  );
}

export function FavoriteStationList({ favorites, stations, onRemove }) {
  const stationsByServiceId = useMemo(
    () => new Map(
      stations.flatMap((station) => (
        station.services.map((service) => [service.id, station])
      ))
    ),
    [stations]
  );

  return (
    <section className="favorite-stations" aria-labelledby="favorite-stations-title">
      <h2 id="favorite-stations-title">Stations</h2>
      <div className="favorite-stations__list">
        {favorites.map((favorite) => {
          const matchedId = (favorite.ids || [favorite.id]).find(
            (id) => stationsByServiceId.has(id)
          );
          const station = stationsByServiceId.get(matchedId) || {
            id: favorite.id,
            name: favorite.name,
            services: [{
              id: favorite.id,
              routes: favorite.routes?.length
                ? favorite.routes
                : [favorite.route].filter(Boolean),
            }],
          };
          return (
            <div className="favorite-station-row" key={favorite.id}>
              <StationItem
                station={station}
                preferredStopId={favorite.id}
                preferredRoute={favorite.route}
              />
              <button
                type="button"
                aria-label={`Remove ${favorite.name} from favorites`}
                onClick={() => onRemove(favorite.id)}
              >
                <Star aria-hidden="true" fill="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
