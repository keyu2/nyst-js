import { Fragment, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import RouteBullet from "../../components/RouteBullet";
import { hasTransferRouteChange, ROUTE_COLORS, routeFamily } from "../../lib/routes";

const INACTIVE_STRIP_COLOR = "color-mix(in srgb, var(--muted) 48%, var(--background))";

function activeStripColor(routeId) {
  return `#${ROUTE_COLORS[routeFamily(routeId)] || "808183"}`;
}

function boroughBoundary(firstStop, secondStop) {
  if (
    !firstStop?.borough ||
    !secondStop?.borough ||
    firstStop.borough === secondStop.borough
  ) {
    return null;
  }

  return [firstStop.borough, secondStop.borough];
}

function EndpointMarker({ borough }) {
  if (!borough) return null;

  return (
    <div className="route-endpoint-marker">
      <span className="borough-direction-label">
        {borough}
        <ArrowDown aria-hidden="true" />
      </span>
    </div>
  );
}

function StripMarker({
  color,
  aboveColor = color,
  belowColor = color,
  connectsAbove,
  connectsBelow,
}) {
  return (
    <span
      className="strip-marker"
      style={{
        "--strip-color": color,
        "--strip-above-color": aboveColor,
        "--strip-below-color": belowColor,
      }}
    >
      {connectsAbove && <span className="strip-line strip-line--above" />}
      {connectsBelow && <span className="strip-line strip-line--below" />}
      <span aria-hidden="true" className="strip-dot" />
    </span>
  );
}

export function RouteStopList({
  stops,
  routeId,
  query,
  noService,
  continuesAbove = false,
  continuesBelow = false,
  showEndpoint = true,
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searching = normalizedQuery.length > 0;
  const visibleStops = useMemo(() => {
    if (!normalizedQuery) return stops;
    return stops.filter((stop) =>
      stop.name.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery, stops]);

  if (!visibleStops.length) {
    return <p className="route-stations-empty">No matching stations.</p>;
  }

  const startBorough = searching ? null : visibleStops[0]?.borough;
  const stripColor = activeStripColor(routeId);
  const inactiveColor = INACTIVE_STRIP_COLOR;

  return (
    <div>
      {showEndpoint && <EndpointMarker borough={startBorough} />}

      {visibleStops.map((stop, index) => {
        const inactive = noService || stop.hasService === false;
        const previousInactive =
          noService || visibleStops[index - 1]?.hasService === false;
        const nextInactive =
          noService || visibleStops[index + 1]?.hasService === false;
        const boundary = searching
          ? null
          : boroughBoundary(visibleStops[index - 1], stop);
        const routeBullets = stop.transferRoutes || [];
        const routeBulletsAddContext = hasTransferRouteChange(
          routeBullets,
          visibleStops[index - 1]?.transferRoutes,
          visibleStops[index + 1]?.transferRoutes
        );

        // Keep the ends of a shared-service run visible. Intermediate stops
        // only need bullets when their available routes change.
        const showRouteBullets =
          searching ||
          index === 0 ||
          index === visibleStops.length - 1 ||
          routeBulletsAddContext;

        return (
          <Fragment key={stop.id}>
            {boundary && (
              <div
                aria-label={`Borough boundary between ${boundary[0]} and ${boundary[1]}`}
                className="borough-boundary"
                style={{ "--strip-color": stripColor }}
              >
                <span aria-hidden="true" className="borough-boundary-line" />
                <span className="borough-direction-label">
                  {boundary[0]}
                  <ArrowUp aria-hidden="true" />
                </span>
                <span className="borough-direction-label">
                  {boundary[1]}
                  <ArrowDown aria-hidden="true" />
                </span>
              </div>
            )}

            <Link
              href={`/stop/${stop.id}?route=${encodeURIComponent(routeId)}`}
              aria-label={`${stop.name}${inactive ? ", no current train service" : ""}`}
              className="strip-stop-row"
            >
              <StripMarker
                color={inactive ? inactiveColor : stripColor}
                aboveColor={inactive || previousInactive ? inactiveColor : stripColor}
                belowColor={inactive || nextInactive ? inactiveColor : stripColor}
                connectsAbove={index > 0 || (continuesAbove && !searching)}
                connectsBelow={
                  index < visibleStops.length - 1 ||
                  (continuesBelow && !searching)
                }
              />

              <span
                className={`strip-stop-content${inactive ? " strip-stop-content--inactive" : ""}`}
              >
                <span className="strip-stop-name">
                  {stop.name}
                  {stop.accessible && (
                    <Image
                      className="route-stop-accessible-icon"
                      src="/icons/accessible.svg"
                      alt="Accessible station"
                      width={24}
                      height={24}
                    />
                  )}
                </span>

                {showRouteBullets && routeBullets.length > 0 && (
                  <span className="strip-transfer-bullets">
                    {routeBullets.map((transferRouteId) => (
                      <RouteBullet
                        key={transferRouteId}
                        routeId={transferRouteId}
                        size={22}
                        title={`${transferRouteId} train`}
                      />
                    ))}
                  </span>
                )}
              </span>

              <span className="strip-stop-chevron" aria-hidden="true">
                {"\u203A"}
              </span>
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}

export function BranchOffshoot({
  branch,
  routeId,
  query,
  noService,
  connectsAtStart = true,
  mergesBack = false,
}) {
  if (!branch?.stops?.length) return null;

  return (
    <section
      className={`branch-offshoot${connectsAtStart ? "" : " branch-offshoot--terminal-start"}`}
      style={{ "--branch-color": activeStripColor(routeId) }}
    >
      <h2 className="visually-hidden">{branch.name} branch</h2>
      {mergesBack && (
        <span className="branch-offshoot__merge" aria-hidden="true" />
      )}
      <RouteStopList
        stops={branch.stops}
        routeId={routeId}
        query={query}
        noService={noService}
        showEndpoint={false}
      />
    </section>
  );
}
