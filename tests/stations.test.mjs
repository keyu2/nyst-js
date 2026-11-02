import test from "node:test";
import assert from "node:assert/strict";
import { buildScheduledRouteIdsByStop } from "../app/lib/mta/stations.js";

test("builds station service from the active GTFS schedule", () => {
  const trips = [
    { trip_id: "weekday-f", route_id: "F", service_id: "weekday" },
    { trip_id: "weekend-g", route_id: "G", service_id: "weekend" },
    { trip_id: "weekend-7x", route_id: "7X", service_id: "weekend" },
  ];
  const stopTimesByTrip = new Map([
    ["weekday-f", [{ stop_id: "719N" }]],
    ["weekend-g", [{ stop_id: "719N" }, { stop_id: "719S" }]],
    ["weekend-7x", [{ stop_id: "719N" }]],
  ]);

  const routesByStop = buildScheduledRouteIdsByStop(
    trips,
    stopTimesByTrip,
    new Set(["weekend"])
  );

  assert.deepEqual([...routesByStop.get("719")].sort(), ["7X", "G"]);
});
