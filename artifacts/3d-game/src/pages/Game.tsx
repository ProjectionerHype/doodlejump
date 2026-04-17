import { useEffect, useRef, useCallback } from "react";

const W = 400;
const H = 600;
const GRAVITY = 0.38;
const BASE_JUMP = -14;
const SPRING_JUMP = -20;
const MOVE_SPEED = 5.5;
const PW = 68;
const PH = 14;
const PLAYER_W = 44;
const PLAYER_H = 52;

// ─── TYPES ───────────────────────────────────────────────────────────────────
type PType = "normal" | "moving" | "broken" | "spring" | "cloud";
type Zone = "city" | "sky" | "sunset" | "night" | "space";

interface Platform {
  id: number; x: number; y: number; w: number; h: number;
  type: PType; vx: number; cracked: boolean; crackedTimer: number;
  bounceTimer: number; used: boolean;
}
interface Bullet { id: number; x: number; y: number; vx: number; vy: number; }
interface Fireball {
  id: number; x: number; y: number; vx: number; vy: number;
  radius: number; phase: number; trail: Array<{x: number; y: number}>;
}
interface FireJet {
  id: number; x: number; y: number; dir: number;
  timer: number; active: boolean; period: number;
}
interface Meteor {
  id: number; x: number; y: number; vx: number; vy: number;
  radius: number; trail: Array<{x: number; y: number; a: number}>;
}
interface Monster {
  id: number; x: number; y: number; w: number; h: number;
  vx: number; type: "worm" | "ufo" | "bat"; alive: boolean; frame: number; hp: number;
}
interface Particle {
  id: number; x: number; y: number; vx: number; vy: number;
  life: number; color: string; r: number; glow?: boolean;
}
interface FloatText {
  id: number; x: number; y: number; vy: number; text: string; life: number; color: string;
}
interface Cloud {
  x: number; y: number; w: number; h: number; speed: number; layer: number;
}
interface Star { x: number; y: number; r: number; twinkle: number; }
interface PowerUp {
  id: number; x: number; y: number; type: "spring" | "jetpack"; collected: boolean;
}

interface GS {
  phase: "menu" | "playing" | "dead";
  px: number; py: number; pvx: number; pvy: number;
  pface: number; animT: number;
  platforms: Platform[];
  bullets: Bullet[];
  fireballs: Fireball[];
  fireJets: FireJet[];
  meteors: Meteor[];
  monsters: Monster[];
  particles: Particle[];
  floats: FloatText[];
  powerups: PowerUp[];
  clouds: Cloud[];
  stars: Star[];
  score: number; hi: number;
  camY: number; scrolled: number;
  keys: Record<string, boolean>;
  mouse: { x: number; y: number };
  jetpack: number; shootCooldown: number;
  pid: number; bid: number; mid: number; fid: number;
  fibid: number; fjid: number; metid: number;
  puid: number; pcid: number; frameN: number;
  aimAngle: number;
  zone: Zone;
  invincible: number;
  lastHazardSpawn: number;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getZone(scrolled: number): Zone {
  if (scrolled < 1200) return "city";
  if (scrolled < 2800) return "sky";
  if (scrolled < 5000) return "sunset";
  if (scrolled < 8000) return "night";
  return "space";
}

function platGap(score: number): number {
  return 52 + Math.min(score / 80, 75) + Math.random() * 18;
}

function makePlat(id: number, x: number, y: number, score: number): Platform {
  const r = Math.random();
  const d = Math.min(score / 2000, 1);
  let type: PType = "normal";
  if (r < 0.07 * d) type = "spring";
  else if (r < 0.22 * d) type = "broken";
  else if (r < 0.40 * d) type = "moving";
  else if (r < 0.48 * d) type = "cloud";
  const w = type === "spring" ? 58 : PW;
  return {
    id, x: Math.max(4, Math.min(W - w - 4, Math.random() * (W - w))),
    y, w, h: PH, type,
    vx: type === "moving" ? (Math.random() > 0.5 ? 1.8 : -1.8) : 0,
    cracked: false, crackedTimer: 0, bounceTimer: 0, used: false,
  };
}

function makeClouds(): Cloud[] {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 12; i++) {
    clouds.push({
      x: Math.random() * W, y: Math.random() * H,
      w: 60 + Math.random() * 80, h: 30 + Math.random() * 30,
      speed: 0.2 + Math.random() * 0.4,
      layer: Math.floor(Math.random() * 2),
    });
  }
  return clouds;
}

function makeStars(): Star[] {
  return Array.from({ length: 120 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.8 + 0.3,
    twinkle: Math.random() * Math.PI * 2,
  }));
}

function init(hi: number): GS {
  const platforms: Platform[] = [];
  platforms.push({
    id: 0, x: W / 2 - PW / 2, y: H - 100, w: PW + 12, h: PH,
    type: "normal", vx: 0, cracked: false, crackedTimer: 0, bounceTimer: 0, used: false,
  });
  for (let i = 1; i < 18; i++) {
    platforms.push(makePlat(i + 1, 0, H - 100 - i * 50, 0));
  }
  return {
    phase: "menu",
    px: W / 2 - PLAYER_W / 2, py: H - 100 - PLAYER_H - 2,
    pvx: 0, pvy: 0, pface: 1, animT: 0,
    platforms, bullets: [], fireballs: [], fireJets: [], meteors: [],
    monsters: [], particles: [], floats: [],
    powerups: [], clouds: makeClouds(), stars: makeStars(),
    score: 0, hi,
    camY: 0, scrolled: 0,
    keys: {}, mouse: { x: W / 2, y: H / 2 },
    jetpack: 0, shootCooldown: 0,
    pid: 20, bid: 0, mid: 0, fid: 0,
    fibid: 0, fjid: 0, metid: 0,
    puid: 0, pcid: 0, frameN: 0,
    aimAngle: -Math.PI / 2,
    zone: "city", invincible: 0, lastHazardSpawn: 0,
  };
}

function addParticles(gs: GS, x: number, y: number, color: string, n = 8, glow = false) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.9;
    const spd = 1.5 + Math.random() * 3.5;
    gs.particles.push({
      id: gs.pcid++, x, y,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2,
      life: 1, color, r: 3 + Math.random() * 5, glow,
    });
  }
}

function addFloat(gs: GS, x: number, y: number, text: string, color: string) {
  gs.floats.push({ id: gs.fid++, x, y, vy: -1.8, text, life: 1, color });
}

function toScreen(camY: number, worldY: number) { return worldY - camY; }

