import { getBullet } from "./routes.js";
import { layoutMapCorridors, placeMapVehicles, placeMapStations, renderMapCorridors, mapStationLabels, mapStationConnections, visibleMapItems } from "./mapCorridors.js";

const MAP_STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};
const DIRECTION_ARROW_IMAGE = "subway-vehicle-direction-arrow";

export async function createSubwayMap({
  bounds,
  center,
  container,
  controls = true,
  lineCasing = true,
  theme = "dark",
  lines,
  onStationSelect,
  onVehicleSelect,
  selectedStationId = "",
  showStationLabels = false,
  stationLabelOverlap = false,
  stations,
  vehicles = [],
  zoom,
}) {
  const maplibreModule = await import("maplibre-gl");
  lines = layoutMapCorridors(lines);
  const maplibregl = maplibreModule.default || maplibreModule;
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

  const map = new maplibregl.Map({
    container,
    style: MAP_STYLES[theme],
    center,
    zoom,
    minZoom: 9,
    maxZoom: 18,
    attributionControl: { compact: true },
    scrollZoom: true,
  });
  map.__subwayTheme = theme;
  map.setMissingStyleImageResolver(async (id) => {
    if (id !== "wood-pattern" || map.hasImage(id)) return;
    map.addImage(id, {
      width: 1,
      height: 1,
      data: new Uint8Array([0, 0, 0, 0]),
    });
  });

  if (controls) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    }), "top-right");
  }

  await new Promise((resolve) => map.once("load", resolve));

  if (bounds?.length === 2) {
    map.fitBounds(bounds, {
      padding: controls ? 52 : 30,
      maxZoom: 13.5,
      duration: 0,
    });
  }

  map.__subwayGeometry = { lines, stations, vehicles };
  lines = renderMapCorridors(map, lines);
  stations = placeMapStations(visibleMapItems(map, stations), lines);
  vehicles = placeMapVehicles(visibleMapItems(map, vehicles), lines);

  map.addSource("subway-lines", {
    type: "geojson",
    data: { type: "FeatureCollection", features: lines },
  });
  if (lineCasing) {
    map.addLayer({
      id: "subway-lines-shadow",
      type: "line",
      source: "subway-lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#000000",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 15, 9],
        "line-offset": [
          "interpolate", ["linear"], ["zoom"],
          9, ["*", ["get", "offset"], 0.55],
          15, ["get", "offset"],
        ],
        "line-opacity": 0.8,
      },
    });
  }
  map.addLayer({
    id: "subway-lines",
    type: "line",
    source: "subway-lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 15, 5],
      "line-offset": [
        "interpolate", ["linear"], ["zoom"],
        9, ["*", ["get", "offset"], 0.55],
        15, ["get", "offset"],
      ],
      "line-opacity": 1,
    },
  });

  await ensureVehicleImages(map, vehicles);
  ensureDirectionArrowImage(map);
  map.__subwayVehicles = vehicles;
  map.addSource("subway-vehicles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: vehicleFeatures(map, vehicles) },
  });
  map.addLayer({
    id: "subway-vehicle-directions",
    type: "symbol",
    source: "subway-vehicles",
    layout: {
      "icon-image": DIRECTION_ARROW_IMAGE,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 15, 0.7],
      "icon-rotate": ["get", "directionBearing"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "subway-vehicles",
    type: "symbol",
    source: "subway-vehicles",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 15, 0.7],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  let geometryFrame = 0;
  const scheduleGeometry = () => {
    if (geometryFrame) return;
    geometryFrame = requestAnimationFrame(() => {
      geometryFrame = 0;
      refreshMapGeometry(map);
    });
  };
  map.on("move", scheduleGeometry);
  map.on("remove", () => cancelAnimationFrame(geometryFrame));

  if (onVehicleSelect) {
    const selectVehicle = (event) => {
      const properties = event.features?.[0]?.properties;
      if (properties?.id && properties?.routeId) {
        onVehicleSelect(properties, map);
      }
    };
    for (const layer of ["subway-vehicle-directions", "subway-vehicles"]) {
      map.on("click", layer, selectVehicle);
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
  }

  map.addSource("subway-station-connections", {
    type: "geojson",
    data: { type: "FeatureCollection", features: mapStationConnections(map, stations) },
  });
  map.addLayer({
    id: "subway-station-connections",
    type: "line",
    source: "subway-station-connections",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#171717", "line-width": 2.5 },
  });
  map.addSource("subway-stations", {
    type: "geojson",
    data: { type: "FeatureCollection", features: stationFeatures(stations) },
  });
  map.addSource("subway-station-labels", {
    type: "geojson",
    data: { type: "FeatureCollection", features: stationFeatures(mapStationLabels(stations)) },
  });
  map.addLayer({
    id: "subway-stations",
    type: "circle",
    source: "subway-stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.7, 15, 3.5],
      "circle-color": "#050505",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 15, 1.3],
    },
  });
  map.addLayer({
    id: "selected-subway-station",
    type: "circle",
    source: "subway-stations",
    filter: ["==", ["get", "id"], selectedStationId],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 15, 5.5],
      "circle-color": "#ffffff",
      "circle-stroke-color": "#000000",
      "circle-stroke-width": 2,
    },
  });
  if (showStationLabels) {
    map.addLayer({
      id: "subway-station-labels",
      type: "symbol",
      source: "subway-station-labels",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 15, 14],
        "text-variable-anchor": ["top", "bottom", "left", "right"],
        "text-radial-offset": 0.8,
        "text-justify": "auto",
        "text-allow-overlap": stationLabelOverlap,
        "text-ignore-placement": stationLabelOverlap,
        "text-optional": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    });
  }
  map.moveLayer("subway-vehicle-directions");
  map.moveLayer("subway-vehicles");
  applyMapThemeColors(map, theme);

  if (onStationSelect) {
    const selectStation = (event) => {
      const stationId = event.features?.[0]?.properties?.id;
      if (stationId) onStationSelect(stationId, map);
    };
    const interactiveLayers = ["subway-stations"];
    if (showStationLabels) interactiveLayers.push("subway-station-labels");
    for (const layer of interactiveLayers) {
      map.on("click", layer, selectStation);
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
  }

  return map;
}

