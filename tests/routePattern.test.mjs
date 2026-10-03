import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRealtimeDetour,
  alertSectionStopIds,
  countActiveRuns,
  extendShortTurnPattern,
  hasServiceAtStops,
  isSplitServiceAlert,
  mostCompletePattern,
  offRouteTerminalBranches,
} from "../app/lib/mta/routePattern.js";

test("connects both ends of a realtime bridge reroute", () => {
  const normalStops = [
    "R31", "R30", "R29", "R28", "R27", "R26", "R25", "R24", "R23",
    "R22", "R21",
  ];
  const result = applyRealtimeDetour(normalStops, [
    { stopIds: ["R31", "R30", "Q01", "R22", "R21"] },
  ]);

  assert.deepEqual(result, ["R31", "R30", "Q01", "R22", "R21"]);
});

test("marks every realtime service-alert section without deleting the gaps", () => {
  const stops = [
    { id: "D01", name: "Norwood-205 St" },
    { id: "D17", name: "34 St-Herald Sq" },
    { id: "D20", name: "W 4 St-Wash Sq" },
    { id: "D21", name: "Broadway-Lafayette St" },
    { id: "D22", name: "Grand St" },
    { id: "R30", name: "DeKalb Av" },
    { id: "R31", name: "Atlantic Av-Barclays Ctr" },
    { id: "D43", name: "Coney Island-Stillwell Av" },
  ];
  const alerts = [{
    header: "D service operates in three sections:",
    description: [
      "1. Between Norwood-205 St and 34 St-Herald Sq",
      "2. Shuttle train between W 4 St-Wash Sq and Grand St, stopping at Broadway-Lafayette St, every 20 minutes",
      "3. Between Atlantic Av-Barclays Ctr and Coney Island-Stillwell Av",
    ].join("\n"),
  }];

  assert.deepEqual([...alertSectionStopIds(alerts, stops)], [
    "D01", "D17", "D20", "D21", "D22", "R31", "D43",
  ]);
  assert.equal(isSplitServiceAlert(alerts[0]), true);
  assert.equal(isSplitServiceAlert({ description: "No D between 34 St and Atlantic Av" }), false);
});

test("extends a short-turn pattern to the complete route", () => {
  const shortTurn = { count: 8, stopIds: ["604", "603", "602", "601"] };
  const fullRoute = { count: 12, stopIds: ["606", "605", "604", "603", "602", "601"] };

  assert.equal(extendShortTurnPattern(shortTurn, [shortTurn, fullRoute]), fullRoute);
});

test("ignores a rare special route that extends the normal pattern", () => {
  const normalRoute = { count: 25, stopIds: ["R27", "R26", "R25", "R24"] };
  const specialRoute = {
    count: 2,
    stopIds: ["N10", "N09", "R27", "R26", "R25", "R24"],
  };

  assert.equal(extendShortTurnPattern(normalRoute, [normalRoute, specialRoute]), normalRoute);
});

test("does not replace a pattern with a different branch", () => {
  const currentRoute = { count: 4, stopIds: ["A", "B", "C", "D"] };
  const otherBranch = { count: 10, stopIds: ["A", "B", "X", "Y", "Z"] };

  assert.equal(extendShortTurnPattern(currentRoute, [currentRoute, otherBranch]), currentRoute);
});

test("shows an optional branch only when that route has upcoming service there", () => {
  const routesByStop = new Map([
    ["204", new Set(["2"])],
    ["205", new Set(["2", "5"])],
  ]);

  assert.equal(hasServiceAtStops(routesByStop, ["204", "205"], "5"), true);
  assert.equal(hasServiceAtStops(routesByStop, ["204"], "5"), false);
});

test("prefers the complete realtime stopping pattern over partial trip updates", () => {
  const pattern = mostCompletePattern([
    { stopIds: ["125", "86", "59", "42"] },
    { stopIds: ["125", "116", "110", "103", "96", "86", "77", "68", "59", "51", "42"] },
    { stopIds: ["96", "86", "77", "68", "59", "51", "42"] },
  ]);

  assert.deepEqual(pattern.stopIds, [
    "125", "116", "110", "103", "96", "86", "77", "68", "59", "51", "42",
  ]);
});

test("detects separately operating sections on a route", () => {
  const stops = ["pelham", "hunts", "whitlock", "125", "south"];
  const activeStops = new Set(["pelham", "hunts", "125", "south"]);

  assert.equal(countActiveRuns(stops, activeStops), 2);
});

test("finds a temporary terminal branch outside the normal route", () => {
  const branches = offRouteTerminalBranches(
    ["pelham", "hunts", "whitlock", "125", "south"],
    [
      { stopIds: ["149-hostos", "138", "125", "south"] },
      { stopIds: ["south", "125", "138", "149-hostos"] },
      { stopIds: ["138", "125", "south"] },
      { stopIds: ["pelham", "hunts"] },
    ]
  );

  assert.deepEqual(branches, [{
    junctionId: "125",
    terminalId: "149-hostos",
    placement: "before",
    stopIds: ["149-hostos", "138"],
  }]);
});

test("places a temporary branch after its junction in canonical route order", () => {
  const branches = offRouteTerminalBranches(
    ["north", "junction", "south"],
    [
      { stopIds: ["north", "junction", "branch-near", "branch-terminal"] },
      { stopIds: ["branch-terminal", "branch-near", "junction", "north"] },
    ]
  );

  assert.deepEqual(branches, [{
    junctionId: "junction",
    terminalId: "branch-terminal",
    placement: "after",
    stopIds: ["branch-near", "branch-terminal"],
  }]);
});
