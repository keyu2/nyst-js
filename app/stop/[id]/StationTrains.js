"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RouteBullet from "../../components/RouteBullet";
import { StationServiceAlerts } from "../../components/ServiceAlerts";
import StationDisplayBoard from "./StationDisplayBoard";
import StationMap from "./StationMap";
import TrainDirection from "./TrainDirection";
import { DirectionSelector, StationRouteTabs } from "./StationControls";
import { useSubwayPreferences } from "../../lib/preferences";
import { routeFamily } from "../../lib/routes";
import {
  createBoardRouteGroups,
  createStationRouteFamilies,
  createStationRouteGroups,
} from "../../lib/boardRouteGroups";
import {
  directionGroupLabel,
  disambiguateDirectionGroupLabels,
} from "../../lib/directionLabels";
import { realtimeDirectionOptions } from "../../lib/stationDirections";

const EMPTY_LIST = Object.freeze([]);
const EMPTY_ALERTS = Object.freeze({});
const REFRESH_INTERVAL = 20_000;

function directionKey(option) {
  const direction = option.id.split(":", 1)[0];
  return `${direction}:${option.label.trim().toLocaleLowerCase()}`;
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
  children,
  stationMapData,
  northbound,
  southbound,
  stopId,
  now,
  requestedRoute,
  stopBorough,
  sameStationTransfers = EMPTY_LIST,
  alertsByRoute = EMPTY_ALERTS,
  stopName,
  stationServices = EMPTY_LIST,
}) {
  const router = useRouter();
  const {
    boardArrivalInversion,
    showSeconds,
    stationView,
  } = useSubwayPreferences();
  const requestedRouteId = String(requestedRoute || "").trim();
  const requestedRouteFamily = routeFamily(requestedRouteId);
  const { routeIds, routeFamilies, familyIds } = useMemo(
    () => createStationRouteFamilies(
      [...northbound, ...southbound]
        .map((train) => train.trip?.route?.id)
        .filter(Boolean),
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
  const routeGroups = useMemo(() => createStationRouteGroups(familyIds), [familyIds]);
  const mapRouteIds = routeGroups.find((members) => members.includes(activeRoute)) || [];
  const map = stationMapData && (
    <StationMap
      {...stationMapData}
      lines={stationMapData.lines.filter((line) => mapRouteIds.includes(routeFamily(line.properties.routeId)))}
      vehicles={stationMapData.vehicles.filter((vehicle) => mapRouteIds.includes(routeFamily(vehicle.routeId)))}
    />
  );
  const directionOptions = useMemo(
    () => realtimeDirectionOptions({
      activeRoute,
      northbound,
      southbound,
    }),
    [activeRoute, northbound, southbound]
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

  if (!routeIds.length) return <>{map}{children}</>;

  if (stationView === "board") {
    return (
      <>
      {children}
      <StationDisplayBoard
        alertsByRoute={alertsByRoute}
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
      </>
    );
  }

  return (
    <>
    {map}
    {children}
    <div className="station-trains station-trains--standard">
      <StationRouteTabs
        activeRoute={activeRoute}
        routeFamilies={routeFamilies}
        routeGroups={routeGroups}
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
    </>
  );
}
