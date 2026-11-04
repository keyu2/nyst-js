import test from "node:test";
import assert from "node:assert/strict";
import {
  createBoardRouteGroups,
  createStationRouteFamilies,
  createStationRouteGroups,
} from "../app/lib/boardRouteGroups.js";
import { buildRegularRouteIdsByStop } from "../app/lib/mta/feeds.js";

test("keeps temporary reroutes out of a station's regular route bullets", () => {
  const trips = [];
  const stopTimesByTrip = new Map();
  const addTrips = (routeId, total, stopping) => {
    for (let index = 0; index < total; index += 1) {
      const tripId = `${routeId}-${index}`;
      trips.push({ trip_id: tripId, route_id: routeId });
      stopTimesByTrip.set(tripId, index < stopping ? [{ stop_id: "251N" }] : []);
    }
  };

  addTrips("2", 100, 1);
  addTrips("3", 100, 80);
  addTrips("4", 100, 20);
  addTrips("5", 100, 2);

  assert.deepEqual([...buildRegularRouteIdsByStop(trips, stopTimesByTrip).get("251")], ["3", "4"]);
});

test("groups separate platforms in one station complex into switchable services", () => {
  assert.deepEqual(
    createBoardRouteGroups(["7", "N", "W"], [
      { id: "718", routes: ["7"] },
      { id: "R09", routes: ["N", "W"] },
    ]),
    [
      { id: "7", members: ["7"] },
      { id: "N-W", members: ["N", "W"] },
    ]
  );
});

test("adds a realtime route that is missing from static station services", () => {
  assert.deepEqual(
    createBoardRouteGroups(["7", "7X"], [{ id: "718", routes: ["7"] }]),
    [{ id: "7", members: ["7"] }]
  );
});

test("hides a regular route when it has no current board service", () => {
  assert.deepEqual(
    createBoardRouteGroups(["3"], [{ id: "251", routes: ["3", "4"] }]),
    [{ id: "3", members: ["3"] }]
  );
});

test("hides a station route tab when realtime service is absent", () => {
  const { routeIds, routeFamilies } = createStationRouteFamilies(
    ["3"],
    [{ id: "251", routes: ["3", "4"] }],
    "4"
  );

  assert.deepEqual(routeIds, ["3"]);
  assert.deepEqual([...routeFamilies], [["3", ["3"]]]);
});

test("falls back to regular station routes when realtime service is unavailable", () => {
  const { routeIds } = createStationRouteFamilies(
    [],
    [{ id: "251", routes: ["3", "4"] }],
    "4"
  );

  assert.deepEqual(routeIds, ["3", "4"]);
});


test("station tabs group related lines while keeping each route selectable", () => {
  assert.deepEqual(createStationRouteGroups(["1", "2", "3", "7", "GS", "N", "Q", "R", "W"]), [
    ["1", "2", "3"], ["7"], ["GS"], ["N", "Q", "R", "W"],
  ]);
});

test("station groups include rerouted services without restoring absent routes", () => {
  const { familyIds } = createStationRouteFamilies(["7", "7X", "E", "F", "Q", "R"], [
    { routes: ["7", "N", "Q", "R", "W"] },
  ]);
  assert.deepEqual(createStationRouteGroups(familyIds), [["7"], ["E"], ["F"], ["Q", "R"]]);
  assert.deepEqual(createStationRouteGroups([]), []);
});
