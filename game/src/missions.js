// Missions and the story: five jobs in order, each a chain of steps (go somewhere, hold a
// spot, collect drops, lose the heat). The mission marker is the gold diamond on the map and
// the minimap; dialogue shows in the bottom bar. Completing a job pays and unlocks the next.
import { GARAGE, MISSIONS } from './config.js';

export function createMissions() {
  return {
    index: 0, // which mission is current
    active: false,
    step: 0,
    timer: 0, // counts down on timed missions
    holdTimer: 0,
    collected: 0,
    drops: [], // cash drop points for the collect mission
    dialogue: '',
    dialogueTimer: 0,
    banner: '', // 'Mission Complete' / 'Mission Failed' flash text
    bannerTimer: 0,
    done: [], // ids of completed missions
  };
}

export function currentMission(missions) {
  return MISSIONS[missions.index] || null;
}

export function currentStep(missions) {
  const m = currentMission(missions);
  return m ? m.steps[missions.step] : null;
}

/** The marker the map and minimap point at, or null when no mission is active. */
export function missionTarget(missions) {
  if (!missions.active) {
    const m = currentMission(missions);
    if (!m) return null;
    // Before starting, the marker sits on the first step so the player can find the job.
    const s = m.steps[0];
    if (s && s.x !== undefined) return { x: s.x, y: s.y, label: m.title };
    // Jobs with no fixed spot (lose the heat) start at the garage.
    return { x: GARAGE.x, y: GARAGE.y, label: m.title };
  }
  const s = currentStep(missions);
  if (!s) return null;
  if (s.type === 'collect') return missions.drops.length ? { x: missions.drops[0].x, y: missions.drops[0].y, label: 'Cash drop' } : null;
  if (s.type === 'loseHeat') return null;
  return { x: s.x, y: s.y, label: s.text };
}

function say(missions, text, seconds) {
  missions.dialogue = text;
  missions.dialogueTimer = seconds || 6;
}

function scatterDrops(missions, city, random, count) {
  missions.drops = [];
  const spots = [
    { x: 1200, y: 500 }, { x: 3000, y: 1000 }, { x: 600, y: 2000 },
    { x: 3600, y: 2500 }, { x: 1800, y: 3000 }, { x: 4200, y: 500 },
  ];
  for (let i = 0; i < count; i += 1) {
    const s = spots[i % spots.length];
    missions.drops.push({ x: s.x + random() * 40 - 20, y: s.y + random() * 40 - 20, taken: false });
  }
}

/** Begin the current mission: dialogue, timers, and any scripted wanted level. */
export function startMission(missions, game) {
  const m = currentMission(missions);
  if (!m || missions.active) return;
  missions.active = true;
  missions.step = 0;
  missions.collected = 0;
  missions.timer = m.timeLimit || 0;
  missions.holdTimer = 0;
  say(missions, m.intro, 8);
  if (m.id === 'heat') game.police.wanted = Math.max(game.police.wanted, 2);
  if (m.id === 'getaway') game.police.wanted = Math.max(game.police.wanted, 3);
  if (m.id === 'score') game.police.wanted = Math.max(game.police.wanted, 2);
  if (m.id === 'drops') scatterDrops(missions, game.city, game.random, 5);
  game.audio.mission();
}

function completeMission(missions, game) {
  const m = currentMission(missions);
  if (!m) return;
  game.player.money += m.reward;
  missions.done.push(m.id);
  missions.active = false;
  missions.banner = `Mission complete — ${m.title}  +$${m.reward}`;
  missions.bannerTimer = 3.5;
  say(missions, `"${m.title}" done. $${m.reward} in your pocket.`, 5);
  game.audio.cash();
  game.effects.addFloat(game.player.x, game.player.y - 30, `+$${m.reward}`, '#39d353');
  missions.index += 1;
  const next = currentMission(missions);
  if (next) say(missions, `Next job: ${next.title}. Follow the gold marker.`, 6);
  else say(missions, 'That\'s every job in Neon Bay — the city is yours, Rex.', 8);
  game.save();
}

function failMission(missions, game, reason) {
  const m = currentMission(missions);
  if (!m) return;
  missions.active = false;
  missions.banner = `Mission failed — ${reason}`;
  missions.bannerTimer = 3.5;
  say(missions, `"${m.title}" failed: ${reason}. Touch the gold marker to try again.`, 6);
  game.audio.fail();
  if (m.id === 'heat' || m.id === 'getaway' || m.id === 'score') game.police.wanted = 0;
}

/**
 * One step of the mission machine. Returns 'complete' or 'failed' on a state change.
 * `at` is the player's position; `onFoot` is false while driving.
 */
export function stepMissions(missions, dt, game) {
  if (missions.dialogueTimer > 0) missions.dialogueTimer -= dt;
  if (missions.bannerTimer > 0) missions.bannerTimer -= dt;
  if (!missions.active) return null;
  const m = currentMission(missions);
  const s = currentStep(missions);
  if (!m || !s) return null;
  const player = game.player;
  const px = player.x;
  const py = player.y;

  if (m.timeLimit) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      failMission(missions, game, 'out of time');
      return 'failed';
    }
  }

  if (s.type === 'goto') {
    if (Math.hypot(px - s.x, py - s.y) < s.r) {
      game.audio.pickup();
      missions.step += 1;
      if (missions.step >= m.steps.length) {
        completeMission(missions, game);
        return 'complete';
      }
      const next = currentStep(missions);
      say(missions, next.text, 5);
    }
  } else if (s.type === 'hold') {
    if (Math.hypot(px - s.x, py - s.y) < s.r) {
      missions.holdTimer += dt;
      if (missions.holdTimer >= s.seconds) {
        game.police.wanted = Math.max(game.police.wanted, 4);
        say(missions, 'Vault cracked! Four stars — run for the hideout!', 5);
        missions.step += 1;
        if (missions.step >= m.steps.length) {
          completeMission(missions, game);
          return 'complete';
        }
      }
    } else {
      missions.holdTimer = Math.max(0, missions.holdTimer - dt * 2);
    }
  } else if (s.type === 'collect') {
    for (const drop of missions.drops) {
      if (!drop.taken && Math.hypot(px - drop.x, py - drop.y) < 46) {
        drop.taken = true;
        missions.collected += 1;
        game.player.money += 50;
        game.audio.cash();
        game.effects.addFloat(drop.x, drop.y - 20, '+$50', '#39d353');
        if (missions.collected >= s.count) {
          completeMission(missions, game);
          return 'complete';
        }
        say(missions, `Cash drop ${missions.collected}/${s.count} collected.`, 3);
      }
    }
  } else if (s.type === 'loseHeat') {
    if (game.police.wanted === 0) {
      completeMission(missions, game);
      return 'complete';
    }
  }
  return null;
}

/** The objective line the HUD shows. */
export function objectiveText(missions) {
  const m = currentMission(missions);
  if (!m) return 'All jobs done — Neon Bay is yours.';
  if (!missions.active) return `Next job: ${m.title} — touch the gold marker to start`;
  const s = currentStep(missions);
  if (!s) return m.title;
  if (s.type === 'collect') return `${s.text.replace(/\(0\/\d+\)/, `(${missions.collected}/${s.count})`)}`;
  if (s.type === 'hold') return `${s.text} (${Math.max(0, Math.ceil(s.seconds - missions.holdTimer))}s)`;
  if (m.timeLimit) return `${s.text} — ${Math.max(0, Math.ceil(missions.timer))}s left`;
  return s.text;
}
