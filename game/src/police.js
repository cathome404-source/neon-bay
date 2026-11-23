// The wanted system: stars 0-5, police cars that spawn and chase the player, ramming,
// the bust meter for an on-foot player, and the wanted level fading when the player stays
// out of sight — faster inside the hideout.
import { HIDEOUT, POLICE } from './config.js';
import { makeCar } from './vehicles.js';

export function createPolice() {
  return {
    wanted: 0,
    heat: 0, // crimes committed since the last decay tick
    unseenTimer: 0, // seconds since any police car was near the player
    bustTimer: 0, // seconds a cop has sat on a slow on-foot player
    cars: [], // police cars (also listed in the shared cars array)
  };
}

/** Add stars for a crime. Returns the new wanted level. */
export function addWanted(police, stars) {
  police.wanted = Math.min(5, police.wanted + stars);
  police.heat += stars;
  police.unseenTimer = 0;
  return police.wanted;
}

/** How many police cars the wanted level calls for. */
export function wantedCarCount(wanted) {
  return Math.min(POLICE.maxCars, wanted + 1);
}

/** Spawn a police car on a road near the player. */
function spawnPoliceCar(police, city, player, random) {
  const p = city.randomRoadPoint();
  // Prefer a road point not too close and not absurdly far.
  let best = p;
  let bestScore = Infinity;
  for (let i = 0; i < 6; i += 1) {
    const cand = city.randomRoadPoint();
    const d = Math.hypot(cand.x - player.x, cand.y - player.y);
    const score = Math.abs(d - POLICE.spawnDistance);
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  const car = makeCar(best.x, best.y, 0, '#2f6fed', 'police');
  car.isPolice = true;
  car.speed = 0;
  police.cars.push(car);
  return car;
}

/**
 * One step of the wanted system. `cars` is the shared car list (police cars are added to
 * and removed from it here). Returns an event string: 'busted' when the player is caught,
 * 'starDown' when a star faded, else null.
 */
export function stepPolice(police, dt, city, random, cars, player, effects) {
  const want = police.wanted > 0 ? wantedCarCount(police.wanted) : 0;
  // Spawn up to the wanted count.
  while (police.cars.length < want) {
    const car = spawnPoliceCar(police, city, player, random);
    cars.push(car);
  }
  // Despawn extras when the heat drops.
  while (police.cars.length > want) {
    const car = police.cars.pop();
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  // Chase: steer toward the player, cut across blocks when close, ram on contact.
  let nearest = Infinity;
  let bust = null;
  for (const car of police.cars) {
    const d = Math.hypot(player.x - car.x, player.y - car.y);
    if (d < nearest) nearest = d;
    const targetAngle = Math.atan2(player.y - car.y, player.x - car.x);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const speed = Math.min(POLICE.chaseSpeed + police.wanted * 18, 420);
    car.speed += (speed - car.speed) * Math.min(1, dt * 1.5);
    car.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!city.hitsBuilding(nx, ny, 24)) {
      car.x = nx;
      car.y = ny;
    } else {
      // Blocked by a building: back up and swing around it.
      car.angle += Math.PI * 0.6 * dt * 10;
      car.speed *= 0.6;
    }
    car.sirenPhase += dt * 6;
    // Ram the player's car, or the player on foot. A ram hurts once per impact,
    // not every frame the cars stay in contact.
    if (car.ramCooldown > 0) car.ramCooldown -= dt;
    if (d < 52) {
      if (player.inCar) {
        const victim = player.inCar;
        if (car.ramCooldown <= 0) {
          victim.hp -= POLICE.ramDamage;
          car.ramCooldown = 2.0;
          effects.addShake(4);
          effects.impact(player.x, player.y, '#e8e3d3');
        }
        victim.speed *= 0.94;
        car.speed *= 0.7;
      } else {
        player.hp -= POLICE.ramDamage * dt * 2;
        effects.addShake(3);
        // A slow on-foot player next to a stopped cop gets busted.
        if (Math.abs(car.speed) < 60) {
          police.bustTimer += dt;
          if (police.bustTimer >= POLICE.bustTime) bust = 'busted';
        }
      }
    }
    // Damaged police cars smoke and slow down.
    if (car.hp < 45) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        effects.smoke(car.x, car.y - 10);
      }
      car.speed = Math.min(car.speed, 160);
    }
    if (car.hp <= 0) {
      car.speed = 0;
      car.hp = 0;
    }
  }
  if (nearest > 700 || police.cars.length === 0) police.bustTimer = Math.max(0, police.bustTimer - dt);

  // Wanted decay: out of sight for a while, one star drops. The hideout speeds it up.
  if (police.wanted > 0) {
    const inHideout = Math.hypot(player.x - HIDEOUT.x, player.y - HIDEOUT.y) < HIDEOUT.r;
    const near = nearest < 700;
    if (!near) {
      police.unseenTimer += dt * (inHideout ? POLICE.hideoutFactor : 1);
      if (police.unseenTimer >= POLICE.decaySeconds) {
        police.unseenTimer = 0;
        police.wanted -= 1;
        return 'starDown';
      }
    } else {
      police.unseenTimer = 0;
    }
  }
  return bust;
}
