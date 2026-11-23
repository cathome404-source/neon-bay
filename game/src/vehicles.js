// Cars: the player's driveable car, parked cars to steal, traffic that follows the road
// grid, and the physics that moves them all. Traffic stays on the roads and turns at
// intersections; the player's car uses a simple arcade model with braking and a handbrake.
import { AVENUES, CAR, STREETS, TRAFFIC, WORLD } from './config.js';

const TRAFFIC_COLORS = ['#c94f4f', '#4f7ec9', '#c9a44f', '#7a4fc9', '#4fc9a8', '#c9c9c9', '#3a3a3a', '#e8e3d3', '#5a7a3a'];

export function makeCar(x, y, angle, color, kind) {
  return {
    x, y, angle, speed: 0,
    color, kind,
    hp: CAR.hp,
    length: CAR.length, width: CAR.width,
    // Traffic AI state:
    road: null, // { axis: 'v'|'h', line: number, dir: 1|-1 }
    targetSpeed: 0,
    stuck: 0,
    // Police state (filled in by police.js):
    isPolice: false,
    smokeTimer: 0,
    touchingBuilding: false, // set when the car is in contact with a building this step
    bumpCooldown: 0, // seconds of no car-car bump damage after a bump
    ramCooldown: 0, // seconds before this police car can ram-damage again
    sirenPhase: Math.random() * Math.PI * 2,
  };
}

/** Put a traffic car on a road with a random direction. */
function placeOnRoad(car, city, random) {
  const vertical = random() < 0.5;
  if (vertical) {
    const line = AVENUES[Math.floor(random() * AVENUES.length)];
    const dir = random() < 0.5 ? 1 : -1;
    car.road = { axis: 'v', line, dir };
    car.x = line + dir * 22;
    car.y = 200 + random() * (WORLD.height - 400);
    car.angle = dir > 0 ? 0 : Math.PI;
  } else {
    const line = STREETS[Math.floor(random() * STREETS.length)];
    const dir = random() < 0.5 ? 1 : -1;
    car.road = { axis: 'h', line, dir };
    car.y = line + dir * 22;
    car.x = 450 + random() * (WORLD.width - 900);
    car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  car.targetSpeed = TRAFFIC.speed + (random() - 0.5) * TRAFFIC.speedJitter;
}

export function createVehicles(city, random) {
  const cars = [];
  // Parked cars from the city, stealable.
  for (const spot of city.parked) {
    cars.push(makeCar(spot.x, spot.y, spot.angle, spot.color, 'parked'));
  }
  // The player's own car by the garage.
  const pc = makeCar(city.playerCarSpot.x, city.playerCarSpot.y, city.playerCarSpot.angle, city.playerCarSpot.color, 'parked');
  pc.isPlayerCar = true;
  cars.push(pc);
  // Moving traffic.
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = makeCar(0, 0, 0, TRAFFIC_COLORS[Math.floor(random() * TRAFFIC_COLORS.length)], 'traffic');
    placeOnRoad(car, city, random);
    cars.push(car);
  }
  return cars;
}

/** The nearest car within `maxDist` of (x, y), skipping `exclude`. */
export function nearestCar(cars, x, y, maxDist, exclude) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car === exclude) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function laneOffset(car) {
  return car.road.dir * 22;
}

/** One traffic step: follow the road, turn at intersections, brake for the car ahead. */
export function stepTraffic(car, dt, city, random, allCars) {
  if (!car.road) return;
  // Car ahead on the same lane: brake.
  let want = car.targetSpeed;
  for (const other of allCars) {
    if (other === car || !other.road || other.road.axis !== car.road.axis || other.road.line !== car.road.line || other.road.dir !== car.road.dir) continue;
    const ahead = car.road.axis === 'v'
      ? (other.y - car.y) * car.road.dir
      : (other.x - car.x) * car.road.dir;
    if (ahead > 0 && ahead < TRAFFIC.minGap + 40) {
      want = Math.min(want, Math.max(0, other.speed * 0.8));
      if (ahead < TRAFFIC.minGap) want = 0;
    }
  }
  car.speed += (want - car.speed) * Math.min(1, dt * 2.5);
  if (car.speed < 0.5 && want === 0) {
    car.stuck += dt;
    if (car.stuck > 4) {
      // Stuck in a jam: turn around at the next intersection.
      car.stuck = 0;
      car.road.dir *= -1;
      car.angle += Math.PI;
    }
  } else {
    car.stuck = 0;
  }
  if (car.road.axis === 'v') {
    car.x = car.road.line + laneOffset(car);
    car.y += car.road.dir * car.speed * dt;
    car.angle = car.road.dir > 0 ? 0 : Math.PI;
    // At an intersection, maybe turn.
    for (const sy of STREETS) {
      if (Math.abs(car.y - sy) < Math.max(6, car.speed * dt) && random() < 0.3) {
        car.road = { axis: 'h', line: sy, dir: random() < 0.5 ? 1 : -1 };
        car.y = sy + car.road.dir * 22;
        break;
      }
    }
    if (car.y < 60 || car.y > WORLD.height - 60) car.road.dir *= -1;
  } else {
    car.y = car.road.line + laneOffset(car);
    car.x += car.road.dir * car.speed * dt;
    car.angle = car.road.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const ax of AVENUES) {
      if (Math.abs(car.x - ax) < Math.max(6, car.speed * dt) && random() < 0.3) {
        car.road = { axis: 'v', line: ax, dir: random() < 0.5 ? 1 : -1 };
        car.x = ax + car.road.dir * 22;
        break;
      }
    }
    if (car.x < 380 || car.x > WORLD.width - 60) car.road.dir *= -1;
  }
  // Keep the car inside the world.
  car.x = Math.max(340, Math.min(WORLD.width - 30, car.x));
  car.y = Math.max(30, Math.min(WORLD.height - 30, car.y));
}

