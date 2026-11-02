import test from "node:test";
import assert from "node:assert/strict";
import { realtimeDirectionOptions } from "../app/lib/stationDirections.js";

function train(routeId, destinationId, destinationName) {
  return {
    trip: { route: { id: routeId } },
    destination: { id: destinationId, name: destinationName },
  };
}

test("shows only directions with current realtime service", () => {
  const options = realtimeDirectionOptions({
    activeRoute: "A",
    northbound: [],
    southbound: [train("A", "A55S", "Far Rockaway-Mott Av")],
  });

  assert.deepEqual(options.map((option) => option.direction), ["southbound"]);
});

test("shows both directions when realtime service exists in both", () => {
  const options = realtimeDirectionOptions({
    activeRoute: "A",
    northbound: [train("A", "A02N", "Inwood-207 St")],
    southbound: [train("A", "A55S", "Far Rockaway-Mott Av")],
  });

  assert.deepEqual(options.map((option) => option.direction), [
    "northbound",
    "southbound",
  ]);
});

test("does not use another route to create a direction section", () => {
  const options = realtimeDirectionOptions({
    activeRoute: "A",
    northbound: [train("C", "A09N", "168 St")],
    southbound: [train("A", "A55S", "Far Rockaway-Mott Av")],
  });

  assert.deepEqual(options.map((option) => option.direction), ["southbound"]);
});
