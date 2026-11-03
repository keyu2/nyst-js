const SERVICE_ORDER = ["R", "M", "F", "E", "A", "C", "B", "D", "N", "Q", "W", "G", "J", "Z", "L", "1", "2", "3", "4", "5", "6", "7", "GS", "FS", "H", "SI"];
const CELL = 0.005;
let cachedKey = "";
let cachedLines = [];

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

export function layoutMapCorridors(lines) {
  const key = JSON.stringify(lines);
  if (key === cachedKey) return cachedLines;
  const paths = [];
  const cells = new Map();
  const neighbors = new Map();
  for (const line of lines) {
    const coordinates = line.geometry.type === "MultiLineString" ? line.geometry.coordinates : [line.geometry.coordinates];
    for (const routeId of String(line.properties.routeId).split(",")) {
      if (!neighbors.has(routeId)) neighbors.set(routeId, new Set());
      for (let path of coordinates) {
        if (path.length < 2) continue;
        const first = path[0], last = path.at(-1);
        if (first[0] > last[0] || (first[0] === last[0] && first[1] > last[1])) path = [...path].reverse();
        paths.push({ routeId, color: line.properties.color, coordinates: path });
        for (let index = 1; index < path.length; index++) {
          const start = path[index - 1], end = path[index];
          const segment = { start, end, routeId };
          const west = Math.floor(Math.min(start[0], end[0]) / CELL), east = Math.floor(Math.max(start[0], end[0]) / CELL);
          const south = Math.floor(Math.min(start[1], end[1]) / CELL), north = Math.floor(Math.max(start[1], end[1]) / CELL);
          for (let x = west; x <= east; x++) for (let y = south; y <= north; y++) {
            const cell = `${x},${y}`;
            if (!cells.has(cell)) cells.set(cell, []);
            cells.get(cell).push(segment);
          }
        }
      }
    }
  }
  for (const path of paths) {
    for (let index = 1; index < path.coordinates.length; index++) {
      const start = path.coordinates[index - 1], end = path.coordinates[index];
      const middle = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const direction = project(middle, start, end);
      const x = Math.floor(middle[0] / CELL), y = Math.floor(middle[1] / CELL);
      for (let column = x - 1; column <= x + 1; column++) for (let row = y - 1; row <= y + 1; row++) {
        for (const candidate of cells.get(`${column},${row}`) || []) {
          if (candidate.routeId === path.routeId || neighbors.get(path.routeId).has(candidate.routeId)) continue;
          const match = project(middle, candidate.start, candidate.end);
          const alignment = Math.abs(direction.dx * match.dx + direction.dy * match.dy) / (Math.hypot(direction.dx, direction.dy) * Math.hypot(match.dx, match.dy));
          if (match.distance <= 40 && alignment > 0.95) {
            neighbors.get(path.routeId).add(candidate.routeId);
            neighbors.get(candidate.routeId).add(path.routeId);
          }
        }
      }
    }
  }
  const order = (route) => { const index = SERVICE_ORDER.indexOf(route); return index < 0 ? SERVICE_ORDER.length : index; };
  const routes = [...neighbors.keys()].sort((a,b) => order(a) - order(b) || a.localeCompare(b));
  const slots = new Map();
  for (const route of routes) {
    const occupied = new Set([...neighbors.get(route)].map((neighbor) => slots.get(neighbor)));
    let slot = 0;
    while (occupied.has(slot)) slot++;
    slots.set(route, slot);
  }
  const offsets = new Map();
  for (const route of routes) {
    if (offsets.has(route)) continue;
    const connected = new Set([route]);
    const queue = [route];
    for (let index = 0; index < queue.length; index++) {
      for (const neighbor of neighbors.get(queue[index])) {
        if (!connected.has(neighbor)) { connected.add(neighbor); queue.push(neighbor); }
      }
    }
    const middle = Math.max(...[...connected].map((item) => slots.get(item))) / 2;
    for (const item of connected) offsets.set(item, (slots.get(item) - middle) * 8);
  }
  const seen = new Set();
  const result = [];
  for (const path of paths) {
    const key = `${path.routeId}:${JSON.stringify(path.coordinates)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      type: "Feature",
      properties: { routeId: path.routeId, color: path.color, offset: offsets.get(path.routeId) },
      geometry: { type: "LineString", coordinates: path.coordinates },
    });
  }
  cachedKey = key;
  cachedLines = result;
  return result;
}

export function placeMapVehicles(vehicles, lines) {
  return vehicles.map((vehicle) => {
    let closest;
    for (const line of lines) {
      if (line.properties.routeId !== vehicle.routeId) continue;
      const path = line.geometry.coordinates;
      for (let index = 1; index < path.length; index++) {
        const point = project([vehicle.longitude, vehicle.latitude], path[index - 1], path[index]);
        if (!closest || point.distance < closest.distance) closest = {
          ...point, offset: line.properties.offset, bearing: Math.atan2(point.dx, point.dy) * 180 / Math.PI,
        };
      }
    }
    return closest ? { ...vehicle, longitude: closest.coordinate[0], latitude: closest.coordinate[1], offset: closest.offset, bearing: closest.bearing } : vehicle;
  });
}
