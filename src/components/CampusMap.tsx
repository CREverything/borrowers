import { MapPin } from "lucide-react";
import {
  campusPlaces,
  MAP_ASPECT,
  toMapPercent,
} from "../data/campusPlaces";
import { campusMapGeometry as geo } from "../data/campusMapGeometry";

const VIEW_W = 100;
const VIEW_H = VIEW_W / MAP_ASPECT;

/** SVG coordinates for a lat/lon, in a viewBox that keeps true proportions. */
function point(lat: number, lon: number) {
  const { x, y } = toMapPercent(lat, lon);
  return { x: (x / 100) * VIEW_W, y: (y / 100) * VIEW_H };
}

interface CampusMapProps {
  /** Currently chosen place name, or anything else for "none". */
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
}

/**
 * A simplified, single-colour map of UCSD for choosing a pickup spot. Each
 * place is a radio button, so it works with arrow keys and screen readers.
 */
export default function CampusMap({ value, onChange, invalid }: CampusMapProps) {
  const geisel = point(32.88113, -117.2375);
  const north = { x: VIEW_W - 8, y: 9 };

  return (
    <div
      className={`campus-map${invalid ? " campus-map--invalid" : ""}`}
      style={{ aspectRatio: `${MAP_ASPECT}` }}
    >
      <svg
        className="campus-map__base"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H.toFixed(2)}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id="campus-map-clip">
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} rx="4" />
          </clipPath>
        </defs>
        <g clipPath="url(#campus-map-clip)">
          <rect width={VIEW_W} height={VIEW_H} className="campus-map__land" />
          {/* Green spaces: lawns and parks, sports fields, eucalyptus groves. */}
          <path d={geo.greens.grass} className="campus-map__grass" />
          <path d={geo.greens.field} className="campus-map__field" />
          <path d={geo.greens.wood} className="campus-map__wood" />
          {/* Roads: a darker casing under a white centre line. */}
          <path d={geo.roads.minor} className="campus-map__road-casing campus-map__road--minor" />
          <path d={geo.roads.major} className="campus-map__road-casing campus-map__road--major" />
          <path d={geo.roads.minor} className="campus-map__road campus-map__road--minor" />
          <path d={geo.roads.major} className="campus-map__road campus-map__road--major" />
          <path d={geo.walks} className="campus-map__walk" />
          <path d={geo.rail} className="campus-map__rail" />
          {geo.labels.map((l) => (
            <text
              key={l.text}
              x={l.x}
              y={l.y}
              transform={`rotate(${l.angle} ${l.x} ${l.y})`}
              className={`campus-map__path-label campus-map__path-label--${l.kind}`}
            >
              {l.text}
            </text>
          ))}
        </g>
        {/* Geisel's diamond silhouette, the campus landmark. */}
        <path
          d={`M${geisel.x} ${geisel.y - 5} L${geisel.x + 5} ${geisel.y} L${geisel.x} ${geisel.y + 5} L${geisel.x - 5} ${geisel.y} Z`}
          className="campus-map__landmark"
        />
        <g className="campus-map__north">
          <path d={`M${north.x} ${north.y - 5} L${north.x + 2.6} ${north.y + 2} L${north.x} ${north.y + 0.6} L${north.x - 2.6} ${north.y + 2} Z`} />
          <text x={north.x} y={north.y + 7}>
            N
          </text>
        </g>
        <text x={VIEW_W - 1.5} y={VIEW_H - 1.5} className="campus-map__credit">
          © OpenStreetMap
        </text>
      </svg>

      {campusPlaces.map((place) => {
        const { x, y } = toMapPercent(place.lat, place.lon);
        const selected = value === place.name;
        return (
          <label
            key={place.name}
            className={`campus-map__pin campus-map__pin--${place.side}${selected ? " campus-map__pin--selected" : ""}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={place.name}
          >
            <input
              type="radio"
              name="campus-place"
              className="sr-only"
              checked={selected}
              onChange={() => onChange(place.name)}
            />
            <span className="campus-map__dot" aria-hidden="true">
              {selected && <MapPin size={12} />}
            </span>
            <span className="campus-map__label">
              {place.label}
              {place.label !== place.name && (
                <span className="sr-only"> ({place.name})</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
