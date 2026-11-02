"use client";

import Link from "next/link";
import { LocateFixed, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AppTabs from "../components/AppTabs";
import RouteBullet from "../components/RouteBullet";
import { useSubwayPreferences } from "../lib/preferences";
import { createSubwayMap, selectSubwayMapStation } from "../lib/subwayMapClient";

function stationHref(station, routeId) {
  const service = station.services.find(({ routeIds }) => routeIds.includes(routeId))
    || station.services[0];
  if (!service) return "/subway";
  return `/stop/${service.id}?route=${encodeURIComponent(routeId || "")}`;
}

function StationSheet({ station, onClose }) {
  const displayedRoutes = station.activeRouteIds.length
    ? station.activeRouteIds
    : station.routeIds;
  const primaryRoute = displayedRoutes[0] || station.routeIds[0] || "";

  return (
    <aside className="subway-map-sheet" aria-label={`${station.name} station`}>
      <button
        className="subway-map-sheet__close"
        type="button"
        aria-label="Close station details"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
      <p>{station.activeRouteIds.length ? "Live service" : "Scheduled service"}</p>
      <h1>{station.name}</h1>
      <div className="subway-map-sheet__routes" aria-label="Services at this station">
        {displayedRoutes.map((routeId) => (
          <Link href={stationHref(station, routeId)} key={routeId}>
            <RouteBullet routeId={routeId} size={42} />
          </Link>
        ))}
      </div>
      <Link className="subway-map-sheet__arrivals" href={stationHref(station, primaryRoute)}>
        View live arrivals
      </Link>
    </aside>
  );
}

export default function SubwayMap({ lines, stations }) {
  const { mapEnabled } = useSubwayPreferences();
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedStationId, setSelectedStationId] = useState(null);
  const stationsById = useMemo(
    () => new Map(stations.map((station) => [station.id, station])),
    [stations]
  );
  const selectedStation = stationsById.get(selectedStationId);

  useEffect(() => {
    if (!mapEnabled || !mapContainer.current) return undefined;
    let cancelled = false;
    let map;

    async function initializeMap() {
      try {
        map = await createSubwayMap({
          container: mapContainer.current,
          center: [-73.94, 40.72],
          zoom: 10.3,
          lines,
          stations,
          onStationSelect: (stationId, activeMap) => {
            setSelectedStationId(stationId);
            selectSubwayMapStation(activeMap, stationId);
          },
        });
        if (cancelled) {
          map.remove();
          return;
        }
        mapInstance.current = map;
        setMapReady(true);
      } catch (error) {
        console.error("Unable to initialize subway map", error);
        if (!cancelled) setMapError("The map could not be loaded.");
      }
    }

    initializeMap();
    return () => {
      cancelled = true;
      mapInstance.current = null;
      map?.remove();
    };
  }, [lines, mapEnabled, stations]);

  function clearSelection() {
    setSelectedStationId(null);
    selectSubwayMapStation(mapInstance.current);
  }

  if (!mapEnabled) {
    return (
      <main className="new-app-shell map-app-shell">
        <div className="map-page map-page--disabled">
          <AppTabs active="map" />
          <section>
            <LocateFixed aria-hidden="true" />
            <h1>Map is off</h1>
            <p>Turn it on in Settings when you want the interactive subway map.</p>
            <Link href="/settings">Open Settings</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="new-app-shell map-app-shell">
      <div className="map-page">
        <AppTabs active="map" />
        <section className="subway-map" aria-label="New York City subway map">
          <div ref={mapContainer} className="subway-map__canvas" />
          {!mapReady && !mapError && <p className="subway-map__status">Loading map…</p>}
          {mapError && <p className="subway-map__status">{mapError}</p>}
          {selectedStation && (
            <StationSheet station={selectedStation} onClose={clearSelection} />
          )}
        </section>
      </div>
    </main>
  );
}
