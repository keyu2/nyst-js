"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMapTheme } from "../../../lib/themePreference";
import { useSubwayPreferences } from "../../../lib/preferences";
import {
  createSubwayMap,
  selectSubwayMapStation,
  updateSubwayMapData,
  updateSubwayMapTheme,
} from "../../../lib/subwayMapClient";
import { parentStopId } from "../../../lib/tripProgress";

function validCoordinate(longitude, latitude) {
  return Number.isFinite(Number(longitude)) && Number.isFinite(Number(latitude));
}

function routeBounds(coordinates) {
  if (!coordinates.length) return null;
  let west = coordinates[0][0];
  let east = west;
  let south = coordinates[0][1];
  let north = south;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return [[west, south], [east, north]];
}

export default function TripMap({ coordinates, nextStop, routeColor, routeId, stopTimes, vehicle }) {
  const { mapEnabled, stationView } = useSubwayPreferences();
  const router = useRouter();
  const theme = useMapTheme();
  const mapContainer = useRef(null);
  const mapInstance = useRef(null);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
    if (mapInstance.current) updateSubwayMapTheme(mapInstance.current, theme);
  }, [theme, mapReady]);
  const stationKey = JSON.stringify(stopTimes.flatMap((stopTime) => {
    const stop = stopTime.stop;
    if (!stop || !validCoordinate(stop.longitude, stop.latitude)) return [];
    return [[parentStopId(stop.id), stop.name, Number(stop.longitude), Number(stop.latitude)]];
  }));
  const stations = useMemo(() => (
    JSON.parse(stationKey).map(([id, name, longitude, latitude]) => ({
      id,
      name,
      longitude,
      latitude,
    }))
  ), [stationKey]);
  const coordinateKey = JSON.stringify(coordinates);
  const mapCoordinates = useMemo(() => (
    JSON.parse(coordinateKey)
      .map(([longitude, latitude]) => [Number(longitude), Number(latitude)])
      .filter(([longitude, latitude]) => validCoordinate(longitude, latitude))
  ), [coordinateKey]);
  const lines = useMemo(() => ([{
    type: "Feature",
    properties: { color: routeColor, offset: 0, routeId },
    geometry: { type: "LineString", coordinates: mapCoordinates },
  }]), [mapCoordinates, routeColor, routeId]);

  useEffect(() => {
    if (
      !mapEnabled ||
      stationView === "board" ||
      !mapContainer.current ||
      mapCoordinates.length < 2
    ) return undefined;

    let cancelled = false;
    let map;
    async function initializeMap() {
      try {
        map = await createSubwayMap({
          bounds: routeBounds(mapCoordinates),
          center: mapCoordinates[Math.floor(mapCoordinates.length / 2)],
          container: mapContainer.current,
          controls: false,
          lineCasing: false,
          theme: themeRef.current,
          lines,
          onStationSelect: (stationId) => {
            router.push(`/stop/${encodeURIComponent(stationId)}?route=${encodeURIComponent(routeId)}`);
          },
          selectedStationId: "",
          showStationLabels: true,
          stationLabelOverlap: true,
          stations,
          vehicles: [],
          zoom: 10,
        });
        if (cancelled) {
          map.remove();
          return;
        }
        mapInstance.current = map;
        setMapReady(true);
      } catch (error) {
        console.error("Unable to initialize trip map", error);
        if (!cancelled) setMapError(true);
      }
    }
    initializeMap();
    return () => {
      cancelled = true;
      mapInstance.current = null;
      map?.remove();
    };
  }, [lines, mapCoordinates, mapEnabled, routeId, router, stationView, stations]);

  useEffect(() => {
    selectSubwayMapStation(mapInstance.current, parentStopId(nextStop?.id));
  }, [mapReady, nextStop?.id]);

  useEffect(() => {
    if (!mapInstance.current) return;
    updateSubwayMapData(mapInstance.current, {
      lines,
      stations,
      vehicles: vehicle ? [vehicle] : [],
    });
  }, [lines, mapReady, stations, vehicle]);

  useEffect(() => {
    if (!mapEnabled || stationView === "board") return undefined;
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [mapEnabled, router, stationView]);

  if (
    !mapEnabled ||
    stationView === "board" ||
    mapCoordinates.length < 2
  ) return null;

  return (
    <section className="trip-map-panel" aria-label={`Map of this ${routeId} train trip`}>
      <div ref={mapContainer} className="trip-map-panel__canvas" />
      {!mapReady && !mapError && <span className="trip-map-panel__loading">Loading trip map…</span>}
      {mapError && <span className="trip-map-panel__loading">Map unavailable</span>}
    </section>
  );
}
