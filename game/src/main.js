// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between four screens:
// title, play, paused and game over. Save/load keeps money, jobs and position.
//
// ?seed=N fixes the city. ?shot=cover|drive|chase|mission (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { DAY_LENGTH, GARAGE, HIDEOUT, PICKUPS, PLAYER, SAVE_KEY } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_PUNCH, ACTION_WEAPON, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './particles.js';
import { createPlayer, punch, regen, shoot, stepBullets, stepOnFoot } from './player.js';
import { collideCars, createVehicles, stepPlayerCar, stepTraffic } from './vehicles.js';
import { createPedestrians, knockDown, scarePeds, stepPeds } from './pedestrians.js';
import { addWanted, createPolice, stepPolice } from './police.js';
import { createMissions, currentMission, missionTarget, objectiveText, startMission, stepMissions } from './missions.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function createGame() {
  const random = createRandom(seed);
  const city = createCity(random);
  const game = {
    seed,
    random,
    city,
    time: 0,
    dayTime: 0.15, // golden afternoon
    player: createPlayer(GARAGE.x, GARAGE.y + 120),
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    police: createPolice(),
    missions: createMissions(),
    effects: createEffects(),
    audio: createAudio(),
    missionObjective: '',
    overReason: 'wasted',
    pickupTimer: 0,
    saveTimer: 0,
    camera: { x: GARAGE.x, y: GARAGE.y },
  };
  game.cars = createVehicles(city, random);
  game.peds = createPedestrians(city, random);
  // Scatter cash, ammo and health pickups on roads and sidewalks.
  const pickupSpots = [];
  for (let i = 0; i < 8; i += 1) pickupSpots.push({ kind: 'cash', at: city.randomRoadPoint() });
  for (let i = 0; i < 4; i += 1) pickupSpots.push({ kind: 'ammo', at: city.randomSidewalkPoint() });
  for (let i = 0; i < 3; i += 1) pickupSpots.push({ kind: 'health', at: city.randomSidewalkPoint() });
  for (const s of pickupSpots) game.pickups.push({ kind: s.kind, x: s.at.x, y: s.at.y, taken: false });

  game.save = function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: game.player.money,
        missionIndex: game.missions.index,
        done: game.missions.done,
        x: game.player.x,
        y: game.player.y,
        hp: game.player.hp,
        ammo: game.player.ammo,
      }));
    } catch { /* Storage can be off: the save then lasts this visit only. */ }
  };

  game.load = function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      game.player.money = data.money || 0;
      game.missions.index = data.missionIndex || 0;
      game.missions.done = data.done || [];
      game.player.x = data.x || GARAGE.x;
      game.player.y = data.y || GARAGE.y + 120;
      game.player.hp = data.hp || PLAYER.hp;
      game.player.ammo = data.ammo || PLAYER.pistolAmmo;
      return true;
    } catch {
      return false;
    }
  };

  game.saveExists = function saveExists() {
    try {
      return window.localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  };

  /** One fixed simulation step. `move` is { up, down, left, right, run }; `actions` flags. */
  game.stepWorld = function stepWorld(dt, move, actions) {
    game.time += dt;
    game.dayTime = (game.time / DAY_LENGTH) % 1;
    const player = game.player;
    const city = game.city;

    // Cooldowns tick down.
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.punchAnim > 0) player.punchAnim -= dt;

    // Get into the nearest stealable car (police cars cannot be stolen).
    function enterNearestCar() {
      let car = null;
      let bestD = 56;
      for (const c of game.cars) {
        if (c.isPolice) continue;
        const d = Math.hypot(c.x - player.x, c.y - player.y);
        if (d < bestD) { bestD = d; car = c; }
      }
      if (!car) return;
      const stolen = car.kind !== 'player' && !car.isPlayerCar;
      car.kind = 'player';
      car.road = null;
      player.inCar = car;
      player.x = car.x;
      player.y = car.y;
      if (stolen) {
        addWanted(game.police, 1);
        game.effects.addFloat(car.x, car.y - 30, 'STOLEN!', '#f2c94c');
        scarePeds(game.peds, player.x, player.y, 200);
      }
      game.audio.click();
    }

    if (player.inCar) {
      const car = player.inCar;
      const drive = {
        throttle: (move.up ? 1 : 0) - (move.down ? 1 : 0),
        steer: (move.right ? 1 : 0) - (move.left ? 1 : 0),
        handbrake: move.run,
      };
      const crashed = stepPlayerCar(car, drive, dt, city, game.effects);
      if (crashed === 'crash') game.audio.crash();
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // Exhaust puffs and damage smoke.
      if (Math.abs(car.speed) > 60 && Math.random() < dt * 8) game.effects.exhaust(car.x, car.y, car.angle);
      if (car.hp < 45) {
        car.smokeTimer -= dt;
        if (car.smokeTimer <= 0) {
          car.smokeTimer = 0.12;
          game.effects.smoke(car.x, car.y - 10);
        }
      }
      if (car.hp <= 0) {
        car.speed = 0;
        car.hp = 0;
      }
      // Running over pedestrians is a crime.
      for (const ped of game.peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34 && Math.abs(car.speed) > 100) {
          knockDown(ped);
          addWanted(game.police, 1);
          game.audio.crash();
          game.effects.blood(ped.x, ped.y);
          game.effects.addShake(5);
          scarePeds(game.peds, ped.x, ped.y, 300);
        }
      }
      game.audio.engine(Math.abs(car.speed) / 520, true);
    } else {
      stepOnFoot(player, { moveX: () => (move.right ? 1 : 0) - (move.left ? 1 : 0), moveY: () => (move.down ? 1 : 0) - (move.up ? 1 : 0), run: () => move.run }, dt, city);
      game.audio.engine(0, false);
      if (actions & ACTION_PUNCH) {
        const result = punch(player, game.peds, game.cars, game.effects, game.audio);
        if (result && typeof result === 'object' && result.kind === 'pedDown') {
          addWanted(game.police, 1);
          scarePeds(game.peds, player.x, player.y, 300);
          game.effects.addFloat(result.ped.x, result.ped.y - 20, 'DOWN', '#e5534b');
        } else if (result && typeof result === 'object' && result.kind === 'carHit') {
          addWanted(game.police, 1);
        }
      }
      if (actions & ACTION_WEAPON) {
        player.pistolOut = !player.pistolOut;
        game.audio.click();
      }
    }

    // Enter / exit a car, or start a mission at the gold marker. The marker wins when the
    // player is on top of it: otherwise a parked car beside a job would eat every E press
    // and the job could never start.
    if (actions & ACTION_INTERACT) {
      if (player.inCar) {
        const car = player.inCar;
        car.kind = 'parked';
        car.speed = 0;
        player.inCar = null;
        player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
        player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
        const fixed = city.resolveCircle(player.x, player.y, 14);
        player.x = fixed.x;
        player.y = fixed.y;
        game.audio.click();
      } else if (!game.missions.active) {
        const target = missionTarget(game.missions);
        if (target && Math.hypot(player.x - target.x, player.y - target.y) < 130) {
          startMission(game.missions, game);
        } else {
          enterNearestCar();
        }
      } else {
        enterNearestCar();
      }
    }

    // Shooting (mouse aim, in world space).
    if (!player.inCar && player.pistolOut && game.mouseDown) {
      const result = shoot(player, game.bullets, game.mouseWorld, game.audio);
      if (result === 'shot') {
        scarePeds(game.peds, player.x, player.y, 320);
        addWanted(game.police, 0); // firing draws attention only when a cop sees it
      }
    }
    const bulletEvents = stepBullets(game.bullets, dt, city, game.peds, game.cars, game.effects);
    for (const ev of bulletEvents) {
      if (ev.kind === 'pedDown') {
        addWanted(game.police, 1);
        scarePeds(game.peds, ev.ped.x, ev.ped.y, 300);
      } else if (ev.kind === 'carHit' && ev.car.isPolice) {
        addWanted(game.police, 1);
      }
    }

    // Traffic, pedestrians, police, missions.
    for (const car of game.cars) {
      if (car.bumpCooldown > 0) car.bumpCooldown -= dt;
      if (car.kind === 'traffic') stepTraffic(car, dt, city, random, game.cars);
    }
    stepPeds(game.peds, dt, city, random);
    const policeEvent = stepPolice(game.police, dt, city, random, game.cars, player, game.effects);
    if (policeEvent === 'busted') game.busted = true;
    const missionEvent = stepMissions(game.missions, dt, game);
    void missionEvent;

    // Car-car collisions (player car vs everything, police vs traffic).
    for (let i = 0; i < game.cars.length; i += 1) {
      for (let j = i + 1; j < game.cars.length; j += 1) {
        const a = game.cars[i];
        const b = game.cars[j];
        if (a.kind === 'parked' && b.kind === 'parked') continue;
        if (collideCars(a, b, game.effects)) {
          if ((a === player.inCar || b === player.inCar) && Math.abs(a.speed - b.speed) > 120) {
            game.audio.crash();
            game.effects.addShake(4);
          }
        }
      }
    }
    // Player car vs pedestrians handled above; on-foot player vs cars: getting clipped hurts.
    if (!player.inCar) {
      for (const car of game.cars) {
        if (car.kind === 'parked') continue;
        if (Math.hypot(car.x - player.x, car.y - player.y) < 34 && Math.abs(car.speed) > 60) {
          player.hp -= 20 * dt * 4;
          game.effects.addShake(3);
        }
      }
    }

    // Pickups.
    for (const pk of game.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.x - player.x, pk.y - player.y) < 42) {
        pk.taken = true;
        if (pk.kind === 'cash') {
          player.money += PICKUPS.cashValue;
          game.audio.cash();
          game.effects.addFloat(pk.x, pk.y - 20, `+$${PICKUPS.cashValue}`, '#39d353');
        } else if (pk.kind === 'ammo') {
          player.ammo += PICKUPS.ammo;
          game.audio.pickup();
          game.effects.addFloat(pk.x, pk.y - 20, `+${PICKUPS.ammo} ammo`, '#f2c94c');
        } else {
          player.hp = Math.min(PLAYER.hp, player.hp + PICKUPS.health);
          game.audio.pickup();
          game.effects.addFloat(pk.x, pk.y - 20, `+${PICKUPS.health} HP`, '#39d353');
        }
      }
    }
    // Respawn pickups over time.
    game.pickupTimer += dt;
    if (game.pickupTimer > 25) {
      game.pickupTimer = 0;
      const taken = game.pickups.filter((p) => p.taken);
      if (taken.length) {
        const pk = taken[0];
        const at = city.randomRoadPoint();
        pk.x = at.x;
        pk.y = at.y;
        pk.taken = false;
      }
    }

    // Health regen, effects, siren, objective line.
    regen(player, dt, game.police.wanted);
    game.effects.update(dt);
    let nearestCop = Infinity;
    for (const car of game.police.cars) nearestCop = Math.min(nearestCop, Math.hypot(car.x - player.x, car.y - player.y));
    game.audio.siren(game.police.wanted > 0 ? Math.max(0, 1 - nearestCop / 1200) : 0);
    game.missionObjective = objectiveText(game.missions);

    // Autosave every 15 seconds while playing.
    game.saveTimer += dt;
    if (game.saveTimer > 15) {
      game.saveTimer = 0;
      game.save();
    }
    return policeEvent;
  };

  return game;
}

