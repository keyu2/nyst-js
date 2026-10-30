import test from "node:test";
import assert from "node:assert/strict";
import { buildRouteAlertSnapshot } from "../app/lib/mta/alerts.js";

function text(value) {
  return { translation: [{ language: "en", text: value }] };
}

test("builds all route alerts and statuses from one active feed snapshot", () => {
  const now = 2_000;
  const entities = [
    {
      id: "delay",
      alert: {
        activePeriod: [{ start: 1_000, end: 3_000 }],
        informedEntity: [{ routeId: "A" }, { routeId: "C" }, { routeId: "A" }],
        headerText: text("Trains are delayed"),
        mercury: { alert_type: "Delays" },
      },
    },
    {
      id: "planned",
      alert: {
        activePeriod: [{ start: 1_000, end: 3_000 }],
        informedEntity: [{ routeId: "A" }],
        headerText: text("Weekend work"),
        mercury: { alert_type: "Planned Work" },
      },
    },
    {
      id: "expired",
      alert: {
        activePeriod: [{ end: 1_999 }],
        informedEntity: [{ routeId: "C" }],
        headerText: text("Old alert"),
        mercury: { alert_type: "Part Suspended" },
      },
    },
  ];

  const snapshot = buildRouteAlertSnapshot(entities, ["A", "C", "E"], now);

  assert.deepEqual(snapshot.routeAlerts.A.map((alert) => alert.id), ["delay", "planned"]);
  assert.deepEqual(snapshot.routeAlerts.C.map((alert) => alert.id), ["delay"]);
  assert.deepEqual(snapshot.routeAlerts.E, []);
  assert.deepEqual(snapshot.routeStatuses, { A: "delay", C: "delay" });
});

test("normalizes route aliases when distributing alerts", () => {
  const snapshot = buildRouteAlertSnapshot([{
    id: "sir",
    alert: {
      informedEntity: [{ routeId: "SIR" }],
      headerText: text("Railway notice"),
      mercury: { alert_type: "Station Notice" },
    },
  }], ["SI"], 2_000);

  assert.equal(snapshot.routeAlerts.SI.length, 1);
  assert.equal(snapshot.routeStatuses.SI, "planned");
});
