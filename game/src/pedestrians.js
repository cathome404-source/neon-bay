// Pedestrians: people walking the sidewalks, crossing at intersections, and running away
// when something scary happens nearby (a speeding car, a gunshot, a punch).
import { PEDS, WORLD } from './config.js';

const SHIRTS = ['#e8e3d3', '#c94f4f', '#4f7ec9', '#c9a44f', '#7a4fc9', '#4fc9a8', '#e8a04f', '#8a6f4f'];

export function makePed(x, y, random) {
  return {
    x, y,
    angle: random() * Math.PI * 2,
    speed: PEDS.walkSpeed * (0.8 + random() * 0.4),
    color: SHIRTS[Math.floor(random() * SHIRTS.length)],
    state: 'walk', // 'walk' | 'flee' | 'down'
    fleeX: 0, fleeY: 0, fleeTimer: 0,
    downTimer: 0,
    changeTimer: 2 + random() * 4,
    hp: 30,
  };
}

export function createPedestrians(city, random) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const p = city.randomSidewalkPoint();
    peds.push(makePed(p.x, p.y, random));
  }
  return peds;
}

/** Scare every pedestrian within `radius` of (x, y): they run from the point. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeX = x;
      ped.fleeY = y;
      ped.fleeTimer = 2.5 + Math.random() * 1.5;
    }
  }
}

/** Knock a pedestrian down: they lie still for a while, then get up and walk off. */
export function knockDown(ped) {
  ped.state = 'down';
  ped.downTimer = 4;
  ped.hp = 30;
}

export function stepPeds(peds, dt, city, random) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'walk';
        ped.hp = 30;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
      ped.angle = away;
      ped.x += Math.cos(away) * PEDS.fleeSpeed * dt;
      ped.y += Math.sin(away) * PEDS.fleeSpeed * dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else {
      ped.changeTimer -= dt;
      if (ped.changeTimer <= 0) {
        ped.changeTimer = 3 + random() * 5;
        // Turn: keep walking mostly straight, sometimes a corner.
        ped.angle += (random() < 0.25 ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() - 0.5) * 0.6);
      }
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
    }
    // Stay in the world and out of buildings; wander back if stuck.
    if (ped.x < 150 || ped.x > WORLD.width - 20 || ped.y < 20 || ped.y > WORLD.height - 20 || city.hitsBuilding(ped.x, ped.y, 10)) {
      ped.angle += Math.PI * (0.5 + random() * 0.5);
      const fixed = city.resolveCircle(ped.x, ped.y, 10);
      ped.x = Math.max(150, Math.min(WORLD.width - 20, fixed.x));
      ped.y = Math.max(20, Math.min(WORLD.height - 20, fixed.y));
    }
  }
}
