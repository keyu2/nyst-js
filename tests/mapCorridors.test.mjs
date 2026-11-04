import assert from "node:assert/strict";
import test from "node:test";
import { layoutMapCorridors, placeMapVehicles, placeMapStations, renderMapCorridors, mapStationLabels, mapStationConnections, visibleMapItems } from "../app/lib/mapCorridors.js";

const feature = (routeId, coordinates) => ({ properties: { routeId, color: routeId === "R" ? "#FCCC0A" : ["E", "A", "C"].includes(routeId) ? "#0039A6" : "#FF6319" }, geometry: { type: "LineString", coordinates } });
const map = { getZoom: () => 15, project: ([x, y]) => ({ x: x * 100000, y: -y * 100000 }), unproject: ([x, y]) => ({ toArray: () => [x / 100000, -y / 100000] }) };
const distance = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180), a[1] - b[1]) * 111320;

function projectedVehicle(routeId, lines, longitude = -73.995, latitude = 40.7) {
  const [vehicle] = placeMapVehicles([{ routeId, longitude, latitude }], lines);
  return map.project([vehicle.longitude, vehicle.latitude]);
}

test("shared R M F E tracks use four equally spaced service lanes", () => {
  const result = layoutMapCorridors(["E", "F", "M", "R"].map((id) => feature(id, [[-74, 40.7], [-73.99, 40.71]])));
  assert.equal(result.length, 4);
  assert.deepEqual(Object.fromEntries(result.map((line) => [line.properties.routeId, line.properties.offset])), { R: -12, M: -4, F: 4, E: 12 });
});

test("a lone service is centered and opposite directions share its lane", () => {
  const line = feature("7", [[-74, 40.7], [-73.99, 40.71]]);
  const reversed = feature("7X", [...line.geometry.coordinates].reverse());
  const result = layoutMapCorridors([line, reversed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].properties.offset, 0);
});

test("shared services with different source coordinates still render in equally spaced lanes", () => {
  const result = layoutMapCorridors([
    feature("R", [[-74, 40.7], [-73.99, 40.7]]),
    feature("M", [[-74, 40.6998], [-73.995, 40.6998], [-73.99, 40.6998]]),
    feature("F", [[-74, 40.7002], [-73.99, 40.7002]]),
    feature("E", [[-73.99, 40.7001], [-74, 40.7001]]),
  ]);
  const rendered = renderMapCorridors(map, result);
  const points = ["R", "M", "F", "E"].map((id) => projectedVehicle(id, rendered));
  for (let index = 1; index < points.length; index++) assert.ok(Math.abs(Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y) - 8) < 0.05);
});

test("curves and branching service remain continuous instead of being split into fragments", () => {
  const path = [[-73.9, 40.74], [-73.899, 40.739], [-73.898, 40.737], [-73.895, 40.736], [-73.89, 40.736]];
  const result = layoutMapCorridors([feature("A", path), feature("C", path.slice(1, 4))]);
  assert.equal(result.length, 2);
  for (const line of result) {
    assert.equal(line.properties.laneOffsets.length, line.geometry.coordinates.length);
    for (let index = 1; index < line.geometry.coordinates.length; index++) assert.ok(distance(line.geometry.coordinates[index - 1], line.geometry.coordinates[index]) < 100);
  }
  const rendered = renderMapCorridors(map, result);
  assert.ok(rendered.every((line) => line.geometry.coordinates.every((point) => point.every(Number.isFinite))));
});

test("a shared lane stays on the same side when routes traverse a bend in opposite directions", () => {
  const result = renderMapCorridors(map, layoutMapCorridors([
    feature("R", [[-74, 40.7], [-73.99, 40.7], [-73.99, 40.71]]),
    feature("F", [[-74.01, 40.71], [-73.99, 40.71], [-73.99, 40.7], [-73.98, 40.7]]),
  ]));
  const a = projectedVehicle("R", result, -73.99, 40.705);
  const b = projectedVehicle("F", result, -73.99, 40.705);
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 8) < 0.1);
});

test("crossing services do not become a shared corridor", () => {
  const result = layoutMapCorridors([
    feature("R", [[-74, 40.7], [-73.99, 40.7]]),
    feature("F", [[-73.995, 40.695], [-73.995, 40.705]]),
  ]);
  assert.ok(result.every((line) => line.properties.laneOffsets.every((offset) => offset === 0)));
});

test("sharing a distant corridor does not displace a solo section", () => {
  const lines = layoutMapCorridors([
    feature("G", [[-74, 40.7], [-73.99, 40.7], [-73.98, 40.7]]),
    feature("F", [[-74, 40.7], [-73.995, 40.7], [-73.995, 40.69]]),
  ]);
  const rendered = renderMapCorridors(map, lines);
  assert.deepEqual(rendered.find((line) => line.properties.routeId === "G").geometry.coordinates.at(-1), [-73.98, 40.7]);
});

