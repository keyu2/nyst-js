const SERVICE_ORDER = ["R", "M", "F", "E", "A", "C", "B", "D", "N", "Q", "W", "G", "J", "Z", "L", "1", "2", "3", "4", "5", "6", "7", "GS", "FS", "H", "SI"];
const ROUTE_FAMILIES = { "6X": "6", "7X": "7", FX: "F", SIX: "SI" };
const CELL = 0.002;
const SHARED_DISTANCE = 45;
const LANE_SPACING = 8;
const segmentIndexes = new WeakMap();
let cachedKey = "";
let cachedLines = [];

function family(routeId) {
  return ROUTE_FAMILIES[routeId] || routeId;
}

function serviceOrder(left, right) {
  const order = (id) => {
    const index = SERVICE_ORDER.indexOf(family(id));
    return index < 0 ? SERVICE_ORDER.length : index;
  };
  return order(left) - order(right) || left.localeCompare(right);
}

function project(point, start, end) {
  const scale = Math.cos(point[1] * Math.PI / 180);
  const dx = (end[0] - start[0]) * scale;
  const dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  const fraction = length ? Math.max(0, Math.min(1,
    ((point[0] - start[0]) * scale * dx + (point[1] - start[1]) * dy) / length
  )) : 0;
  const coordinate = [start[0] + (end[0] - start[0]) * fraction, start[1] + dy * fraction];
  return { coordinate, distance: Math.hypot((point[0] - coordinate[0]) * scale, point[1] - coordinate[1]) * 111320, dx, dy };
}

function segmentIndex(lines) {
  let index = segmentIndexes.get(lines);
  if (index) return index;
  const cells = new Map();
  const routes = new Map();
  for (const [pathIndex, line] of lines.entries()) {
    const routeId = family(line.properties.routeId);
    const segments = routes.get(routeId) || [];
    const path = line.geometry.coordinates;
    for (let position = 1; position < path.length; position++) {
      const start = path[position - 1], end = path[position];
      if (start[0] === end[0] && start[1] === end[1]) continue;
      const segment = { start, end, routeId, pathIndex, offset: line.properties.offset || 0 };
      segments.push(segment);
      const west = Math.floor(Math.min(start[0], end[0]) / CELL);
      const east = Math.floor(Math.max(start[0], end[0]) / CELL);
      const south = Math.floor(Math.min(start[1], end[1]) / CELL);
      const north = Math.floor(Math.max(start[1], end[1]) / CELL);
      for (let x = west; x <= east; x++) for (let y = south; y <= north; y++) {
        const key = `${x},${y}`;
        const cell = cells.get(key) || [];
        cell.push(segment);
        cells.set(key, cell);
      }
    }
    routes.set(routeId, segments);
  }
  index = { cells, routes };
  segmentIndexes.set(lines, index);
  return index;
}

function nearbySegments(index, point, radius = 1) {
  const segments = new Set();
  const x = Math.floor(point[0] / CELL), y = Math.floor(point[1] / CELL);
  for (let column = x - radius; column <= x + radius; column++) {
    for (let row = y - radius; row <= y + radius; row++) {
      for (const segment of index.cells.get(`${column},${row}`) || []) segments.add(segment);
    }
  }
  return segments;
}

function sharedRoutes(index, point, directions, supportedPaths) {
  const matches = new Map();
  for (const segment of nearbySegments(index, point)) {
    const match = project(point, segment.start, segment.end);
    if (match.distance > SHARED_DISTANCE || (!supportedPaths.has(segment.pathIndex) && match.distance > 2)) continue;
    const alignment = Math.max(...directions.map((direction) => Math.abs(direction.dx * match.dx + direction.dy * match.dy)
      / (Math.hypot(direction.dx, direction.dy) * Math.hypot(match.dx, match.dy)) || 0));
    if (alignment < 0.94 || !Number.isFinite(alignment)) continue;
    const existing = matches.get(segment.routeId);
    if (!existing || segment.pathIndex < existing.pathIndex || (segment.pathIndex === existing.pathIndex && match.distance < existing.distance)) {
      matches.set(segment.routeId, { ...match, pathIndex: segment.pathIndex });
    }
  }
  return matches;
}

