"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RouteBullet from "../../components/RouteBullet";
import { StationServiceAlerts } from "../../components/ServiceAlerts";
import StationDisplayBoard from "./StationDisplayBoard";
import TrainDirection from "./TrainDirection";
import { DirectionSelector, StationRouteTabs } from "./StationControls";
import { useSubwayPreferences } from "../../lib/preferences";
import { routeFamily } from "../../lib/routes";
import { createBoardRouteGroups } from "../../lib/boardRouteGroups";
import {
  directionGroupLabel,
  disambiguateDirectionGroupLabels,
} from "../../lib/directionLabels";

const EMPTY_LIST = Object.freeze([]);
const EMPTY_ALERTS = Object.freeze({});
const REFRESH_INTERVAL = 20_000;

function destinationOptions(directionId, trains) {
  const destinations = new Map();
  for (const train of trains) {
    const destinationId = train?.destination?.id || train?.destination?.name || train?.headsign;
    const label = train?.destination?.name || train?.headsign;
    if (!destinationId || !label) continue;
    const key = `${directionId}:${destinationId}`;
    const option = destinations.get(key) || {
      id: key,
      label,
      borough: train?.destination?.borough || null,
      direction: directionId,
      trains: [],
    };
    option.trains.push(train);
    destinations.set(key, option);
  }
  return [...destinations.values()];
}

function directionKey(option) {
  const direction = option.id.split(":", 1)[0];
  return `${direction}:${option.label.trim().toLocaleLowerCase()}`;
}

