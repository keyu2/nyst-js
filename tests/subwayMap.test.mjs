import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRealtimeStationLineFeatures,
  buildRealtimeStationVehicles,
  buildRouteLineFeatures,
  snapVehiclesToLines,
  smoothLineCoordinates,
} from "../app/lib/mta/map.js";

const shapes = [
  { shape_id: "weekday-a", shape_pt_sequence: "2", shape_pt_lon: "-73.9", shape_pt_lat: "40.8" },
  { shape_id: "weekday-a", shape_pt_sequence: "1", shape_pt_lon: "-74.0", shape_pt_lat: "40.7" },
  { shape_id: "weekend-a", shape_pt_sequence: "1", shape_pt_lon: "-73.8", shape_pt_lat: "40.6" },
  { shape_id: "weekend-a", shape_pt_sequence: "2", shape_pt_lon: "-73.7", shape_pt_lat: "40.7" },
];

test("map lines follow services running today and preserve shape order", () => {
  const trips = [
    { route_id: "A", service_id: "weekday", shape_id: "weekday-a" },
    { route_id: "A", service_id: "weekend", shape_id: "weekend-a" },
  ];
  const features = buildRouteLineFeatures(trips, shapes, new Set(["weekend"]));

  assert.equal(features.length, 1);
  assert.equal(features[0].properties.routeId, "A");
  assert.equal(features[0].properties.color, "#0039A6");
  assert.deepEqual(features[0].geometry.coordinates, [
    [-73.8, 40.6],
    [-73.7, 40.7],
  ]);
});

test("map lines collapse express variants into the public route family", () => {
  const trips = [
    { route_id: "7X", service_id: "weekday", shape_id: "weekday-a" },
  ];
  const features = buildRouteLineFeatures(trips, shapes);

  assert.equal(features[0].properties.routeId, "7");
  assert.equal(features[0].properties.color, "#B933AD");
});

test("shared track colors receive separate line offsets", () => {
  const trips = [
    { route_id: "N", service_id: "weekday", shape_id: "weekday-a" },
    { route_id: "7", service_id: "weekday", shape_id: "weekend-a" },
  ];
  const features = buildRouteLineFeatures(trips, shapes);
  const yellow = features.find((feature) => feature.properties.routeId === "N");
  const purple = features.find((feature) => feature.properties.routeId === "7");

  assert.notEqual(yellow.properties.offset, purple.properties.offset);
});

test("station maps draw one realtime line per service", () => {
  const stopsById = new Map([
    ["A01N", { stop_lon: "-74.0", stop_lat: "40.70" }],
    ["A02N", { stop_lon: "-73.99", stop_lat: "40.71" }],
    ["A03N", { stop_lon: "-73.98", stop_lat: "40.72" }],
  ]);
  const trip = (routeId, tripId) => ({
    tripUpdate: {
      trip: { routeId, tripId },
      stopTimeUpdate: ["A01N", "A02N", "A03N"].map((stopId) => ({ stopId })),
    },
  });
  const features = buildRealtimeStationLineFeatures(
    [trip("C", "c-1"), trip("C", "c-2"), trip("F", "f-1")],
    stopsById,
    ["C", "F"],
    new Set(["A02"])
  );

  assert.deepEqual(features.map((feature) => feature.properties.routeId), ["C", "F"]);
  assert.equal(features.length, 2);
  assert.notEqual(features[0].properties.offset, features[1].properties.offset);
});

test("station maps merge services that use the same route color", () => {
  const stopsById = new Map([
    ["A01N", { stop_lon: "-74.0", stop_lat: "40.70" }],
    ["A02N", { stop_lon: "-73.99", stop_lat: "40.71" }],
    ["A03N", { stop_lon: "-73.98", stop_lat: "40.72" }],
  ]);
  const trip = (routeId) => ({
    tripUpdate: {
      trip: { routeId },
      stopTimeUpdate: ["A01N", "A02N", "A03N"].map((stopId) => ({ stopId })),
    },
  });
  const features = buildRealtimeStationLineFeatures(
    [trip("C"), trip("E")],
    stopsById,
    ["C", "E"],
    new Set(["A02"])
  );

  assert.equal(features.length, 1);
  assert.equal(features[0].properties.color, "#0039A6");
  assert.equal(features[0].properties.routeId, "C,E");
  assert.equal(features[0].geometry.type, "LineString");
});

