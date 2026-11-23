// Drawing only: the city, its cars and people, the HUD with its minimap, and the menus.
// The camera follows the player; the day/night tint shifts the light from golden afternoon
// through dusk to night. Nothing here changes the game state.
import { AVENUES, BEACH, DAY_LENGTH, FONT, GARAGE, HIDEOUT, PALETTE, PLAYER, STREETS, WORLD } from './config.js';
import { missionTarget } from './missions.js';

const PLAYER_AMMO_MAX = PLAYER.pistolAmmo;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const VIEW_W = 1200;
const VIEW_H = 800;
const MINIMAP = { w: 210, h: 150, margin: 14 };

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { dpr: 1, w: 0, h: 0, scale: 1, camX: 0, camY: 0 };
  const fonts = new Map();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    view.scale = Math.min(view.w / VIEW_W, view.h / VIEW_H);
  }

  function text(value, x, y, size, color, align, bold) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround(game) {
    const city = game.city;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Parks.
    ctx.fillStyle = PALETTE.park;
    for (const p of city.parks) ctx.fillRect(p.x, p.y, p.w, p.h);
    // Beach sand and water, with animated wave lines.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, 0, BEACH.sandX, WORLD.height);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, 0, BEACH.waterX, WORLD.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    const wave = Math.sin(game.time * 1.4) * 8;
    ctx.beginPath();
    ctx.moveTo(BEACH.waterX, 0);
    for (let y = 0; y <= WORLD.height; y += 120) ctx.lineTo(BEACH.waterX + wave * Math.sin(y * 0.01 + game.time), y);
    ctx.stroke();
    // Sidewalks, then roads, then lane markings.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const ax of AVENUES) ctx.fillRect(ax - 69, 0, 138, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - 69, WORLD.width, 138);
    ctx.fillStyle = PALETTE.road;
    for (const ax of AVENUES) ctx.fillRect(ax - 45, 0, 90, WORLD.height);
    for (const sy of STREETS) ctx.fillRect(0, sy - 45, WORLD.width, 90);
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, WORLD.height); }
    for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(WORLD.width, sy); }
    ctx.stroke();
    ctx.setLineDash([]);
    // Docks: piers into the water at the south-east.
    ctx.fillStyle = '#6b5d4f';
    ctx.fillRect(4300, 3300, 500, 60);
    ctx.fillRect(4450, 3050, 60, 310);
  }

  function drawBuildings(game) {
    const night = game.dayTime > 0.6 && game.dayTime < 0.9;
    for (const b of game.city.buildings) {
      // Shadow offset by height.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + 6 + b.tall * 2, b.y + 8 + b.tall * 2, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = shade(b.color, -28);
      ctx.fillRect(b.x, b.y, b.w, 10);
      ctx.fillStyle = shade(b.color, 18);
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      // Windows: lit at night.
      ctx.fillStyle = night ? '#ffd76a' : 'rgba(30,40,60,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (((cx * 7 + cy * 13 + Math.floor(b.windows * 100)) % 5) < 3) {
            ctx.fillRect(b.x + 10 + cx * 26, b.y + 12 + cy * 26, 12, 14);
          }
        }
      }
      if (b.tall > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(b.x + 6, b.y + 6, 14, 14);
      }
    }
    for (const c of game.city.containers) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(c.x + 4, c.y + 5, c.w, c.h);
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let i = 1; i < 5; i += 1) ctx.fillRect(c.x + i * 18, c.y, 2, c.h);
    }
    // Garage and hideout markers.
    ctx.fillStyle = 'rgba(57,211,83,0.25)';
    ctx.beginPath(); ctx.arc(GARAGE.x, GARAGE.y, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39d353';
    text('GARAGE', GARAGE.x - 34, GARAGE.y - 52, 15, '#39d353', 'left', true);
    ctx.fillStyle = 'rgba(242,201,76,0.2)';
    ctx.beginPath(); ctx.arc(HIDEOUT.x, HIDEOUT.y, HIDEOUT.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(242,201,76,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(HIDEOUT.x, HIDEOUT.y, HIDEOUT.r, 0, Math.PI * 2); ctx.stroke();
    text('HIDEOUT', HIDEOUT.x - 36, HIDEOUT.y - HIDEOUT.r - 8, 15, '#f2c94c', 'left', true);
  }

  function drawSkids(game) {
    ctx.strokeStyle = 'rgba(20,20,20,0.5)';
    ctx.lineWidth = 5;
    for (const s of game.effects.skids) {
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 10, s.y - Math.sin(s.angle) * 10);
      ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
      ctx.stroke();
    }
  }

  function drawCarShape(car) {
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(car.x + 4, car.y + 6, 34, 18, car.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(-32, -15, 64, 30, 8);
    ctx.fill();
    // Roof and windshield.
    ctx.fillStyle = shade(car.color, -30);
    roundRect(-8, -12, 22, 24, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.8)';
    roundRect(12, -11, 8, 22, 3);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(28, -12, 4, 6);
    ctx.fillRect(28, 6, 4, 6);
    ctx.fillStyle = '#a02020';
    ctx.fillRect(-32, -12, 4, 6);
    ctx.fillRect(-32, 6, 4, 6);
    if (car.isPolice) {
      const flash = Math.sin(car.sirenPhase) > 0;
      ctx.fillStyle = flash ? '#ff2f2f' : '#2f6fff';
      ctx.fillRect(-6, -14, 12, 5);
      ctx.fillStyle = flash ? '#2f6fff' : '#ff2f2f';
      ctx.fillRect(-6, 9, 12, 5);
    }
    ctx.restore();
    // Damage smoke is drawn by the effects layer.
  }

  function drawPedShape(ped, time) {
    if (ped.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath(); ctx.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const bob = Math.sin(time * 10 + ped.x) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(ped.x + 2, ped.y + 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 + bob * 0.3, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawPlayerShape(game) {
    const p = game.player;
    if (p.inCar) return;
    const bob = p.moving ? Math.sin(p.walkPhase) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 5, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Body: green jacket, dark jeans, facing the movement direction.
    ctx.save();
    ctx.translate(p.x, p.y + bob * 0.3);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#39d353';
    roundRect(-10, -9, 20, 18, 6);
    ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
    if (p.pistolOut) {
      ctx.fillStyle = '#222';
      ctx.fillRect(10, -2, 12, 4);
    }
    if (p.punchAnim > 0) {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath(); ctx.arc(20, 0, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPickups(game) {
    for (const pk of game.pickups) {
      if (pk.taken) continue;
      const pulse = 1 + Math.sin(game.time * 4 + pk.x) * 0.12;
      ctx.save();
      ctx.translate(pk.x, pk.y);
      ctx.scale(pulse, pulse);
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#39d353';
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b3d16';
        text('$', -4, 5, 16, '#0b3d16', 'left', true);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = '#222';
        ctx.fillRect(-6, -4, 4, 8);
        ctx.fillRect(2, -4, 4, 8);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-9, -3, 18, 6);
        ctx.fillRect(-3, -9, 6, 18);
      }
      ctx.restore();
    }
    // Mission cash drops.
    for (const drop of game.missions.drops) {
      if (drop.taken) continue;
      const pulse = 1 + Math.sin(game.time * 5) * 0.15;
      ctx.save();
      ctx.translate(drop.x, drop.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#39d353';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b3d16';
      text('$', -5, 6, 18, '#0b3d16', 'left', true);
      ctx.restore();
    }
  }

  function drawMissionMarker(game) {
    const target = missionTarget(game.missions);
    if (!target) return;
    const pulse = 1 + Math.sin(game.time * 4) * 0.18;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(14, 0); ctx.lineTo(0, 22); ctx.lineTo(-14, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#222';
    text('M', -6, 6, 16, '#222', 'left', true);
    ctx.restore();
    // A beacon column so the marker is visible from far away.
    const grad = ctx.createLinearGradient(target.x, target.y - 260, target.x, target.y);
    grad.addColorStop(0, 'rgba(242,201,76,0)');
    grad.addColorStop(1, 'rgba(242,201,76,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(target.x - 8, target.y - 260, 16, 260);
  }

  function drawBullets(game) {
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 3;
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(game) {
    for (const p of game.effects.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of game.effects.floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      text(f.text, f.x, f.y, 18, f.color, 'center', true);
    }
    ctx.globalAlpha = 1;
  }

  function drawDayTint(game) {
    const t = game.dayTime;
    if (t < 0.45) {
      ctx.fillStyle = 'rgba(255,190,90,0.05)';
      ctx.fillRect(game.camera.x - VIEW_W / 2, game.camera.y - VIEW_H / 2, VIEW_W, VIEW_H);
    } else if (t < 0.6) {
      ctx.fillStyle = 'rgba(255,120,40,0.10)';
      ctx.fillRect(game.camera.x - VIEW_W / 2, game.camera.y - VIEW_H / 2, VIEW_W, VIEW_H);
    } else if (t < 0.88) {
      ctx.fillStyle = 'rgba(8,12,48,0.32)';
      ctx.fillRect(game.camera.x - VIEW_W / 2, game.camera.y - VIEW_H / 2, VIEW_W, VIEW_H);
    } else {
      ctx.fillStyle = 'rgba(255,150,120,0.07)';
      ctx.fillRect(game.camera.x - VIEW_W / 2, game.camera.y - VIEW_H / 2, VIEW_W, VIEW_H);
    }
  }

  function drawMinimap(game) {
    const x = view.w - MINIMAP.w - MINIMAP.margin;
    const y = MINIMAP.margin;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    ctx.fillStyle = PALETTE.panel;
    roundRect(x - 6, y - 6, MINIMAP.w + 12, MINIMAP.h + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, MINIMAP.w, MINIMAP.h);
    ctx.clip();
    ctx.fillStyle = PALETTE.grassDark;
    ctx.fillRect(x, y, MINIMAP.w, MINIMAP.h);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x, y, BEACH.waterX * sx, MINIMAP.h);
    ctx.fillStyle = PALETTE.road;
    for (const ax of AVENUES) ctx.fillRect(x + ax * sx - 1, y, 2, MINIMAP.h);
    for (const sy2 of STREETS) ctx.fillRect(x, y + sy2 * sy - 1, MINIMAP.w, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const car of game.cars) {
      if (car.kind === 'parked') continue;
      ctx.fillRect(x + car.x * sx - 1, y + car.y * sy - 1, 2, 2);
    }
    for (const car of game.police.cars) {
      ctx.fillStyle = Math.sin(game.time * 8) > 0 ? '#ff2f2f' : '#2f6fff';
      ctx.fillRect(x + car.x * sx - 2, y + car.y * sy - 2, 4, 4);
    }
    const target = missionTarget(game.missions);
    if (target) {
      const pulse = 3 + Math.sin(game.time * 5) * 1.5;
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath(); ctx.arc(x + target.x * sx, y + target.y * sy, pulse, 0, Math.PI * 2); ctx.fill();
    }
    // Player: green dot with a white ring.
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + game.player.x * sx, y + game.player.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39d353';
    ctx.beginPath(); ctx.arc(x + game.player.x * sx, y + game.player.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    roundRect(x - 6, y - 6, MINIMAP.w + 12, MINIMAP.h + 12, 8);
    ctx.stroke();
  }

  function drawHud(game) {
    const p = game.player;
    // Health + money, top-left.
    ctx.fillStyle = PALETTE.panel;
    roundRect(14, 14, 250, 64, 10);
    ctx.fill();
    text('REX MARLOWE', 26, 36, 14, PALETTE.muted, 'left', true);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(26, 44, 150, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.hp > 40 ? '#39d353' : '#e5534b';
    roundRect(26, 44, Math.max(0, 150 * (p.hp / 100)), 12, 6);
    ctx.fill();
    text(`$${p.money}`, 190, 56, 20, '#39d353', 'left', true);
    // Wanted stars under the minimap.
    const stars = game.police.wanted;
    const sx = view.w - MINIMAP.w - MINIMAP.margin;
    const sy = MINIMAP.margin + MINIMAP.h + 16;
    ctx.fillStyle = PALETTE.panel;
    roundRect(sx - 6, sy - 6, MINIMAP.w + 12, 34, 8);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      text('★', sx + 16 + i * 40, sy + 20, 26, i < stars ? '#f2c94c' : 'rgba(255,255,255,0.25)', 'left', true);
    }
    // Mission objective, top-centre.
    const obj = game.missionObjective;
    if (obj) {
      ctx.fillStyle = PALETTE.panel;
      roundRect(view.w / 2 - 310, 14, 620, 40, 10);
      ctx.fill();
      text(obj, view.w / 2, 40, 17, PALETTE.text, 'center', true);
    }
    // Bottom-left: weapon/ammo, and speed while driving.
    ctx.fillStyle = PALETTE.panel;
    roundRect(14, view.h - 64, 250, 50, 10);
    ctx.fill();
    if (p.inCar) {
      const kmh = Math.round(Math.abs(p.inCar.speed) * 0.32);
      text(`${kmh} km/h`, 26, view.h - 30, 24, PALETTE.text, 'left', true);
      text(p.inCar.hp < 45 ? 'DAMAGED' : 'DRIVING', 150, view.h - 32, 14, p.inCar.hp < 45 ? '#e5534b' : PALETTE.muted, 'left', true);
    } else {
      text(p.pistolOut ? `PISTOL  ${p.ammo} / ${PLAYER_AMMO_MAX}` : 'FISTS  [Q] pistol', 26, view.h - 30, 18, PALETTE.text, 'left', true);
    }
    // Controls hint, bottom-right.
    text('WASD move · E car · Space punch · Click shoot · P pause', view.w - 16, view.h - 18, 13, PALETTE.muted, 'right');
    // Dialogue bar.
    if (game.missions.dialogueTimer > 0 && game.missions.dialogue) {
      ctx.fillStyle = PALETTE.panel;
      roundRect(view.w / 2 - 330, view.h - 150, 660, 64, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,201,76,0.6)';
      ctx.lineWidth = 1;
      roundRect(view.w / 2 - 330, view.h - 150, 660, 64, 10);
      ctx.stroke();
      wrapText(game.missions.dialogue, view.w / 2 - 310, view.h - 126, 620, 16);
    }
    // Mission banner.
    if (game.missions.bannerTimer > 0 && game.missions.banner) {
      ctx.fillStyle = 'rgba(12,14,20,0.85)';
      roundRect(view.w / 2 - 300, view.h / 2 - 110, 600, 52, 10);
      ctx.fill();
      text(game.missions.banner, view.w / 2, view.h / 2 - 76, 22, '#f2c94c', 'center', true);
    }
    drawMinimap(game);
  }

  function wrapText(value, x, y, maxW, size) {
    const words = value.split(' ');
    let line = '';
    let lineY = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      ctx.font = `${size}px ${FONT}`;
      if (ctx.measureText(test).width > maxW && line) {
        text(line, x, lineY, size, PALETTE.text, 'left');
        line = word;
        lineY += size + 6;
      } else {
        line = test;
      }
    }
    if (line) text(line, x, lineY, size, PALETTE.text, 'left');
  }

  function drawPanel(title, lines, prompt, buttons) {
    const w = Math.min(680, view.w - 60);
    const lineH = 30;
    const height = 150 + lines.length * lineH + (buttons ? 70 : 40);
    const x = (view.w - w) / 2;
    const y = (view.h - height) / 2;
    ctx.fillStyle = 'rgba(8,10,16,0.86)';
    roundRect(x, y, w, height, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,201,76,0.5)';
    ctx.lineWidth = 1;
    roundRect(x, y, w, height, 14);
    ctx.stroke();
    text(title, view.w / 2, y + 64, 44, '#f2c94c', 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], view.w / 2, y + 116 + i * lineH, 17, PALETTE.muted, 'center');
    }
    const out = [];
    if (buttons) {
      const bw = 220;
      const bh = 48;
      const total = buttons.length * (bw + 20) - 20;
      let bx = view.w / 2 - total / 2;
      const by = y + height - 66;
      for (const b of buttons) {
        ctx.fillStyle = b.primary ? '#f2c94c' : 'rgba(255,255,255,0.15)';
        roundRect(bx, by, bw, bh, 10);
        ctx.fill();
        text(b.label, bx + bw / 2, by + 31, 20, b.primary ? '#222' : PALETTE.text, 'center', true);
        out.push({ id: b.id, x: bx, y: by, w: bw, h: bh });
        bx += bw + 20;
      }
    } else if (prompt) {
      text(prompt, view.w / 2, y + height - 34, 19, '#f2c94c', 'center', true);
    }
    return out;
  }

  const TITLE_LINES = [
    'Neon Bay, 2026. Rex Marlowe came home to drive — and the city pulled him back in.',
    'Steal cars, outrun the cops, run five jobs for Vic and Lena, and take the Big Score.',
    '',
    'WASD / arrows — walk and drive · E — steal / exit a car · Space — punch',
    'Mouse — aim · Click — shoot · Q — pistol · Shift — run · P / Esc — pause',
    'Gold markers are jobs. Stars are the cops. The hideout sheds the heat.',
  ];

  /** Paint one frame. Returns the screen-space buttons (for clicks) on menu screens. */
  function draw(game, screen, saveExists) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, view.w, view.h);
    // Camera follows the player, plus shake. It never shows outside the world: the
    // visible half-size comes from the actual viewport and scale, not the nominal view.
    const shake = game.effects.shakeOffset();
    const focus = game.player.inCar || game.player;
    const halfW = view.w / (2 * view.scale);
    const halfH = view.h / (2 * view.scale);
    view.camX = Math.max(halfW, Math.min(WORLD.width - halfW, focus.x));
    view.camY = Math.max(halfH, Math.min(WORLD.height - halfH, focus.y));
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale,
      view.dpr * (view.w / 2 - view.camX * view.scale + shake.x),
      view.dpr * (view.h / 2 - view.camY * view.scale + shake.y));
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.camX - VIEW_W / 2 - 60, view.camY - VIEW_H / 2 - 60, VIEW_W + 120, VIEW_H + 120);
    ctx.clip();
    drawGround(game);
    drawBuildings(game);
    drawSkids(game);
    drawPickups(game);
    drawMissionMarker(game);
    for (const car of game.cars) drawCarShape(car);
    for (const ped of game.peds) drawPedShape(ped, game.time);
    drawPlayerShape(game);
    drawBullets(game);
    drawParticles(game);
    drawDayTint(game);
    ctx.restore();
    // Screen-space HUD and menus.
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (screen === SCREEN_TITLE) {
      const buttons = [{ id: 'start', label: 'START', primary: true }];
      if (saveExists) buttons.unshift({ id: 'continue', label: 'CONTINUE', primary: false });
      return drawPanel('NEON BAY', TITLE_LINES, null, buttons);
    }
    drawHud(game);
    if (screen === SCREEN_PAUSED) {
      return drawPanel('PAUSED', ['The city waits for no one — except now.'], null,
        [{ id: 'resume', label: 'RESUME', primary: true }, { id: 'quit', label: 'QUIT TO TITLE', primary: false }]);
    }
    if (screen === SCREEN_OVER) {
      const lines = game.overReason === 'busted'
        ? ['The Neon Bay PD caught up with Rex.', `Money kept: $${game.player.money}`]
        : ['Rex is down. Neon Bay keeps its secrets — for now.', `Money kept: $${game.player.money}`];
      return drawPanel(game.overReason === 'busted' ? 'BUSTED' : 'WASTED', lines, null,
        [{ id: 'restart', label: 'PLAY AGAIN', primary: true }, { id: 'quit', label: 'QUIT TO TITLE', primary: false }]);
    }
    return [];
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
