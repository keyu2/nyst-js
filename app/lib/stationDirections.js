import { routeFamily } from "./routes.js";

function destinationOptions(directionId, trains) {
  const destinations = new Map();

  for (const train of trains) {
    const destinationId = train?.destination?.id || train?.destination?.name || train?.headsign;
    const label = train?.destination?.name || train?.headsign;
    if (!destinationId || !label) continue;

    const key = `${directionId}:${destinationId}`;
    const option = destinations.get(key) || {
      id: key,
      label,
      borough: train?.destination?.borough || null,
      direction: directionId,
      trains: [],
    };
    option.trains.push(train);
    destinations.set(key, option);
  }

  return [...destinations.values()];
}

export function realtimeDirectionOptions({ activeRoute, northbound, southbound }) {
  const trainsForRoute = (trains) => trains.filter(
    (train) => routeFamily(train.trip?.route?.id) === activeRoute
  );

  return [
    ...destinationOptions("northbound", trainsForRoute(northbound)),
    ...destinationOptions("southbound", trainsForRoute(southbound)),
  ];
}
