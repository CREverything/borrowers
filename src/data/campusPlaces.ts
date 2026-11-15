/**
 * Pickup spots on the UCSD campus map. Coordinates are approximate building
 * centres from OpenStreetMap. Each `name` is what gets saved as the listing's
 * location, so it must be at least 10 characters (the location minimum).
 * `label` is the shorter text drawn on the map.
 */
export interface CampusPlace {
  name: string;
  label: string;
  lat: number;
  lon: number;
  /** Which side of the pin the label sits, to keep neighbours readable. */
  side: "left" | "right" | "top" | "bottom";
}

export const campusPlaces: CampusPlace[] = [
  { name: "Seventh College", label: "Seventh", lat: 32.88835, lon: -117.2421, side: "right" },
  { name: "Eleanor Roosevelt College", label: "ERC", lat: 32.88509, lon: -117.2422, side: "left" },
  { name: "RIMAC Arena", label: "RIMAC", lat: 32.8853, lon: -117.2395, side: "right" },
  { name: "Warren College", label: "Warren", lat: 32.88276, lon: -117.234, side: "top" },
  { name: "Marshall College", label: "Marshall", lat: 32.88173, lon: -117.2412, side: "right" },
  { name: "Geisel Library", label: "Geisel", lat: 32.88113, lon: -117.2375, side: "right" },
  { name: "Sixth College", label: "Sixth", lat: 32.88047, lon: -117.2421, side: "left" },
  { name: "Canyonview Aquatic Center", label: "Pool", lat: 32.88066, lon: -117.2322, side: "top" },
  { name: "Price Center", label: "Price Center", lat: 32.87965, lon: -117.2361, side: "right" },
  { name: "Sun God Lawn", label: "Sun God Lawn", lat: 32.87865, lon: -117.2401, side: "right" },
  { name: "Pepper Canyon Hall", label: "Pepper Canyon", lat: 32.87835, lon: -117.2337, side: "bottom" },
  { name: "Central Campus Station", label: "Trolley", lat: 32.87833, lon: -117.2318, side: "top" },
  { name: "Muir College", label: "Muir", lat: 32.87801, lon: -117.2412, side: "left" },
  { name: "Center Hall", label: "Center Hall", lat: 32.87767, lon: -117.2373, side: "left" },
  { name: "Revelle College", label: "Revelle", lat: 32.87446, lon: -117.2409, side: "right" },
  { name: "Theatre District", label: "Theatre District", lat: 32.87147, lon: -117.241, side: "right" },
];

/** Map bounds. Longitude is scaled by cos(latitude) so distances look right. */
export const MAP_BOUNDS = { north: 32.8898, south: 32.8702, west: -117.2448, east: -117.2302 };
const LON_SCALE = Math.cos((32.88 * Math.PI) / 180);
export const MAP_ASPECT =
  ((MAP_BOUNDS.east - MAP_BOUNDS.west) * LON_SCALE) / (MAP_BOUNDS.north - MAP_BOUNDS.south);

/** Position as percentages of the map's width and height. */
export function toMapPercent(lat: number, lon: number) {
  return {
    x: ((lon - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 100,
    y: ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 100,
  };
}

export const findCampusPlace = (location: string) =>
  campusPlaces.find((p) => p.name.toLowerCase() === location.trim().toLowerCase());
