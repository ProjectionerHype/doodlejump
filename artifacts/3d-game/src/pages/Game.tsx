import { useEffect, useRef, useCallback } from "react";

const W = 400;
const H = 600;
const GRAVITY = 0.4;
const BASE_JUMP = -14;
const SPRING_JUMP = -20;
const MOVE_SPEED = 7;

// ── ZONES ────────────────────────────────────────────────────────
const ZONES = [
  { name: "Notebook",     emoji: "📓", threshold: 0,    bgA: "#fefaf2", bgB: "#f0e8d8" },
  { name: "Cloud Kingdom",emoji: "☁️",  threshold: 1000, bgA: "#d0eeff", bgB: "#a8d8ff" },
  { name: "Outer Space",  emoji: "🚀", threshold: 2000, bgA: "#0a0820", bgB: "#1a0838" },
  { name: "Deep Ocean",   emoji: "🌊", threshold: 3000, bgA: "#003860", bgB: "#001830" },
];

function getZone(score: number) {
  let z = 0;
  for (let i = ZONES.length - 1; i >= 0; i--) if (score >= ZONES[i].threshold) { z = i; break; }
  return z;
}

// Per-zone platform normal colors [top, mid, bot, stroke, shine]
const ZONE_PLAT_COLORS = [
  ["#90e870", "#38c020", "#208010", "#186010", "rgba(255,255,255,0.4)"],  // notebook
  ["#fff8f0", "#f0d890", "#c8a840", "#8a6010", "rgba(255,255,255,0.6)"],  // clouds – golden
  ["#c060ff", "#8020e0", "#5000b0", "#3000a0", "rgba(200,140,255,0.5)"],  // space – purple
  ["#50e8d0", "#10b8a0", "#008870", "#005850", "rgba(180,255,240,0.45)"], // ocean – teal
];

type PType = "normal" | "moving" | "broken" | "spring" | "disappear";

interface Platform {
  id: number; x: number; y: number; w: number; h: number;
  type: PType; vx: number; cracked: boolean; crackedTimer: number;
  bounceTimer: number; used: boolean;
}
interface Monster {
  id: number; x: number; y: number; w: number; h: number;
  vx: number; type: "worm" | "ufo" | "bat"; alive: boolean;
  frame: number; hp: number;
}
interface Particle {
  id: number; x: number; y: number; vx: number; vy: number;
  life: number; color: string; r: number; trail?: boolean;
}
interface FloatingText {
  id: number; x: number; y: number; vy: number;
  text: string; life: number; color: string; big?: boolean;
}
interface PowerUp {
  id: number; x: number; y: number;
  type: "spring" | "jetpack" | "hat"; collected: boolean;
}
interface GS {
  phase: "menu" | "playing" | "dead";
  px: number; py: number; pvx: number; pvy: number;
  pface: number; animT: number;
  platforms: Platform[]; monsters: Monster[];
  particles: Particle[]; floats: FloatingText[]; powerups: PowerUp[];
  score: number; hi: number; camY: number; scrolled: number;
  keys: Record<string, boolean>;
  touchTargetX: number | null; tiltX: number;
  jetpack: number; hat: number;
  // combo system
  combo: number; comboTimer: number;
  // world zone
  zone: number;
  pid: number; mid: number; fid: number; puid: number; pcid: number;
  frameN: number;
}

const PW = 66; const PH = 14;
const PLAYER_W = 46; const PLAYER_H = 50;

function platGap(score: number) { return 55 + Math.min(score / 100, 70) + Math.random() * 20; }

function makePlat(id: number, _x: number, y: number, score: number): Platform {
  const r = Math.random(); const d = Math.min(score / 2000, 1);
  let type: PType = "normal";
  if (r < 0.06 * d) type = "spring";
  else if (r < 0.2 * d) type = "broken";
  else if (r < 0.38 * d) type = "moving";
  else if (r < 0.45 * d) type = "disappear";
  const w = type === "spring" ? 60 : PW;
  return { id, x: Math.max(0, Math.min(W - w, Math.random() * (W - w))), y, w, h: PH, type, vx: type === "moving" ? (Math.random() > 0.5 ? 1.8 : -1.8) : 0, cracked: false, crackedTimer: 0, bounceTimer: 0, used: false };
}

function makeMonster(id: number, camY: number, score: number): Monster {
  const zone = getZone(score);
  // zone 0+: worm; zone 1+: bat; zone 2+: ufo
  const available: Array<"worm"|"ufo"|"bat"> = zone >= 2 ? ["worm","ufo","bat"] : zone >= 1 ? ["worm","bat"] : ["worm"];
  const type = available[Math.floor(Math.random() * available.length)];
  return { id, x: Math.random() * (W - 52), y: camY - 80 - Math.random() * 200, w: type === "ufo" ? 52 : type === "bat" ? 44 : 48, h: type === "ufo" ? 30 : type === "bat" ? 26 : 28, vx: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.5), type, alive: true, frame: 0, hp: type === "ufo" ? 2 : 1 };
}

function init(hi: number): GS {
  const platforms: Platform[] = [];
  platforms.push({ id: 0, x: W / 2 - PW / 2, y: H - 100, w: PW + 10, h: PH, type: "normal", vx: 0, cracked: false, crackedTimer: 0, bounceTimer: 0, used: false });
  for (let i = 1; i < 18; i++) platforms.push(makePlat(i + 1, 0, H - 100 - i * 50, 0));
  return {
    phase: "menu", px: W / 2 - PLAYER_W / 2, py: H - 100 - PLAYER_H - 2,
    pvx: 0, pvy: 0, pface: 1, animT: 0,
    platforms, monsters: [], particles: [], floats: [], powerups: [],
    score: 0, hi, camY: 0, scrolled: 0,
    keys: {}, touchTargetX: null, tiltX: 0,
    jetpack: 0, hat: 0,
    combo: 0, comboTimer: 0,
    zone: 0,
    pid: 20, mid: 0, fid: 0, puid: 0, pcid: 0, frameN: 0,
  };
}

