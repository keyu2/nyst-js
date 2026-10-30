"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { useRouter } from "next/navigation";
import RouteBullet from "../../components/RouteBullet";
import { RichAlertText } from "../../components/ServiceAlerts";
import { serviceAlertLabel, serviceAlertTone } from "../../lib/alertClassification";
import { directionGroupLabel } from "../../lib/directionLabels";
import { formatArrivalCountdown } from "../../lib/time";
import { useLiveTimestamp } from "../../lib/useLiveTimestamp";
import { useBoardRouteFilter, useFullscreenFit } from "./displayBoardHooks";

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const ALERT_SLIDE_DURATION_MS = 15_000;

function directionLabel(trains, stopBorough, direction) {
  const parts = new Set();
  for (const train of trains) {
    const label = directionGroupLabel(
      stopBorough,
      train.destination?.borough || null,
      direction
    );
    for (const part of label.split("/").map((value) => value.trim()).filter(Boolean)) {
      parts.add(part);
    }
  }
  return [...parts].join(" / ") || (direction === "northbound" ? "Northbound" : "Southbound");
}

function BoardAlertCarousel({ alerts }) {
  const pages = [];
  for (let index = 0; index < alerts.length; index += 2) {
    pages.push(alerts.slice(index, index + 2));
  }
  const [activePageIndex, setActivePageIndex] = useState(0);
  const activeAlerts = pages[activePageIndex];

  useEffect(() => {
    if (pages.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActivePageIndex((index) => (index + 1) % pages.length);
    }, ALERT_SLIDE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [activePageIndex, pages.length]);

  return (
    <>
      <div
        className="display-board-alert-progress"
        style={{
          "--display-alert-count": pages.length,
          "--display-alert-duration": `${ALERT_SLIDE_DURATION_MS}ms`,
        }}
        aria-hidden="true"
      >
        {pages.map((page, index) => (
          <span
            className={
              pages.length === 1 || index < activePageIndex
                ? "complete"
                : index === activePageIndex
                  ? "active"
                  : undefined
            }
            key={page.map((alert) => alert.id || alert.header).join("|") || index}
          >
            <i />
          </span>
        ))}
      </div>
      <div className="display-board-alert-slide" aria-live="polite" aria-atomic="true">
        {activeAlerts.map((alert, index) => (
          <details
            className={`display-board-alert display-board-alert--${serviceAlertTone(alert)}`}
            open
            key={alert.id || `${alert.header}-${index}`}
          >
            <summary>
              <span>{serviceAlertLabel(alert)}</span>
              <strong><RichAlertText text={alert.header || "Service alert"} /></strong>
            </summary>
            {(alert.timeLabel || (
              alert.description && alert.description !== alert.header
            )) && (
              <div className="display-board-alert__details">
                {alert.timeLabel && <b>{alert.timeLabel}</b>}
                {alert.description && alert.description !== alert.header && (
                  <p><RichAlertText text={alert.description} /></p>
                )}
              </div>
            )}
          </details>
        ))}
      </div>
    </>
  );
}

const BoardAlerts = memo(function BoardAlerts({ alerts }) {
  const carouselKey = alerts
    .map((alert, index) => alert.id || `${alert.header}-${index}`)
    .join("|");

  return (
    <section className="display-board-alerts" aria-labelledby="display-board-alerts-title">
      <h2 id="display-board-alerts-title">Happening now</h2>
      {!alerts.length && <p className="display-board-clear">No active alerts for the selected lines.</p>}
      {alerts.length > 0 && (
        <BoardAlertCarousel alerts={alerts} key={carouselKey} />
      )}
    </section>
  );
});

function BoardDirection({
  direction,
  invertArrivingTrains,
  trains,
  stopBorough,
  stopId,
  now,
  showSeconds,
}) {
  const currentTrains = trains
    .filter((train) => Number(train.arrival?.time || train.departure?.time || 0) >= now - 30)
    .sort((a, b) =>
      Number(a.arrival?.time || a.departure?.time || Infinity) -
      Number(b.arrival?.time || b.departure?.time || Infinity)
    )
    .slice(0, 4);
  if (!currentTrains.length) return null;
  const label = directionLabel(currentTrains, stopBorough, direction);

  return (
    <section className="display-board-direction" aria-label={`${label} arrivals`}>
      <h2>{label}</h2>
      <div className="display-board-trains">
        {currentTrains.map((train, index) => {
          const routeId = train.trip?.route?.id || "?";
          const arrivalTime = Number(train.arrival?.time || train.departure?.time || 0);
          const remainingSeconds = Math.max(0, arrivalTime - now);
          const countdownMinutes = Math.floor(remainingSeconds / 60);
          const isArriving = remainingSeconds < 60;
          const destinationId = train.destination?.id || "";
          const destination = destinationId.startsWith(stopId)
            ? "Terminating"
            : train.destination?.name || train.headsign || "Unknown destination";
          return (
            <Link
              className={`display-board-train${isArriving && invertArrivingTrains ? " display-board-train--arriving" : ""}`}
              href={`/trip/${routeId}/${encodeURIComponent(train.trip?.id || "")}?from=${encodeURIComponent(stopId)}`}
              key={`${routeId}-${train.trip?.id || index}`}
            >
              <RouteBullet routeId={routeId} size={56} />
              <span className="display-board-destination">
                <strong>{directionGroupLabel(stopBorough, train.destination?.borough, direction)}</strong>
                <span>{destination}</span>
                {train.delayMinutes && <small>Est. delayed {train.delayMinutes} min</small>}
              </span>
              <strong
                className="display-board-time"
                aria-label={formatArrivalCountdown(remainingSeconds, showSeconds)}
              >
                <span
                  className="display-board-countdown"
                  aria-hidden="true"
                >
                  <span className="display-board-minute-stack">
                    <span className="display-board-minutes">{countdownMinutes}</span>
                    <small>MIN</small>
                  </span>
                  {showSeconds && (
                    <sup>{String(remainingSeconds % 60).padStart(2, "0")}</sup>
                  )}
                </span>
              </strong>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const RouteFilters = memo(function RouteFilters({
  routeGroups,
  selectedGroupSet,
  toggleGroup,
}) {
  return (
    <div className="display-board-route-filters" aria-label="Lines shown">
      {routeGroups.map((group) => {
        const selected = selectedGroupSet.has(group.id);
        return (
          <button
            type="button"
            className={selected ? "active" : ""}
            onClick={() => toggleGroup(group.id)}
            aria-label={`${group.members.join(" and ")} line filter`}
            aria-pressed={selected}
            key={group.id}
          >
            {group.members.map((routeId) => (
              <RouteBullet routeId={routeId} size={30} key={routeId} />
            ))}
          </button>
        );
      })}
    </div>
  );
});

export default function StationDisplayBoard({
  alertsByRoute,
  invertArrivingTrains,
  northbound,
  initialTimestamp,
  routeIds,
  routeGroups: providedRouteGroups,
  showSeconds,
  southbound,
  stopBorough,
  stopId,
  stopName,
}) {
  const router = useRouter();
  const now = useLiveTimestamp(initialTimestamp);
  const {
    alerts,
    filteredNorthbound,
    filteredSouthbound,
    routeGroups,
    selectedGroupIds,
    selectedGroupSet,
    toggleGroup,
  } = useBoardRouteFilter({
    alertsByRoute,
    northbound,
    providedRouteGroups,
    routeIds,
    southbound,
    stopId,
  });
  const { boardRef, fitRef, fullscreen, toggleFullscreen } = useFullscreenFit(
    `${selectedGroupIds.join("|")}:${alerts.length}`
  );

  const currentDate = new Date(now * 1000);
  const dateLabel = DISPLAY_DATE_FORMATTER.format(currentDate);
  const timeParts = DISPLAY_TIME_FORMATTER.formatToParts(currentDate);

  return (
    <div className="station-trains station-trains--board">
      <section className="station-display-board" ref={boardRef}>
        <button
          className="display-board-fullscreen-exit"
          type="button"
          onClick={toggleFullscreen}
          aria-label="Exit full screen"
        />
        <div className="display-board-fit" ref={fitRef}>
          <div className="display-board-masthead">
            <span className="display-board-brand">NYST</span>
            <time dateTime={currentDate.toISOString()} title={dateLabel}>
              {timeParts.map((part, index) => (
                <span
                  className={
                    part.type === "second"
                      ? "display-board-clock-seconds"
                      : part.type === "dayPeriod"
                        ? "display-board-clock-period"
                        : undefined
                  }
                  key={`${part.type}-${index}`}
                >
                  {part.value}
                </span>
              ))}
            </time>
          </div>
          <header className="display-board-header">
            <div className="display-board-identity">
              {routeGroups.length > 1 ? (
                <RouteFilters
                  routeGroups={routeGroups}
                  selectedGroupSet={selectedGroupSet}
                  toggleGroup={toggleGroup}
                />
              ) : (
                <div className="display-board-routes">
                  {routeIds.map((routeId) => <RouteBullet routeId={routeId} size={34} key={routeId} />)}
                </div>
              )}
              <h1>{stopName}</h1>
            </div>
            <div className="display-board-controls">
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) window.history.back();
                  else router.push("/subway");
                }}
              >
                Back
              </button>
              <Link href="/settings">Settings</Link>
              <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>
                {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
                {fullscreen ? "Exit full screen" : "Full screen"}
              </button>
            </div>
          </header>
          <div className="display-board-directions">
            <BoardDirection
              direction="northbound"
              invertArrivingTrains={invertArrivingTrains}
              trains={filteredNorthbound}
              stopBorough={stopBorough}
              stopId={stopId}
              now={now}
              showSeconds={showSeconds}
            />
            <BoardDirection
              direction="southbound"
              invertArrivingTrains={invertArrivingTrains}
              trains={filteredSouthbound}
              stopBorough={stopBorough}
              stopId={stopId}
              now={now}
              showSeconds={showSeconds}
            />
          </div>
          {!filteredNorthbound.length && !filteredSouthbound.length && (
            <p className="display-board-empty">No upcoming trains reported.</p>
          )}
          <BoardAlerts alerts={alerts} />
        </div>
      </section>
    </div>
  );
}
