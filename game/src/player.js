// Rex Marlowe on foot: walking and running, punching, the pistol, taking damage, and
// getting in and out of cars. The player object lives in the shared game state.
import { PLAYER, WORLD } from './config.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: 0, // facing, radians
    hp: PLAYER.hp,
    money: 0,
    inCar: null,
    punchCooldown: 0,
    fireCooldown: 0,
    ammo: PLAYER.pistolAmmo,
    hasPistol: true,
    pistolOut: false,
    punchAnim: 0,
    walkPhase: 0,
    moving: false,
    regenTimer: 0,
  };
}

/** Move the player on foot from the held keys. Returns true when the player moved. */
export function stepOnFoot(player, input, dt, city) {
  const mx = input.moveX();
  const my = input.moveY();
  const moving = mx !== 0 || my !== 0;
  player.moving = moving;
  if (!moving) return false;
  const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(mx, my);
  const dx = (mx / len) * speed * dt;
  const dy = (my / len) * speed * dt;
  player.angle = Math.atan2(dy, dx);
  player.walkPhase += dt * (input.run() ? 14 : 9);
  const nx = player.x + dx;
  const ny = player.y + dy;
  // Water blocks the player; the beach is fine to walk on.
  if (nx > 140) player.x = nx;
  if (ny > 20 && ny < WORLD.height - 20) player.y = ny;
  player.x = Math.max(140, Math.min(WORLD.width - 20, player.x));
  player.y = Math.max(20, Math.min(WORLD.height - 20, player.y));
  const fixed = city.resolveCircle(player.x, player.y, PLAYER.radius);
  player.x = fixed.x;
  player.y = fixed.y;
  return true;
}

/** The punch: hits the nearest pedestrian or police car in front of the player. */
export function punch(player, peds, cars, effects, audio) {
  if (player.punchCooldown > 0) return null;
  player.punchCooldown = PLAYER.punchCooldown;
  player.punchAnim = 0.25;
  audio.punch();
  const px = player.x + Math.cos(player.angle) * PLAYER.punchRange;
  const py = player.y + Math.sin(player.angle) * PLAYER.punchRange;
  let hit = null;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 34) { hit = { kind: 'ped', ped }; break; }
  }
  if (!hit) {
    for (const car of cars) {
      if (car.kind === 'parked' || car.kind === 'traffic') continue;
      if (Math.hypot(car.x - px, car.y - py) < 44) { hit = { kind: 'car', car }; break; }
    }
  }
  if (!hit) return 'miss';
  effects.impact(px, py, '#e8e3d3');
  if (hit.kind === 'ped') {
    hit.ped.hp -= PLAYER.punchDamage;
    if (hit.ped.hp <= 0) {
      hit.ped.hp = 0;
      return { kind: 'pedDown', ped: hit.ped };
    }
    return { kind: 'pedHit', ped: hit.ped };
  }
  hit.car.hp -= PLAYER.punchDamage;
  return { kind: 'carHit', car: hit.car };
}

/** Fire the pistol toward the mouse. Returns 'shot' or 'empty'. */
export function shoot(player, bullets, mouseWorld, audio) {
  if (!player.pistolOut || player.fireCooldown > 0) return null;
  if (player.ammo <= 0) {
    player.fireCooldown = 0.3;
    return 'empty';
  }
  player.fireCooldown = PLAYER.fireCooldown;
  player.ammo -= 1;
  const angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
  player.angle = angle;
  bullets.push({
    x: player.x + Math.cos(angle) * 20,
    y: player.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    life: 0.9,
  });
  audio.gunshot();
  return 'shot';
}

/** Move bullets and resolve hits against pedestrians, police cars and buildings. */
export function stepBullets(bullets, dt, city, peds, cars, effects) {
  const events = [];
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0 || city.hitsBuilding(b.x, b.y, 2);
    if (!dead) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
          ped.hp -= PLAYER.pistolDamage;
          effects.blood(b.x, b.y);
          if (ped.hp <= 0) events.push({ kind: 'pedDown', ped });
          else events.push({ kind: 'pedHit', ped });
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of cars) {
        if (car.isPolice || car.kind === 'traffic') {
          if (Math.hypot(car.x - b.x, car.y - b.y) < 30) {
            car.hp -= PLAYER.pistolDamage;
            effects.impact(b.x, b.y, '#f2c94c');
            events.push({ kind: 'carHit', car });
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) {
      if (city.hitsBuilding(b.x, b.y, 2)) effects.impact(b.x, b.y, '#e8e3d3');
      bullets.splice(i, 1);
    }
  }
  return events;
}

/** Slow health regen while the player is safe (no wanted level). */
export function regen(player, dt, wanted) {
  if (wanted === 0 && player.hp > 0 && player.hp < PLAYER.hp) {
    player.regenTimer += dt;
    if (player.regenTimer > 1) {
      player.regenTimer = 0;
      player.hp = Math.min(PLAYER.hp, player.hp + 2);
    }
  } else {
    player.regenTimer = 0;
  }
}
