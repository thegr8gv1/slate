import type { GeoPlace, GeoPoint } from '../contracts/index.js';

const EARTH_RADIUS_M = 6_371_008.8;
const EARTH_RADIUS_MILES = 3958.7613;

/**
 * Average hex edge length in metres per resolution, matching the H3 resolution
 * table. Keeping the same ladder means the index can be swapped for real H3
 * (`h3-js`) without re-tuning any of the radius maths above it.
 */
const EDGE_METRES_BY_RES = [
  1_107_712.59, 418_676.01, 158_244.66, 59_810.86, 22_606.38, 8_544.41, 3_229.48, 1_220.63,
  461.35, 174.38, 65.91, 24.91, 9.42, 3.56, 1.35, 0.51,
];

export function edgeMetres(resolution: number): number {
  return EDGE_METRES_BY_RES[Math.max(0, Math.min(15, resolution))];
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

/**
 * Spherical Mercator. Cell area inflates by sec(latitude), which is why every
 * proximity query re-filters with exact haversine after the cell scan — the
 * index is a cheap candidate generator, never the source of truth.
 */
function project(point: GeoPoint): { x: number; y: number } {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  return {
    x: EARTH_RADIUS_M * (point.lng * Math.PI) / 180,
    y: EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  };
}

/* ------------------------------------------------------------------ */
/* Hex grid                                                            */
/* ------------------------------------------------------------------ */

interface Axial {
  q: number;
  r: number;
}

function axialRound(qf: number, rf: number): Axial {
  // Cube rounding: convert to cube coords, round, then repair the largest drift.
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;
  let rx = Math.round(xf);
  let ry = Math.round(yf);
  let rz = Math.round(zf);
  const dx = Math.abs(rx - xf);
  const dy = Math.abs(ry - yf);
  const dz = Math.abs(rz - zf);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

function toAxial(point: GeoPoint, resolution: number): Axial {
  const { x, y } = project(point);
  const size = edgeMetres(resolution);
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}

/** Opaque, sortable spatial cell id, e.g. `h7:-2841:9930`. */
export function cellFor(point: GeoPoint, resolution: number): string {
  const { q, r } = toAxial(point, resolution);
  return `h${resolution}:${q}:${r}`;
}

function parseCell(cell: string): { resolution: number; q: number; r: number } {
  const [res, q, r] = cell.split(':');
  return { resolution: Number(res.slice(1)), q: Number(q), r: Number(r) };
}

const AXIAL_DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/**
 * Every cell within `k` rings of the origin — the fanout set a Set-Beacon
 * dispatch walks. Returns 1 + 3k(k+1) cells, so the caller can budget the scan.
 */
export function kRing(cell: string, k: number): string[] {
  const { resolution, q, r } = parseCell(cell);
  if (k <= 0) return [cell];
  const cells: string[] = [`h${resolution}:${q}:${r}`];
  for (let radius = 1; radius <= k; radius += 1) {
    // Walk to the start of the ring, then trace its six edges.
    let cq = q + AXIAL_DIRECTIONS[4].q * radius;
    let cr = r + AXIAL_DIRECTIONS[4].r * radius;
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < radius; step += 1) {
        cells.push(`h${resolution}:${cq}:${cr}`);
        cq += AXIAL_DIRECTIONS[side].q;
        cr += AXIAL_DIRECTIONS[side].r;
      }
    }
  }
  return cells;
}

/** How many rings of resolution-`res` hexes cover `miles` at this latitude. */
export function ringsForMiles(miles: number, resolution: number, latitude: number): number {
  const metres = miles * 1609.344;
  // Mercator inflates cell size away from the equator; shrink the effective
  // edge so the ring count still covers the true ground distance.
  const effectiveEdge = edgeMetres(resolution) * Math.cos((latitude * Math.PI) / 180);
  return Math.max(1, Math.ceil(metres / (effectiveEdge * 1.5)));
}

/** Cells in a k-ring: 1 + 3k(k+1). */
export function cellsInRing(k: number): number {
  return 1 + 3 * k * (k + 1);
}

/**
 * Radius covered by one cell at this resolution and latitude — the crossover
 * point where a bounding box beats enumerating cells.
 */
const MAX_ENUMERATED_CELLS = 2200;

export interface ProximityPlan {
  strategy: 'cells' | 'bbox';
  cells: string[];
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  cellsConsidered: number;
}

/**
 * Chooses how to generate proximity candidates.
 *
 * Small radii enumerate hex cells, which is an exact index hit. Past a few
 * thousand cells the IN-list costs more than it saves, so we switch to a
 * latitude/longitude bounding box — a coarser prefilter that the exact
 * haversine pass narrows back down anyway. Real H3 solves this by rolling up
 * to a coarser parent resolution; the bbox is the same trade in one step.
 */
export function planProximity(
  origin: GeoPoint & { cell?: string },
  radiusMiles: number,
  resolution: number,
): ProximityPlan {
  const k = ringsForMiles(radiusMiles, resolution, origin.lat);
  const considered = cellsInRing(k);
  const latDelta = radiusMiles / 69.0;
  const lngDelta = radiusMiles / Math.max(1, 69.0 * Math.cos((origin.lat * Math.PI) / 180));
  const bbox = {
    minLat: origin.lat - latDelta,
    maxLat: origin.lat + latDelta,
    minLng: origin.lng - lngDelta,
    maxLng: origin.lng + lngDelta,
  };

  if (considered > MAX_ENUMERATED_CELLS) {
    return { strategy: 'bbox', cells: [], bbox, cellsConsidered: considered };
  }
  const cell = origin.cell ?? cellFor(origin, resolution);
  return { strategy: 'cells', cells: kRing(cell, k), bbox, cellsConsidered: considered };
}

/* ------------------------------------------------------------------ */
/* Exact distance                                                      */
/* ------------------------------------------------------------------ */

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function makePlace(
  lat: number,
  lng: number,
  label: string,
  region: string,
  resolution = 7,
): GeoPlace {
  return { lat, lng, label, region, cell: cellFor({ lat, lng }, resolution) };
}

/** Deterministic jitter so seeded crew spread realistically around a hub. */
export function offsetPoint(origin: GeoPoint, bearingDeg: number, miles: number): GeoPoint {
  const bearing = (bearingDeg * Math.PI) / 180;
  const angular = miles / EARTH_RADIUS_MILES;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