function applyMapThemeColors(map, theme) {
    const foreground = theme === "dark" ? "#ffffff" : "#171717";
    const background = theme === "dark" ? "#050505" : "#ffffff";
    for (const layer of map.getStyle().layers || []) {
    if (layer.id.startsWith("subway-") || layer.id === "selected-subway-station" || layer.type !== "symbol") continue;
    if (layer.layout?.["text-field"]) map.setPaintProperty(layer.id, "text-opacity", 0.45);
    if (layer.layout?.["icon-image"]) map.setPaintProperty(layer.id, "icon-opacity", 0.3);
  }
  if (map.getLayer("subway-stations")) {
        map.setPaintProperty("subway-stations", "circle-color", "#ffffff");
        map.setPaintProperty("subway-stations", "circle-stroke-color", "#171717");
    }
    if (map.getLayer("selected-subway-station")) {
        map.setPaintProperty("selected-subway-station", "circle-color", foreground);
        map.setPaintProperty("selected-subway-station", "circle-stroke-color", background);
    }
    if (map.getLayer("subway-station-labels")) {
        map.setPaintProperty("subway-station-labels", "text-color", foreground);
        map.setPaintProperty("subway-station-labels", "text-halo-color", background);
    }
}
export function updateSubwayMapTheme(map, theme) {
    if (map.__subwayTheme === theme)
        return;
    map.__subwayTheme = theme;
    map.once("style.load", () => {
        const vehicles = map.__subwayGeometry?.vehicles || [];
        ensureDirectionArrowImage(map);
        void ensureVehicleImages(map, vehicles).catch((error) => map.fire("error", { error }));
        applyMapThemeColors(map, map.__subwayTheme);
        refreshMapGeometry(map);
    });
    map.setStyle(MAP_STYLES[theme], {
        transformStyle: (previous, next) => {
            if (!previous)
                return next;
            return {
                ...next,
                sources: {
                    ...next.sources,
                    ...Object.fromEntries(Object.entries(previous.sources).filter(([id]) => id.startsWith("subway-"))),
                },
                layers: [...next.layers, ...previous.layers.filter((layer) => layer.id.startsWith("subway-") || layer.id === "selected-subway-station")],
            };
        },
    });
}

