"use client";

import Link from "next/link";
import { useState } from "react";
import RouteBullet from "../../components/RouteBullet";
import { formatArrivalCountdown } from "../../lib/time";
import { useLiveTimestamp } from "../../lib/useLiveTimestamp";

function ClockIcon() {
  return (
    <svg
      aria-label="Train has not departed"
      role="img"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className="arrival-clock-icon"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrainList({ trains, stopId, now, showSeconds }) {
  const [visibleLimit, setVisibleLimit] = useState(6);
  const currentTrains = trains
    .filter((train) => {
      const arrivalTime = train.arrival?.time || train.departure?.time;
      return !arrivalTime || Number(arrivalTime) >= now - 30;
    })
    .sort((a, b) =>
      Number(a.arrival?.time || a.departure?.time || Infinity) -
      Number(b.arrival?.time || b.departure?.time || Infinity)
    );
  const visibleTrains = currentTrains.slice(0, visibleLimit);
  const fullyExpanded = visibleLimit >= Math.min(18, currentTrains.length);

  return (
    <div className="arrival-list">
      {visibleTrains.map((train, index) => {
        const routeId = train.trip?.route?.id || "?";
        const arrivalTime = train.arrival?.time || train.departure?.time;
        const remainingSeconds = arrivalTime ? Math.max(0, Number(arrivalTime) - now) : null;
        const destinationId = train.destination?.id || "";
        const terminating = destinationId.startsWith(stopId);
        const hasNotDeparted = train.notDeparted;

        return (
          <Link
            key={`${routeId}-${train.trip?.id || index}`}
            href={`/trip/${routeId}/${encodeURIComponent(train.trip?.id || "")}?from=${encodeURIComponent(stopId)}`}
            className="arrival-row"
          >
            <RouteBullet routeId={routeId} size={38} alt={routeId} className="arrival-bullet" />
            <div className="arrival-destination">
              <div>{terminating ? "Terminating" : train.destination?.name || "Unknown destination"}</div>
              {train.delayMinutes && (
                <div className="arrival-delay">
                  Est. Delayed: {train.delayMinutes} min
                </div>
              )}
            </div>
            <div className={`arrival-time${hasNotDeparted ? " arrival-time--pending" : ""}`}>
              <span>
                {formatArrivalCountdown(remainingSeconds, showSeconds)}
              </span>
              {hasNotDeparted && <ClockIcon />}
            </div>
          </Link>
        );
      })}

      {currentTrains.length > 6 && (
        <button
          type="button"
          onClick={() => setVisibleLimit(fullyExpanded ? 6 : Math.min(18, visibleLimit + 6))}
          className="arrival-show-more"
        >
          {fullyExpanded ? "Show fewer trains" : "Show more trains"}
        </button>
      )}
    </div>
  );
}

export default function TrainDirection({
  title,
  trains,
  stopId,
  initialTimestamp,
  showSeconds,
}) {
  const now = useLiveTimestamp(initialTimestamp);

  return (
    <section className={`train-direction${title ? " train-direction--titled" : ""}`}>
      {title && (
        <h2>{title}</h2>
      )}
      <TrainList
        trains={trains}
        stopId={stopId}
        now={now}
        showSeconds={showSeconds}
      />
    </section>
  );
}
