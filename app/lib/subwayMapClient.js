import { getBullet } from "./routes.js";
import { layoutMapCorridors, placeMapVehicles, placeMapStations, renderMapCorridors } from "./mapCorridors.js";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const DIRECTION_ARROW_IMAGE = "subway-vehicle-direction-arrow";

export async function createSubwayMap({
  bounds,
  center,
  container,
  controls = true,
  lineCasing = true,
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
    style: MAP_STYLE,
    center,
    zoom,
    minZoom: 9,
    maxZoom: 18,
    attributionControl: { compact: true },
    scrollZoom: true,
  });
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
  stations = placeMapStations(stations, lines);
  vehicles = placeMapVehicles(vehicles, lines);

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
      "line-opacity": 0.88,
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
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.72, 15, 1],
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
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.72, 15, 1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.on("zoom", () => refreshMapGeometry(map));

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

  const stationFeatures = stations.map((station) => ({
    type: "Feature",
    properties: { id: station.id, name: station.name },
    geometry: {
      type: "Point",
      coordinates: [station.longitude, station.latitude],
    },
  }));
  map.addSource("subway-stations", {
    type: "geojson",
    data: { type: "FeatureCollection", features: stationFeatures },
  });
  map.addLayer({
    id: "subway-stations",
    type: "circle",
    source: "subway-stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 15, 6],
      "circle-color": "#050505",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0.75, 15, 2],
    },
  });
  map.addLayer({
    id: "selected-subway-station",
    type: "circle",
    source: "subway-stations",
    filter: ["==", ["get", "id"], selectedStationId],
    paint: {
      "circle-radius": 10,
      "circle-color": "#ffffff",
      "circle-stroke-color": "#000000",
      "circle-stroke-width": 3,
    },
  });
  if (showStationLabels) {
    map.addLayer({
      id: "subway-station-labels",
      type: "symbol",
      source: "subway-stations",
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

function stationFeatures(stations) {
  return stations.map((station) => ({
    type: "Feature",
    properties: { id: station.id, name: station.name },
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
  context.moveTo(48, 0);
  context.lineTo(38, 17);
  context.lineTo(58, 17);
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
  const stations = placeMapStations(data.stations, lines);
  const vehicles = placeMapVehicles(data.vehicles, lines);
  map.getSource("subway-lines")?.setData({type:"FeatureCollection",features:lines});
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
