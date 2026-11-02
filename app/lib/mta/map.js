import { ROUTE_COLORS, routeFamily } from "../routes.js";
import { stationActiveRouteIds, stationRouteIds } from "../stationDiscovery.js";
import { activeServiceIds } from "./helpers.js";
import { getRealtime, getStatic } from "./feeds.js";
import { getStations } from "./stations.js";
import { stationStopId } from "./stopIds.js";
import { tripLookupId } from "./stopIds.js";

const MAX_SHAPES_PER_ROUTE = 6;
const MAX_POINTS_PER_SHAPE = 500;
const COLOR_OFFSETS = {
  "0039A6": -6,
  "FF6319": -4.5,
  "6CBE45": -3,
  "996633": -1.5,
  "A7A9AC": 0,
  "FCCC0A": 1.5,
  "EE352E": 3,
  "00933C": 4.5,
  "B933AD": 6,
};

function compactCoordinates(points) {
  const stride = Math.max(1, Math.ceil(points.length / MAX_POINTS_PER_SHAPE));
  const coordinates = points
    .filter((_, index) => index % stride === 0 || index === points.length - 1)
    .map((point) => [Number(point.shape_pt_lon), Number(point.shape_pt_lat)])
    .filter(([longitude, latitude]) => (
      Number.isFinite(longitude) && Number.isFinite(latitude)
    ));

  return coordinates.length >= 2 ? coordinates : [];
}

export function buildRouteLineFeatures(trips, shapes, serviceIds = null) {
  const shapePoints = new Map();
  for (const point of shapes) {
    const points = shapePoints.get(point.shape_id) || [];
    points.push(point);
    shapePoints.set(point.shape_id, points);
  }
  for (const points of shapePoints.values()) {
    points.sort((left, right) => (
      Number(left.shape_pt_sequence) - Number(right.shape_pt_sequence)
    ));
  }

  const eligibleTrips = serviceIds
    ? trips.filter((trip) => serviceIds.has(trip.service_id))
    : trips;
  const tripPool = eligibleTrips.length ? eligibleTrips : trips;
  const shapeCountsByRoute = new Map();

  for (const trip of tripPool) {
    const routeId = routeFamily(trip.route_id);
    if (!routeId || !trip.shape_id || !shapePoints.has(trip.shape_id)) continue;
    const counts = shapeCountsByRoute.get(routeId) || new Map();
    counts.set(trip.shape_id, (counts.get(trip.shape_id) || 0) + 1);
    shapeCountsByRoute.set(routeId, counts);
  }

  return [...shapeCountsByRoute]
    .flatMap(([routeId, counts]) => (
      [...counts]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, MAX_SHAPES_PER_ROUTE)
        .map(([shapeId]) => ({
          type: "Feature",
          properties: {
            routeId,
            color: `#${ROUTE_COLORS[routeId] || "808183"}`,
            offset: COLOR_OFFSETS[ROUTE_COLORS[routeId]] || 0,
          },
          geometry: {
            type: "LineString",
            coordinates: compactCoordinates(shapePoints.get(shapeId)),
          },
        }))
    ))
    .filter((feature) => feature.geometry.coordinates.length >= 2);
}

