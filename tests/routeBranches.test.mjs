import assert from "node:assert/strict";
import test from "node:test";
import {
  buildARouteBranches,
  buildFiveRouteBranches,
} from "../app/lib/mta/routeBranches.js";

const stopTimes = (ids) => ids.map((stopId, index) => ({
  stop_id: stopId,
  arrival_time: `10:${String(index).padStart(2, "0")}:00`,
  departure_time: `10:${String(index).padStart(2, "0")}:00`,
}));
const routeStop = (id) => ({ id });

test("builds A branches and restores one-direction Aqueduct service", () => {
  const leffertsTrip = { trip_id: "lefferts" };
  const farRockawayTrip = { trip_id: "far-rockaway" };
  const stopTimesByTrip = new Map([
    ["lefferts", stopTimes(["A02", "A61", "A63", "A65"])],
    ["far-rockaway", stopTimes(["A02", "A61", "H02", "H04", "H11"])],
  ]);
  const result = buildARouteBranches({
    candidates: [leffertsTrip, farRockawayTrip],
    normalStopIds: ["A02", "A61"],
    nowMinute: 600,
    realtimeEntities: [],
    routeStop,
    scheduledToday: [leffertsTrip, farRockawayTrip],
    stopTimesByTrip,
  });

  assert.deepEqual(result.normalStopIds, ["A02", "A61"]);
  assert.deepEqual(
    result.branches.find(({ id }) => id === "far-rockaway").stops.map(({ id }) => id),
    ["H01", "H02", "H04", "H11"]
  );
});

test("keeps realtime A local stops on the shared trunk", () => {
  const leffertsTrip = { trip_id: "lefferts" };
  const farRockawayTrip = { trip_id: "far-rockaway" };
  const localTrip = { trip_id: "late-night-local" };
  const staticTrunk = ["A02", "A20", "A30", "A48", "A51", "A55", "A61"];
  const localTrunk = [
    "A02",
    "A20",
    "A30",
    "A48",
    "A49",
    "A50",
    "A51",
    "A52",
    "A53",
    "A54",
    "A55",
    "A61",
  ];
  const stopTimesByTrip = new Map([
    ["lefferts", stopTimes([...staticTrunk, "A63", "A65"])],
    ["far-rockaway", stopTimes([...staticTrunk, "H02", "H04", "H11"])],
    ["late-night-local", stopTimes([...localTrunk, "H02", "H04", "H11"])],
  ]);
  const result = buildARouteBranches({
    candidates: [leffertsTrip, farRockawayTrip, localTrip],
    normalStopIds: [
      "H11",
      "H04",
      "H02",
      "A61",
      "A55",
      "A51",
      "A50",
      "A49",
      "A48",
      "A30",
      "A20",
    ],
    nowMinute: 600,
    realtimeEntities: [],
    realtimePatterns: [
      { stopIds: ["A20", "A30", "A48", "A49", "A50", "A51", "A55", "A61"] },
      { stopIds: ["A61", "A55", "A54", "A53", "A52", "A51", "A48", "A30"] },
    ],
    routeStop,
    scheduledToday: [leffertsTrip, farRockawayTrip],
    stopTimesByTrip,
  });

  assert.deepEqual(result.normalStopIds, [
    "A02",
    "A20",
    "A30",
    "A48",
    "A49",
    "A50",
    "A51",
    "A52",
    "A53",
    "A54",
    "A55",
    "A61",
  ]);
  assert.equal(result.branches.length, 2);
});

test("orders the 5 north-to-south and exposes Nereid when realtime serves it", () => {
  const result = buildFiveRouteBranches({
    normalStopIds: ["101", "213", "501"],
    realtimeRoutesByStop: new Map([["210", new Set(["5"])]]),
    routeStop,
  });

  assert.deepEqual(result.normalStopIds, ["501", "213", "101"]);
  assert.equal(result.branches[0].id, "nereid");
  assert.equal(result.branches[0].stops.at(-1).id, "212");
});

test("A branches follow future realtime service rather than scheduled trains or past stop records", () => {
  const ids = {
    lefferts: ["A02", "A61", "A63", "A65"],
    far: ["A02", "A61", "H02", "H04", "H06", "H11"],
    park: ["A02", "A61", "H02", "H04", "H12", "H15"],
  };
  const candidates = Object.keys(ids).map((trip_id) => ({ trip_id }));
  const entity = (routeId, stopId, time, scheduleRelationship = 0) => ({ tripUpdate: {
    trip: { routeId, scheduleRelationship }, stopTimeUpdate: [{ stopId, arrival: { time } }],
  } });
  const build = (entities, realtimeAvailable = true) => buildARouteBranches({
    candidates, scheduledToday: candidates,
    stopTimesByTrip: new Map(Object.entries(ids).map(([id, values]) => [id, stopTimes(values)])),
    normalStopIds: ["A02", "A61"], nowMinute: 600, now: 1000,
    realtimeEntities: entities, realtimeAvailable, routeStop,
  });
  assert.deepEqual(build([entity("A", "H11S", 1100), entity("A", "H15S", 900)]).branches.map(({ id }) => id), ["far-rockaway"]);
  assert.deepEqual(build([]).branches, []);
  assert.equal(build([], false).branches.length, 3);
  assert.deepEqual(build([entity("A", "H15S", 1100, 3), entity("SR", "H15S", 1100)]).branches, []);
  const parkOnly = build([entity("A", "H12N", 1100)]).branches;
  assert.deepEqual(parkOnly.map(({ id }) => id), ["far-rockaway", "rockaway-park"]);
  assert.deepEqual(parkOnly[0].stops.map(({ id }) => id), ["H01", "H02", "H04"]);
});
