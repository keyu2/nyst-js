import assert from "node:assert/strict";
import test from "node:test";
import {
  nearestStations,
  searchDiscovery,
  stationActiveRouteIds,
  stationRouteIds,
} from "../app/lib/stationDiscovery.js";

const stations = [
  { id: "near", name: "Jackson Hts-Roosevelt Av", latitude: 40.75, longitude: -73.88, services: [{ id: "G14", routes: ["E", "F", "M", "R"] }] },
  { id: "next", name: "74 St-Broadway", latitude: 40.751, longitude: -73.89, services: [{ id: "710", routes: ["7", "7X"] }] },
  { id: "far", name: "World Trade Center", latitude: 40.7126, longitude: -74.0099, services: [{ id: "E01", routes: ["E"] }] },
];

test("nearestStations keeps nearby station complexes even when services overlap", () => {
  const results = nearestStations(stations, { latitude: 40.75, longitude: -73.88 }, 2);
  assert.deepEqual(results.map((station) => station.id), ["near", "next"]);
  assert.equal(results[0].distance, 0);
});

test("stationRouteIds collapses express variants into route families", () => {
  assert.deepEqual(stationRouteIds(stations[1]), ["7"]);
});

test("keeps regular routes visible while realtime service determines active routes", () => {
  const station = {
    services: [{
      id: "719",
      routes: ["7", "E", "F", "G"],
      scheduledRoutes: ["7", "E", "F", "G"],
      realtimeRoutes: ["7", "E", "G"],
    }],
  };

  assert.deepEqual(stationRouteIds(station), ["7", "E", "F", "G"]);
  assert.deepEqual(stationActiveRouteIds(station), ["7", "E", "G"]);
});

test("adds a realtime reroute to a station result", () => {
  const station = {
    services: [{
      id: "719",
      routes: ["7", "E", "G"],
      scheduledRoutes: ["7", "E", "G"],
      realtimeRoutes: ["F"],
    }],
  };

  assert.deepEqual(stationRouteIds(station), ["7", "E", "F", "G"]);
  assert.deepEqual(stationActiveRouteIds(station), ["F"]);
});

test("uses scheduled routes only when realtime station service is unavailable", () => {
  const station = {
    services: [{
      id: "R30",
      routes: ["B", "D", "N", "Q", "R"],
      scheduledRoutes: ["Q", "R"],
      realtimeRoutes: [],
    }],
  };

  assert.deepEqual(stationRouteIds(station), ["B", "D", "N", "Q", "R"]);
  assert.deepEqual(stationActiveRouteIds(station), ["Q", "R"]);
});

test("searchDiscovery returns an exact route result", () => {
  const results = searchDiscovery(stations, ["E", "F", "7", "7X"], "E");
  assert.deepEqual(results.routes, ["E"]);
  assert.deepEqual(results.stations, []);
});

test("searchDiscovery combines a route and station term", () => {
  const results = searchDiscovery(stations, ["E", "F", "7"], "E Roosevelt");
  assert.deepEqual(results.routes, []);
  assert.deepEqual(results.stations.map((station) => station.id), ["near"]);
});

test("searchDiscovery searches station names without a route", () => {
  const results = searchDiscovery(stations, ["E", "F", "7"], "world trade");
  assert.deepEqual(results.stations.map((station) => station.id), ["far"]);
});