function addParticles(gs: GS, x: number, y: number, color: string, n = 8) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.8;
    const spd = 1.5 + Math.random() * 3;
    gs.particles.push({ id: gs.pcid++, x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 1.5, life: 1, color, r: 3 + Math.random() * 4 });
  }
}
function addFloat(gs: GS, x: number, y: number, text: string, color: string, big = false) {
  gs.floats.push({ id: gs.fid++, x, y, vy: big ? -2.2 : -1.5, text, life: 1, color, big });
}
function addTrail(gs: GS, x: number, y: number, color: string, speed: number) {
  const n = Math.random() < 0.6 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    gs.particles.push({ id: gs.pcid++, x: x + (Math.random() - 0.5) * 2.5, y: y + (Math.random() - 0.5) * 2.5, vx: -speed * 0.18 + (Math.random() - 0.5) * 1.2, vy: -0.4 + (Math.random() - 0.5) * 0.8, life: 0.55 + Math.random() * 0.35, color, r: 2.5 + Math.random() * 2.5, trail: true });
  }
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS>(init(0));
  const rafRef = useRef(0);
  const hiRef = useRef(parseInt(localStorage.getItem("djhi") || "0", 10));

  const startGame = useCallback(() => {
    const gs = init(hiRef.current); gs.phase = "playing"; gsRef.current = gs;
  }, []);

  useEffect(() => {
    gsRef.current = init(hiRef.current);
    const onKey = (e: KeyboardEvent) => {
      gsRef.current.keys[e.code] = e.type === "keydown";
      if (e.type === "keydown" && (e.code === "Space" || e.code === "Enter") && gsRef.current.phase !== "playing") startGame();
    };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [startGame]);

  useEffect(() => {
    const onTilt = (e: DeviceOrientationEvent) => { if (e.gamma !== null) gsRef.current.tiltX = Math.max(-1, Math.min(1, e.gamma / 25)); };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    function toScreen(worldY: number) { return worldY - gsRef.current.camY; }

    // ── BACKGROUNDS ─────────────────────────────────────────────
    // Shared decorative elements per zone (clouds, stars, bubbles)
    const decorItems: { x: number; y: number; r: number; spd: number; phase: number }[] = [];
    for (let i = 0; i < 30; i++) decorItems.push({ x: Math.random() * W, y: Math.random() * H, r: 10 + Math.random() * 30, spd: 0.2 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });

    function drawBgNotebook(gs: GS) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "#fefaf2"); g.addColorStop(0.6, "#faf5e8"); g.addColorStop(1, "#f0e8d8");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const gridSize = 28; const offsetY = (gs.scrolled * 0.3) % gridSize;
      ctx.lineCap = "round";
      for (let i = 0; i < Math.ceil(H / gridSize) + 2; i++) {
        const y = -gridSize + offsetY + i * gridSize; const isMajor = i % 4 === 0;
        ctx.strokeStyle = isMajor ? "rgba(150,190,230,0.55)" : "rgba(170,205,240,0.38)"; ctx.lineWidth = isMajor ? 1.1 : 0.8;
        const wobble = Math.sin(i * 3.7 + gs.scrolled * 0.001) * 0.6;
        ctx.beginPath(); ctx.moveTo(0, y + wobble); ctx.bezierCurveTo(W * 0.25, y + Math.sin(i + 1.2) * 0.8 + wobble, W * 0.75, y + Math.sin(i + 2.4) * 0.8 + wobble, W, y + wobble * 0.5); ctx.stroke();
      }
      ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(170,205,240,0.22)";
      for (let x = gridSize; x < W; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    }

    function drawBgClouds(gs: GS) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#a8d8ff"); g.addColorStop(0.5, "#c8eaff"); g.addColorStop(1, "#e8f6ff");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Drifting clouds
      decorItems.forEach((d, i) => {
        const cx = (d.x + gs.scrolled * d.spd * 0.1) % (W + 80) - 40;
        const cy = d.y;
        ctx.globalAlpha = 0.55 + Math.sin(d.phase + gs.frameN * 0.008) * 0.15;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.ellipse(cx, cy, d.r * 1.8, d.r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx - d.r * 0.7, cy + d.r * 0.2, d.r * 1.1, d.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + d.r * 0.8, cy + d.r * 0.1, d.r * 1.0, d.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        if (i < 3) { // Sunbeams
          ctx.globalAlpha = 0.06; ctx.fillStyle = "#ffe080";
          ctx.beginPath(); ctx.moveTo(W * 0.8, -20);
          const spreadAngle = (i - 1) * 0.25;
          ctx.lineTo(W * 0.8 + Math.cos(1.4 + spreadAngle) * 700, Math.sin(1.4 + spreadAngle) * 700);
          ctx.lineTo(W * 0.8 + Math.cos(1.5 + spreadAngle) * 700, Math.sin(1.5 + spreadAngle) * 700);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    }

    function drawBgSpace(gs: GS) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#080418"); g.addColorStop(0.5, "#0e0828"); g.addColorStop(1, "#180840");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Stars
      decorItems.forEach((d, i) => {
        const blink = 0.6 + Math.sin(d.phase + gs.frameN * 0.04 + i) * 0.4;
        ctx.globalAlpha = blink;
        const starSize = d.r * 0.18;
        const sx = d.x; const sy = (d.y + gs.scrolled * 0.05) % H;
        ctx.fillStyle = i % 5 === 0 ? "#ffeecc" : i % 5 === 1 ? "#ccddff" : "#ffffff";
        ctx.beginPath(); ctx.arc(sx, sy, starSize, 0, Math.PI * 2); ctx.fill();
        if (i % 8 === 0) { // Cross sparkle for big stars
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.5; ctx.globalAlpha = blink * 0.5;
          ctx.beginPath(); ctx.moveTo(sx - starSize * 3, sy); ctx.lineTo(sx + starSize * 3, sy); ctx.moveTo(sx, sy - starSize * 3); ctx.lineTo(sx, sy + starSize * 3); ctx.stroke();
        }
      });
      // Nebula glow
      ctx.globalAlpha = 0.07 + Math.sin(gs.frameN * 0.005) * 0.03;
      const nb = ctx.createRadialGradient(W * 0.3, H * 0.4, 0, W * 0.3, H * 0.4, 200);
      nb.addColorStop(0, "#8040ff"); nb.addColorStop(1, "transparent");
      ctx.fillStyle = nb; ctx.fillRect(0, 0, W, H);
      const nb2 = ctx.createRadialGradient(W * 0.7, H * 0.7, 0, W * 0.7, H * 0.7, 160);
      nb2.addColorStop(0, "#ff4080"); nb2.addColorStop(1, "transparent");
      ctx.fillStyle = nb2; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    function drawBgOcean(gs: GS) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#001428"); g.addColorStop(0.5, "#002840"); g.addColorStop(1, "#003858");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Caustic light patterns
      ctx.globalAlpha = 0.06;
      for (let i = 0; i < 8; i++) {
        const cx = (i * 55 + gs.frameN * 0.3 + Math.sin(i) * 30) % W;
        const cy = (i * 80 + gs.scrolled * 0.2) % H;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 + Math.sin(gs.frameN * 0.02 + i) * 20);
        cg.addColorStop(0, "#80ffee"); cg.addColorStop(1, "transparent");
        ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
      }
      // Bubbles
      decorItems.forEach((d, i) => {
        if (i >= 15) return;
        const by = ((d.y - gs.scrolled * d.spd * 0.2 + gs.frameN * d.spd) % (H + 40));
        const bx = d.x + Math.sin(d.phase + gs.frameN * 0.02) * 12;
        ctx.globalAlpha = 0.18 + Math.sin(d.phase + gs.frameN * 0.03) * 0.08;
        ctx.strokeStyle = "#80ddff"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(bx, by, d.r * 0.35, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "rgba(180,240,255,0.15)"; ctx.fill();
      });
      // Seaweed sway
      ctx.globalAlpha = 0.25; ctx.strokeStyle = "#20c060"; ctx.lineWidth = 3; ctx.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const wx = 30 + i * 80; const sway = Math.sin(gs.frameN * 0.03 + i) * 15;
        ctx.beginPath(); ctx.moveTo(wx, H); ctx.quadraticCurveTo(wx + sway, H - 30, wx + sway * 0.5, H - 60); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawBg() {
      const gs = gsRef.current;
      const z = gs.zone;
      if (z === 0) drawBgNotebook(gs);
      else if (z === 1) drawBgClouds(gs);
      else if (z === 2) drawBgSpace(gs);
      else drawBgOcean(gs);
    }

    // ── PLATFORM ────────────────────────────────────────────────
    function drawPlatform(p: Platform) {
      const gs = gsRef.current;
      const sy = toScreen(p.y);
      if (sy > H + 30 || sy < -50) return;
      const bounce = p.bounceTimer > 0 ? Math.sin(p.bounceTimer * 0.6) * 5 : 0;
      const zc = ZONE_PLAT_COLORS[gs.zone];
      ctx.save(); ctx.translate(p.x + p.w / 2, sy + p.h / 2 - bounce * 0.5);
      if (p.type === "spring") {
        const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        g.addColorStop(0, "#ff8faa"); g.addColorStop(0.5, "#e8305a"); g.addColorStop(1, "#c01840");
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill();
        ctx.strokeStyle = "#801030"; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "#ffd0e0"; ctx.lineWidth = 3; ctx.lineCap = "round";
        for (let i = 0; i < 3; i++) { const cy = -p.h / 2 - 6 - i * 7; ctx.beginPath(); ctx.moveTo(-8, cy); ctx.quadraticCurveTo(0, cy - 6, 8, cy); ctx.stroke(); }
        ctx.strokeStyle = "#e8305a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -p.h / 2 - 18 - bounce * 2); ctx.lineTo(-6, -p.h / 2); ctx.moveTo(6, -p.h / 2 - 18 - bounce * 2); ctx.lineTo(6, -p.h / 2); ctx.stroke();
      } else if (p.type === "broken" || p.cracked) {
        ctx.fillStyle = p.cracked ? "#a06830" : "#c87840"; ctx.strokeStyle = "#7a4818"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 5); ctx.fill(); ctx.stroke();
        if (p.cracked) { ctx.globalAlpha = 1 - p.crackedTimer / 30; ctx.strokeStyle = "#7a4818"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-p.w / 4, -p.h / 2); ctx.lineTo(-p.w / 6, p.h / 2); ctx.moveTo(p.w / 5, -p.h / 2 + 2); ctx.lineTo(p.w / 3, p.h / 2); ctx.moveTo(0, -p.h / 2); ctx.lineTo(-p.w / 8, p.h / 2); ctx.stroke(); }
        else { ctx.strokeStyle = "#7a4818"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -p.h / 2 + 3); ctx.lineTo(-5, p.h / 2 - 2); ctx.moveTo(10, -p.h / 2 + 2); ctx.lineTo(6, p.h / 2 - 3); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else if (p.type === "moving") {
        const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        g.addColorStop(0, "#80c8ff"); g.addColorStop(0.5, "#2090e8"); g.addColorStop(1, "#0060b8");
        ctx.fillStyle = g; ctx.strokeStyle = "#004090"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 3, p.w - 10, 4);
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.vx > 0 ? "▶▶" : "◀◀", 0, 3);
      } else if (p.type === "disappear") {
        ctx.globalAlpha = p.used ? 0.3 : 1; ctx.fillStyle = "#e8f8ff"; ctx.strokeStyle = "#90c8e8"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath(); ctx.ellipse(-p.w / 4, -p.h / 2 - 5, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(p.w / 4, -p.h / 2 - 5, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // Normal platform — zone-colored
        const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        g.addColorStop(0, zc[0]); g.addColorStop(0.5, zc[1]); g.addColorStop(1, zc[2]);
        ctx.fillStyle = g; ctx.strokeStyle = zc[3]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = zc[4]; ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 3, p.w - 10, 4);
      }
      ctx.restore();
    }

    // ── FROG ────────────────────────────────────────────────────
    function drawDoodler(gs: GS) {
      const sx = gs.px; const sy = toScreen(gs.py);
      const f = gs.pface; const t = gs.animT;
      const falling = gs.pvy > 2; const rising = gs.pvy < -3;
      ctx.save(); ctx.translate(sx + PLAYER_W / 2, sy + PLAYER_H / 2 - 4); ctx.scale(f, 1);
      const sqX = rising ? 0.84 : falling ? 1.12 : 1; const sqY = rising ? 1.16 : falling ? 0.88 : 1;
      ctx.scale(sqX * 0.68, sqY * 0.68);
      if (gs.jetpack > 0) {
        ctx.fillStyle = "#cc3010"; ctx.strokeStyle = "#881000"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-28, -10, 10, 22, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ff5020"; ctx.beginPath(); ctx.moveTo(-27, 12); ctx.lineTo(-22, 12 + 10 + Math.sin(t * 0.5) * 5); ctx.lineTo(-17, 12); ctx.closePath(); ctx.fill();
      }
      const footKick = rising ? -6 : falling ? 4 : Math.sin(t * 0.2) * 3;
      ctx.strokeStyle = "#186004"; ctx.lineWidth = 1.5; ctx.fillStyle = "#50cc20";
      ctx.beginPath(); ctx.ellipse(-10, 18 + footKick, 9, 5, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(10, 18 + footKick, 9, 5, 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const bodyG = ctx.createRadialGradient(-5, -6, 3, 0, 0, 22);
      bodyG.addColorStop(0, "#88f044"); bodyG.addColorStop(0.5, "#4acc18"); bodyG.addColorStop(0.85, "#2e9a08"); bodyG.addColorStop(1, "#1a6004");
      ctx.fillStyle = bodyG; ctx.strokeStyle = "#186004"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 2, 21, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(200,255,140,0.22)"; ctx.beginPath(); ctx.ellipse(-5, -7, 9, 6, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(200,255,160,0.45)"; ctx.beginPath(); ctx.ellipse(1, 7, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a5800";
      ctx.beginPath(); ctx.ellipse(-4, -4, 2, 1.5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, -4, 2, 1.5, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#0a4000"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-12, 5); ctx.quadraticCurveTo(0, 15, 12, 5); ctx.stroke();
      ctx.fillStyle = "#bb1a3a"; ctx.beginPath(); ctx.moveTo(-9, 6); ctx.quadraticCurveTo(0, 14, 9, 6); ctx.quadraticCurveTo(0, 10, -9, 6); ctx.fill();
      const wag = Math.sin(t * 0.22) * 2.5;
      ctx.fillStyle = "#ff3d88"; ctx.strokeStyle = "#cc1060"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-3, 11); ctx.quadraticCurveTo(wag * 0.4, 14, 1, 20 + wag); ctx.quadraticCurveTo(4 + wag, 24 + wag, 0, 24 + wag); ctx.quadraticCurveTo(-4 + wag, 24 + wag, -1, 20 + wag); ctx.quadraticCurveTo(wag * 0.3, 14, 3, 11); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ff70bb"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 21 + wag); ctx.lineTo(0, 24 + wag); ctx.stroke();
      [[-9, "#88f044"], [9, "#88f044"]].forEach(([ex, c]) => {
        const eGrad = ctx.createRadialGradient(ex as number, -19, 1, ex as number, -19, 11);
        eGrad.addColorStop(0, c as string); eGrad.addColorStop(0.7, "#4acc18"); eGrad.addColorStop(1, "#2a8808");
        ctx.fillStyle = eGrad; ctx.strokeStyle = "#186004"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex as number, -19, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-9, -19, 8, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(9, -19, 8, 0, Math.PI * 2); ctx.fill();
      const pDx = Math.max(-3, Math.min(3, gs.pvx * 0.2)); const pDy = rising ? -1.5 : falling ? 1.5 : 0;
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(-9 + pDx, -19 + pDy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9 + pDx * 0.5, -19 + pDy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-9 + pDx + 1.5, -19 + pDy - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9 + pDx * 0.5 + 1.5, -19 + pDy - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.fillStyle = "#ff7799";
      ctx.beginPath(); ctx.ellipse(-16, 1, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16, 1, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (gs.hat > 0) {
        const spin = t * 0.22;
        ctx.fillStyle = "#2222cc"; ctx.strokeStyle = "#111188"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, -31, 12, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#3333ee"; ctx.beginPath(); ctx.roundRect(-8, -46, 16, 15, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#6677ff"; ctx.fillRect(-8, -44, 16, 4);
        ctx.save(); ctx.translate(0, -48); ctx.rotate(spin);
        ["#ff4040", "#44cc44", "#4444ff", "#ff44cc"].forEach((c, i) => { ctx.fillStyle = c; ctx.save(); ctx.rotate((i * Math.PI) / 2); ctx.beginPath(); ctx.ellipse(9, 0, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
        ctx.fillStyle = "#ccc"; ctx.strokeStyle = "#888"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }

    // ── MONSTER ─────────────────────────────────────────────────
    function drawMonster(m: Monster) {
      const sy = toScreen(m.y);
      if (sy > H + 40 || sy < -50) return;
      ctx.save(); ctx.translate(m.x + m.w / 2, sy + m.h / 2);
      if (m.type === "worm") {
        ctx.scale(m.vx > 0 ? 1 : -1, 1);
        const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 22);
        g.addColorStop(0, "#ff8888"); g.addColorStop(0.5, "#dd2020"); g.addColorStop(1, "#880808");
        ctx.fillStyle = g; ctx.strokeStyle = "#660000"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(12, -5, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.ellipse(13, -5, 3, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(14, -6, 1, 1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#cc0000";
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -14); ctx.lineTo(i * 7 - 3, -22); ctx.lineTo(i * 7 + 3, -22); ctx.closePath(); ctx.fill(); }
      } else if (m.type === "ufo") {
        const bob = Math.sin(m.frame * 0.04) * 4;
        ctx.save(); ctx.translate(0, bob);
        const g2 = ctx.createLinearGradient(0, -15, 0, 15);
        g2.addColorStop(0, "#aaddff"); g2.addColorStop(0.5, "#4499ee"); g2.addColorStop(1, "#1155aa");
        ctx.fillStyle = g2; ctx.strokeStyle = "#0033aa"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const dg = ctx.createRadialGradient(0, -6, 1, 0, -6, 14);
        dg.addColorStop(0, "#ddeeff"); dg.addColorStop(1, "#7799cc");
        ctx.fillStyle = dg; ctx.strokeStyle = "#4477bb"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, -8, 14, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let i = -2; i <= 2; i++) {
          ctx.fillStyle = i % 2 === 0 ? "#ffff00" : "#ff8800";
          ctx.beginPath(); ctx.arc(i * 9, 8 + Math.sin(m.frame * 0.1 + i) * 2, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } else {
        const flap = Math.sin(m.frame * 0.2) * 0.4;
        ctx.scale(m.vx > 0 ? 1 : -1, 1);
        ctx.fillStyle = "#442266"; ctx.strokeStyle = "#221133"; ctx.lineWidth = 1.5;
        ctx.save(); ctx.rotate(-flap);
        ctx.beginPath(); ctx.moveTo(-22, 0); ctx.quadraticCurveTo(-15, -12, 0, -4); ctx.quadraticCurveTo(15, -12, 22, 0); ctx.quadraticCurveTo(12, 10, 0, 6); ctx.quadraticCurveTo(-12, 10, -22, 0); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#883399"; ctx.beginPath(); ctx.ellipse(0, -2, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffdd00"; ctx.beginPath(); ctx.arc(-4, -4, 3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(4, -4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-4, -4, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(4, -4, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ── HUD ─────────────────────────────────────────────────────
    function drawHUD(gs: GS) {
      ctx.save();
      // Score panel
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath(); ctx.roundRect(8, 8, 120, 38, 10); ctx.fill();
      ctx.fillStyle = "#2a7010"; ctx.font = "bold 13px 'Comic Sans MS', cursive"; ctx.textAlign = "left";
      ctx.fillText(`Score: ${gs.score}`, 16, 24);
      ctx.fillStyle = "#a05010"; ctx.fillText(`Best: ${gs.hi}`, 16, 40);

      // Combo indicator
      if (gs.combo >= 2) {
        const pulse = 1 + Math.sin(gs.frameN * 0.25) * 0.08;
        const comboColors = ["", "", "#ff9020", "#ff5010", "#dd2090", "#aa00ff"];
        const col = comboColors[Math.min(gs.combo, comboColors.length - 1)] || "#aa00ff";
        ctx.save();
        ctx.translate(W / 2, 50); ctx.scale(pulse, pulse);
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.roundRect(-52, -16, 104, 28, 12); ctx.fill();
        ctx.fillStyle = col; ctx.font = `bold 18px 'Comic Sans MS', cursive`; ctx.textAlign = "center";
        ctx.fillText(`🔥 x${gs.combo} COMBO!`, 0, 6);
        ctx.restore();
      }

      // Power-up timers
      if (gs.jetpack > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.beginPath(); ctx.roundRect(W - 110, 8, 102, 24, 8); ctx.fill();
        ctx.fillStyle = "#cc3010"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "right";
        ctx.fillText(`🚀 ${Math.ceil(gs.jetpack / 60)}s`, W - 12, 25);
      }
      if (gs.hat > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.beginPath(); ctx.roundRect(W - 110, gs.jetpack > 0 ? 36 : 8, 102, 24, 8); ctx.fill();
        ctx.fillStyle = "#2222cc"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "right";
        ctx.fillText(`🎩 ${Math.ceil(gs.hat / 60)}s`, W - 12, gs.jetpack > 0 ? 53 : 25);
      }
      ctx.restore();
    }

    function drawMenu(gs: GS) {
      ctx.save();
      ctx.fillStyle = "rgba(255,252,240,0.88)"; ctx.beginPath(); ctx.roundRect(W / 2 - 150, 90, 300, 250, 20); ctx.fill();
      ctx.strokeStyle = "#38c020"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(W / 2 - 150, 90, 300, 250, 20); ctx.stroke();
      ctx.fillStyle = "#2a7010"; ctx.font = "bold 36px 'Comic Sans MS', cursive"; ctx.textAlign = "center";
      ctx.fillText("Doodle Jump", W / 2, 145);
      ctx.fillStyle = "#555"; ctx.font = "13px 'Comic Sans MS', cursive";
      ctx.fillText("Drag finger left/right to move", W / 2, 175);
      ctx.fillText("Stomp monsters from above!", W / 2, 195);
      ctx.fillText("Chain stomps for COMBO bonus!", W / 2, 215);
      ctx.fillText("4 worlds to explore!", W / 2, 235);
      const grad = ctx.createLinearGradient(W / 2 - 85, 0, W / 2 + 85, 0);
      grad.addColorStop(0, "#56d830"); grad.addColorStop(1, "#28a010");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(W / 2 - 85, 248, 170, 48, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 22px 'Comic Sans MS', cursive"; ctx.fillText("▶  PLAY", W / 2, 280);
      if (gs.hi > 0) { ctx.fillStyle = "#a05010"; ctx.font = "bold 14px 'Comic Sans MS', cursive"; ctx.fillText(`Best: ${gs.hi}`, W / 2, 322); }
      ctx.restore();
    }

    function drawGameOver(gs: GS) {
      ctx.save();
      ctx.fillStyle = "rgba(255,245,230,0.92)"; ctx.beginPath(); ctx.roundRect(W / 2 - 140, 180, 280, 220, 18); ctx.fill();
      ctx.strokeStyle = "#e05020"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(W / 2 - 140, 180, 280, 220, 18); ctx.stroke();
      ctx.fillStyle = "#c03010"; ctx.font = "bold 34px 'Comic Sans MS', cursive"; ctx.textAlign = "center";
      ctx.fillText("Game Over!", W / 2, 228);
      ctx.fillStyle = "#444"; ctx.font = "18px 'Comic Sans MS', cursive"; ctx.fillText(`Score: ${gs.score}`, W / 2, 262);
      if (gs.score >= gs.hi && gs.score > 0) {
        ctx.fillStyle = "#d07000"; ctx.font = "bold 15px 'Comic Sans MS', cursive"; ctx.fillText("🏆 New Best!", W / 2, 285);
      } else {
        ctx.fillStyle = "#888"; ctx.font = "14px 'Comic Sans MS', cursive"; ctx.fillText(`Best: ${gs.hi}`, W / 2, 285);
      }
      const grad = ctx.createLinearGradient(W / 2 - 80, 0, W / 2 + 80, 0);
      grad.addColorStop(0, "#56d830"); grad.addColorStop(1, "#28a010");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(W / 2 - 80, 305, 160, 48, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Comic Sans MS', cursive"; ctx.fillText("▶  PLAY AGAIN", W / 2, 337);
      ctx.restore();
    }

    // ── RENDER ──────────────────────────────────────────────────
    function render() {
      const gs = gsRef.current;
      ctx.clearRect(0, 0, W, H);
      drawBg();
      if (gs.phase === "menu") { gs.platforms.forEach(drawPlatform); drawDoodler(gs); drawMenu(gs); return; }
      gs.platforms.forEach(drawPlatform);
      gs.powerups.forEach((pu) => {
        if (pu.collected) return;
        const sy = toScreen(pu.y);
        ctx.save(); ctx.translate(pu.x + 15, sy + 15); ctx.rotate(Math.sin(gs.frameN * 0.05) * 0.2);
        if (pu.type === "jetpack") {
          ctx.fillStyle = "#e04020"; ctx.fillRect(-10, -15, 20, 30); ctx.fillStyle = "#ff8040"; ctx.fillRect(-6, -18, 12, 8);
          ctx.fillStyle = "#ffcc00"; const fh = 8 + Math.sin(gs.frameN * 0.3) * 4;
          ctx.beginPath(); ctx.moveTo(-8, 15); ctx.lineTo(0, 15 + fh); ctx.lineTo(8, 15); ctx.fill();
        } else {
          ctx.fillStyle = "#4040dd"; ctx.beginPath(); ctx.ellipse(0, 5, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(-10, -10, 20, 15); ctx.fillStyle = "#8888ff"; ctx.fillRect(-10, -8, 20, 4);
        }
        ctx.restore();
      });
      // Trail particles (additive glow)
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      gs.particles.forEach((p) => {
        if (!p.trail) return;
        const sy = toScreen(p.y); const radius = p.r * p.life; if (radius < 0.3) return;
        const grd = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, radius * 2.2);
        grd.addColorStop(0, p.color); grd.addColorStop(0.55, p.color); grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = p.life * 0.85; ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, sy, radius * 2.2, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
      // Regular particles
      gs.particles.forEach((p) => {
        if (p.trail) return;
        const sy = toScreen(p.y); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, sy, p.r * p.life, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      gs.monsters.forEach(drawMonster);
      drawDoodler(gs);
      // Floating texts
      gs.floats.forEach((f) => {
        const sy = toScreen(f.y);
        ctx.globalAlpha = f.life; ctx.fillStyle = f.color;
        if (f.big) {
          ctx.save();
          const scale = 1 + (1 - f.life) * 0.4;
          ctx.translate(f.x, sy); ctx.scale(scale, scale);
          ctx.font = "bold 22px 'Comic Sans MS', cursive"; ctx.textAlign = "center";
          ctx.fillText(f.text, 0, 0);
          ctx.restore();
        } else {
          ctx.font = "bold 16px 'Comic Sans MS', cursive"; ctx.textAlign = "center";
          ctx.fillText(f.text, f.x, sy);
        }
      });
      ctx.globalAlpha = 1;
      drawHUD(gs);
      if (gs.phase === "dead") drawGameOver(gs);
    }

    // ── UPDATE ──────────────────────────────────────────────────
    function update() {
      const gs = gsRef.current;
      gs.frameN++; gs.animT++;
      if (gs.phase !== "playing") return;

      // ── Movement ──
      const keyLeft = gs.keys["ArrowLeft"] || gs.keys["KeyA"];
      const keyRight = gs.keys["ArrowRight"] || gs.keys["KeyD"];
      if (keyLeft) { gs.pvx = Math.max(gs.pvx - 1.2, -MOVE_SPEED * 1.5); gs.pface = -1; }
      else if (keyRight) { gs.pvx = Math.min(gs.pvx + 1.2, MOVE_SPEED * 1.5); gs.pface = 1; }
      else if (Math.abs(gs.tiltX) > 0.12) {
        const tiltForce = gs.tiltX * 2.2;
        gs.pvx = Math.max(-MOVE_SPEED * 1.5, Math.min(MOVE_SPEED * 1.5, gs.pvx + tiltForce));
        if (gs.tiltX < 0) gs.pface = -1; if (gs.tiltX > 0) gs.pface = 1;
      } else if (gs.touchTargetX !== null) {
        const frogCenterX = gs.px + PLAYER_W / 2;
        const delta = gs.touchTargetX - frogCenterX;
        const desired = Math.max(-MOVE_SPEED * 1.5, Math.min(MOVE_SPEED * 1.5, delta * 0.22));
        gs.pvx += (desired - gs.pvx) * 0.28;
        if (delta < -2) gs.pface = -1; else if (delta > 2) gs.pface = 1;
      } else { gs.pvx *= 0.82; }

      gs.px += gs.pvx;
      if (gs.px > W) gs.px = -PLAYER_W;
      if (gs.px + PLAYER_W < 0) gs.px = W;

      // ── Physics ──
      if (gs.jetpack > 0) { gs.jetpack--; gs.pvy = Math.max(gs.pvy - 0.6, -11); addParticles(gs, gs.px + PLAYER_W / 2, gs.py + PLAYER_H, "#ff8040", 1); }
      else if (gs.hat > 0) { gs.hat--; gs.pvy = Math.max(gs.pvy - 0.3, -7); }
      else { gs.pvy += GRAVITY; }
      gs.py += gs.pvy;

      // ── Camera ──
      const screenPY = gs.py - gs.camY;
      if (screenPY < H / 2.5) {
        const d = H / 2.5 - screenPY; gs.camY -= d; gs.scrolled += d;
        gs.score = Math.max(gs.score, Math.floor(gs.scrolled / 4));
      }

      // ── Zone check ──
      const newZone = Math.min(getZone(gs.score), ZONES.length - 1);
      if (newZone !== gs.zone) {
        gs.zone = newZone;
      }

      // ── Combo timer ──
      if (gs.comboTimer > 0) { gs.comboTimer--; if (gs.comboTimer === 0) gs.combo = 0; }

      // ── Speed trail ──
      const absVx = Math.abs(gs.pvx); const absVy = Math.abs(gs.pvy);
      const fastEnough = absVx > 2.8 || (gs.jetpack > 0 && absVy > 3) || (gs.hat > 0 && gs.pvy < -2);
      if (fastEnough) {
        const trailX = gs.px + PLAYER_W / 2 + (gs.pvx > 0 ? -10 : 10);
        const trailY = gs.py + PLAYER_H * 0.55;
        let col: string;
        if (gs.jetpack > 0) col = Math.random() < 0.5 ? "#ff9030" : "#ffee60";
        else if (gs.hat > 0) col = Math.random() < 0.5 ? "#60ccff" : "#ffffff";
        else if (absVx > 5.5) col = Math.random() < 0.5 ? "#c0ff40" : "#ffffff";
        else col = Math.random() < 0.5 ? "#80ee20" : "#ccff88";
        addTrail(gs, trailX, trailY, col, gs.pvx);
      }

      // ── Platform collisions ──
      if (gs.pvy > 0) {
        for (const p of gs.platforms) {
          const prevPy = gs.py - gs.pvy;
          const overlapsX = gs.px + 8 < p.x + p.w - 8 && gs.px + PLAYER_W - 8 > p.x + 8;
          const landedOn = prevPy + PLAYER_H <= p.y + 4 && gs.py + PLAYER_H >= p.y && gs.py + PLAYER_H <= p.y + p.h + 12;
          if (overlapsX && landedOn) {
            if (p.type === "broken") { if (!p.cracked) { p.cracked = true; p.crackedTimer = 0; } else continue; }
            if (p.type === "disappear") p.used = true;
            // Reset combo on landing
            if (gs.combo > 0) { gs.combo = 0; gs.comboTimer = 0; }
            if (p.type === "spring") {
              gs.pvy = SPRING_JUMP; p.bounceTimer = 12;
              addParticles(gs, p.x + p.w / 2, p.y, "#ff6090", 8);
              addFloat(gs, p.x + p.w / 2, p.y - 20, "BOING!", "#e8305a");
            } else {
              gs.pvy = BASE_JUMP; p.bounceTimer = 8;
              if (p.type !== "disappear") addParticles(gs, p.x + p.w / 2, p.y, ZONE_PLAT_COLORS[gs.zone][1], 4);
            }
            gs.py = p.y - PLAYER_H; break;
          }
        }
      }

      // ── Platform update ──
      gs.platforms.forEach((p) => {
        if (p.bounceTimer > 0) p.bounceTimer--;
        if (p.type === "moving") { p.x += p.vx; if (p.x <= 0 || p.x + p.w >= W) p.vx *= -1; }
        if (p.cracked) p.crackedTimer++;
      });
      gs.platforms = gs.platforms.filter((p) => {
        if (p.cracked && p.crackedTimer > 28) return false;
        if (p.used && p.type === "disappear") return false;
        return toScreen(p.y) < H + 30;
      });
      while (gs.platforms.length < 22) {
        const highest = gs.platforms.length ? Math.min(...gs.platforms.map((p) => p.y)) : gs.camY;
        if (highest < gs.camY - 80) break;
        gs.platforms.push(makePlat(gs.pid++, 0, highest - platGap(gs.score), gs.score));
      }

      // ── Powerups ──
      gs.powerups.forEach((pu) => {
        if (pu.collected) return;
        const dx = gs.px + PLAYER_W / 2 - (pu.x + 15); const dy = (gs.py + PLAYER_H / 2) - (pu.y + 15);
        if (Math.abs(dx) < 28 && Math.abs(dy) < 28) {
          pu.collected = true;
          if (pu.type === "jetpack") { gs.jetpack = 180; addFloat(gs, gs.px + PLAYER_W / 2, gs.py, "JETPACK!", "#e04020"); }
          else { gs.hat = 300; addFloat(gs, gs.px + PLAYER_W / 2, gs.py, "PROPELLER!", "#4040dd"); }
          addParticles(gs, pu.x + 15, pu.y + 15, "#ffcc00", 12);
        }
      });
      gs.powerups = gs.powerups.filter((pu) => !pu.collected && toScreen(pu.y) < H + 30);
      if (gs.score > 200 && Math.random() < 0.0008) {
        gs.powerups.push({ id: gs.puid++, x: Math.random() * (W - 40), y: gs.camY - 100 - Math.random() * 150, type: Math.random() < 0.5 ? "jetpack" : "hat", collected: false });
      }

      // ── Monsters ──
      if (gs.score > 300 && gs.monsters.filter((m) => m.alive).length < Math.min(Math.floor(gs.score / 800) + 1, 4) && Math.random() < 0.004) {
        gs.monsters.push(makeMonster(gs.mid++, gs.camY, gs.score));
      }
      gs.monsters.forEach((m) => {
        if (!m.alive) return;
        m.x += m.vx; m.frame++;
        if (m.x <= 0 || m.x + m.w >= W) m.vx *= -1;
        if (m.type === "ufo") m.y += Math.sin(m.frame * 0.04) * 0.8;
        if (m.type === "bat") m.y += Math.sin(m.frame * 0.06) * 1.2 - 0.1;
        const mRight = m.x + m.w; const mBottom = m.y + m.h;
        const pRight = gs.px + PLAYER_W; const pBottom = gs.py + PLAYER_H;
        const overlap = gs.px + 10 < mRight - 10 && pRight - 10 > m.x + 10 && gs.py + 8 < mBottom - 8 && pBottom - 8 > m.y + 8;
        if (overlap) {
          if (gs.pvy > 0 && gs.py + PLAYER_H < m.y + m.h * 0.55) {
            // Stomp!
            m.hp--;
            if (m.hp <= 0) {
              m.alive = false;
              // Combo calculation
              gs.combo++;
              gs.comboTimer = 180; // 3 seconds window for next stomp
              const baseBonus = m.type === "ufo" ? 200 : m.type === "bat" ? 150 : 100;
              const comboMult = gs.combo;
              const totalBonus = baseBonus * comboMult;
              gs.score += totalBonus;
              addParticles(gs, m.x + m.w / 2, m.y + m.h / 2, "#ff6030", 16);
              // Combo text
              if (gs.combo >= 2) {
                addFloat(gs, m.x + m.w / 2, m.y - 10, `x${comboMult} COMBO!  +${totalBonus}`, gs.combo >= 4 ? "#dd00ff" : gs.combo >= 3 ? "#ff4400" : "#ff9000", true);
              } else {
                addFloat(gs, m.x + m.w / 2, m.y - 10, `+${totalBonus}`, "#ff4020");
              }
              // Bigger particle burst for higher combos
              if (gs.combo >= 3) addParticles(gs, m.x + m.w / 2, m.y + m.h / 2, gs.combo >= 4 ? "#dd00ff" : "#ff6000", 12);
            }
            gs.pvy = BASE_JUMP;
          } else {
            die(gs);
          }
        }
      });
      gs.monsters = gs.monsters.filter((m) => m.alive && toScreen(m.y) < H + 80);

      // ── Particles & floats ──
      gs.particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += p.trail ? 0.04 : 0.12; p.life -= p.trail ? 0.07 : 0.025; });
      gs.particles = gs.particles.filter((p) => p.life > 0);
      gs.floats.forEach((f) => { f.y += f.vy; f.life -= 0.018; });
      gs.floats = gs.floats.filter((f) => f.life > 0);

      if (toScreen(gs.py) > H + 60) die(gs);
    }

    function die(gs: GS) {
      if (gs.phase !== "playing") return;
      gs.phase = "dead";
      if (gs.score > hiRef.current) { hiRef.current = gs.score; gs.hi = gs.score; localStorage.setItem("djhi", String(gs.score)); }
    }

    function loop() { update(); render(); rafRef.current = requestAnimationFrame(loop); }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const gs = gsRef.current; const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const t = e.touches[0]; const mx = (t.clientX - rect.left) * (W / rect.width); const my = (t.clientY - rect.top) * (H / rect.height);
    if (gs.phase === "menu") { if (mx > W / 2 - 85 && mx < W / 2 + 85 && my > 248 && my < 296) startGame(); return; }
    if (gs.phase === "dead") { if (mx > W / 2 - 80 && mx < W / 2 + 80 && my > 305 && my < 353) startGame(); return; }
    gs.touchTargetX = mx;
  }, [startGame]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const gs = gsRef.current; if (gs.phase !== "playing") return;
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const t = e.touches[0]; gs.touchTargetX = (t.clientX - rect.left) * (W / rect.width);
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); gsRef.current.touchTargetX = null; gsRef.current.pvx *= 0.5;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const gs = gsRef.current; const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width); const my = (e.clientY - rect.top) * (H / rect.height);
    if (gs.phase === "menu" && mx > W / 2 - 85 && mx < W / 2 + 85 && my > 248 && my < 296) startGame();
    if (gs.phase === "dead" && mx > W / 2 - 80 && mx < W / 2 + 80 && my > 305 && my < 353) startGame();
  }, [startGame]);

  return (
    <div style={{ width: "100vw", height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a2e", overflow: "hidden" }}>
      <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 3px #2a9010" }}>
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{ display: "block", maxHeight: "100dvh", maxWidth: "100vw", width: "auto", height: "auto", cursor: "default", touchAction: "none", userSelect: "none" }}
          onClick={handleClick} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        />
      </div>
    </div>
  );
}