/**
 * Drive the player's car. `drive` is { throttle: -1..1, steer: -1..1, handbrake }.
 * Returns 'crash' when the car hit something hard, else null.
 */
export function stepPlayerCar(car, drive, dt, city, effects) {
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const sign = car.speed >= 0 ? 1 : -1;
  if (drive.throttle > 0) car.speed += CAR.accel * drive.throttle * dt;
  else if (drive.throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed += CAR.reverseAccel * drive.throttle * dt;
  } else {
    car.speed -= car.speed * 0.6 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  if (drive.handbrake) {
    car.speed -= car.speed * 2.2 * dt;
    const skid = Math.abs(car.speed) > 120 && Math.abs(drive.steer) > 0.2;
    if (skid) {
      effects.addSkid(car.x - forward.x * 18, car.y - forward.y * 18, car.angle);
    }
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  // The car must answer the wheel even from a standstill, or a driver starting sideways
  // to the road can never turn onto it: a base turn rate plus a speed factor.
  const turnFactor = 0.4 + 0.6 * Math.min(1, Math.abs(car.speed) / 200);
  const steerAmount = drive.steer * CAR.turnRate * turnFactor * (drive.handbrake ? 1.6 : 1);
  car.angle += steerAmount * sign * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  let crashed = false;
  const beforeX = car.x;
  const beforeY = car.y;
  car.x = Math.max(30, Math.min(WORLD.width - 30, nx));
  car.y = Math.max(30, Math.min(WORLD.height - 30, ny));
  // Buildings stop the car. Each axis moves on its own, so a car pressing diagonally
  // into a wall slides along it instead of wedging in the corner. Only a fresh impact
  // hurts: grinding along a wall just scrubs speed, so a wedged driver can reverse out.
  let blocked = false;
  if (city.hitsBuilding(car.x, car.y, 26)) {
    // Try the x move alone, then the y move alone, keeping whichever axis is clear.
    const tryX = Math.max(30, Math.min(WORLD.width - 30, nx));
    const tryY = Math.max(30, Math.min(WORLD.height - 30, ny));
    car.x = beforeX;
    car.y = beforeY;
    if (!city.hitsBuilding(tryX, car.y, 26)) car.x = tryX;
    else blocked = true;
    if (!city.hitsBuilding(car.x, tryY, 26)) car.y = tryY;
    else blocked = true;
    if (blocked) {
      if (!car.touchingBuilding && Math.abs(car.speed) > 150) {
        crashed = true;
        car.hp -= Math.abs(car.speed) * 0.035;
        effects.impact(car.x + Math.cos(car.angle) * 30, car.y + Math.sin(car.angle) * 30, '#e8e3d3');
        effects.addShake(Math.min(10, Math.abs(car.speed) * 0.02));
      }
      car.speed *= 0.6;
    }
  }
  car.touchingBuilding = blocked;
  // Water stops the car too (the beach is not a road).
  if (car.x < 140) {
    car.x = 140;
    if (Math.abs(car.speed) > 100) crashed = true;
    car.speed *= -0.2;
  }
  return crashed ? 'crash' : null;
}

/** Push two cars apart and trade a little speed; returns true when they touched. */
export function collideCars(a, b, effects) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = 46;
  if (d >= min || d < 0.01) return false;
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = Math.abs(a.speed - b.speed);
  // Bump damage happens once per impact, not every frame the cars overlap:
  // without the cooldown a long shove would shred both cars in a second.
  if (rel > 80 && a.bumpCooldown <= 0 && b.bumpCooldown <= 0) {
    a.hp -= rel * 0.008;
    b.hp -= rel * 0.008;
    a.bumpCooldown = 0.4;
    b.bumpCooldown = 0.4;
    if (effects) effects.impact((a.x + b.x) / 2, (a.y + b.y) / 2, '#e8e3d3');
  }
  const tmp = a.speed;
  a.speed = b.speed * 0.5;
  b.speed = tmp * 0.5;
  return true;
}
