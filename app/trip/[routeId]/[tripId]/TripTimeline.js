"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Metro } from "iconoir-react";
import { ChevronDown } from "lucide-react";
import RouteBullet from "../../../components/RouteBullet";
import { useSubwayPreferences } from "../../../lib/preferences";
import { parentStopId, selectedStopStatus } from "../../../lib/tripProgress";
import { hasTransferRouteChange } from "../../../lib/routes";
import { useLiveTimestamp } from "../../../lib/useLiveTimestamp";

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/New_York",
});

function formatTime(timestamp) {
  return timestamp ? TIME_FORMATTER.format(new Date(Number(timestamp) * 1000)) : "";
}

function TransferRoutes({ routeIds }) {
  return (
    <div
      className="trip-transfer-routes"
      aria-label={`Transfer available to ${routeIds.join(", ")}`}
    >
      {routeIds.map((routeId) => (
        <Link
          key={routeId}
          href={`/route/${encodeURIComponent(routeId)}`}
          aria-label={`View ${routeId} train route`}
          className="trip-transfer-link"
        >
          <RouteBullet routeId={routeId} title={`${routeId} train`} size={20} />
        </Link>
      ))}
    </div>
  );
}

function TripStopRow({
  index,
  intermediateStopCount,
  nextStopIndex,
  now,
  routeId,
  selectedStopIndex,
  stopTime,
  stopTimes,
  stopsAway,
  tripProgressUnit,
}) {
  if (!stopTime.stop) return null;

  const stopId = parentStopId(stopTime.stop.id);
  const timestamp = stopTime.arrival?.time || stopTime.departure?.time;
  const isNext = index === nextStopIndex;
  const isSelected = index === selectedStopIndex;
  const isPast = nextStopIndex !== -1 && index < nextStopIndex;
  const isBetweenSelectedStops = intermediateStopCount > 0
    && index > nextStopIndex
    && index < selectedStopIndex;
  const transferRoutes = stopTime.transferRoutes || [];
  const showTransferRoutes = index === 0
    || index === stopTimes.length - 1
    || hasTransferRouteChange(
      transferRoutes,
      stopTimes[index - 1]?.transferRoutes,
      stopTimes[index + 1]?.transferRoutes
    );
  const rowHeight = transferRoutes.length && showTransferRoutes ? 78 : 58;
  const wrapperClassName = [
    isPast && "trip-past-stop",
    isBetweenSelectedStops && "trip-between-stop",
  ].filter(Boolean).join(" ") || undefined;

  return (
    <Fragment>
      <div className={wrapperClassName}>
        <div
          className={`trip-stop-row${isPast ? " trip-stop-row--past" : ""}${isNext ? " trip-stop-row--next" : ""}`}
          style={{ "--trip-row-height": `${rowHeight}px` }}
        >
          <Link
            className="trip-stop-link"
            href={`/stop/${stopId}?route=${encodeURIComponent(routeId)}`}
            aria-label={`View ${stopTime.stop.name} station`}
          />
          <div className="trip-stop-time">{formatTime(timestamp)}</div>

          <div className="trip-stop-track">
            {index !== 0 && <div className="trip-track-line trip-track-line--above" />}
            {index !== stopTimes.length - 1 && (
              <div className="trip-track-line trip-track-line--below" />
            )}
            {isNext ? (
              <span className="trip-train-icon">
                <Metro aria-hidden="true" strokeWidth={2} />
              </span>
            ) : (
              <div className="trip-stop-dot" />
            )}
          </div>

          <div
            className={`trip-stop-details${isNext || isSelected ? " trip-stop-details--emphasized" : ""}`}
          >
            <div className={isSelected ? "trip-selected-stop-name" : undefined}>
              <span>{stopTime.stop.name}</span>
              {isSelected && (
                <span className="trip-stops-away">
                  {selectedStopStatus(stopsAway, timestamp, now, tripProgressUnit)}
                </span>
              )}
            </div>
            {showTransferRoutes && transferRoutes.length > 0 && (
              <TransferRoutes routeIds={transferRoutes} />
            )}
          </div>
        </div>
      </div>

      {isNext && intermediateStopCount > 0 && (
        <label className="trip-between-control" htmlFor="trip-between-toggle">
          <span className="trip-between-line" aria-hidden="true" />
          <span className="show-copy">Show intermediate stops</span>
          <span className="hide-copy">Hide intermediate stops</span>
          <ChevronDown aria-hidden="true" />
        </label>
      )}
    </Fragment>
  );
}

export default function TripTimeline({ initialTimestamp, progress, routeId, stopTimes }) {
  const now = useLiveTimestamp(initialTimestamp);
  const { tripProgressUnit } = useSubwayPreferences();
  const {
    intermediateStopCount,
    nextStopIndex,
    previousStopCount,
    selectedStopIndex,
    stopsAway,
  } = progress;

  return (
    <>
      {previousStopCount > 0 && (
        <input
          className="trip-previous-toggle"
          id="trip-previous-toggle"
          type="checkbox"
        />
      )}
      {previousStopCount > 0 && (
        <label className="trip-previous-control" htmlFor="trip-previous-toggle">
          <span className="show-copy">Show previous stops ({previousStopCount})</span>
          <span className="hide-copy">Hide previous stops</span>
          <ChevronDown aria-hidden="true" />
        </label>
      )}
      {intermediateStopCount > 0 && (
        <input
          className="trip-between-toggle"
          id="trip-between-toggle"
          type="checkbox"
        />
      )}

      <div className="trip-timeline">
        {stopTimes.map((stopTime, index) => (
          <TripStopRow
            index={index}
            intermediateStopCount={intermediateStopCount}
            key={`${stopTime.stop?.id || "stop"}-${index}`}
            nextStopIndex={nextStopIndex}
            now={now}
            routeId={routeId}
            selectedStopIndex={selectedStopIndex}
            stopTime={stopTime}
            stopTimes={stopTimes}
            stopsAway={stopsAway}
            tripProgressUnit={tripProgressUnit}
          />
        ))}
      </div>
    </>
  );
}
