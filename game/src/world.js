// The city itself: a road grid, blocks with buildings, a beach, downtown, docks and suburbs,
// plus the collision and road queries every other system asks. Generation is seeded, so the
// same seed always builds the same Neon Bay.
import { AVENUES, BEACH, GARAGE, HIDEOUT, PALETTE, STREETS, WORLD, ZONES } from './config.js';

const CAR_COLORS = ['#c94f4f', '#4f7ec9', '#c9a44f', '#7a4fc9', '#4fc9a8', '#c9c9c9', '#3a3a3a', '#e8e3d3'];

function inZone(zone, x, y) {
  return x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
}

function zoneOf(x, y) {
  if (x < BEACH.sandX) return 'beach';
  if (inZone(ZONES.docks, x, y)) return 'docks';
  if (inZone(ZONES.downtown, x, y)) return 'downtown';
  if (inZone(ZONES.suburbs, x, y)) return 'suburbs';
  return 'city';
}

/** True when the point is on a road surface (not the sidewalk). */
export function isOnRoad(x, y) {
  const half = 45;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= half) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= half) return true;
  return false;
}

/** True when the point is on a sidewalk strip beside a road. */
export function isOnSidewalk(x, y) {
  const road = 45;
  const walk = 24;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d > road && d <= road + walk) return true;
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d > road && d <= road + walk) return true;
  }
  return false;
}

/** The nearest road centreline point to (x, y): the point a car steers toward. */
export function nearestRoadPoint(x, y) {
  let bestX = AVENUES[0];
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; bestX = ax; }
  }
  let bestY = STREETS[0];
  bestD = Infinity;
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; bestY = sy; }
  }
  // Prefer the closer axis: if the point is nearer an avenue, snap x; else snap y.
  if (Math.abs(x - bestX) <= Math.abs(y - bestY)) return { x: bestX, y };
  return { x, y: bestY };
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const containers = [];

  // Blocks are the rectangles between neighbouring roads. Each block gets 1-4 buildings,
  // or a park in a few, with the zone deciding the look.
  const xs = [BEACH.sandX + 40, ...AVENUES, WORLD.width - 40];
  const ys = [40, ...STREETS, WORLD.height - 40];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + 69;
      const x1 = xs[bx + 1] - 69;
      const y0 = ys[by] + 69;
      const y1 = ys[by + 1] - 69;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const zone = zoneOf(cx, cy);
      if (zone === 'beach') continue;
      // A few blocks are parks.
      if (random() < 0.08 && zone !== 'downtown' && zone !== 'docks') {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      const count = zone === 'downtown' ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const bw = zone === 'downtown' ? 130 + random() * 140 : 70 + random() * 110;
        const bh = zone === 'downtown' ? 130 + random() * 140 : 60 + random() * 90;
        const bx0 = x0 + random() * Math.max(1, (x1 - x0) - bw);
        const by0 = y0 + random() * Math.max(1, (y1 - y0) - bh);
        const tall = zone === 'downtown' ? 2 + Math.floor(random() * 4) : 1;
        buildings.push({
          x: bx0, y: by0, w: bw, h: bh,
          zone, tall,
          color: zone === 'downtown' ? PALETTE.buildingDowntown : zone === 'docks' ? PALETTE.buildingDocks : zone === 'suburbs' ? PALETTE.house : PALETTE.building,
          windows: random(),
        });
      }
      // Docks get shipping containers stacked near the warehouses.
      if (zone === 'docks') {
        for (let i = 0; i < 6; i += 1) {
          containers.push({
            x: x0 + random() * Math.max(1, (x1 - x0) - 90),
            y: y0 + random() * Math.max(1, (y1 - y0) - 40),
            w: 90, h: 36,
            color: ['#b8542f', '#2f7fb8', '#4f8f3a', '#c9a44f'][Math.floor(random() * 4)],
          });
        }
      }
    }
  }

  // Parked cars: along road edges, clear of intersections and of the garage.
  const parked = [];
  const carColors = [...CAR_COLORS];
  for (let i = 0; i < 26; i += 1) {
    const vertical = random() < 0.5;
    let x;
    let y;
    let angle;
    if (vertical) {
      const ax = AVENUES[Math.floor(random() * AVENUES.length)];
      const side = random() < 0.5 ? -1 : 1;
      x = ax + side * 58;
      y = 120 + random() * (WORLD.height - 240);
      angle = side > 0 ? 0 : Math.PI;
    } else {
      const sy = STREETS[Math.floor(random() * STREETS.length)];
      const side = random() < 0.5 ? -1 : 1;
      y = sy + side * 58;
      x = 420 + random() * (WORLD.width - 840);
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // Keep intersections and the garage clear.
    let nearJunction = false;
    for (const ax of AVENUES) for (const sy of STREETS) {
      if (Math.hypot(x - ax, y - sy) < 150) nearJunction = true;
    }
    if (nearJunction || Math.hypot(x - GARAGE.x, y - GARAGE.y) < 160) continue;
    parked.push({ x, y, angle, color: carColors[Math.floor(random() * carColors.length)] });
  }

  // The player's own car waits on the avenue by the garage.
  const playerCarSpot = { x: 600, y: GARAGE.y + 50, angle: 0, color: '#e5534b' };

  /** Push a circle out of every building and container it overlaps; returns the fixed point. */
  function resolveCircle(x, y, r) {
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else if (d2 <= 0.0001) {
        // Centre inside the building: push out along the shortest side.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
    for (const c of containers) {
      const cx = Math.max(c.x, Math.min(x, c.x + c.w));
      const cy = Math.max(c.y, Math.min(y, c.y + c.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      }
    }
    return { x, y };
  }

  /** True when the circle overlaps any building or container. */
  function hitsBuilding(x, y, r) {
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
    for (const c of containers) {
      const cx = Math.max(c.x, Math.min(x, c.x + c.w));
      const cy = Math.max(c.y, Math.min(y, c.y + c.h));
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
    }
    return false;
  }

  /** A random point on a road, for spawns. */
  function randomRoadPoint() {
    if (random() < 0.5) {
      return { x: AVENUES[Math.floor(random() * AVENUES.length)], y: 150 + random() * (WORLD.height - 300) };
    }
    return { x: 420 + random() * (WORLD.width - 840), y: STREETS[Math.floor(random() * STREETS.length)] };
  }

  /** A random point on a sidewalk, for pedestrians. */
  function randomSidewalkPoint() {
    const p = randomRoadPoint();
    const vertical = random() < 0.5;
    if (vertical) return { x: p.x + (random() < 0.5 ? -58 : 58), y: p.y };
    return { x: p.x, y: p.y + (random() < 0.5 ? -58 : 58) };
  }

  return {
    buildings, parks, containers, parked, playerCarSpot,
    resolveCircle, hitsBuilding, randomRoadPoint, randomSidewalkPoint,
    zoneOf, isOnRoad, isOnSidewalk, nearestRoadPoint,
  };
}

export { GARAGE, HIDEOUT };
