export function parentStopId(stopId) {
  return String(stopId || "").replace(/[NS]$/, "");
}

export function selectedStopStatus(stopsAway, timestamp, now, unit = "minutes") {
  if (stopsAway === null) return "passed";

  const arrivalTime = Number(timestamp);
  const currentTime = Number(now);
  if (Number.isFinite(arrivalTime) && Number.isFinite(currentTime)) {
    const secondsAway = arrivalTime - currentTime;
    if (secondsAway <= 30) return "arriving now";
    if (unit === "minutes") {
      const minutesAway = Math.ceil(secondsAway / 60);
      return `${minutesAway} min away`;
    }
  }

  return `${stopsAway} ${stopsAway === 1 ? "stop" : "stops"} away`;
}

export function buildTripProgress(stopTimes, selectedStopId) {
  const nextStopIndex = stopTimes.findIndex((stopTime) => stopTime.future === true);
  const normalizedSelectedStopId = parentStopId(selectedStopId);
  const selectedStopIndex = normalizedSelectedStopId
    ? stopTimes.findIndex(
        (stopTime) => parentStopId(stopTime.stop?.id) === normalizedSelectedStopId
      )
    : -1;
  const stopsAway = nextStopIndex >= 0 && selectedStopIndex >= nextStopIndex
    ? selectedStopIndex - nextStopIndex
    : null;

  return {
    nextStopIndex,
    nextStop: nextStopIndex >= 0 ? stopTimes[nextStopIndex]?.stop || null : null,
    previousStopCount: Math.max(0, nextStopIndex),
    selectedStopIndex,
    stopsAway,
    intermediateStopCount: stopsAway > 1 ? stopsAway - 1 : 0,
  };
}