test("same-color services share one representative corridor line", () => {
  const stopsById = new Map([
    ["A01N", { stop_lon: "-74.0", stop_lat: "40.70" }],
    ["A02N", { stop_lon: "-73.99", stop_lat: "40.71" }],
    ["A03N", { stop_lon: "-73.98", stop_lat: "40.72" }],
    ["E03N", { stop_lon: "-73.95", stop_lat: "40.73" }],
  ]);
  const trip = (routeId, lastStopId) => ({
    tripUpdate: {
      trip: { routeId },
      stopTimeUpdate: ["A01N", "A02N", lastStopId].map((stopId) => ({ stopId })),
    },
  });
  const features = buildRealtimeStationLineFeatures(
    [trip("C", "A03N"), trip("E", "E03N")],
    stopsById,
    ["C", "E"],
    new Set(["A02"])
  );

  assert.equal(features.length, 1);
  assert.deepEqual(features[0].properties.routeId, "C,E");
  const [longitude, latitude] = features[0].geometry.coordinates.at(-1);
  assert.ok(Math.abs(longitude - (-73.98)) < 1e-9);
  assert.ok(Math.abs(latitude - 40.72) < 1e-9);
});

test("station maps prefer the matched GTFS shape over straight stop connections", () => {
  const stopsById = new Map([
    ["A01N", { stop_lon: "-74.0", stop_lat: "40.70" }],
    ["A02N", { stop_lon: "-73.98", stop_lat: "40.72" }],
  ]);
  const entity = {
    tripUpdate: {
      trip: { routeId: "F", tripId: "f-live" },
      stopTimeUpdate: [{ stopId: "A01N" }, { stopId: "A02N" }],
    },
  };
  const staticData = {
    tripsByRealtimeId: new Map([["f-live", { shape_id: "f-shape" }]]),
    shapesById: new Map([["f-shape", [
      { shape_pt_sequence: "1", shape_pt_lon: "-74.0", shape_pt_lat: "40.70" },
      { shape_pt_sequence: "2", shape_pt_lon: "-73.99", shape_pt_lat: "40.73" },
      { shape_pt_sequence: "3", shape_pt_lon: "-73.98", shape_pt_lat: "40.72" },
    ]]]),
  };
  const features = buildRealtimeStationLineFeatures(
    [entity],
    stopsById,
    ["F"],
    new Set(["A01"]),
    staticData
  );

  assert.deepEqual(features[0].geometry.coordinates, [
    [-74.0, 40.70],
    [-73.99, 40.73],
    [-73.98, 40.72],
  ]);
});

test("station maps interpolate realtime train positions between stops", () => {
  const stopsById = new Map([
    ["A01N", { stop_lon: "-74.0", stop_lat: "40.70" }],
    ["A02N", { stop_lon: "-73.98", stop_lat: "40.72" }],
  ]);
  const vehicles = buildRealtimeStationVehicles([
    {
      tripUpdate: {
        trip: { routeId: "F", tripId: "f-live" },
        stopTimeUpdate: [
          { stopId: "A01N", arrival: { time: 100 } },
          { stopId: "A02N", arrival: { time: 200 } },
        ],
      },
    },
  ], stopsById, ["F"], 150);

  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].routeId, "F");
  assert.ok(Math.abs(vehicles[0].longitude - (-73.99)) < 1e-9);
  assert.ok(Math.abs(vehicles[0].latitude - 40.71) < 1e-9);
  assert.ok(vehicles[0].directionBearing > 30);
  assert.ok(vehicles[0].directionBearing < 50);
});

test("realtime station paths are smoothed while keeping station coordinates", () => {
  const coordinates = [[0, 0], [1, 1], [2, 0]];
  const smoothed = smoothLineCoordinates(coordinates, 4);

  assert.deepEqual(smoothed[0], coordinates[0]);
  assert.deepEqual(smoothed[4], coordinates[1]);
  assert.deepEqual(smoothed.at(-1), coordinates.at(-1));
  assert.ok(smoothed.length > coordinates.length);
});

test("train markers snap to their matching route color", () => {
  const vehicles = snapVehiclesToLines([
    { id: "r1", routeId: "R", color: "#FCCC0A", longitude: 0.5, latitude: 0.2 },
  ], [{
    type: "Feature",
    properties: { color: "#FCCC0A", offset: 4 },
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
  }]);

  assert.equal(vehicles[0].longitude, 0.5);
  assert.equal(vehicles[0].latitude, 0);
  assert.equal(vehicles[0].offset, 4);
  assert.equal(vehicles[0].bearing, 90);
});
