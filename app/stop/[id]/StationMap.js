"use client";

import { useEffect, useRef, useState } from "react";
import { useSubwayPreferences } from "../../lib/preferences";
import { createSubwayMap, updateSubwayMapData } from "../../lib/subwayMapClient";

export default function StationMap({ lines, station, vehicles = [] }) {
  const { mapEnabled, stationView } = useSubwayPreferences();
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const latestMapData = useRef({ lines, station, vehicles });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    latestMapData.current = { lines, station, vehicles };
  }, [lines, station, vehicles]);

  useEffect(() => {
    if (!mapEnabled || stationView === "board" || !mapContainer.current) {
      return undefined;
    }
    let cancelled = false;
    let map;

    async function initializeMap() {
      try {
        const initialData = latestMapData.current;
        map = await createSubwayMap({
          center: [initialData.station.longitude, initialData.station.latitude],
          container: mapContainer.current,
          controls: false,
          lineCasing: false,
          lines: initialData.lines,
          selectedStationId: initialData.station.id,
          stations: [initialData.station],
          vehicles: initialData.vehicles,
          zoom: 12.8,
        });
        if (cancelled) {
          map.remove();
          return;
        }
        mapInstance.current = map;
        setMapReady(true);
      } catch (error) {
        console.error("Unable to initialize station map", error);
        if (!cancelled) setMapError(true);
      }
    }

    initializeMap();
    return () => {
      cancelled = true;
      mapInstance.current = null;
      map?.remove();
    };
  }, [mapEnabled, station.id, station.latitude, station.longitude, station.name, stationView]);

  useEffect(() => {
    if (!mapInstance.current) return;
    updateSubwayMapData(mapInstance.current, {
      lines,
      stations: [station],
      vehicles,
    });
  }, [lines, station, vehicles]);

  if (!mapEnabled || stationView === "board") return null;

  return (
    <section className="station-map-panel" aria-label={`Map of ${station.name} station`}>
      <div ref={mapContainer} className="station-map-panel__canvas" />
      {!mapReady && !mapError && <span className="station-map-panel__loading">Loading map…</span>}
      {mapError && <span className="station-map-panel__loading">Map unavailable</span>}
    </section>
  );
}
