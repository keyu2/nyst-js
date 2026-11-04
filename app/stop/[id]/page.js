import BackButton from "../../components/BackButton";
import HomeButton from "../../components/HomeButton";
import Link from "next/link";
import Image from "next/image";
import RouteBullet from "../../components/RouteBullet";
import FavoriteStationButton from "../../components/FavoriteStationButton";
import StationTrains from "./StationTrains";
import { getRouteAlerts, getStop } from "../../lib/mta";
import { getStationMapData } from "../../lib/mta/map";
import { routeFamily } from "../../lib/routes";

function groupTransfersByName(transfers) {
  const groups = new Map();
  for (const transfer of transfers) {
    const name = transfer.stop.name;
    const station = groups.get(name) || { name, services: [] };
    const serviceKey = transfer.routes.join(",");
    if (!station.services.some((service) => service.key === serviceKey)) {
      station.services.push({ ...transfer, key: serviceKey });
    }
    groups.set(name, station);
  }
  return [...groups.values()];
}

export default async function StopPage({ params, searchParams }) {
  const { id } = await params;
  const { route } = await searchParams;
  const [stop, stationMapData] = await Promise.all([
    getStop(id),
    getStationMapData(id),
  ]);

  const trains = stop.stopTimes || [];
  const alertRouteIds = [...new Set(
    trains
      .map((train) => routeFamily(train.trip?.route?.id))
      .concat((stop.services || []).flatMap((service) => service.routes))
      .concat(route ? routeFamily(route) : [])
      .filter(Boolean)
  )];
  const alertsByRoute = Object.fromEntries(await Promise.all(
    alertRouteIds.map(async (routeId) => [routeId, await getRouteAlerts(routeId)])
  ));
  const northbound = trains.filter((train) => train.stop?.id?.endsWith("N"));
  const southbound = trains.filter((train) => train.stop?.id?.endsWith("S"));
  const transferStations = groupTransfersByName(stop.transfers || []);
  const sameStationTransfers = transferStations.filter((station) =>
    station.name.trim().toLocaleLowerCase() === stop.name.trim().toLocaleLowerCase()
  );
  const otherStationTransfers = transferStations.filter((station) =>
    station.name.trim().toLocaleLowerCase() !== stop.name.trim().toLocaleLowerCase()
  );

  return (
    <main className="page-shell stop-page">
      <BackButton href={route ? `/route/${encodeURIComponent(route)}` : "/subway"} />
      <HomeButton />

      <StationTrains
        stationMapData={stationMapData}
        northbound={northbound}
        southbound={southbound}
        stopId={id}
        now={stop.generatedAt}
        requestedRoute={route}
        stopBorough={stop.borough}
        sameStationTransfers={sameStationTransfers.flatMap((station) => station.services)}
        alertsByRoute={alertsByRoute}
        stopName={stop.name}
        stationServices={stop.services}
      >
        <div className="stop-page-heading">
          <h1 className="stop-page-title">
            {stop.name}
          </h1>
          {stop.accessible && <Image className="stop-accessible-icon" src="/icons/accessible.svg" alt="Accessible station" width={30} height={30} />}
          <FavoriteStationButton station={{
            id,
            ids: [...new Set([id, ...(stop.services || []).map((service) => service.id)])],
            name: stop.name,
            route: route || alertRouteIds[0] || "",
            routes: alertRouteIds,
          }} />
        </div>

        {otherStationTransfers.length > 0 && (
          <div className="transfer-section">
            <div className="transfer-label">Transfer is available to:</div>
            <div className="transfer-groups">
              {otherStationTransfers.map((station) => {
                const target = station.services[0];
                const routes = [...new Set(station.services.flatMap((service) => service.routes))];

                return (
                  <Link
                    key={station.name}
                    className="transfer-station-group"
                    href={`/stop/${target.stop.id}?route=${encodeURIComponent(target.routes[0] || "")}`}
                    aria-label={`${station.name}: ${routes.join(", ")} trains`}
                  >
                    <span>{station.name}</span>
                    <span className="transfer-station-routes">
                      {routes.map((routeId) => (
                        <RouteBullet key={routeId} routeId={routeId} size={24} />
                      ))}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

      </StationTrains>
    </main>
  );
}