function stationFeatures(stations) {
  return stations.map((station) => ({
    type: "Feature",
    properties: { id: station.id, name: station.name, routeId: station.routeId || "" },
    geometry: {
      type: "Point",
      coordinates: [station.longitude, station.latitude],
    },
  }));
}

function vehicleIconName(vehicle) {
  return `subway-vehicle-${vehicle.routeId}`;
}

function ensureDirectionArrowImage(map) {
  if (map.hasImage(DIRECTION_ARROW_IMAGE)) return;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  context.beginPath();
  context.moveTo(48, 18);
  context.lineTo(38, 34);
  context.lineTo(58, 34);
  context.closePath();
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "#000000";
  context.stroke();
  map.addImage(
    DIRECTION_ARROW_IMAGE,
    context.getImageData(0, 0, 96, 96),
    { pixelRatio: 2 }
  );
}

async function ensureVehicleImages(map, vehicles) {
  const uniqueVehicles = [...new Map(
    vehicles.map((vehicle) => [vehicleIconName(vehicle), vehicle])
  ).values()];
  await Promise.all(uniqueVehicles.map(async (vehicle) => {
    const name = vehicleIconName(vehicle);
    if (map.hasImage(name)) return;
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = getBullet(vehicle.routeId);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, 64, 64);
    if (!map.hasImage(name)) {
      map.addImage(name, context.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
    }
  }));
}

function lineOffsetScale(zoom) {
  if (zoom <= 9) return 0.55;
  if (zoom >= 15) return 1;
  return 0.55 + ((zoom - 9) / 6) * 0.45;
}

function vehicleFeatures(map, vehicles) {
  return vehicles.map((vehicle) => ({
    type: "Feature",
    properties: {
      id: vehicle.id,
      icon: vehicleIconName(vehicle),
      routeId: vehicle.routeId,
      directionBearing: Number.isFinite(vehicle.directionBearing)
        ? vehicle.directionBearing
        : 0,
    },
    geometry: {
      type: "Point",
      coordinates: (() => {
        if (!Number.isFinite(vehicle.bearing) || !vehicle.offset) {
          return [vehicle.longitude, vehicle.latitude];
        }
        const point = map.project([vehicle.longitude, vehicle.latitude]);
        const angle = vehicle.bearing * Math.PI / 180;
        const offset = vehicle.offset * lineOffsetScale(map.getZoom());
        return map.unproject([
          point.x + Math.cos(angle) * offset,
          point.y + Math.sin(angle) * offset,
        ]).toArray();
      })(),
    },
  }));
}

function refreshMapGeometry(map) {
  const data = map.__subwayGeometry;
  if (!data) return;
  const lines = renderMapCorridors(map, data.lines);
  const stations = placeMapStations(visibleMapItems(map, data.stations), lines);
  const vehicles = placeMapVehicles(visibleMapItems(map, data.vehicles), lines);
  map.getSource("subway-lines")?.setData({type:"FeatureCollection",features:lines});
  map.getSource("subway-station-connections")?.setData({type:"FeatureCollection",features:mapStationConnections(map,stations)});
  map.getSource("subway-station-labels")?.setData({type:"FeatureCollection",features:stationFeatures(mapStationLabels(stations))});
  map.getSource("subway-stations")?.setData({type:"FeatureCollection",features:stationFeatures(stations)});
  map.getSource("subway-vehicles")?.setData({type:"FeatureCollection",features:vehicleFeatures(map,vehicles)});
}

export async function updateSubwayMapData(map, { lines, stations, vehicles = [] }) {
  if (!map) return;
  await ensureVehicleImages(map, vehicles);
  map.__subwayGeometry = {lines:layoutMapCorridors(lines),stations,vehicles};
  refreshMapGeometry(map);
}

export function selectSubwayMapStation(map, stationId = "") {
  if (map?.getLayer("selected-subway-station")) {
    map.setFilter("selected-subway-station", ["==", ["get", "id"], stationId]);
  }
}
