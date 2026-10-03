import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTripProgress,
  parentStopId,
  selectedStopStatus,
} from "../app/lib/tripProgress.js";

const stopTime = (id, future = false) => ({ stop: { id, name: id }, future });

test("normalizes directional platform suffixes", () => {
  assert.equal(parentStopId("D42N"), "D42");
  assert.equal(parentStopId("D42S"), "D42");
  assert.equal(parentStopId("D42"), "D42");
});

test("measures the selected station from the next stop", () => {
  const progress = buildTripProgress([
    stopTime("A01N"),
    stopTime("A02N", true),
    stopTime("A03N", true),
    stopTime("A04N", true),
  ], "A04S");

  assert.equal(progress.nextStopIndex, 1);
  assert.equal(progress.previousStopCount, 1);
  assert.equal(progress.selectedStopIndex, 3);
  assert.equal(progress.stopsAway, 2);
  assert.equal(progress.intermediateStopCount, 1);
});

test("does not report a distance after the selected station has passed", () => {
  const progress = buildTripProgress([
    stopTime("A01N"),
    stopTime("A02N", true),
  ], "A01");

  assert.equal(progress.stopsAway, null);
  assert.equal(progress.intermediateStopCount, 0);
});

test("uses realtime arrival time before calling the next stop arriving now", () => {
  const now = 1_000;

  assert.equal(selectedStopStatus(0, now + 180, now), "3 min away");
  assert.equal(selectedStopStatus(0, now + 30, now), "arriving now");
});

test("can report trip progress in minutes or stops", () => {
  const now = 1_000;

  assert.equal(selectedStopStatus(2, now + 420, now, "minutes"), "7 min away");
  assert.equal(selectedStopStatus(2, now + 420, now, "stops"), "2 stops away");
  assert.equal(selectedStopStatus(0, now + 180, now, "stops"), "0 stops away");
});