function stationRouteFamilies(northbound, southbound, stationServices, requestedRouteId) {
  const routeIds = [...new Set(
    [...northbound, ...southbound]
      .map((train) => train.trip?.route?.id)
      .concat(stationServices.flatMap((service) => service.routes || []))
      .concat(requestedRouteId)
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const routeFamilies = new Map();

  for (const routeId of routeIds) {
    const familyId = routeFamily(routeId);
    const members = routeFamilies.get(familyId) || [];
    members.push(routeId);
    routeFamilies.set(familyId, members);
  }

  return { routeIds, routeFamilies, familyIds: [...routeFamilies.keys()] };
}

function routeDirectionOptions({
  activeRoute,
  northbound,
  requestedRouteFamily,
  scheduledTermini,
  southbound,
}) {
  const trainsForRoute = (trains) => trains.filter(
    (train) => routeFamily(train.trip?.route?.id) === activeRoute
  );
  const realtimeOptions = [
    ...destinationOptions("northbound", trainsForRoute(northbound)),
    ...destinationOptions("southbound", trainsForRoute(southbound)),
  ];
  const options = [...realtimeOptions];

  if (realtimeOptions.length === 0 || activeRoute !== requestedRouteFamily) {
    return options;
  }

  for (const terminus of scheduledTermini) {
    const direction = terminus.direction === "N" ? "northbound" : "southbound";
    const hasRealtimeService = realtimeOptions.some(
      (option) => option.direction === direction
    );
    if (hasRealtimeService) continue;

    options.push({
      id: `${direction}:scheduled:${terminus.stop.id}`,
      label: terminus.stop.name,
      borough: terminus.stop.borough || null,
      direction,
      trains: [],
    });
  }

  return options;
}

function groupDirectionOptions(options, stopBorough) {
  const groupedDirections = [];

  for (const option of options) {
    const label = directionGroupLabel(stopBorough, option.borough, option.direction);
    const group = groupedDirections.find((item) => item.id === option.direction);
    if (!group) {
      groupedDirections.push({ id: option.direction, label, options: [option] });
      continue;
    }

    group.options.push(option);
    if (label.includes("/") || !group.label.includes("/")) group.label = label;
  }

  return disambiguateDirectionGroupLabels(groupedDirections);
}

export default function StationTrains({
  northbound,
  southbound,
  stopId,
  now,
  requestedRoute,
  scheduledTermini = EMPTY_LIST,
  stopBorough,
  sameStationTransfers = EMPTY_LIST,
  alertsByRoute = EMPTY_ALERTS,
  stopName,
  stationServices = EMPTY_LIST,
}) {
  const router = useRouter();
  const {
    boardAlertLayout,
    boardArrivalInversion,
    showSeconds,
    stationView,
  } = useSubwayPreferences();
  const requestedRouteId = String(requestedRoute || "").trim();
  const requestedRouteFamily = routeFamily(requestedRouteId);
  const { routeIds, routeFamilies, familyIds } = useMemo(
    () => stationRouteFamilies(
      northbound,
      southbound,
      stationServices,
      requestedRouteId
    ),
    [northbound, requestedRouteId, southbound, stationServices]
  );
  const boardRouteIds = useMemo(() => [...new Set(
    [...northbound, ...southbound]
      .map((train) => train.trip?.route?.id)
      .filter(Boolean)
  )].sort((left, right) => (
    left.localeCompare(right, undefined, { numeric: true })
  )), [northbound, southbound]);
  const boardRouteGroups = useMemo(
    () => createBoardRouteGroups(boardRouteIds, stationServices),
    [boardRouteIds, stationServices]
  );

  const [selectedRoute, setSelectedRoute] = useState(
    requestedRouteFamily || familyIds[0] || ""
  );
  const [selectedDirection, setSelectedDirection] = useState("");
  const [selectedTerminus, setSelectedTerminus] = useState("");

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL);
    return () => window.clearInterval(refreshTimer);
  }, [router]);
  const activeRoute = familyIds.includes(selectedRoute) ? selectedRoute : familyIds[0] || "";
  const directionOptions = useMemo(
    () => routeDirectionOptions({
      activeRoute,
      northbound,
      requestedRouteFamily,
      scheduledTermini,
      southbound,
    }),
    [
      activeRoute,
      northbound,
      requestedRouteFamily,
      scheduledTermini,
      southbound,
    ]
  );
  const directionGroups = useMemo(
    () => groupDirectionOptions(directionOptions, stopBorough),
    [directionOptions, stopBorough]
  );
  const activeDirectionGroup = directionGroups.find(
    (group) => group.id === selectedDirection
  ) || directionGroups[0];
  const activeTerminus = activeDirectionGroup?.options.find(
    (option) => directionKey(option) === selectedTerminus
  );
  const activeTrains = activeTerminus
    ? activeTerminus.trains
    : activeDirectionGroup?.options.flatMap((option) => option.trains) || [];
  const activeRouteAlerts = alertsByRoute[activeRoute] || [];

  if (!routeIds.length) return null;

  if (stationView === "board") {
    return (
      <StationDisplayBoard
        alertsByRoute={alertsByRoute}
        alertLayout={boardAlertLayout}
        invertArrivingTrains={boardArrivalInversion}
        northbound={northbound}
        initialTimestamp={now}
        routeIds={boardRouteIds}
        routeGroups={boardRouteGroups}
        showSeconds={showSeconds}
        southbound={southbound}
        stopBorough={stopBorough}
        stopId={stopId}
        stopName={stopName}
      />
    );
  }

  return (
    <div className="station-trains station-trains--standard">
      <StationRouteTabs
        activeRoute={activeRoute}
        routeFamilies={routeFamilies}
        sameStationTransfers={sameStationTransfers}
        onRouteChange={(familyId) => {
          setSelectedRoute(familyId);
          setSelectedDirection("");
          setSelectedTerminus("");
        }}
      />

      {activeRouteAlerts.length > 0 && (
        <div className="station-service-alerts">
          <StationServiceAlerts alerts={activeRouteAlerts} />
        </div>
      )}
      <div className="station-direction-divider" aria-hidden="true" />

      {!activeDirectionGroup && activeRoute && (
        <div className="station-no-service">
          <RouteBullet routeId={activeRoute} size={26} />
          <span>
            trains are not scheduled to stop at this station in either direction. Use alternative service.
          </span>
        </div>
      )}

      {directionOptions.length > 0 && (
        <DirectionSelector
          activeDirectionGroup={activeDirectionGroup}
          activeTerminus={activeTerminus}
          directionGroups={directionGroups}
          selectedTerminus={selectedTerminus}
          terminusKey={directionKey}
          onDirectionChange={(directionId) => {
            setSelectedDirection(directionId);
            setSelectedTerminus("");
          }}
          onTerminusChange={setSelectedTerminus}
        />
      )}

      {activeDirectionGroup && activeTrains.length === 0 && (
        <div className="station-no-service station-no-service--direction">
          <span>{activeDirectionGroup.label}-bound</span>
          <RouteBullet routeId={activeRoute} size={26} />
          <span>
            trains are not stopping at this station right now. Use alternative service.
          </span>
        </div>
      )}

      {activeDirectionGroup && activeTrains.length > 0 && (
        <TrainDirection
          key={`${activeDirectionGroup.id}:${selectedTerminus || "all"}`}
          title=""
          trains={activeTrains}
          stopId={stopId}
          initialTimestamp={now}
          showSeconds={showSeconds}
        />
      )}
    </div>
  );
}
