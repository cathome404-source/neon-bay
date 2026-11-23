// The screenshot scenes behind ?shot=cover|drive|chase|mission. Each one stages a real
// game state — a driving player, a police chase, a mission in progress — from the same
// seeded city, then steps the traffic and pedestrians forward a few seconds so the frame
// is what a short game really looks like. The same seed always gives the same frame.
import { SCREEN_PLAY } from './render.js';
import { startMission } from './missions.js';
import { addWanted } from './police.js';

const STEP = 1 / 60;

function settle(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.stepWorld(STEP, { up: false, down: false, left: false, right: false, run: false }, 0);
  }
}

function putPlayerInCar(game, x, y, angle, speed) {
  const car = game.cars.find((c) => c.isPlayerCar) || game.cars[0];
  car.kind = 'player';
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  car.hp = 100;
  game.player.inCar = car;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
}

function placePoliceNear(game, count, dist) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.6;
    const car = game.police.cars[i];
    if (!car) break;
    car.x = game.player.x + Math.cos(angle) * dist;
    car.y = game.player.y + Math.sin(angle) * dist;
    car.angle = Math.atan2(game.player.y - car.y, game.player.x - car.x);
    car.speed = 240;
    car.hp = 100;
  }
}

/** Line the police cars up behind the player, so the chase reads in one frame. */
function lineUpPolice(game, offsets) {
  const p = game.player;
  offsets.forEach((off, i) => {
    const car = game.police.cars[i];
    if (!car) return;
    car.x = p.x + off[0];
    car.y = p.y + off[1];
    car.angle = p.angle;
    car.speed = 300;
    car.hp = 100;
  });
}

/**
 * Stage the named scene on the live game object and return the screen to draw.
 * Any unknown name stages the cover.
 */
export function stageShot(name, game) {
  game.dayTime = 0.18; // golden afternoon for every shot
  if (name === 'drive') {
    // On foot on the beach, cars and people around.
    game.player.inCar = null;
    game.player.x = 250;
    game.player.y = 1500;
    game.player.angle = -Math.PI / 2;
    game.player.hp = 100;
    game.player.money = 350;
    settle(game, 3);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    // Three stars, three police cars closing in, skid marks on the road.
    putPlayerInCar(game, 2400, 1500, Math.PI / 2, 380);
    addWanted(game.police, 3);
    game.police.unseenTimer = 0;
    placePoliceNear(game, 3, 320);
    for (let i = 0; i < 14; i += 1) {
      game.effects.addSkid(2400 + i * 4, 1500 - i * 22, Math.PI / 2);
    }
    game.missions.index = 3;
    startMission(game.missions, game);
    settle(game, 1.2);
    // Freeze the chase mid-frame: the player's car at speed, the cops lined up behind.
    game.player.inCar.speed = 380;
    lineUpPolice(game, [[-50, -260], [130, -210], [-170, -200]]);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // The cash-drops job: on foot beside a drop, gold marker on the minimap.
    game.missions.index = 2;
    startMission(game.missions, game);
    const drop = game.missions.drops[0];
    game.player.inCar = null;
    game.player.x = drop.x - 60;
    game.player.y = drop.y + 40;
    game.player.angle = Math.atan2(drop.y - game.player.y, drop.x - game.player.x);
    game.player.money = 850;
    game.player.hp = 100;
    settle(game, 2);
    return { screen: SCREEN_PLAY };
  }
  // Cover: driving downtown with two stars, police behind, first mission active.
  putPlayerInCar(game, 2400, 1500, Math.PI / 2, 300);
  addWanted(game.police, 2);
  game.police.unseenTimer = 0;
  placePoliceNear(game, 2, 420);
  game.missions.index = 0;
  startMission(game.missions, game);
  game.player.money = 120;
  settle(game, 1.5);
  // Freeze the drive mid-frame: the player's car at speed, the cops trailing.
  game.player.inCar.speed = 320;
  lineUpPolice(game, [[-70, -300], [150, -250]]);
  return { screen: SCREEN_PLAY };
}
