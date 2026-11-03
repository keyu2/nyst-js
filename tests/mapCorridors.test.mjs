import assert from "node:assert/strict";
import test from "node:test";
import { layoutMapCorridors, placeMapVehicles, placeMapStations, renderMapCorridors } from "../app/lib/mapCorridors.js";

test("shared R M F E tracks use four equally spaced service lanes", () => {
  const lines = ["E", "F", "M", "R"].map((routeId) => ({
    properties: { routeId, color: routeId === "R" ? "#FCCC0A" : routeId === "E" ? "#0039A6" : "#FF6319" },
    geometry: { type: "LineString", coordinates: [[-74, 40.7], [-73.99, 40.71]] },
  }));
  const result = layoutMapCorridors(lines);
  assert.equal(result.length, 4);
  const offsets = Object.fromEntries(result.map((line) => [line.properties.routeId, line.properties.offset]));
  assert.deepEqual(offsets, { R: -12, M: -4, F: 4, E: 12 });
  const [vehicle] = placeMapVehicles([{ routeId: "F", longitude: -73.995, latitude: 40.705 }], result);
  assert.equal(vehicle.offset, 4);
});

test("a lone service is centered and opposite directions share its lane", () => {
  const line = { properties: { routeId: "7", color: "#B933AD" }, geometry: { type: "LineString", coordinates: [[-74, 40.7], [-73.99, 40.71]] } };
  const reversed = { ...line, geometry: { ...line.geometry, coordinates: [...line.geometry.coordinates].reverse() } };
  const result = layoutMapCorridors([line, reversed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].properties.offset, 0);
});

test("curves retain every point when shared services join and leave", () => {
  const path = [[-73.90,40.74],[-73.899,40.739],[-73.898,40.737],[-73.895,40.736],[-73.89,40.736]];
  const feature = (routeId, coordinates) => ({properties:{routeId,color:"#0039A6"},geometry:{type:"LineString",coordinates}});
  const result = layoutMapCorridors([feature("A",path),feature("C",path.slice(1,4))]);
  assert.equal(result.length,2);
  assert.deepEqual(result.find((line)=>line.properties.routeId==="A").geometry.coordinates,path);
  assert.deepEqual(result.find((line)=>line.properties.routeId==="C").geometry.coordinates,path.slice(1,4));
  assert.notEqual(result[0].properties.laneOffsets[2],result[1].properties.laneOffsets[1]);
});

test("different sampling densities cannot clip a service into disconnected fragments", () => {
  const coarse = [[-73.90,40.74],[-73.89,40.73]];
  const dense = [[-73.90,40.7401],[-73.898,40.7381],[-73.896,40.7361],[-73.894,40.7341],[-73.89,40.7301]];
  const feature = (routeId, coordinates) => ({properties:{routeId,color:"#FF6319"},geometry:{type:"LineString",coordinates}});
  const result = layoutMapCorridors([feature("F",coarse),feature("M",dense)]);
  assert.equal(result.length,2);
  assert.deepEqual(result.find((line)=>line.properties.routeId==="F").geometry.coordinates,coarse);
  assert.deepEqual(result.find((line)=>line.properties.routeId==="M").geometry.coordinates,dense);
});

test("sharing a distant corridor does not displace a solo section", () => {
  const feature=(routeId,coordinates)=>({properties:{routeId,color:"#00933C"},geometry:{type:"LineString",coordinates}});
  const result=layoutMapCorridors([
    feature("G",[[-74,40.70],[-73.99,40.70],[-73.98,40.70]]),
    feature("F",[[-74,40.70],[-73.995,40.70],[-73.995,40.69]]),
  ]);
  const green=result.find((line)=>line.properties.routeId==="G");
  assert.equal(green.properties.laneOffsets.at(-1),0);
  const map={getZoom:()=>15,project:([x,y])=>({x:x*10000,y:-y*10000}),unproject:([x,y])=>({toArray:()=>[x/10000,-y/10000]})};
  const rendered=renderMapCorridors(map,result);
  assert.deepEqual(rendered.find((line)=>line.properties.routeId==="G").geometry.coordinates.at(-1),[-73.98,40.70]);
  const [station]=placeMapStations([{id:"test",name:"Test",longitude:-73.999,latitude:40.7001,routeIds:["G"]}],rendered);
  const [vehicle]=placeMapVehicles([{routeId:"G",longitude:station.longitude,latitude:station.latitude}],rendered);
  assert.ok(Math.abs(station.longitude-vehicle.longitude)<1e-9);
  assert.ok(Math.abs(station.latitude-vehicle.latitude)<1e-9);
  assert.equal(vehicle.offset,0);
  const [express]=placeMapVehicles([{routeId:"SIX",longitude:-73.999,latitude:40.7001}],rendered.map((line)=>({...line,properties:{...line.properties,routeId:"SI"}})));
  assert.equal(express.offset,0);
});