function samplePath(path) {
  const result = [path[0]];
  let carried = 0;
  for (let index = 1; index < path.length; index++) {
    let start = path[index - 1];
    const end = path[index];
    let length = project(start, end, end).distance;
    while (carried + length >= 60) {
      const fraction = (60 - carried) / length;
      const point = [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
      result.push(point);
      start = point;
      length = project(start, end, end).distance;
      carried = 0;
    }
    carried += length;
    const next = path[index + 1];
    if (next) {
      const incoming = project(end, path[index - 1], end);
      const outgoing = project(end, end, next);
      const cosine = (incoming.dx * outgoing.dx + incoming.dy * outgoing.dy)
        / (Math.hypot(incoming.dx, incoming.dy) * Math.hypot(outgoing.dx, outgoing.dy));
      if (cosine < 0.5 && carried > 1) { result.push(end); carried = 0; }
    }
  }
  const end = path.at(-1);
  if (result.at(-1)[0] !== end[0] || result.at(-1)[1] !== end[1]) result.push(end);
  return result;
}

export function layoutMapCorridors(lines) {
  const key = JSON.stringify(lines);
  if (key === cachedKey) return cachedLines;
  const paths = [];
  const seen = new Set();
  for (const line of lines) {
    const coordinates = line.geometry.type === "MultiLineString" ? line.geometry.coordinates : [line.geometry.coordinates];
    for (const id of String(line.properties.routeId).split(",")) {
      const routeId = family(id);
      for (let path of coordinates) {
        path = path.filter((point, index) => Number.isFinite(point[0]) && Number.isFinite(point[1])
          && (!index || point[0] !== path[index - 1][0] || point[1] !== path[index - 1][1]));
        if (path.length < 2) continue;
        const first = path[0], last = path.at(-1);
        if (first[0] > last[0] || (first[0] === last[0] && first[1] > last[1])) path = [...path].reverse();
        const identity = `${routeId}:${JSON.stringify(path)}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        paths.push({ type: "Feature", properties: { routeId, color: line.properties.color, offset: 0 }, geometry: { type: "LineString", coordinates: path } });
      }
    }
  }
  paths.sort((a, b) => serviceOrder(a.properties.routeId, b.properties.routeId)
    || b.geometry.coordinates.length - a.geometry.coordinates.length);
  const index = segmentIndex(paths);
  cachedLines = paths.map((line) => {
    const path = samplePath(line.geometry.coordinates);
    const laneOffsets = [];
    const coordinates = path.map((point, position) => {
      const start = path[Math.max(0, position - 1)], end = path[Math.min(path.length - 1, position + 1)];
      const direction = project(point, start, end);
      const directions = [direction, project(point, start, point), project(point, point, end)];
      const supportedPaths = new Set();
      for (const support of [path[Math.max(0, position - 3)], path[Math.min(path.length - 1, position + 3)]]) {
        if (project(point, support, support).distance < 100) continue;
        for (const segment of nearbySegments(index, support)) {
          if (project(support, segment.start, segment.end).distance <= SHARED_DISTANCE) supportedPaths.add(segment.pathIndex);
        }
      }
      let center = point;
      let matches = sharedRoutes(index, center, directions, supportedPaths);
      let leader = line.properties.routeId;
      for (let pass = 0; pass < 3; pass++) {
        const first = [...matches.keys(), line.properties.routeId].sort(serviceOrder)[0];
        if (first === leader) {
          center = matches.get(first)?.coordinate || center;
          break;
        }
        leader = first;
        center = matches.get(leader).coordinate;
        matches = sharedRoutes(index, center, directions, supportedPaths);
      }
      const services = [...new Set([...matches.keys(), line.properties.routeId])].sort(serviceOrder);
      const reference = matches.get(services[0]) || direction;
      const orientation = direction.dx * reference.dx + direction.dy * reference.dy < 0 ? -1 : 1;
      laneOffsets.push((services.indexOf(line.properties.routeId) - (services.length - 1) / 2) * LANE_SPACING * orientation);
      return center;
    });
    const offset = laneOffsets.every((value) => value === laneOffsets[0]) ? laneOffsets[0] : 0;
    return { ...line, properties: { ...line.properties, offset, laneOffsets }, geometry: { type: "LineString", coordinates } };
  });
  cachedKey = key;
  return cachedLines;
}

function nearestOnRoute(point, routeId, index) {
  let closest;
  const candidates = [...nearbySegments(index, point, 2)].filter((segment) => segment.routeId === family(routeId));
  for (const segment of candidates.length ? candidates : index.routes.get(family(routeId)) || []) {
    const match = project(point, segment.start, segment.end);
    if (!closest || match.distance < closest.distance) closest = { ...match, offset: segment.offset };
  }
  return closest;
}

export function placeMapVehicles(vehicles, lines) {
  const index = segmentIndex(lines);
  return vehicles.flatMap((vehicle) => {
    const closest = nearestOnRoute([vehicle.longitude, vehicle.latitude], vehicle.routeId, index);
    if (!closest) return [];
    const bearing = Math.atan2(closest.dx, closest.dy) * 180 / Math.PI;
    const reported = vehicle.directionBearing;
    const directionBearing = Number.isFinite(reported) && Math.cos((reported - bearing) * Math.PI / 180) < 0 ? bearing + 180 : bearing;
    return [{ ...vehicle, longitude: closest.coordinate[0], latitude: closest.coordinate[1], offset: closest.offset, bearing, directionBearing }];
  });
}

function simplifyPath(points) {
  if (points.length < 3) return points;
  const retained = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop();
    const start = points[first], end = points[last];
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = dx * dx + dy * dy;
    let furthest = -1, distance = 2;
    for (let index = first + 1; index < last; index++) {
      const point = points[index];
      const fraction = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
      const error = Math.max(Math.hypot(point.x - start.x - dx * fraction, point.y - start.y - dy * fraction),
        Math.abs(point.offset - start.offset - (end.offset - start.offset) * fraction) * 20);
      if (error > distance) { furthest = index; distance = error; }
    }
    if (furthest < 0) continue;
    retained.add(furthest);
    pending.push([first, furthest], [furthest, last]);
  }
  return [...retained].sort((a, b) => a - b).map((index) => points[index]);
}

function roundedPath(points) {
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1], point = points[index], next = points[index + 1];
    const incoming = Math.hypot(point.x - previous.x, point.y - previous.y);
    const outgoing = Math.hypot(next.x - point.x, next.y - point.y);
    const cross = (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
    const dot = (point.x - previous.x) * (next.x - point.x) + (point.y - previous.y) * (next.y - point.y);
    if (dot > 0 && Math.abs(cross) < incoming * outgoing * 0.06) { result.push(point); continue; }
    const radius = Math.min(48, incoming * 0.45, outgoing * 0.45);
    if (radius < 0.3) { result.push(point); continue; }
    const start = { x: point.x + (previous.x - point.x) * radius / incoming, y: point.y + (previous.y - point.y) * radius / incoming, offset: point.offset + (previous.offset - point.offset) * radius / incoming };
    const end = { x: point.x + (next.x - point.x) * radius / outgoing, y: point.y + (next.y - point.y) * radius / outgoing, offset: point.offset + (next.offset - point.offset) * radius / outgoing };
    result.push(start);
    const steps = Math.max(3, Math.ceil(radius / 4));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps, u = 1 - t;
      result.push({ x: u * u * start.x + 2 * u * t * point.x + t * t * end.x, y: u * u * start.y + 2 * u * t * point.y + t * t * end.y, offset: u * u * start.offset + 2 * u * t * point.offset + t * t * end.offset });
    }
  }
  result.push(points.at(-1));
  return result;
}

export function renderMapCorridors(map, lines) {
  const scale = Math.max(0.55, Math.min(1, 0.55 + (map.getZoom() - 9) / 6 * 0.45));
  return lines.flatMap((line) => {
    const pixels = line.geometry.coordinates.map((point) => map.project(point));
    const offsets = line.properties.laneOffsets || pixels.map(() => line.properties.offset);
    const canvas = map.getCanvas?.();
    const width = canvas?.clientWidth || Infinity, height = canvas?.clientHeight || Infinity;
    const ranges = [];
    let first = -1;
    for (let index = 1; index < pixels.length; index++) {
      const start = pixels[index - 1], end = pixels[index];
      const visible = !canvas || (Math.max(start.x, end.x) >= -128 && Math.min(start.x, end.x) <= width + 128
        && Math.max(start.y, end.y) >= -128 && Math.min(start.y, end.y) <= height + 128);
      if (visible && first < 0) first = index - 1;
      if (first >= 0 && (!visible || index === pixels.length - 1)) {
        ranges.push([first, visible ? index : index - 1]);
        first = -1;
      }
    }
    return ranges.map(([first, last]) => {
      const controls = pixels.slice(first, last + 1).map((point, localIndex) => {
        const index = first + localIndex;
        let total = offsets[index], weight = 1;
        for (const step of [-1, 1]) {
          let distance = 0;
          for (let cursor = index + step; cursor >= 0 && cursor < pixels.length; cursor += step) {
            const prior = pixels[cursor - step], current = pixels[cursor];
            distance += Math.hypot(current.x - prior.x, current.y - prior.y);
            if (distance >= 12) break;
            const fraction = 1 - distance / 12;
            total += offsets[cursor] * fraction;
            weight += fraction;
          }
        }
        return { ...point, offset: total / weight * scale };
      });
      const rounded = roundedPath(simplifyPath(controls));
      const shifted = rounded.map((point, index) => {
        const previous = rounded[Math.max(0, index - 1)], next = rounded[Math.min(rounded.length - 1, index + 1)];
        const offset = point.offset;
        const dx = point.x - previous.x, dy = point.y - previous.y;
        const ex = next.x - point.x, ey = next.y - point.y;
        const incoming = Math.hypot(dx, dy), outgoing = Math.hypot(ex, ey);
        const first = incoming ? { x: -dy / incoming, y: dx / incoming } : { x: -ey / outgoing, y: ex / outgoing };
        const second = outgoing ? { x: -ey / outgoing, y: ex / outgoing } : first;
        const length = Math.hypot(first.x + second.x, first.y + second.y);
        if (!length) return point;
        const normal = { x: (first.x + second.x) / length, y: (first.y + second.y) / length };
        const miter = offset / Math.max(0.5, normal.x * second.x + normal.y * second.y);
        return { x: point.x + normal.x * miter, y: point.y + normal.y * miter };
      });
      const coordinates = shifted.map((point) => map.unproject([point.x, point.y]).toArray());
      return { ...line, properties: { ...line.properties, offset: 0 }, geometry: { type: "LineString", coordinates } };
    });
  });
}

export function visibleMapItems(map, items) {
  const canvas = map.getCanvas?.();
  if (!canvas) return items;
  return items.filter((item) => {
    const point = map.project([item.longitude, item.latitude]);
    return point.x >= -128 && point.y >= -128 && point.x <= canvas.clientWidth + 128 && point.y <= canvas.clientHeight + 128;
  });
}

export function placeMapStations(stations, lines) {
  const index = segmentIndex(lines);
  return stations.flatMap((station) => {
    const assignedRoutes = station.activeRouteIds ?? station.routeIds ?? station.services?.flatMap((service) => service.realtimeRoutes?.length ? service.realtimeRoutes : service.routes) ?? [];
    const knownRoutes = station.activeRouteIds !== undefined || station.routeIds !== undefined || Boolean(station.services?.length);
    const routes = knownRoutes ? assignedRoutes : [...index.routes.keys()];
    const points = [];
    for (const routeId of new Set(routes.map(family))) {
      const closest = nearestOnRoute([station.longitude, station.latitude], routeId, index);
      if (!closest || closest.distance > 250) continue;
      points.push({ ...station, routeId, longitude: closest.coordinate[0], latitude: closest.coordinate[1] });
    }
    return points;
  });
}

export function mapStationLabels(stations) {
  const groups = new Map();
  for (const station of stations) {
    const group = groups.get(station.id) || [];
    group.push(station);
    groups.set(station.id, group);
  }
  return [...groups.values()].map((group) => ({
    ...group[0],
    longitude: group.reduce((sum, station) => sum + station.longitude, 0) / group.length,
    latitude: group.reduce((sum, station) => sum + station.latitude, 0) / group.length,
  }));
}

export function mapStationConnections(map, stations) {
  const groups = new Map();
  for (const station of stations) {
    const group = groups.get(station.id) || [];
    group.push(station);
    groups.set(station.id, group);
  }
  const features = [];
  for (const group of groups.values()) {
    const connected = new Set([0]);
    while (connected.size < group.length) {
      let closest;
      for (const first of connected) for (let second = 0; second < group.length; second++) {
        if (connected.has(second)) continue;
        const start = map.project([group[first].longitude, group[first].latitude]);
        const end = map.project([group[second].longitude, group[second].latitude]);
        const distance = Math.hypot(start.x - end.x, start.y - end.y);
        if (!closest || distance < closest.distance) closest = { first, second, distance };
      }
      if (!closest) break;
      connected.add(closest.second);
      if (closest.distance > 14) continue;
      features.push({ type: "Feature", properties: { id: group[0].id }, geometry: { type: "LineString", coordinates: [group[closest.first], group[closest.second]].map((station) => [station.longitude, station.latitude]) } });
    }
  }
  return features;
}
