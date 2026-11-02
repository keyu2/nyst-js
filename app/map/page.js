import SubwayMap from "./SubwayMap";
import { getSubwayMapData } from "../lib/mta/map";

export const metadata = {
  title: "Map · NYC Subway",
};

export default async function MapPage() {
  const mapData = await getSubwayMapData();
  return <SubwayMap {...mapData} />;
}
