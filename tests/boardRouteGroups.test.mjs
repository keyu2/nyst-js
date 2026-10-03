import test from "node:test";
import assert from "node:assert/strict";
import { createBoardRouteGroups } from "../app/lib/boardRouteGroups.js";
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