test("every served route gets a station dot on its own lane with a single station label", () => {
  const lines = renderMapCorridors(map, layoutMapCorridors(["R", "M", "F", "E"].map((id) => feature(id, [[-74, 40.7], [-73.99, 40.7]]))));
  const stations = placeMapStations([{ id: "one", name: "Test", longitude: -73.995, latitude: 40.7, routeIds: ["R", "M", "F", "E"] }], lines);
  assert.equal(stations.length, 4);
  assert.equal(mapStationLabels(stations).length, 1);
  assert.equal(mapStationConnections(map, stations).length, 3);
  for (const station of stations) {
    const [vehicle] = placeMapVehicles([{ routeId: station.routeId, longitude: station.longitude, latitude: station.latitude }], lines);
    assert.ok(distance([station.longitude, station.latitude], [vehicle.longitude, vehicle.latitude]) < 0.01);
  }
});

test("stations on trip maps without route metadata still appear on their trip line", () => {
  const lines = renderMapCorridors(map, layoutMapCorridors([feature("7", [[-74, 40.7], [-73.99, 40.7]])]));
  assert.equal(placeMapStations([{ id: "one", name: "Test", longitude: -73.995, latitude: 40.7 }], lines).length, 1);
});

test("vehicle direction follows its rendered lane and missing services create no floating markers", () => {
  const lines = renderMapCorridors(map, layoutMapCorridors([feature("R", [[-74, 40.7], [-73.99, 40.7]])]));
  const vehicles = placeMapVehicles([
    { routeId: "R", longitude: -73.995, latitude: 40.7, directionBearing: 85 },
    { routeId: "R", longitude: -73.995, latitude: 40.7, directionBearing: 265 },
    { routeId: "W", longitude: -73.995, latitude: 40.7, directionBearing: 90 },
  ], lines);
  assert.equal(vehicles.length, 2);
  assert.equal(Math.abs(vehicles[0].directionBearing - vehicles[1].directionBearing), 180);
});

test("connected station dots remain attached to their service lanes after zoom and rotation", () => {
  const lines = layoutMapCorridors(["R", "M", "F", "E"].map((id) => feature(id, [[-74, 40.7], [-73.99, 40.7]])));
  for (const zoom of [10, 13, 16]) {
    const rotated = {getZoom: () => zoom, project: ([x, y]) => ({x: -y * 100000, y: -x * 100000}), unproject: ([x, y]) => ({toArray: () => [-y / 100000, -x / 100000]})};
    const rendered = renderMapCorridors(rotated, lines);
    const stations = placeMapStations([{id: "one", name: "Test", longitude: -73.995, latitude: 40.7, routeIds: ["R", "M", "F", "E"]}], rendered);
    assert.equal(stations.length, 4);
    for (const station of stations) {
      const [vehicle] = placeMapVehicles([{routeId: station.routeId, longitude: station.longitude, latitude: station.latitude}], rendered);
      assert.ok(distance([station.longitude, station.latitude], [vehicle.longitude, vehicle.latitude]) < 0.01);
    }
  }
});


test("brief parallel approaches do not pull a through service into a false shared corridor", () => {
  const lines = layoutMapCorridors([
    feature("R", [[-73.9953, 40.7002], [-73.9947, 40.7002]]),
    feature("F", [[-74, 40.7], [-73.99, 40.7]]),
  ]);
  const through = lines.find((line) => line.properties.routeId === "F");
  assert.ok(through.geometry.coordinates.every((point) => Math.abs(point[1] - 40.7) < 1e-9));
  assert.ok(through.properties.laneOffsets.every((offset) => offset === 0));
});

test("viewport clipping retains crossing services and reveals the next section when panning", () => {
  const lines = layoutMapCorridors([feature("R", [[-74, 40.7], [-73.98, 40.7]])]);
  const view = (west) => ({
    getZoom: () => 15,
    getCanvas: () => ({clientWidth: 400, clientHeight: 300}),
    project: ([x, y]) => ({x: (x - west) * 100000, y: 150 - (y - 40.7) * 100000}),
    unproject: ([x, y]) => ({toArray: () => [x / 100000 + west, (150 - y) / 100000 + 40.7]}),
  });
  const first = renderMapCorridors(view(-74), lines);
  const next = renderMapCorridors(view(-73.985), lines);
  assert.equal(first.length, 1);
  assert.equal(next.length, 1);
  assert.ok(first[0].geometry.coordinates.at(-1)[0] < next[0].geometry.coordinates[0][0]);
  const items = [{longitude: -73.999, latitude: 40.7}, {longitude: -73.981, latitude: 40.7}];
  assert.deepEqual(visibleMapItems(view(-74), items), [items[0]]);
  assert.deepEqual(visibleMapItems(view(-73.985), items), [items[1]]);
});


test("station dots follow existing active service instead of adding regular express services", () => {
  const lines = renderMapCorridors(map, layoutMapCorridors(["R", "F", "E"].map((id) => feature(id, [[-74, 40.7], [-73.99, 40.7]]))));
  const station = {id: "one", name: "Test", longitude: -73.995, latitude: 40.7, routeIds: ["R", "F", "E"], activeRouteIds: ["R"]};
  assert.deepEqual(placeMapStations([station], lines).map((point) => point.routeId), ["R"]);
  assert.deepEqual(placeMapStations([{...station, activeRouteIds: []}], lines), []);
});
