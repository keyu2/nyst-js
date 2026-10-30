export const ROUTE_GROUPS = [
  ["A", "C", "E"],
  ["B", "D", "F", "M"],
  ["G"],
  ["L"],
  ["J", "Z"],
  ["N", "Q", "R", "W"],
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7"],
  ["GS", "FS", "H"],
  ["SI"],
];

export const ROUTE_FAMILIES = [
  { routes: ["A", "C", "E"], name: "Eighth Avenue", color: "#0039a6" },
  { routes: ["B", "D", "F", "M"], name: "Sixth Avenue", color: "#ff6319" },
  { routes: ["G"], name: "Crosstown", color: "#6cbe45" },
  { routes: ["L"], name: "Canarsie", color: "#a7a9ac" },
  { routes: ["J", "Z"], name: "Nassau Street", color: "#996633" },
  { routes: ["N", "Q", "R", "W"], name: "Broadway", color: "#fccc0a" },
  { routes: ["1", "2", "3"], name: "Broadway–Seventh", color: "#ee352e" },
  { routes: ["4", "5", "6"], name: "Lexington Avenue", color: "#00933c" },
  { routes: ["7"], name: "Flushing", color: "#b933ad" },
  { routes: ["GS", "FS", "H"], name: "Shuttles", color: "#808183" },
  { routes: ["SI"], name: "Staten Island Railway", color: "#007ac3" },
];

export const MOBILE_LINE_SECTIONS = [
  { families: [0, 1], layout: "trunks" },
  { families: [2, 3, 4], layout: "minor" },
  { families: [5, 9], layout: "broadway-shuttles" },
  {
    families: [6, 7],
    layout: "irt",
    labels: { 6: "7 Avenue", 7: "Lexington" },
  },
  {
    families: [8, 10],
    layout: "flushing-sir",
    labels: { 8: "Flushing", 10: "Staten Island" },
  },
];

export const ROUTE_STATUS = {
  planned: { color: "#1677d2", label: "Planned service change" },
  delay: { color: "#df7b12", label: "Delays" },
  suspended: { color: "#d6232a", label: "Service suspended" },
};
