function containsContiguousStops(candidate, stops) {
  if (!stops.length || candidate.length < stops.length) return false;

  for (let start = 0; start <= candidate.length - stops.length; start += 1) {
    if (stops.every((stopId, index) => candidate[start + index] === stopId)) return true;
  }
  return false;
}

export function extendShortTurnPattern(pattern, availablePatterns) {
  if (!pattern) return pattern;

  return availablePatterns
    .filter(
      (candidate) =>
        candidate.count >= pattern.count &&
        containsContiguousStops(candidate.stopIds, pattern.stopIds)
    )
    .sort((a, b) => b.stopIds.length - a.stopIds.length || b.count - a.count)[0] || pattern;
}

export function hasServiceAtStops(routesByStop, stopIds, routeId) {
  return stopIds.some((stopId) => routesByStop.get(stopId)?.has(routeId));
}

export function mostCompletePattern(patterns) {
  const grouped = new Map();
  for (const pattern of patterns) {
    if (!pattern?.stopIds?.length) continue;
    const key = pattern.stopIds.join(",");
    const existing = grouped.get(key) || { stopIds: pattern.stopIds, count: 0 };
    existing.count += 1;
    grouped.set(key, existing);
  }

  return [...grouped.values()].sort(
    (a, b) => b.stopIds.length - a.stopIds.length || b.count - a.count
  )[0];
}

export function countActiveRuns(stopIds, activeStopIds) {
  let runs = 0;
  let wasActive = false;

  for (const stopId of stopIds) {
    const isActive = activeStopIds.has(stopId);
    if (isActive && !wasActive) runs += 1;
    wasActive = isActive;
  }

  return runs;
}

export function applyRealtimeDetour(baseStopIds, patterns) {
  const baseIndex = new Map(baseStopIds.map((stopId, index) => [stopId, index]));
  let bestDetour = null;

  for (const pattern of patterns) {
    let stopIds = pattern?.stopIds || [];
    const sharedStops = stopIds.filter((stopId) => baseIndex.has(stopId));
    if (sharedStops.length < 2) continue;

    if (baseIndex.get(sharedStops[0]) > baseIndex.get(sharedStops.at(-1))) {
      stopIds = [...stopIds].reverse();
    }

    for (let index = 1; index < stopIds.length - 1; index += 1) {
      if (baseIndex.has(stopIds[index])) continue;

      const runStart = index;
      while (index < stopIds.length && !baseIndex.has(stopIds[index])) index += 1;
      const startId = stopIds[runStart - 1];
      const endId = stopIds[index];
      const startIndex = baseIndex.get(startId);
      const endIndex = baseIndex.get(endId);
      if (startIndex === undefined || endIndex === undefined || startIndex >= endIndex) {
        continue;
      }

      const replacement = stopIds.slice(runStart - 1, index + 1);
      const score = (endIndex - startIndex) * 100 + replacement.length;
      if (!bestDetour || score > bestDetour.score) {
        bestDetour = { startIndex, endIndex, replacement, score };
      }
    }
  }

  if (!bestDetour) return baseStopIds;
  return [
    ...baseStopIds.slice(0, bestDetour.startIndex),
    ...bestDetour.replacement,
    ...baseStopIds.slice(bestDetour.endIndex + 1),
  ];
}

function normalizedStationName(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sectionEndpointId(value, stops) {
  const target = normalizedStationName(value);
  if (!target) return null;
  const exact = stops.find((stop) => normalizedStationName(stop.name) === target);
  if (exact) return exact.id;

  // Alert text occasionally omits a borough or avenue suffix. Only accept a
  // partial name when it identifies exactly one stop on this route.
  const matches = stops.filter((stop) => {
    const name = normalizedStationName(stop.name);
    return name.startsWith(target) || target.startsWith(name);
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function isSplitServiceAlert(alert) {
  const text = `${alert?.header || ""}\n${alert?.description || ""}`;
  return /\b(?:runs|operates)\s+in\s+(?:two|three|four|\d+)\s+sections?\b/i.test(text);
}

export function alertSectionStopIds(alerts, stops) {
  const active = new Set();

  for (const alert of alerts) {
    const text = `${alert.header || ""}\n${alert.description || ""}`;
    if (!isSplitServiceAlert(alert)) continue;

    for (const line of text.split(/\r?\n/)) {
      const section = line.match(
        /^\s*\d+[.)]?\s+.*?\bbetween\s+(.+?)\s+and\s+(.+?)(?=,|\s+stopping\b|\s+every\b|$)/i
      );
      if (!section) continue;
      const firstId = sectionEndpointId(section[1], stops);
      const secondId = sectionEndpointId(section[2], stops);
      const firstIndex = stops.findIndex((stop) => stop.id === firstId);
      const secondIndex = stops.findIndex((stop) => stop.id === secondId);
      if (firstIndex < 0 || secondIndex < 0) continue;

      const start = Math.min(firstIndex, secondIndex);
      const end = Math.max(firstIndex, secondIndex);
      for (const stop of stops.slice(start, end + 1)) active.add(stop.id);
    }
  }

  return active;
}

export function offRouteTerminalBranches(baseStopIds, patterns) {
  const baseStops = new Set(baseStopIds);
  const baseIndex = new Map(baseStopIds.map((stopId, index) => [stopId, index]));
  const branches = new Map();

  const saveBranch = (junctionId, stopIds, placement) => {
    if (!junctionId || !stopIds.length) return;
    const terminalId = placement === "before" ? stopIds[0] : stopIds.at(-1);
    const key = `${junctionId}:${terminalId}`;
    const existing = branches.get(key);
    if (!existing || stopIds.length > existing.stopIds.length) {
      branches.set(key, { junctionId, terminalId, placement, stopIds });
    }
  };

  for (const pattern of patterns) {
    const stopIds = pattern?.stopIds || [];
    const firstBaseIndex = stopIds.findIndex((stopId) => baseStops.has(stopId));
    if (firstBaseIndex < 0) continue;

    const lastBaseIndex = stopIds.findLastIndex((stopId) => baseStops.has(stopId));
    const matchedBaseIndices = stopIds
      .slice(firstBaseIndex, lastBaseIndex + 1)
      .filter((stopId) => baseStops.has(stopId))
      .map((stopId) => baseIndex.get(stopId));
    const followsBaseOrder = matchedBaseIndices.length < 2 ||
      matchedBaseIndices.at(-1) >= matchedBaseIndices[0];
    const prefix = stopIds.slice(0, firstBaseIndex);
    const suffix = stopIds.slice(lastBaseIndex + 1);

    saveBranch(
      stopIds[firstBaseIndex],
      followsBaseOrder ? prefix : [...prefix].reverse(),
      followsBaseOrder ? "before" : "after"
    );
    saveBranch(
      stopIds[lastBaseIndex],
      followsBaseOrder ? suffix : [...suffix].reverse(),
      followsBaseOrder ? "after" : "before"
    );
  }

  const values = [...branches.values()];
  return values.filter((branch) => !values.some((candidate) =>
    candidate !== branch &&
    candidate.junctionId === branch.junctionId &&
    candidate.placement === branch.placement &&
    candidate.stopIds.length > branch.stopIds.length &&
    containsContiguousStops(candidate.stopIds, branch.stopIds)
  ));
}