// ─── RENDER HELPERS ──────────────────────────────────────────────────────────
function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawFireball(ctx: CanvasRenderingContext2D, fb: Fireball, camY: number) {
  const sy = toScreen(camY, fb.y);
  if (sy < -60 || sy > H + 60) return;
  ctx.save();
  // Trail
  fb.trail.forEach((t, i) => {
    const alpha = (i / fb.trail.length) * 0.6;
    const size = fb.radius * (i / fb.trail.length) * 0.9;
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(t.x, toScreen(camY, t.y), 0, t.x, toScreen(camY, t.y), size);
    g.addColorStop(0, "#ffee60");
    g.addColorStop(0.4, "#ff6010");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(t.x, toScreen(camY, t.y), size, 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  // Core
  const cg = ctx.createRadialGradient(fb.x, sy, 0, fb.x, sy, fb.radius);
  cg.addColorStop(0, "#fffbe8");
  cg.addColorStop(0.3, "#ffdd20");
  cg.addColorStop(0.7, "#ff6010");
  cg.addColorStop(1, "#cc1000");
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(fb.x, sy, fb.radius, 0, Math.PI * 2); ctx.fill();
  // Glow
  ctx.globalAlpha = 0.3 + 0.2 * Math.sin(fb.phase * 0.2);
  drawGlow(ctx, fb.x, sy, fb.radius * 2.5, "rgba(255,120,20,0.5)");
  ctx.globalAlpha = 1;
  // Flame spikes
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + fb.phase * 0.08;
    const len = fb.radius * (0.8 + Math.random() * 0.6);
    ctx.strokeStyle = `rgba(255,${100 + Math.floor(Math.random() * 100)},0,0.8)`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fb.x + Math.cos(a) * fb.radius * 0.7, sy + Math.sin(a) * fb.radius * 0.7);
    ctx.lineTo(fb.x + Math.cos(a) * len, sy + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFireJet(ctx: CanvasRenderingContext2D, fj: FireJet, camY: number, frameN: number) {
  const sy = toScreen(camY, fj.y);
  if (sy < -100 || sy > H + 100) return;
  ctx.save();
  // Mount
  ctx.fillStyle = "#555";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  if (fj.dir > 0) {
    ctx.beginPath(); ctx.roundRect(0, sy - 14, 20, 28, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillRect(16, sy - 4, 6, 8);
  } else {
    ctx.beginPath(); ctx.roundRect(W - 20, sy - 14, 20, 28, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillRect(W - 22, sy - 4, 6, 8);
  }
  if (fj.active) {
    const len = 80 + Math.sin(frameN * 0.3) * 20;
    const startX = fj.dir > 0 ? 22 : W - 22;
    for (let i = 0; i < 3; i++) {
      const jitter = (Math.random() - 0.5) * 10;
      const g = ctx.createLinearGradient(startX, sy, startX + fj.dir * len, sy);
      g.addColorStop(0, "rgba(255,255,200,0.95)");
      g.addColorStop(0.3, "rgba(255,120,0,0.9)");
      g.addColorStop(0.7, "rgba(255,30,0,0.6)");
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      const fw = 14 - i * 3;
      ctx.beginPath();
      ctx.moveTo(startX, sy - fw / 2 + jitter);
      ctx.quadraticCurveTo(startX + fj.dir * len * 0.5, sy + jitter * 1.5, startX + fj.dir * len, sy + jitter);
      ctx.lineTo(startX + fj.dir * len, sy + fw / 2 + jitter);
      ctx.quadraticCurveTo(startX + fj.dir * len * 0.5, sy + fw + jitter * 0.5, startX, sy + fw / 2 + jitter);
      ctx.fill();
    }
    // Glow
    ctx.globalAlpha = 0.25;
    drawGlow(ctx, startX + fj.dir * 30, sy, 40, "rgba(255,100,0,0.8)");
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawMeteor(ctx: CanvasRenderingContext2D, m: Meteor, camY: number) {
  const sy = toScreen(camY, m.y);
  if (sy < -80 || sy > H + 80) return;
  ctx.save();
  m.trail.forEach((t, i) => {
    const alpha = (i / m.trail.length) * 0.7;
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(t.x, toScreen(camY, m.y - (m.trail.length - i) * 3), 0,
      t.x, toScreen(camY, m.y - (m.trail.length - i) * 3), m.radius * (i / m.trail.length));
    g.addColorStop(0, "#ffe080");
    g.addColorStop(0.5, "#ff4020");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, toScreen(camY, m.y - (m.trail.length - i) * 3), m.radius * (i / m.trail.length), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  const mg = ctx.createRadialGradient(m.x, sy, 0, m.x, sy, m.radius);
  mg.addColorStop(0, "#fff8e0");
  mg.addColorStop(0.4, "#ff9020");
  mg.addColorStop(0.8, "#cc3010");
  mg.addColorStop(1, "#550000");
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(m.x, sy, m.radius, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── BACKGROUND DRAWING ──────────────────────────────────────────────────────
function drawBackground(ctx: CanvasRenderingContext2D, gs: GS) {
  const s = gs.scrolled;
  const t = gs.frameN;

  // Sky gradient based on zone
  let c1: string, c2: string, c3: string;
  if (s < 1200) {
    const p = s / 1200;
    c1 = `hsl(${200 - p * 10},70%,${65 - p * 15}%)`;
    c2 = `hsl(${210 - p * 20},65%,${55 - p * 20}%)`;
    c3 = `hsl(${220 + p * 20},60%,${40 - p * 10}%)`;
  } else if (s < 2800) {
    const p = (s - 1200) / 1600;
    c1 = `hsl(${30 + p * 20},${70 + p * 20}%,${50 - p * 20}%)`;
    c2 = `hsl(${20 + p * 30},${80}%,${40 - p * 15}%)`;
    c3 = `hsl(${280 + p * 20},60%,${30 - p * 10}%)`;
  } else if (s < 5000) {
    const p = (s - 2800) / 2200;
    c1 = `hsl(${50 - p * 40},90%,${30 - p * 20}%)`;
    c2 = `hsl(${280 + p * 20},80%,${20}%)`;
    c3 = `hsl(${240 + p * 20},70%,${15 - p * 5}%)`;
  } else if (s < 8000) {
    const p = (s - 5000) / 3000;
    c1 = `hsl(${220 + p * 20},${60 + p * 20}%,${10 - p * 8}%)`;
    c2 = `hsl(${240},70%,${8}%)`;
    c3 = `hsl(${260},80%,${6}%)`;
  } else {
    c1 = "hsl(240,90%,4%)";
    c2 = "hsl(260,80%,5%)";
    c3 = "hsl(220,70%,3%)";
  }

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(0.5, c2);
  bg.addColorStop(1, c3);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // City silhouette at bottom zones
  if (s < 1500) {
    const alpha = Math.max(0, 1 - s / 1500);
    ctx.globalAlpha = alpha;
    const buildings = [
      { x: 0, w: 55, h: 140 }, { x: 50, w: 40, h: 190 }, { x: 85, w: 65, h: 110 },
      { x: 145, w: 35, h: 220 }, { x: 175, w: 50, h: 160 }, { x: 220, w: 30, h: 250 },
      { x: 245, w: 55, h: 130 }, { x: 295, w: 40, h: 200 }, { x: 330, w: 50, h: 170 },
      { x: 375, w: 30, h: 140 },
    ];
    buildings.forEach((b) => {
      const buildGrad = ctx.createLinearGradient(b.x, H - b.h, b.x, H);
      buildGrad.addColorStop(0, "rgba(20,25,50,0.95)");
      buildGrad.addColorStop(1, "rgba(10,12,28,0.98)");
      ctx.fillStyle = buildGrad;
      ctx.fillRect(b.x, H - b.h, b.w, b.h);
      // Windows
      for (let wy = H - b.h + 10; wy < H - 10; wy += 22) {
        for (let wx = b.x + 6; wx < b.x + b.w - 8; wx += 16) {
          if (Math.sin(wx * 7 + wy * 13) > 0.1) {
            ctx.fillStyle = `rgba(255,240,150,${0.4 + Math.sin(wx + t * 0.005) * 0.2})`;
            ctx.fillRect(wx, wy, 8, 10);
          }
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  // Stars (appear in night/space zones)
  const starAlpha = Math.max(0, Math.min(1, (s - 3000) / 2000));
  if (starAlpha > 0) {
    ctx.globalAlpha = starAlpha;
    gs.stars.forEach((star) => {
      const tw = 0.5 + 0.5 * Math.sin(star.twinkle + t * 0.025);
      ctx.globalAlpha = starAlpha * (0.4 + 0.6 * tw);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r * tw, 0, Math.PI * 2);
      ctx.fill();
      if (star.r > 1.2) {
        ctx.globalAlpha = starAlpha * 0.3 * tw;
        drawGlow(ctx, star.x, star.y, star.r * 4, "rgba(180,210,255,0.8)");
      }
    });
    ctx.globalAlpha = 1;
  }

  // Nebula in space zone
  if (s > 6000) {
    const na = Math.min(1, (s - 6000) / 2000) * 0.18;
    ctx.globalAlpha = na;
    const positions = [[100, 200], [300, 350], [180, 480], [60, 420]];
    const colors = ["rgba(100,0,200,0.6)", "rgba(0,100,200,0.6)", "rgba(200,0,100,0.6)", "rgba(0,200,150,0.5)"];
    positions.forEach(([nx, ny], i) => {
      const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, 100 + i * 20);
      ng.addColorStop(0, colors[i]);
      ng.addColorStop(1, "transparent");
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.arc(nx, ny, 120 + i * 25, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // Clouds (only in city/sky/sunset zones)
  const cloudAlpha = Math.max(0, 1 - (s - 4000) / 1500);
  if (cloudAlpha > 0) {
    gs.clouds.forEach((cloud) => {
      const speed = cloud.layer === 0 ? 0.15 : 0.3;
      cloud.x -= speed + gs.pvx * 0.015;
      if (cloud.x + cloud.w < 0) cloud.x = W + 10;
      if (cloud.x > W + 10) cloud.x = -cloud.w;

      ctx.globalAlpha = cloudAlpha * (cloud.layer === 0 ? 0.55 : 0.35);
      const isSunset = s > 2000 && s < 5000;
      const cloudColor = isSunset ? "rgba(255,180,120,0.9)" : "rgba(255,255,255,0.9)";
      ctx.fillStyle = cloudColor;
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.w / 2, cloud.y, cloud.w / 2, cloud.h / 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.w * 0.35, cloud.y - cloud.h * 0.25, cloud.w * 0.3, cloud.h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cloud.x + cloud.w * 0.65, cloud.y - cloud.h * 0.2, cloud.w * 0.28, cloud.h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // Zone label (brief flash when entering new zone)
  const zoneLabels: Record<Zone, string> = {
    city: "🌆 City", sky: "☁ Sky Zone", sunset: "🌅 Stratosphere",
    night: "🌙 Night Sky", space: "🚀 Outer Space"
  };
  const zoneBreaks: Record<Zone, number> = { city: 0, sky: 1200, sunset: 2800, night: 5000, space: 8000 };
  const breakY = zoneBreaks[gs.zone];
  const dt = Math.abs(s - breakY);
  if (dt < 120 && gs.zone !== "city") {
    const fa = 1 - dt / 120;
    ctx.globalAlpha = fa;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath(); ctx.roundRect(W / 2 - 100, H / 2 - 20, 200, 40, 10); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(zoneLabels[gs.zone], W / 2, H / 2 + 6);
    ctx.globalAlpha = 1;
  }
}

// ─── DRAW PLATFORM ───────────────────────────────────────────────────────────
function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, camY: number, zone: Zone) {
  const sy = toScreen(camY, p.y);
  if (sy > H + 30 || sy < -50) return;
  const bounce = p.bounceTimer > 0 ? Math.sin(p.bounceTimer * 0.55) * 5 : 0;
  ctx.save();
  ctx.translate(p.x + p.w / 2, sy + p.h / 2 - bounce * 0.5);

  if (p.type === "spring") {
    const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
    g.addColorStop(0, "#ff9fc0"); g.addColorStop(0.5, "#e8305a"); g.addColorStop(1, "#a01038");
    ctx.fillStyle = g; ctx.strokeStyle = "#801030"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 2, p.w - 10, 4);
    // Spring coil
    ctx.strokeStyle = "#ffe0f0"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const cy = -p.h / 2 - 5 - i * 6;
      ctx.beginPath(); ctx.moveTo(-7, cy); ctx.quadraticCurveTo(0, cy - 5, 7, cy); ctx.stroke();
    }

  } else if (p.type === "broken" || p.cracked) {
    ctx.globalAlpha = p.cracked ? 1 - p.crackedTimer / 28 : 1;
    ctx.fillStyle = p.cracked ? "#9a5c28" : "#bf7038";
    ctx.strokeStyle = "#6a3810"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 5); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#6a3810"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-p.w / 4, -p.h / 2); ctx.lineTo(-p.w / 8, p.h / 2);
    ctx.moveTo(p.w / 6, -p.h / 2 + 2); ctx.lineTo(p.w / 3.5, p.h / 2);
    ctx.moveTo(0, -p.h / 2); ctx.lineTo(-p.w / 10, p.h / 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,200,140,0.25)"; ctx.fillRect(-p.w / 2 + 4, -p.h / 2 + 3, p.w - 8, 3);
    ctx.globalAlpha = 1;

  } else if (p.type === "moving") {
    let g;
    if (zone === "space") {
      g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, "#cc80ff"); g.addColorStop(0.5, "#8030cc"); g.addColorStop(1, "#500090");
      ctx.strokeStyle = "#300060";
    } else {
      g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, "#80c8ff"); g.addColorStop(0.5, "#2090e8"); g.addColorStop(1, "#0060b8");
      ctx.strokeStyle = "#004090";
    }
    ctx.fillStyle = g; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 2, p.w - 10, 4);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.vx > 0 ? "▶▶" : "◀◀", 0, 4);

  } else if (p.type === "cloud") {
    ctx.globalAlpha = p.used ? 0.2 : 0.85;
    ctx.fillStyle = "#e8f8ff"; ctx.strokeStyle = "#90c8e8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath(); ctx.ellipse(-p.w / 4, -p.h / 2 - 7, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.w / 4, -p.h / 2 - 7, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -p.h / 2 - 10, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

  } else {
    let g, strokeC;
    if (zone === "sunset") {
      g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, "#ffa060"); g.addColorStop(0.5, "#e86020"); g.addColorStop(1, "#b03000");
      strokeC = "#802000";
    } else if (zone === "night" || zone === "space") {
      g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, "#80ffee"); g.addColorStop(0.5, "#20ccaa"); g.addColorStop(1, "#008870");
      strokeC = "#006050";
    } else {
      g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
      g.addColorStop(0, "#90e870"); g.addColorStop(0.5, "#38c020"); g.addColorStop(1, "#208010");
      strokeC = "#186010";
    }
    ctx.fillStyle = g; ctx.strokeStyle = strokeC!; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 2, p.w - 10, 4);
  }

  ctx.restore();
}

// ─── DRAW CHARACTER ──────────────────────────────────────────────────────────
function drawPlayer(ctx: CanvasRenderingContext2D, gs: GS) {
  const sx = gs.px;
  const sy = toScreen(gs.camY, gs.py);
  const f = gs.pface;
  const t = gs.animT;
  const falling = gs.pvy > 2;
  const rising = gs.pvy < -4;

  ctx.save();
  ctx.translate(sx + PLAYER_W / 2, sy + PLAYER_H / 2);
  ctx.scale(f, 1);

  // Squish/stretch
  const sqX = rising ? 0.85 : falling ? 1.1 : 1;
  const sqY = rising ? 1.15 : falling ? 0.9 : 1;
  ctx.scale(sqX, sqY);

  // Jetpack
  if (gs.jetpack > 0) {
    ctx.fillStyle = "#c03010";
    ctx.strokeStyle = "#801000"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-30, -16, 12, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff6030";
    const fh = 12 + Math.sin(t * 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(-29, 10); ctx.lineTo(-24, 10 + fh); ctx.lineTo(-19, 10); ctx.fill();
    ctx.fillStyle = "#ff9050";
    ctx.beginPath();
    ctx.moveTo(-28, 10); ctx.lineTo(-24, 10 + fh * 0.5); ctx.lineTo(-20, 10); ctx.fill();
  }

  // Body — space suit style
  // Legs
  const legPhase = Math.sin(t * 0.18);
  const legL = rising || falling ? 0 : legPhase * 8;
  ctx.fillStyle = "#2255cc";
  ctx.strokeStyle = "#112288"; ctx.lineWidth = 1.5;
  // Left leg
  ctx.beginPath();
  ctx.ellipse(-9 + legL * 0.3, 21, 7, 9, -0.1 + legL * 0.02, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Right leg
  ctx.beginPath();
  ctx.ellipse(9 - legL * 0.3, 21, 7, 9, 0.1 - legL * 0.02, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Boot highlights
  ctx.fillStyle = "#4499ff";
  ctx.beginPath(); ctx.ellipse(-9 + legL * 0.3, 17, 5, 3, -0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(9 - legL * 0.3, 17, 5, 3, 0.1, 0, Math.PI * 2); ctx.fill();

  // Thruster glow on boots when jumping
  if (rising || gs.jetpack > 0) {
    ctx.globalAlpha = 0.7;
    drawGlow(ctx, -9, 26, 12, "rgba(80,180,255,0.8)");
    drawGlow(ctx, 9, 26, 12, "rgba(80,180,255,0.8)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#aaeeff";
    ctx.beginPath(); ctx.ellipse(-9, 29, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, 29, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Torso — space suit
  const torsoGrad = ctx.createLinearGradient(-16, -12, 16, 10);
  torsoGrad.addColorStop(0, "#3366ee");
  torsoGrad.addColorStop(0.5, "#2244cc");
  torsoGrad.addColorStop(1, "#112288");
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = "#0a1866"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-16, -14, 32, 26, 8); ctx.fill(); ctx.stroke();

  // Chest detail — star emblem
  ctx.fillStyle = "#ffcc00";
  ctx.strokeStyle = "#aa8800"; ctx.lineWidth = 1;
  const starPts = 5;
  ctx.beginPath();
  for (let i = 0; i < starPts * 2; i++) {
    const angle = (i * Math.PI) / starPts - Math.PI / 2;
    const r = i % 2 === 0 ? 7 : 3.5;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, -2 + Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, -2 + Math.sin(angle) * r);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Arm / gun
  const aimAngleAdj = gs.pface === 1 ? gs.aimAngle : Math.PI - gs.aimAngle;
  ctx.save();
  ctx.translate(14, 0);
  ctx.rotate(aimAngleAdj);
  // Arm
  ctx.fillStyle = "#3366ee"; ctx.strokeStyle = "#112288"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(0, -5, 20, 10, 5); ctx.fill(); ctx.stroke();
  // Gun
  const gunGrad = ctx.createLinearGradient(18, -4, 36, 4);
  gunGrad.addColorStop(0, "#888");
  gunGrad.addColorStop(0.5, "#ccc");
  gunGrad.addColorStop(1, "#666");
  ctx.fillStyle = gunGrad; ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(18, -4, 18, 8, 4); ctx.fill(); ctx.stroke();
  // Barrel
  ctx.fillStyle = "#444";
  ctx.fillRect(34, -2.5, 6, 5);
  // Muzzle glow
  if (gs.shootCooldown > 8) {
    ctx.globalAlpha = (gs.shootCooldown - 8) / 12;
    drawGlow(ctx, 42, 0, 12, "rgba(255,200,50,0.9)");
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Helmet
  const helmetGrad = ctx.createRadialGradient(-6, -22, 3, 0, -22, 20);
  helmetGrad.addColorStop(0, "#ccddff");
  helmetGrad.addColorStop(0.4, "#8899ee");
  helmetGrad.addColorStop(0.8, "#445599");
  helmetGrad.addColorStop(1, "#223377");
  ctx.fillStyle = helmetGrad;
  ctx.strokeStyle = "#1a2866"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, -20, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // Visor
  const visorGrad = ctx.createRadialGradient(-4, -22, 2, 2, -20, 14);
  visorGrad.addColorStop(0, "rgba(200,240,255,0.9)");
  visorGrad.addColorStop(0.3, "rgba(100,200,255,0.7)");
  visorGrad.addColorStop(0.7, "rgba(20,120,200,0.6)");
  visorGrad.addColorStop(1, "rgba(0,60,140,0.8)");
  ctx.fillStyle = visorGrad;
  ctx.strokeStyle = "#1155aa"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(2, -20, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Eyes inside visor
  ctx.fillStyle = "#00ddff";
  ctx.shadowColor = "#00ffff"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(5, -22, 4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#001866";
  ctx.beginPath(); ctx.arc(6, -22, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(7, -23, 0.9, 0, Math.PI * 2); ctx.fill();

  // Visor shine
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath(); ctx.ellipse(-2, -26, 6, 3, -0.3, 0, Math.PI * 2); ctx.fill();

  // Antenna
  ctx.strokeStyle = "#88aaff"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(6, -39); ctx.lineTo(10, -46); ctx.stroke();
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath(); ctx.arc(10, -47, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff8";
  ctx.beginPath(); ctx.arc(9, -48, 1, 0, Math.PI * 2); ctx.fill();

  // Invincibility shimmer
  if (gs.invincible > 0 && Math.floor(gs.frameN / 4) % 2 === 0) {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#00ffff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -4, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ─── DRAW MONSTER ────────────────────────────────────────────────────────────
function drawMonster(ctx: CanvasRenderingContext2D, m: Monster, camY: number) {
  const sy = toScreen(camY, m.y);
  if (sy > H + 50 || sy < -60) return;
  ctx.save();
  ctx.translate(m.x + m.w / 2, sy + m.h / 2);

  if (m.type === "worm") {
    ctx.scale(m.vx > 0 ? 1 : -1, 1);
    const wg = ctx.createRadialGradient(-4, -4, 2, 0, 0, 22);
    wg.addColorStop(0, "#ff8888"); wg.addColorStop(0.5, "#dd1818"); wg.addColorStop(1, "#880000");
    ctx.fillStyle = wg; ctx.strokeStyle = "#550000"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 2, 23, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(12, -4, 6, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.ellipse(13, -4, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(14, -5, 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cc0000";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 8, -14); ctx.lineTo(i * 8 - 5, -6); ctx.lineTo(i * 8 + 5, -6); ctx.fill();
    }
    ctx.globalAlpha = 0.4;
    drawGlow(ctx, 0, 0, 30, "rgba(255,50,0,0.5)");
    ctx.globalAlpha = 1;

  } else if (m.type === "ufo") {
    const phase = m.frame * 0.1;
    ctx.globalAlpha = 0.3;
    drawGlow(ctx, 0, 8, 40, "rgba(100,255,100,0.6)");
    ctx.globalAlpha = 1;
    const dg = ctx.createLinearGradient(0, -m.h / 2, 0, m.h / 2);
    dg.addColorStop(0, "#c0c0ee"); dg.addColorStop(0.5, "#7070cc"); dg.addColorStop(1, "#3030aa");
    ctx.fillStyle = dg; ctx.strokeStyle = "#1818aa"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 5, 27, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(150,255,180,0.75)"; ctx.strokeStyle = "#40cc60"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, -2, 15, 13, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    const lc = ["#ff4040", "#40ff40", "#4040ff", "#ffff40", "#ff40ff"];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + phase;
      ctx.fillStyle = lc[i];
      ctx.shadowColor = lc[i]; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 19, 6 + Math.sin(a) * 3, 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

  } else {
    ctx.scale(m.vx > 0 ? 1 : -1, 1);
    const wf = Math.sin(m.frame * 0.28) * 0.45;
    ctx.fillStyle = "#663399"; ctx.strokeStyle = "#221133"; ctx.lineWidth = 1.5;
    ctx.save(); ctx.rotate(-wf);
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-30, -22, -42, 6); ctx.quadraticCurveTo(-30, 10, -5, 8); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.rotate(wf);
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.quadraticCurveTo(30, -22, 42, 6); ctx.quadraticCurveTo(30, 10, 5, 8); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#442266"; ctx.strokeStyle = "#221133"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 2, 14, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff1111"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(-5, -1, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -1, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(-4, -1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(-7, 18); ctx.lineTo(0, 11); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, 11); ctx.lineTo(7, 18); ctx.lineTo(0, 11); ctx.fill();
  }

  // HP
  for (let i = 0; i < m.hp; i++) {
    ctx.fillStyle = "#ff3030"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(-5 + i * 10, -m.h / 2 - 10, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ─── DRAW BULLET ─────────────────────────────────────────────────────────────
function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet, camY: number) {
  const sy = toScreen(camY, b.y);
  ctx.save();
  ctx.translate(b.x, sy);
  ctx.rotate(Math.atan2(b.vy, b.vx));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
  g.addColorStop(0, "#fffbe8"); g.addColorStop(0.3, "#ffe040"); g.addColorStop(0.7, "#ff8010"); g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function drawHUD(ctx: CanvasRenderingContext2D, gs: GS) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.roundRect(8, 8, 130, 44, 10); ctx.fill();
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#80ffee"; ctx.textAlign = "left"; ctx.fillText("SCORE", 16, 22);
  ctx.font = "bold 20px 'Segoe UI', sans-serif"; ctx.fillStyle = "#fff";
  ctx.fillText(gs.score.toLocaleString(), 16, 44);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.roundRect(W - 130, 8, 122, 44, 10); ctx.fill();
  ctx.font = "bold 11px 'Segoe UI', sans-serif"; ctx.fillStyle = "#ffd700"; ctx.textAlign = "right";
  ctx.fillText("BEST", W - 14, 22);
  ctx.font = "bold 20px 'Segoe UI', sans-serif"; ctx.fillStyle = "#fff";
  ctx.fillText(gs.hi.toLocaleString(), W - 14, 44);

  if (gs.jetpack > 0) {
    ctx.textAlign = "center"; ctx.font = "bold 13px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ff8040";
    ctx.fillText("🚀 JETPACK " + Math.ceil(gs.jetpack / 60) + "s", W / 2, 28);
  }

  const zoneColors: Record<Zone, string> = {
    city: "#ffdd80", sky: "#80ccff", sunset: "#ff9050", night: "#aaaaff", space: "#cc88ff"
  };
  const zoneNames: Record<Zone, string> = {
    city: "City", sky: "Sky", sunset: "Stratosphere", night: "Night", space: "Space"
  };
  ctx.textAlign = "center"; ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.roundRect(W / 2 - 50, H - 30, 100, 22, 8); ctx.fill();
  ctx.fillStyle = zoneColors[gs.zone];
  ctx.fillText(zoneNames[gs.zone], W / 2, H - 14);

  ctx.restore();
}

// ─── MENU ────────────────────────────────────────────────────────────────────
function drawMenu(ctx: CanvasRenderingContext2D, gs: GS) {
  const t = gs.frameN;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,20,0.6)";
  ctx.beginPath(); ctx.roundRect(40, 80, W - 80, 420, 24); ctx.fill();

  const shimmer = Math.sin(t * 0.04) * 0.5 + 0.5;
  const titleG = ctx.createLinearGradient(0, 120, 0, 200);
  titleG.addColorStop(0, `hsl(${180 + shimmer * 40},100%,75%)`);
  titleG.addColorStop(0.5, `hsl(${200 + shimmer * 30},90%,65%)`);
  titleG.addColorStop(1, `hsl(${220},80%,55%)`);

  ctx.font = "bold 62px 'Impact', 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.shadowColor = `hsl(${200 + shimmer * 40},100%,60%)`;
  ctx.shadowBlur = 20 + shimmer * 15;
  ctx.fillStyle = titleG;
  ctx.fillText("DOODLE", W / 2, 170);
  ctx.fillText("JUMP", W / 2, 235);
  ctx.shadowBlur = 0;

  ctx.font = "15px 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(180,220,255,0.7)";
  ctx.fillText("Space Explorer Edition", W / 2, 260);

  const pulse = 1 + Math.sin(t * 0.07) * 0.05;
  ctx.save();
  ctx.translate(W / 2, 315); ctx.scale(pulse, pulse);
  const btnG = ctx.createLinearGradient(-90, -26, 90, 26);
  btnG.addColorStop(0, "#00ccff"); btnG.addColorStop(0.5, "#0066ee"); btnG.addColorStop(1, "#4400cc");
  ctx.fillStyle = btnG; ctx.strokeStyle = "#88ccff"; ctx.lineWidth = 2;
  ctx.shadowColor = "#00ccff"; ctx.shadowBlur = 15;
  ctx.beginPath(); ctx.roundRect(-90, -26, 180, 52, 16); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff"; ctx.font = "bold 22px 'Segoe UI', sans-serif";
  ctx.fillText("LAUNCH!", 0, 9);
  ctx.restore();

  ctx.font = "13px 'Segoe UI', sans-serif"; ctx.fillStyle = "rgba(180,210,255,0.75)";
  ctx.fillText("← → or A/D to move", W / 2, 375);
  ctx.fillText("Click/tap to shoot enemies", W / 2, 396);
  ctx.fillText("Survive fireballs & meteors!", W / 2, 417);

  if (gs.hi > 0) {
    ctx.fillStyle = "#ffd700"; ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillText("Best: " + gs.hi.toLocaleString(), W / 2, 450);
  }
  ctx.restore();
}

// ─── GAME OVER ───────────────────────────────────────────────────────────────
function drawGameOver(ctx: CanvasRenderingContext2D, gs: GS) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,20,0.8)";
  ctx.beginPath(); ctx.roundRect(40, 120, W - 80, 350, 24); ctx.fill();

  ctx.textAlign = "center";
  ctx.font = "bold 54px 'Impact', sans-serif";
  const dg = ctx.createLinearGradient(0, 155, 0, 215);
  dg.addColorStop(0, "#ff6666"); dg.addColorStop(1, "#cc0022");
  ctx.fillStyle = dg;
  ctx.shadowColor = "#ff0033"; ctx.shadowBlur = 20;
  ctx.fillText("GAME", W / 2, 200); ctx.fillText("OVER", W / 2, 255);
  ctx.shadowBlur = 0;

  ctx.font = "24px 'Segoe UI', sans-serif"; ctx.fillStyle = "#fff";
  ctx.fillText("Score: " + gs.score.toLocaleString(), W / 2, 294);

  if (gs.score >= gs.hi && gs.score > 0) {
    const hc = `hsl(${(gs.frameN * 3) % 360},100%,65%)`;
    ctx.fillStyle = hc; ctx.font = "bold 17px 'Segoe UI', sans-serif";
    ctx.fillText("NEW HIGH SCORE!", W / 2, 322);
  } else {
    ctx.fillStyle = "#ffd700"; ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.fillText("Best: " + gs.hi.toLocaleString(), W / 2, 322);
  }

  const pulse = 0.7 + 0.3 * Math.sin(gs.frameN * 0.1);
  ctx.globalAlpha = pulse;
  const bg = ctx.createLinearGradient(W / 2 - 85, 350, W / 2 + 85, 398);
  bg.addColorStop(0, "#8833cc"); bg.addColorStop(1, "#dd2299");
  ctx.fillStyle = bg; ctx.strokeStyle = "#cc88ff"; ctx.lineWidth = 2;
  ctx.shadowColor = "#cc44ff"; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.roundRect(W / 2 - 85, 348, 170, 50, 16); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Segoe UI', sans-serif";
  ctx.fillText("PLAY AGAIN", W / 2, 380);
  ctx.fillStyle = "rgba(180,200,255,0.6)"; ctx.font = "13px 'Segoe UI', sans-serif";
  ctx.fillText("Space / click to restart", W / 2, 428);
  ctx.restore();
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS>(init(0));
  const rafRef = useRef(0);
  const hiRef = useRef(parseInt(localStorage.getItem("djhi2") || "0", 10));

  const startGame = useCallback(() => {
    const gs = init(hiRef.current);
    gs.phase = "playing";
    gsRef.current = gs;
  }, []);

  useEffect(() => {
    gsRef.current = init(hiRef.current);
    const onKey = (e: KeyboardEvent) => {
      gsRef.current.keys[e.code] = e.type === "keydown";
      if (e.type === "keydown" && (e.code === "Space" || e.code === "Enter")) {
        if (gsRef.current.phase !== "playing") startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [startGame]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    function update() {
      const gs = gsRef.current;
      gs.frameN++; gs.animT++;
      if (gs.phase !== "playing") return;

      const left = gs.keys["ArrowLeft"] || gs.keys["KeyA"];
      const right = gs.keys["ArrowRight"] || gs.keys["KeyD"];
      if (left) { gs.pvx = Math.max(gs.pvx - 1.3, -MOVE_SPEED * 1.6); gs.pface = -1; }
      else if (right) { gs.pvx = Math.min(gs.pvx + 1.3, MOVE_SPEED * 1.6); gs.pface = 1; }
      else gs.pvx *= 0.80;

      gs.px += gs.pvx;
      if (gs.px > W) gs.px = -PLAYER_W;
      if (gs.px + PLAYER_W < 0) gs.px = W;

      if (gs.jetpack > 0) {
        gs.jetpack--;
        gs.pvy = Math.max(gs.pvy - 0.65, -12);
        for (let i = 0; i < 2; i++) addParticles(gs, gs.px + PLAYER_W / 2, gs.py + PLAYER_H, "#ff8040", 1);
      } else gs.pvy += GRAVITY;

      gs.py += gs.pvy;

      const screenPY = gs.py - gs.camY;
      if (screenPY < H / 2.8) {
        const d = H / 2.8 - screenPY;
        gs.camY -= d; gs.scrolled += d;
        gs.score = Math.max(gs.score, Math.floor(gs.scrolled / 4));
        gs.zone = getZone(gs.scrolled);
        // Scroll stars
        gs.stars.forEach((s) => {
          s.y += d * 0.08;
          if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        });
      }

      // Platform collisions
      if (gs.pvy > 0) {
        for (const p of gs.platforms) {
          const prevPy = gs.py - gs.pvy;
          const ox = gs.px + 8 < p.x + p.w - 8 && gs.px + PLAYER_W - 8 > p.x + 8;
          const on = prevPy + PLAYER_H <= p.y + 5 && gs.py + PLAYER_H >= p.y && gs.py + PLAYER_H <= p.y + p.h + 14;
          if (ox && on) {
            if (p.type === "broken") {
              if (!p.cracked) { p.cracked = true; p.crackedTimer = 0; }
              else continue;
            }
            if (p.type === "cloud") p.used = true;
            if (p.type === "spring") {
              gs.pvy = SPRING_JUMP; p.bounceTimer = 12;
              addParticles(gs, p.x + p.w / 2, p.y, "#ff60c0", 8, true);
              addFloat(gs, p.x + p.w / 2, p.y - 20, "BOING!", "#ff6090");
            } else { gs.pvy = BASE_JUMP; p.bounceTimer = 8; }
            gs.py = p.y - PLAYER_H;
            break;
          }
        }
      }

      // Update/cull platforms
      gs.platforms.forEach((p) => {
        if (p.bounceTimer > 0) p.bounceTimer--;
        if (p.type === "moving") { p.x += p.vx; if (p.x <= 0 || p.x + p.w >= W) p.vx *= -1; }
        if (p.cracked) p.crackedTimer++;
      });
      gs.platforms = gs.platforms.filter((p) => {
        if (p.cracked && p.crackedTimer > 26) return false;
        if (p.used) return false;
        return toScreen(gs.camY, p.y) < H + 30;
      });

      // Generate platforms
      while (true) {
        const minY = gs.platforms.length ? Math.min(...gs.platforms.map((p) => p.y)) : gs.camY;
        if (minY < gs.camY - 60 && gs.platforms.length >= 20) break;
        gs.platforms.push(makePlat(gs.pid++, 0, minY - platGap(gs.score), gs.score));
        if (gs.platforms.filter((p) => toScreen(gs.camY, p.y) < H).length >= 22) break;
      }

      // Powerups
      if (gs.score > 300 && Math.random() < 0.0006) {
        const tY = gs.camY - 120 - Math.random() * 160;
        gs.powerups.push({ id: gs.puid++, x: 20 + Math.random() * (W - 60), y: tY, type: "jetpack", collected: false });
      }
      gs.powerups.forEach((pu) => {
        if (pu.collected) return;
        const dx = gs.px + PLAYER_W / 2 - (pu.x + 15);
        const dy = gs.py + PLAYER_H / 2 - (pu.y + 15);
        if (Math.abs(dx) < 32 && Math.abs(dy) < 32) {
          pu.collected = true; gs.jetpack = 240;
          addFloat(gs, gs.px + PLAYER_W / 2, gs.py, "JETPACK!", "#ff8040");
          addParticles(gs, pu.x, pu.y, "#ffcc20", 14, true);
        }
      });
      gs.powerups = gs.powerups.filter((p) => !p.collected && toScreen(gs.camY, p.y) < H + 30);

      // Bullets
      if (gs.shootCooldown > 0) gs.shootCooldown--;
      gs.bullets = gs.bullets.filter((b) => {
        b.x += b.vx; b.y += b.vy;
        return toScreen(gs.camY, b.y) > -80 && toScreen(gs.camY, b.y) < H + 80;
      });

      // ─── HAZARDS ─────────────────────────────────────────────────────────
      // Fireballs: spawn based on zone
      const fbMax = gs.zone === "city" ? 1 : gs.zone === "sky" ? 2 : gs.zone === "sunset" ? 3 : gs.zone === "night" ? 4 : 5;
      if (gs.fireballs.length < fbMax && Math.random() < 0.008) {
        const side = Math.random() > 0.5;
        gs.fireballs.push({
          id: gs.fibid++,
          x: side ? -20 : W + 20,
          y: gs.camY + Math.random() * H * 0.8,
          vx: (side ? 1 : -1) * (2 + Math.random() * 2),
          vy: (Math.random() - 0.5) * 2,
          radius: 12 + Math.random() * 6,
          phase: 0,
          trail: [],
        });
      }
      gs.fireballs.forEach((fb) => {
        fb.trail.push({ x: fb.x, y: fb.y });
        if (fb.trail.length > 12) fb.trail.shift();
        fb.x += fb.vx; fb.y += fb.vy; fb.phase++;
        fb.vy += (Math.random() - 0.5) * 0.3;
        if (toScreen(gs.camY, fb.y) > H + 60) {
          fb.vy = -(2 + Math.random() * 2);
        }
        // Bounce off walls
        if (fb.x < fb.radius) { fb.x = fb.radius; fb.vx = Math.abs(fb.vx); }
        if (fb.x > W - fb.radius) { fb.x = W - fb.radius; fb.vx = -Math.abs(fb.vx); }
        // Fireball hits player
        if (gs.invincible <= 0) {
          const dx = gs.px + PLAYER_W / 2 - fb.x;
          const dy = gs.py + PLAYER_H / 2 - fb.y;
          if (Math.sqrt(dx * dx + dy * dy) < fb.radius + 16) {
            die(gs);
          }
        }
        // Bullet hits fireball (temporarily shrinks it)
        gs.bullets.forEach((b) => {
          const bdx = b.x - fb.x; const bdy = b.y - fb.y;
          if (Math.sqrt(bdx * bdx + bdy * bdy) < fb.radius + 5) {
            fb.radius = Math.max(6, fb.radius - 3);
            b.vy = 1e9;
            addParticles(gs, fb.x, fb.y, "#ffaa20", 5, true);
          }
        });
      });
      gs.fireballs = gs.fireballs.filter((fb) => {
        const sy = toScreen(gs.camY, fb.y);
        return sy > -80 && sy < H + 80;
      });

      // Fire jets (appear in sunset+ zones)
      if (gs.zone !== "city" && gs.zone !== "sky" && gs.fireJets.length < 3 && Math.random() < 0.003) {
        gs.fireJets.push({
          id: gs.fjid++,
          x: 0,
          y: gs.camY - 50 - Math.random() * 200,
          dir: Math.random() > 0.5 ? 1 : -1,
          timer: 0, active: false,
          period: 80 + Math.floor(Math.random() * 80),
        });
      }
      gs.fireJets.forEach((fj) => {
        fj.timer++;
        const cycle = fj.timer % fj.period;
        fj.active = cycle < fj.period * 0.4;
        if (fj.active && gs.invincible <= 0) {
          const jetLen = 90;
          const startX = fj.dir > 0 ? 22 : W - 22;
          const endX = startX + fj.dir * jetLen;
          const sy = toScreen(gs.camY, fj.y);
          const px = gs.px + PLAYER_W / 2, py = toScreen(gs.camY, gs.py + PLAYER_H / 2);
          // Simple segment-circle collision
          const inJetX = fj.dir > 0 ? (px > startX && px < endX) : (px < startX && px > endX);
          if (inJetX && Math.abs(py - sy) < 18) die(gs);
        }
      });
      gs.fireJets = gs.fireJets.filter((fj) => toScreen(gs.camY, fj.y) < H + 30);

      // Meteors (appear in night/space zones)
      if ((gs.zone === "night" || gs.zone === "space") && gs.meteors.length < 5 && Math.random() < 0.006) {
        gs.meteors.push({
          id: gs.metid++,
          x: Math.random() * W,
          y: gs.camY - 60,
          vx: (Math.random() - 0.5) * 4,
          vy: 4 + Math.random() * 4,
          radius: 8 + Math.random() * 8,
          trail: [],
        });
      }
      gs.meteors.forEach((m) => {
        m.trail.push({ x: m.x, y: m.y, a: 1 });
        if (m.trail.length > 14) m.trail.shift();
        m.x += m.vx; m.y += m.vy;
        if (gs.invincible <= 0) {
          const dx = gs.px + PLAYER_W / 2 - m.x;
          const dy = gs.py + PLAYER_H / 2 - m.y;
          if (Math.sqrt(dx * dx + dy * dy) < m.radius + 14) die(gs);
        }
        gs.bullets.forEach((b) => {
          const bdx = b.x - m.x; const bdy = b.y - m.y;
          if (Math.sqrt(bdx * bdx + bdy * bdy) < m.radius + 5) {
            addParticles(gs, m.x, m.y, "#ffaa60", 8, true);
            addFloat(gs, m.x, m.y, "+50", "#ffaa40");
            gs.score += 50;
            m.vy = 1e9; b.vy = 1e9;
          }
        });
      });
      gs.meteors = gs.meteors.filter((m) => {
        const sy = toScreen(gs.camY, m.y);
        return sy < H + 60 && m.vy < 100;
      });

      // Monsters
      const mMax = Math.min(Math.floor(gs.score / 600) + 1, 5);
      if (gs.score > 200 && gs.monsters.filter((m) => m.alive).length < mMax && Math.random() < 0.0035) {
        const types: Array<"worm" | "ufo" | "bat"> = gs.score < 800 ? ["worm"] : gs.score < 2000 ? ["worm", "ufo"] : ["worm", "ufo", "bat"];
        const type = types[Math.floor(Math.random() * types.length)];
        gs.monsters.push({
          id: gs.mid++,
          x: Math.random() * (W - 50),
          y: gs.camY - 80 - Math.random() * 180,
          w: type === "ufo" ? 54 : type === "bat" ? 46 : 48,
          h: type === "ufo" ? 32 : type === "bat" ? 28 : 28,
          vx: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2),
          type, alive: true, frame: 0,
          hp: type === "ufo" ? 2 : 1,
        });
      }
      gs.monsters.forEach((m) => {
        if (!m.alive) return;
        m.x += m.vx; m.frame++;
        if (m.x <= 0 || m.x + m.w >= W) m.vx *= -1;
        if (m.type === "ufo") m.y += Math.sin(m.frame * 0.04) * 0.9;
        if (m.type === "bat") m.y += Math.sin(m.frame * 0.07) * 1.4 - 0.15;
        // Bullet hits monster
        gs.bullets.forEach((b) => {
          if (b.x > m.x && b.x < m.x + m.w && b.y > m.y && b.y < m.y + m.h) {
            m.hp--;
            addParticles(gs, b.x, b.y, "#ff4040", 5);
            b.vy = 1e9;
            if (m.hp <= 0) {
              m.alive = false;
              addParticles(gs, m.x + m.w / 2, m.y + m.h / 2, "#ff5030", 16, true);
              const pts = m.type === "ufo" ? 200 : m.type === "bat" ? 150 : 100;
              gs.score += pts;
              addFloat(gs, m.x + m.w / 2, m.y, "+" + pts, "#ff6020");
            }
          }
        });
        // Player touches monster
        if (!m.alive || gs.invincible > 0) return;
        const overlap = gs.px + 8 < m.x + m.w - 8 && gs.px + PLAYER_W - 8 > m.x + 8 &&
          gs.py + 8 < m.y + m.h - 8 && gs.py + PLAYER_H - 8 > m.y + 8;
        if (overlap) {
          if (gs.pvy > 0 && gs.py + PLAYER_H < m.y + m.h * 0.55) {
            m.hp--; if (m.hp <= 0) { m.alive = false; addParticles(gs, m.x + m.w / 2, m.y + m.h / 2, "#ff5030", 12, true); gs.score += 100; addFloat(gs, m.x + m.w / 2, m.y, "+100", "#ff6020"); }
            gs.pvy = BASE_JUMP;
          } else die(gs);
        }
      });
      gs.monsters = gs.monsters.filter((m) => m.alive && toScreen(gs.camY, m.y) < H + 80);

      // Aim
      const cx = gs.px + PLAYER_W / 2, cy = toScreen(gs.camY, gs.py + PLAYER_H / 2);
      gs.aimAngle = Math.atan2(gs.mouse.y - cy, gs.mouse.x - cx);

      // Particles & floats
      gs.particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.022; });
      gs.particles = gs.particles.filter((p) => p.life > 0);
      gs.floats.forEach((f) => { f.y += f.vy; f.life -= 0.016; });
      gs.floats = gs.floats.filter((f) => f.life > 0);
      if (gs.invincible > 0) gs.invincible--;
      if (toScreen(gs.camY, gs.py) > H + 80) die(gs);
    }

    function die(gs: GS) {
      if (gs.phase !== "playing") return;
      gs.phase = "dead";
      if (gs.score > hiRef.current) { hiRef.current = gs.score; gs.hi = gs.score; localStorage.setItem("djhi2", String(gs.score)); }
    }

    function render() {
      const gs = gsRef.current;
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, gs);
      gs.platforms.forEach((p) => drawPlatform(ctx, p, gs.camY, gs.zone));

      // Powerups
      gs.powerups.forEach((pu) => {
        if (pu.collected) return;
        const sy = toScreen(gs.camY, pu.y);
        const bob = Math.sin(gs.frameN * 0.07) * 4;
        ctx.save(); ctx.translate(pu.x + 18, sy + 18 + bob);
        ctx.fillStyle = "#c03010"; ctx.strokeStyle = "#801000"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-14, -18, 16, 28, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ff5020"; ctx.fillRect(-10, -20, 10, 8);
        ctx.fillStyle = "#ffcc20";
        const fh = 10 + Math.sin(gs.frameN * 0.3) * 5;
        ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-7, 10 + fh); ctx.lineTo(-2, 10); ctx.fill();
        ctx.globalAlpha = 0.4;
        drawGlow(ctx, 0, 12, 20, "rgba(255,100,0,0.7)");
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      // Particles
      gs.particles.forEach((p) => {
        const sy = toScreen(gs.camY, p.y);
        ctx.globalAlpha = p.life;
        if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, sy, p.r * p.life, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      });
      ctx.globalAlpha = 1;

      // Hazards
      gs.fireJets.forEach((fj) => drawFireJet(ctx, fj, gs.camY, gs.frameN));
      gs.fireballs.forEach((fb) => drawFireball(ctx, fb, gs.camY));
      gs.meteors.forEach((m) => drawMeteor(ctx, m, gs.camY));
      gs.bullets.forEach((b) => drawBullet(ctx, b, gs.camY));
      gs.monsters.forEach((m) => drawMonster(ctx, m, gs.camY));

      // Aim line
      if (gs.phase === "playing") {
        const ax = gs.px + PLAYER_W / 2, ay = toScreen(gs.camY, gs.py + PLAYER_H / 2);
        const aa = gs.pface === 1 ? gs.aimAngle : Math.PI - gs.aimAngle;
        ctx.save();
        ctx.strokeStyle = "rgba(255,220,60,0.55)"; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]); ctx.lineDashOffset = -(gs.frameN * 0.6);
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(aa) * 60, ay + Math.sin(aa) * 60); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      drawPlayer(ctx, gs);

      // Float texts
      gs.floats.forEach((f) => {
        const sy = toScreen(gs.camY, f.y);
        ctx.globalAlpha = f.life;
        ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 6;
        ctx.font = "bold 16px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, sy);
        ctx.shadowBlur = 0;
      });
      ctx.globalAlpha = 1;

      if (gs.phase === "playing" || gs.phase === "dead") drawHUD(ctx, gs);
      if (gs.phase === "menu") drawMenu(ctx, gs);
      if (gs.phase === "dead") drawGameOver(ctx, gs);
    }

    function loop() { update(); render(); rafRef.current = requestAnimationFrame(loop); }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const shoot = useCallback(() => {
    const gs = gsRef.current;
    if (gs.phase !== "playing" || gs.shootCooldown > 0) return;
    const angle = gs.pface === 1 ? gs.aimAngle : Math.PI - gs.aimAngle;
    const spd = 14;
    gs.bullets.push({
      id: gs.bid++,
      x: gs.px + PLAYER_W / 2 + Math.cos(angle) * 26,
      y: gs.py + PLAYER_H / 2 + Math.sin(angle) * 26,
      vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
    });
    gs.shootCooldown = 10;
    addParticles(gs, gs.px + PLAYER_W / 2, gs.py + PLAYER_H / 2, "#ffcc20", 3);
  }, []);

  const handleMM = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    gsRef.current.mouse.x = (e.clientX - r.left) * (W / r.width);
    gsRef.current.mouse.y = (e.clientY - r.top) * (H / r.height);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const gs = gsRef.current;
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const my = (e.clientY - r.top) * (H / r.height);
    if (gs.phase === "menu") { if (mx > W / 2 - 90 && mx < W / 2 + 90 && my > 289 && my < 341) startGame(); return; }
    if (gs.phase === "dead") { if (mx > W / 2 - 85 && mx < W / 2 + 85 && my > 348 && my < 398) startGame(); return; }
    shoot();
  }, [startGame, shoot]);

  const handleTS = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const gs = gsRef.current;
    const r = canvasRef.current!.getBoundingClientRect();
    const t = e.touches[0];
    const mx = (t.clientX - r.left) * (W / r.width);
    const my = (t.clientY - r.top) * (H / r.height);
    gs.mouse.x = mx; gs.mouse.y = my;
    if (gs.phase === "menu") { if (mx > W / 2 - 90 && mx < W / 2 + 90 && my > 289 && my < 341) startGame(); return; }
    if (gs.phase === "dead") { if (mx > W / 2 - 85 && mx < W / 2 + 85 && my > 348 && my < 398) startGame(); return; }
    if (mx < W * 0.28) { gs.keys["ArrowLeft"] = true; gs.keys["ArrowRight"] = false; }
    else if (mx > W * 0.72) { gs.keys["ArrowRight"] = true; gs.keys["ArrowLeft"] = false; }
    else shoot();
  }, [startGame, shoot]);

  const handleTM = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const gs = gsRef.current; if (gs.phase !== "playing") return;
    const r = canvasRef.current!.getBoundingClientRect();
    const t = e.touches[0];
    const mx = (t.clientX - r.left) * (W / r.width);
    const my = (t.clientY - r.top) * (H / r.height);
    gs.mouse.x = mx; gs.mouse.y = my;
    if (mx < W * 0.28) { gs.keys["ArrowLeft"] = true; gs.keys["ArrowRight"] = false; }
    else if (mx > W * 0.72) { gs.keys["ArrowRight"] = true; gs.keys["ArrowLeft"] = false; }
    else { gs.keys["ArrowLeft"] = false; gs.keys["ArrowRight"] = false; }
  }, []);

  const handleTE = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    gsRef.current.keys["ArrowLeft"] = false; gsRef.current.keys["ArrowRight"] = false;
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at center, #0d1535 0%, #050810 100%)" }}>
      <div style={{ position: "relative", borderRadius: "16px", overflow: "hidden", boxShadow: "0 0 80px rgba(0,120,255,0.2), 0 0 0 2px rgba(0,180,255,0.25), 0 20px 60px rgba(0,0,0,0.8)" }}>
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{ display: "block", maxHeight: "94vh", width: "auto", cursor: "crosshair", touchAction: "none", userSelect: "none" }}
          onMouseMove={handleMM} onClick={handleClick}
          onTouchStart={handleTS} onTouchMove={handleTM} onTouchEnd={handleTE}
        />
      </div>
    </div>
  );
}
