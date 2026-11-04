function edge(first, second) {
  return [first, second].sort().join("|");
}

function branchJunction(routeId, branch) {
  if (routeId === "5" && branch.id === "nereid") return { id: "213", before: true };
  if (routeId === "A") return { id: branch.id === "rockaway-park" ? "H04" : "A61", before: false };
  return { id: branch.junctionId, before: branch.placement === "before" };
}

export function applyTrackService(routeId, stops, branches, patterns, known) {
  if (!known) return;
  const graph = new Map();
  const connect = (first, second) => {
    if (!first || !second || first === second) return;
    graph.set(first, [...(graph.get(first) || []), second]);
    graph.set(second, [...(graph.get(second) || []), first]);
  };
  const addStops = (items) => {
    for (let index = 1; index < items.length; index += 1) connect(items[index - 1].id, items[index].id);
  };
  const branchStopIds = new Set(branches.flatMap((branch) => branch.stops.map((stop) => stop.id)));
  addStops(stops.filter((stop) => !branchStopIds.has(stop.id)));
  for (const branch of branches) {
    addStops(branch.stops);
    if (!branch.stops.length) continue;
    const junction = branchJunction(routeId, branch);
    connect(junction.id, junction.before ? branch.stops.at(-1).id : branch.stops[0].id);
  }
  const active = new Set();
  for (const pattern of patterns) {
    for (let index = 1; index < pattern.stopIds.length; index += 1) {
      const start = pattern.stopIds[index - 1];
      const end = pattern.stopIds[index];
      const parents = new Map([[start, null]]);
      const queue = [start];
      for (let position = 0; position < queue.length; position += 1) {
        const current = queue[position];
        if (current === end) break;
        for (const next of graph.get(current) || []) {
          if (parents.has(next)) continue;
          parents.set(next, current);
          queue.push(next);
        }
      }
      if (!parents.has(end)) continue;
      for (let current = end; current !== start; current = parents.get(current)) active.add(edge(current, parents.get(current)));
    }
  }
  const mark = (items, previous, next) => {
    items.forEach((stop, index) => {
      stop.trackServiceAbove = active.has(edge(items[index - 1]?.id || previous, stop.id));
      stop.trackServiceBelow = active.has(edge(stop.id, items[index + 1]?.id || next));
    });
  };
  mark(stops, "", "");
  for (const branch of branches) {
    const junction = branchJunction(routeId, branch);
    mark(branch.stops, junction.before ? "" : junction.id, junction.before ? junction.id : "");
  }
}