function realtimeStopCoordinate(stopId, stopsById) {
  const stop = stopsById.get(stopId) || stopsById.get(stationStopId(stopId));
  const longitude = Number(stop?.stop_lon);
  const latitude = Number(stop?.stop_lat);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

export function smoothLineCoordinates(coordinates, stepsPerSegment = 8) {
  if (coordinates.length < 3) return coordinates;
  const smoothed = [coordinates[0]];

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const p0 = coordinates[Math.max(0, index - 1)];
    const p1 = coordinates[index];
    const p2 = coordinates[index + 1];
    const p3 = coordinates[Math.min(coordinates.length - 1, index + 2)];
    for (let step = 1; step <= stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      smoothed.push([0, 1].map((axis) => 0.5 * (
        2 * p1[axis] +
        (-p0[axis] + p2[axis]) * t +
        (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
        (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
      )));
    }
  }

  return smoothed;
}

export function buildRealtimeStationLineFeatures(
  entities,
  stopsById,
  displayedRouteIds,
  serviceStopIds,
  staticData = null
) {
  const displayedRouteSet = new Set(displayedRouteIds.map(routeFamily));
  const stationStopIds = new Set([...serviceStopIds].map(stationStopId));
  const candidates = new Map();

  for (const entity of entities) {
    const update = entity.tripUpdate;
    const routeId = routeFamily(update?.trip?.routeId);
    if (!update || !displayedRouteSet.has(routeId)) continue;

    const updates = update.stopTimeUpdate || [];
    if (!updates.some((item) => stationStopIds.has(stationStopId(item.stopId)))) continue;
    const staticTrip = staticData?.tripsByRealtimeId?.get(
      tripLookupId(update.trip?.tripId)
    );
    const staticShape = staticTrip?.shape_id
      ? compactCoordinates(staticData?.shapesById?.get(staticTrip.shape_id) || [])
      : [];
    const coordinates = staticShape.length >= 2
      ? staticShape
      : updates
        .map((item) => realtimeStopCoordinate(item.stopId, stopsById))
        .filter(Boolean)
        .filter((coordinate, index, all) => (
          index === 0 || coordinate[0] !== all[index - 1][0] || coordinate[1] !== all[index - 1][1]
        ));
    if (coordinates.length < 2) continue;

    const candidate = {
      coordinates,
      authoritative: staticShape.length >= 2,
    };
    const existing = candidates.get(routeId);
    if (!existing || coordinates.length > existing.coordinates.length) {
      candidates.set(routeId, candidate);
    }
  }

  const activeRoutes = displayedRouteIds
    .map(routeFamily)
    .filter((routeId, index, all) => all.indexOf(routeId) === index)
    .filter((routeId) => candidates.has(routeId));
  const colorGroups = [];
  for (const routeId of activeRoutes) {
    const color = ROUTE_COLORS[routeId] || "808183";
    const group = colorGroups.find((item) => item.color === color);
    if (group) {
      group.routeIds.push(routeId);
    } else {
      colorGroups.push({
        color,
        routeIds: [routeId],
        path: candidates.get(routeId),
      });
    }
  }
  const middle = (colorGroups.length - 1) / 2;

  return colorGroups.map((group, index) => ({
    type: "Feature",
    properties: {
      routeId: group.routeIds.join(","),
      color: `#${group.color}`,
      offset: (index - middle) * 8,
    },
    geometry: {
      type: "LineString",
      coordinates: group.path.authoritative
        ? group.path.coordinates
        : smoothLineCoordinates(group.path.coordinates),
    },
  }));
}

function stopUpdateTime(stopUpdate) {
  const value = stopUpdate?.arrival?.time ?? stopUpdate?.departure?.time;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function coordinateBearing(start, end) {
  const latitude = (start[1] + end[1]) / 2;
  const longitudeScale = Math.cos(latitude * Math.PI / 180);
  return Math.atan2(
    (end[0] - start[0]) * longitudeScale,
    end[1] - start[1]
  ) * 180 / Math.PI;
}

export function buildRealtimeStationVehicles(
  entities,
  stopsById,
  displayedRouteIds,
  now = Math.floor(Date.now() / 1000)
) {
  const displayedRouteSet = new Set(displayedRouteIds.map(routeFamily));
  const vehicles = [];

  for (const entity of entities) {
    const update = entity.tripUpdate;
    const routeId = routeFamily(update?.trip?.routeId);
    if (!update || !displayedRouteSet.has(routeId)) continue;
    const timedStops = (update.stopTimeUpdate || []).flatMap((item) => {
      const coordinate = realtimeStopCoordinate(item.stopId, stopsById);
      const timestamp = stopUpdateTime(item);
      return coordinate && timestamp
        ? [{ coordinate, timestamp }]
        : [];
    });
    if (!timedStops.length) continue;

    const nextIndex = timedStops.findIndex((item) => item.timestamp >= now);
    if (nextIndex < 0) continue;
    let longitude = timedStops[nextIndex].coordinate[0];
    let latitude = timedStops[nextIndex].coordinate[1];
    const directionStart = nextIndex > 0
      ? timedStops[nextIndex - 1]?.coordinate
      : timedStops[nextIndex]?.coordinate;
    const directionEnd = nextIndex > 0
      ? timedStops[nextIndex]?.coordinate
      : timedStops[nextIndex + 1]?.coordinate;
    const directionBearing = directionStart && directionEnd
      ? coordinateBearing(directionStart, directionEnd)
      : 0;
    if (nextIndex > 0) {
      const previous = timedStops[nextIndex - 1];
      const next = timedStops[nextIndex];
      const duration = Math.max(1, next.timestamp - previous.timestamp);
      const progress = Math.max(0, Math.min(1, (now - previous.timestamp) / duration));
      longitude = previous.coordinate[0] + (next.coordinate[0] - previous.coordinate[0]) * progress;
      latitude = previous.coordinate[1] + (next.coordinate[1] - previous.coordinate[1]) * progress;
    }

    vehicles.push({
      id: update.trip?.tripId || entity.id || `${routeId}-${vehicles.length}`,
      routeId,
      color: `#${ROUTE_COLORS[routeId] || "808183"}`,
      textColor: ["FCCC0A", "6CBE45"].includes(ROUTE_COLORS[routeId])
        ? "#000000"
        : "#ffffff",
      longitude,
      latitude,
      directionBearing,
    });
  }

  return vehicles;
}

function featurePaths(feature) {
  return feature.geometry.type === "MultiLineString"
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
}

export function snapVehiclesToLines(vehicles, lines) {
  return vehicles.map((vehicle) => {
    const matchingLines = lines.filter((line) => line.properties.color === vehicle.color);
    let closest = null;

    for (const line of matchingLines) {
      for (const path of featurePaths(line)) {
        for (let index = 1; index < path.length; index += 1) {
          const start = path[index - 1];
          const end = path[index];
          const latitudeScale = Math.cos((vehicle.latitude * Math.PI) / 180);
          const startX = start[0] * latitudeScale;
          const endX = end[0] * latitudeScale;
          const vehicleX = vehicle.longitude * latitudeScale;
          const dx = endX - startX;
          const dy = end[1] - start[1];
          const lengthSquared = dx * dx + dy * dy;
          if (!lengthSquared) continue;
          const progress = Math.max(0, Math.min(1, (
            (vehicleX - startX) * dx + (vehicle.latitude - start[1]) * dy
          ) / lengthSquared));
          const longitude = start[0] + (end[0] - start[0]) * progress;
          const latitude = start[1] + (end[1] - start[1]) * progress;
          const distanceSquared = (
            (vehicle.longitude - longitude) * latitudeScale
          ) ** 2 + (vehicle.latitude - latitude) ** 2;

          if (!closest || distanceSquared < closest.distanceSquared) {
            closest = {
              distanceSquared,
              longitude,
              latitude,
              bearing: Math.atan2(dx, dy) * 180 / Math.PI,
              offset: Number(line.properties.offset) || 0,
            };
          }
        }
      }
    }

    return closest ? { ...vehicle, ...closest } : vehicle;
  });
}

export async function getStationMapData(stopId) {
  const [data, entities, stations] = await Promise.all([
    getStatic(),
    getRealtime(),
    getStations(),
  ]);
  const baseStopId = stationStopId(stopId);
  const station = stations.find((item) => (
    item.services.some((service) => service.id === baseStopId)
  ));
  if (!station) return null;

  const routeIds = stationActiveRouteIds(station);
  const displayedRouteIds = routeIds.length ? routeIds : stationRouteIds(station);
  const serviceStopIds = new Set(station.services.map((service) => service.id));
  let lines = buildRealtimeStationLineFeatures(
    entities,
    data.stopsById,
    displayedRouteIds,
    serviceStopIds,
    data
  );
  const realtimeColors = new Set(lines.map((line) => line.properties.color));
  const missingRouteIds = displayedRouteIds.filter((routeId) => (
    !realtimeColors.has(`#${ROUTE_COLORS[routeFamily(routeId)] || "808183"}`)
  ));
  if (missingRouteIds.length) {
    const displayedRouteSet = new Set(displayedRouteIds);
    const trips = data.trips.filter((trip) => (
      displayedRouteSet.has(routeFamily(trip.route_id)) &&
      (data.stopTimesByTrip.get(trip.trip_id) || []).some((stopTime) => (
        serviceStopIds.has(stationStopId(stopTime.stop_id))
      ))
    ));
    const fallbackLines = buildRouteLineFeatures(trips, data.shapes, activeServiceIds(data));
    const addedFallbackColors = new Set();
    const fallbackByColor = missingRouteIds.flatMap((displayedRouteId) => {
      const feature = fallbackLines.find((line) => line.properties.routeId === displayedRouteId);
      if (!feature) return [];
      if (
        realtimeColors.has(feature.properties.color) ||
        addedFallbackColors.has(feature.properties.color)
      ) return [];
      addedFallbackColors.add(feature.properties.color);
      return [{
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: smoothLineCoordinates(feature.geometry.coordinates, 3),
        },
      }];
    });
    lines = [...lines, ...fallbackByColor];
  }
  const middle = (lines.length - 1) / 2;
  lines = lines.map((line, index) => ({
    ...line,
    properties: { ...line.properties, offset: (index - middle) * 8 },
  }));
  const vehicles = snapVehiclesToLines(
    buildRealtimeStationVehicles(entities, data.stopsById, displayedRouteIds),
    lines
  );

  return {
    lines,
    vehicles,
    station: {
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      routeIds: displayedRouteIds,
    },
  };
}

export async function getSubwayMapData() {
  const [data, stations] = await Promise.all([getStatic(), getStations()]);
  const lines = buildRouteLineFeatures(
    data.trips,
    data.shapes,
    activeServiceIds(data)
  );

  return {
    lines,
    stations: stations.map((station) => ({
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      routeIds: stationRouteIds(station),
      activeRouteIds: stationActiveRouteIds(station),
      services: station.services.map((service) => ({
        id: service.id,
        routeIds: [...new Set([
          ...(service.routes || []),
          ...(service.realtimeRoutes || []),
        ].map(routeFamily))],
      })),
    })),
  };
}
