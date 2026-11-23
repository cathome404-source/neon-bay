// Particles, skid marks, floating score text and screen shake: the juice that makes the
// city feel alive. Nothing here knows about the game rules, only about things that fade.
export function createEffects() {
  const particles = [];
  const skids = [];
  const floats = [];
  let shake = 0;

  function addParticle(x, y, vx, vy, life, size, color) {
    if (particles.length > 400) return;
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  function exhaust(x, y, angle) {
    const back = angle + Math.PI;
    addParticle(
      x + Math.cos(back) * 26, y + Math.sin(back) * 26,
      Math.cos(back) * 40 + (Math.random() - 0.5) * 30,
      Math.sin(back) * 40 + (Math.random() - 0.5) * 30,
      0.5, 4 + Math.random() * 4, 'rgba(120,120,120,0.5)',
    );
  }

  function impact(x, y, color) {
    for (let i = 0; i < 10; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 160;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.3, 3 + Math.random() * 3, color);
    }
  }

  function smoke(x, y) {
    addParticle(
      x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20, -30 - Math.random() * 30,
      1.1, 8 + Math.random() * 6, 'rgba(60,60,60,0.45)',
    );
  }

  function blood(x, y) {
    for (let i = 0; i < 6; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35, 3, '#a02020');
    }
  }

  function addSkid(x, y, angle) {
    skids.push({ x, y, angle, life: 6 });
    if (skids.length > 300) skids.shift();
  }

  function addFloat(x, y, text, color) {
    floats.push({ x, y, text, color: color || '#f2c94c', life: 1.2 });
    if (floats.length > 24) floats.shift();
  }

  function addShake(amount) {
    shake = Math.min(18, shake + amount);
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      const f = floats[i];
      f.life -= dt;
      f.y -= 30 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 30);
  }

  function shakeOffset() {
    if (shake <= 0.1) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
  }

  return {
    particles, skids, floats,
    exhaust, impact, smoke, blood,
    addSkid, addFloat, addShake,
    update, shakeOffset,
  };
}
