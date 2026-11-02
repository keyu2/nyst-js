"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSubwayPreferences } from "../../../lib/preferences";
import { createSubwayMap } from "../../../lib/subwayMapClient";
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

export default function TripMap({ coordinates, nextStop, routeColor, routeId, stopTimes }) {
  const { mapEnabled, stationView } = useSubwayPreferences();
  const mapContainer = useRef(null);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const stations = useMemo(() => (
    stopTimes.flatMap((stopTime) => {
      const stop = stopTime.stop;
      if (!stop || !validCoordinate(stop.longitude, stop.latitude)) return [];
      return [{
        id: parentStopId(stop.id),
        name: stop.name,
        longitude: Number(stop.longitude),
        latitude: Number(stop.latitude),
      }];
    })
  ), [stopTimes]);
  const mapCoordinates = useMemo(() => (
    coordinates
      .map(([longitude, latitude]) => [Number(longitude), Number(latitude)])
      .filter(([longitude, latitude]) => validCoordinate(longitude, latitude))
  ), [coordinates]);

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
          lines: [{
            type: "Feature",
            properties: { color: routeColor, offset: 0, routeId },
            geometry: { type: "LineString", coordinates: mapCoordinates },
          }],
          selectedStationId: parentStopId(nextStop?.id),
          stations,
          zoom: 10,
        });
        if (cancelled) {
          map.remove();
          return;
        }
        setMapReady(true);
      } catch (error) {
        console.error("Unable to initialize trip map", error);
        if (!cancelled) setMapError(true);
      }
    }
    initializeMap();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [mapCoordinates, mapEnabled, nextStop?.id, routeColor, routeId, stationView, stations]);

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