const game0 = createGame();
let game = game0;
const renderer = createRenderer(canvas);
const input = createInput(canvas);
let screen = SCREEN_TITLE;

// Debug hook for automated play-testing (and nothing else): the live game state.
window.__nbState = () => ({
  screen,
  player: {
    x: Math.round(game.player.x), y: Math.round(game.player.y),
    hp: Math.round(game.player.hp), money: game.player.money,
    inCar: !!game.player.inCar, ammo: game.player.ammo,
    angle: +game.player.angle.toFixed(2),
    carSpeed: game.player.inCar ? Math.round(game.player.inCar.speed) : 0,
    carHp: game.player.inCar ? Math.round(game.player.inCar.hp) : null,
  },
  playerCar: (() => {
    const c = game.cars.find((cc) => cc.isPlayerCar);
    return c ? { x: Math.round(c.x), y: Math.round(c.y) } : null;
  })(),
  wanted: game.police.wanted,
  policeCars: game.police.cars.length,
  missionIndex: game.missions.index,
  missionActive: game.missions.active,
  objective: game.missionObjective,
  cars: game.cars.length,
  peds: game.peds.length,
});

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, game);
  game.missionObjective = objectiveText(game.missions);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, false);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let buttons = [];
  let saveExists = game.saveExists();

  function startGame(fresh) {
    if (fresh) game = createGame();
    game.audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Follow the gold marker for your next job.');
  }

  function endGame(reason) {
    game.overReason = reason;
    screen = SCREEN_OVER;
    game.save();
    announce(reason === 'busted' ? 'Busted. The cops caught Rex.' : 'Wasted. Rex is down.');
  }

  function moveState() {
    return {
      up: input.up(), down: input.down(), left: input.left(), right: input.right(), run: input.run(),
    };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the title.
      game.stepWorld(STEP, { up: false, down: false, left: false, right: false, run: false }, 0);
      return;
    }
    const actions = input.takeActions();
    const mouse = input.mouse();
    game.mouseDown = mouse.down;
    game.audio.unlock();
    // Mouse position in world space (for aiming).
    const scale = renderer.view.scale;
    game.mouseWorld = {
      x: game.camera.x + (mouse.x - renderer.view.w / 2) / scale,
      y: game.camera.y + (mouse.y - renderer.view.h / 2) / scale,
    };
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    const policeEvent = game.stepWorld(STEP, moveState(), actions);
    if (game.busted) {
      game.busted = false;
      endGame('busted');
      return;
    }
    if (game.player.hp <= 0) {
      game.player.hp = 0;
      endGame('wasted');
    }
  }

  function handleButtons() {
    if (input.takeClick()) {
      const mouse = input.mouse();
      for (const b of buttons) {
        if (mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) {
          game.audio.unlock();
          game.audio.click();
          if (b.id === 'start') startGame(true);
          else if (b.id === 'continue') {
            game.load();
            screen = SCREEN_PLAY;
            announce('Continuing. Follow the gold marker for your next job.');
          } else if (b.id === 'resume') screen = SCREEN_PLAY;
          else if (b.id === 'restart') startGame(true);
          else if (b.id === 'quit') {
            screen = SCREEN_TITLE;
            saveExists = game.saveExists();
          }
          return;
        }
      }
    }
    // Keyboard shortcuts on menus.
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startGame(true);
      else if (screen === SCREEN_OVER) startGame(true);
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      while (accumulator >= STEP && (screen === SCREEN_PLAY || screen === SCREEN_TITLE)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      handleButtons();
    }
    // Camera anchor follows the player (the renderer centres on it).
    game.camera.x = game.player.x;
    game.camera.y = game.player.y;
    buttons = renderer.draw(game, screen, saveExists);
    if (screen === SCREEN_TITLE || screen === SCREEN_PAUSED || screen === SCREEN_OVER) handleButtons();
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
