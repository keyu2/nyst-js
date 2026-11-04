import assert from "node:assert/strict";
import test from "node:test";
import { applyTrackService } from "../app/lib/mta/routeTracks.js";

const stops = (ids) => ids.map((id) => ({ id, hasService: false }));

test("Gun Hill express colors traversed track without activating skipped stations or track beyond the terminal", () => {
  for (const stopIds of [["214", "213", "208"], ["208", "213", "214"]]) {
    const main = stops(["501", "505", "213", "214"]);
    const branch = { id: "nereid", stops: stops(["204", "205", "206", "207", "208", "209", "210", "211", "212"]) };
    branch.stops[4].hasService = true;
    applyTrackService("5", main, [branch], [{ stopIds }], true);
    for (const stop of branch.stops.slice(5)) {
      assert.equal(stop.hasService, false);
      assert.equal(stop.trackServiceAbove, true);
      assert.equal(stop.trackServiceBelow, true);
    }
    assert.equal(branch.stops[4].trackServiceAbove, false);
    assert.equal(branch.stops[4].trackServiceBelow, true);
    for (const stop of branch.stops.slice(0, 4)) {
      assert.equal(stop.trackServiceAbove, false);
      assert.equal(stop.trackServiceBelow, false);
    }
  }
});

test("separate live operating sections do not color the gap between them", () => {
  const items = stops(["one", "two", "three", "four"]);
  applyTrackService("D", items, [], [{ stopIds: ["one", "two"] }, { stopIds: ["three", "four"] }], true);
  assert.equal(items[1].trackServiceBelow, false);
  assert.equal(items[2].trackServiceAbove, false);
  assert.equal(items[0].trackServiceBelow, true);
});

test("a successful empty realtime response leaves all tracks inactive while an unavailable feed stays unknown", () => {
  const items = stops(["one", "two"]);
  applyTrackService("E", items, [], [], false);
  assert.equal(items[0].trackServiceBelow, undefined);
  applyTrackService("E", items, [], [], true);
  assert.equal(items[0].trackServiceBelow, false);
});


test("a representative express pattern cannot shortcut the local branch track", () => {
  const main = stops(["501", "505", "213", "208", "214"]);
  const branch = { id: "nereid", stops: stops(["204", "205", "206", "207", "208", "209", "210", "211", "212"]) };
  applyTrackService("5", main, [branch], [{ stopIds: ["214", "213", "208"] }], true);
  for (const stop of branch.stops.slice(5)) {
    assert.equal(stop.hasService, false);
    assert.equal(stop.trackServiceAbove, true);
    assert.equal(stop.trackServiceBelow, true);
  }
});
