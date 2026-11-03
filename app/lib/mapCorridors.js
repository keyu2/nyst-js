const SERVICE_ORDER = ["R", "M", "F", "E", "A", "C", "B", "D", "N", "Q", "W", "G", "J", "Z", "L", "1", "2", "3", "4", "5", "6", "7", "GS", "FS", "H", "SI"];
const CELL = 0.005;
const ROUTE_FAMILIES = {"6X":"6","7X":"7",FX:"F",SIX:"SI"};
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
  for (const line of lines) {
    const coordinates = line.geometry.type === "MultiLineString" ? line.geometry.coordinates : [line.geometry.coordinates];
    for (const routeId of String(line.properties.routeId).split(",")) {
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
  const order = (route) => { const index = SERVICE_ORDER.indexOf(route); return index < 0 ? SERVICE_ORDER.length : index; };
  const result = [];
  const seen = new Set();
  for (const path of paths) {
    const pathKey = `${path.routeId}:${JSON.stringify(path.coordinates)}`;
    if (seen.has(pathKey)) continue;
    seen.add(pathKey);
    const laneOffsets = path.coordinates.map((point,index) => {
      const start = path.coordinates[Math.max(0,index-1)], end = path.coordinates[Math.min(path.coordinates.length-1,index+1)];
      const direction = project(point,start,end);
      const incoming = project(point,start,point);
      const outgoing = project(point,point,end);
      const routes = new Set([path.routeId]);
      const x = Math.floor(point[0]/CELL), y = Math.floor(point[1]/CELL);
      for (let column=x-1;column<=x+1;column++) for (let row=y-1;row<=y+1;row++) {
        for (const candidate of cells.get(`${column},${row}`) || []) {
          if (routes.has(candidate.routeId)) continue;
          const match=project(point,candidate.start,candidate.end);
          const alignment=Math.max(...[direction,incoming,outgoing].map((vector)=>Math.abs(vector.dx*match.dx+vector.dy*match.dy)/(Math.hypot(vector.dx,vector.dy)*Math.hypot(match.dx,match.dy)) || 0));
          if (match.distance<=40 && alignment>0.95) routes.add(candidate.routeId);
        }
      }
      const ordered=[...routes].sort((a,b)=>order(a)-order(b)||a.localeCompare(b));
      return (ordered.indexOf(path.routeId)-(ordered.length-1)/2)*8;
    });
    result.push({
      type:"Feature",
      properties:{routeId:path.routeId,color:path.color,offset:laneOffsets.every((offset)=>offset===laneOffsets[0])?laneOffsets[0]:0,laneOffsets},
      geometry:{type:"LineString",coordinates:path.coordinates},
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
      if ((ROUTE_FAMILIES[line.properties.routeId] || line.properties.routeId) !== (ROUTE_FAMILIES[vehicle.routeId] || vehicle.routeId)) continue;
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

export function renderMapCorridors(map, lines) {
  const scale = Math.max(0.55,Math.min(1,0.55+(map.getZoom()-9)/6*0.45));
  return lines.map((line) => {
    const pixels=line.geometry.coordinates.map((point)=>map.project(point));
    const coordinates=pixels.map((point,index)=>{
      const offset=(line.properties.laneOffsets?.[index] || 0)*scale;
      if (!offset) return line.geometry.coordinates[index];
      const start=pixels[Math.max(0,index-1)], end=pixels[Math.min(pixels.length-1,index+1)];
      const dx=end.x-start.x,dy=end.y-start.y;
      const length=Math.hypot(dx,dy);
      if (!length) return line.geometry.coordinates[index];
      return map.unproject([point.x-dy/length*offset,point.y+dx/length*offset]).toArray();
    });
    return {...line,properties:{...line.properties,offset:0},geometry:{...line.geometry,coordinates}};
  });
}

export function placeMapStations(stations,lines) {
  return stations.map((station)=>{
    const routes=station.routeIds || station.services?.flatMap((service)=>service.realtimeRoutes?.length?service.realtimeRoutes:service.routes) || [];
    let closest;
    for (const line of lines) {
      if (routes.length && !routes.includes(line.properties.routeId)) continue;
      const path=line.geometry.coordinates;
      for (let index=1;index<path.length;index++) {
        const point=project([station.longitude,station.latitude],path[index-1],path[index]);
        if (!closest || point.distance<closest.distance) closest=point;
      }
    }
    if (!closest || closest.distance>150) return station;
    return {...station,longitude:closest.coordinate[0],latitude:closest.coordinate[1]};
  });
}
