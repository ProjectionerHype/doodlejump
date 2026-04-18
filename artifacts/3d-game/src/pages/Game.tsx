import { useEffect, useRef, useCallback } from "react";

const W = 400;
const H = 600;
const GRAVITY = 0.4;
const BASE_JUMP = -14;
const SPRING_JUMP = -20;
const MOVE_SPEED = 5;

type PType = "normal" | "moving" | "broken" | "spring" | "disappear";

interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  type: PType;
  vx: number;
  cracked: boolean;
  crackedTimer: number;
  bounceTimer: number;
  used: boolean;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Monster {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  type: "worm" | "ufo" | "bat";
  alive: boolean;
  frame: number;
  hp: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  life: number;
  color: string;
}

interface PowerUp {
  id: number;
  x: number;
  y: number;
  type: "spring" | "jetpack" | "hat";
  collected: boolean;
}

interface GS {
  phase: "menu" | "playing" | "dead";
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  pface: number;
  animT: number;
  platforms: Platform[];
  bullets: Bullet[];
  monsters: Monster[];
  particles: Particle[];
  floats: FloatingText[];
  powerups: PowerUp[];
  score: number;
  hi: number;
  camY: number;
  scrolled: number;
  keys: Record<string, boolean>;
  mouse: { x: number; y: number };
  jetpack: number;
  hat: number;
  pid: number;
  bid: number;
  mid: number;
  fid: number;
  puid: number;
  pcid: number;
  frameN: number;
  aimAngle: number;
  shootCooldown: number;
}

const PW = 66;
const PH = 14;
const PLAYER_W = 46;
const PLAYER_H = 50;

function platGap(score: number): number {
  const base = 55;
  const extra = Math.min(score / 100, 70);
  return base + extra + Math.random() * 20;
}

function makePlat(id: number, x: number, y: number, score: number): Platform {
  const r = Math.random();
  const d = Math.min(score / 2000, 1);
  let type: PType = "normal";
  if (r < 0.06 * d) type = "spring";
  else if (r < 0.2 * d) type = "broken";
  else if (r < 0.38 * d) type = "moving";
  else if (r < 0.45 * d) type = "disappear";

  const w = type === "spring" ? 60 : PW;
  return {
    id,
    x: Math.max(0, Math.min(W - w, Math.random() * (W - w))),
    y,
    w,
    h: PH,
    type,
    vx: type === "moving" ? (Math.random() > 0.5 ? 1.8 : -1.8) : 0,
    cracked: false,
    crackedTimer: 0,
    bounceTimer: 0,
    used: false,
  };
}

function makeMonster(id: number, camY: number, score: number): Monster {
  const types: Array<"worm" | "ufo" | "bat"> = ["worm", "ufo", "bat"];
  const type = types[Math.floor(Math.random() * (score > 2000 ? 3 : score > 800 ? 2 : 1))];
  return {
    id,
    x: Math.random() * (W - 50),
    y: camY - 80 - Math.random() * 200,
    w: type === "ufo" ? 52 : type === "bat" ? 44 : 48,
    h: type === "ufo" ? 30 : type === "bat" ? 26 : 28,
    vx: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.5),
    type,
    alive: true,
    frame: 0,
    hp: type === "ufo" ? 2 : 1,
  };
}

function init(hi: number): GS {
  const platforms: Platform[] = [];
  platforms.push({
    id: 0,
    x: W / 2 - PW / 2,
    y: H - 100,
    w: PW + 10,
    h: PH,
    type: "normal",
    vx: 0,
    cracked: false,
    crackedTimer: 0,
    bounceTimer: 0,
    used: false,
  });
  for (let i = 1; i < 18; i++) {
    platforms.push(makePlat(i + 1, 0, H - 100 - i * 50, 0));
  }
  return {
    phase: "menu",
    px: W / 2 - PLAYER_W / 2,
    py: H - 100 - PLAYER_H - 2,
    pvx: 0,
    pvy: 0,
    pface: 1,
    animT: 0,
    platforms,
    bullets: [],
    monsters: [],
    particles: [],
    floats: [],
    powerups: [],
    score: 0,
    hi,
    camY: 0,
    scrolled: 0,
    keys: {},
    mouse: { x: W / 2, y: H / 2 },
    jetpack: 0,
    hat: 0,
    pid: 20,
    bid: 0,
    mid: 0,
    fid: 0,
    puid: 0,
    pcid: 0,
    frameN: 0,
    aimAngle: -Math.PI / 2,
    shootCooldown: 0,
  };
}

function addParticles(gs: GS, x: number, y: number, color: string, n = 8) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.8;
    const spd = 1.5 + Math.random() * 3;
    gs.particles.push({
      id: gs.pcid++,
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 1.5,
      life: 1,
      color,
      r: 3 + Math.random() * 4,
    });
  }
}

function addFloat(gs: GS, x: number, y: number, text: string, color: string) {
  gs.floats.push({ id: gs.fid++, x, y, vy: -1.5, text, life: 1, color });
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS>(init(0));
  const rafRef = useRef(0);
  const hiRef = useRef(parseInt(localStorage.getItem("djhi") || "0", 10));

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
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [startGame]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    function toScreen(worldY: number) {
      return worldY - gsRef.current.camY;
    }

    // ─── DRAW BACKGROUND ─────────────────────────────────────────
    function drawBg() {
      const gs = gsRef.current;
      const scrolled = gs.scrolled;

      // Base paper — warm cream with subtle radial gradient
      const paperGrad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.75);
      paperGrad.addColorStop(0, "#fefaf2");
      paperGrad.addColorStop(0.6, "#faf5e8");
      paperGrad.addColorStop(1, "#f0e8d8");
      ctx.fillStyle = paperGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle watercolor corner washes
      const wc = [
        { x: 0, y: 0, c1: "rgba(180,210,255,0.13)" },
        { x: W, y: 0, c1: "rgba(255,200,220,0.12)" },
        { x: 0, y: H, c1: "rgba(200,255,200,0.10)" },
        { x: W, y: H, c1: "rgba(255,230,180,0.12)" },
      ];
      wc.forEach(({ x, y, c1 }) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 200);
        g.addColorStop(0, c1); g.addColorStop(1, "transparent");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      });

      // Horizontal notebook lines — with subtle hand-drawn waviness
      const gridSize = 28;
      const offsetY = (scrolled * 0.3) % gridSize;
      ctx.lineCap = "round";
      for (let i = 0; i < Math.ceil(H / gridSize) + 2; i++) {
        const y = -gridSize + offsetY + i * gridSize;
        // Alternate slightly thicker lines for every 4th (college-rule feel)
        const isMajor = i % 4 === 0;
        ctx.strokeStyle = isMajor
          ? "rgba(150,190,230,0.55)"
          : "rgba(170,205,240,0.38)";
        ctx.lineWidth = isMajor ? 1.1 : 0.8;
        ctx.beginPath();
        // Slight sine-wave wobble for hand-drawn feel
        const wobble = Math.sin(i * 3.7 + scrolled * 0.001) * 0.6;
        ctx.moveTo(0, y + wobble);
        ctx.bezierCurveTo(
          W * 0.25, y + Math.sin(i + 1.2) * 0.8 + wobble,
          W * 0.75, y + Math.sin(i + 2.4) * 0.8 + wobble,
          W, y + wobble * 0.5
        );
        ctx.stroke();
      }

      // Faint vertical grid lines
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(170,205,240,0.22)";
      for (let x = gridSize; x < W; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      // Red margin line — vivid with slight inner shadow
      const marginX = 52;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(220,60,60,0.55)";
      ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, H); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(220,60,60,0.18)";
      ctx.beginPath(); ctx.moveTo(marginX - 4, 0); ctx.lineTo(marginX - 4, H); ctx.stroke();

      // Punch holes (3 rings on left edge)
      [120, 300, 480].forEach((hy) => {
        const adjustedHy = ((hy - (scrolled * 0.15)) % H + H) % H;
        ctx.fillStyle = "rgba(220,210,195,0.85)";
        ctx.strokeStyle = "rgba(180,170,155,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(8, adjustedHy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(240,230,215,0.95)";
        ctx.beginPath(); ctx.arc(8, adjustedHy, 6, 0, Math.PI * 2); ctx.fill();
      });

      // Hand-drawn doodle decorations in the margin area
      ctx.save();
      ctx.globalAlpha = 0.35;
      const doodleOffY = scrolled * 0.18;

      // Stars scattered in margin
      const starPositions = [
        [22, 60], [30, 160], [18, 250], [28, 380], [20, 470],
        [35, 90], [15, 340],
      ];
      starPositions.forEach(([dx, dy]) => {
        const sy = ((dy - doodleOffY % 600) + 600) % 600;
        if (sy < -30 || sy > H + 30) return;
        ctx.strokeStyle = "#e8a020";
        ctx.fillStyle = "rgba(255,200,50,0.6)";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        const rs = 6, ri = 2.5;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const ao = (j * 4 * Math.PI) / 5 - Math.PI / 2;
          const ai = ao + (2 * Math.PI) / 10;
          if (j === 0) ctx.moveTo(dx + Math.cos(ao) * rs, sy + Math.sin(ao) * rs);
          else ctx.lineTo(dx + Math.cos(ao) * rs, sy + Math.sin(ao) * rs);
          ctx.lineTo(dx + Math.cos(ai) * ri, sy + Math.sin(ai) * ri);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      });

      // Hearts
      [[32, 200], [20, 420], [38, 130]].forEach(([dx, dy]) => {
        const sy = ((dy - doodleOffY % 600) + 600) % 600;
        if (sy < -30 || sy > H + 30) return;
        ctx.strokeStyle = "#dd2060";
        ctx.fillStyle = "rgba(255,100,140,0.55)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(dx, sy + 4);
        ctx.bezierCurveTo(dx, sy - 1, dx - 7, sy - 7, dx - 7, sy - 2);
        ctx.bezierCurveTo(dx - 7, sy + 3, dx, sy + 10, dx, sy + 10);
        ctx.bezierCurveTo(dx, sy + 10, dx + 7, sy + 3, dx + 7, sy - 2);
        ctx.bezierCurveTo(dx + 7, sy - 7, dx, sy - 1, dx, sy + 4);
        ctx.fill(); ctx.stroke();
      });

      // Squiggly arrows in margin
      [[25, 310], [18, 520]].forEach(([dx, dy]) => {
        const sy = ((dy - doodleOffY % 600) + 600) % 600;
        if (sy < -30 || sy > H + 30) return;
        ctx.strokeStyle = "#4060c0";
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(dx - 8, sy - 10);
        ctx.quadraticCurveTo(dx + 4, sy - 5, dx - 6, sy);
        ctx.quadraticCurveTo(dx + 4, sy + 5, dx - 8, sy + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(dx - 12, sy + 6); ctx.lineTo(dx - 8, sy + 10); ctx.lineTo(dx - 4, sy + 6);
        ctx.stroke();
      });

      // Small drawn circles / smiley in margin
      [[28, 48], [22, 450]].forEach(([dx, dy]) => {
        const sy = ((dy - doodleOffY % 600) + 600) % 600;
        if (sy < -30 || sy > H + 30) return;
        ctx.strokeStyle = "#20a040";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(dx, sy, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(dx - 3, sy - 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 3, sy - 2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx, sy + 2, 4, 0, Math.PI); ctx.stroke();
      });

      // Subtle diagonal pencil hatching texture patch (very faint)
      ctx.globalAlpha = 0.06;
      ctx.strokeStyle = "#8090a0";
      ctx.lineWidth = 0.5;
      for (let hx = 0; hx < W; hx += 6) {
        ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx - H * 0.3, H); ctx.stroke();
      }

      ctx.restore();
    }

    // ─── DRAW PLATFORM ───────────────────────────────────────────
    function drawPlatform(p: Platform) {
      const sy = toScreen(p.y);
      if (sy > H + 30 || sy < -50) return;

      const bounce = p.bounceTimer > 0 ? Math.sin(p.bounceTimer * 0.6) * 5 : 0;

      ctx.save();
      ctx.translate(p.x + p.w / 2, sy + p.h / 2 - bounce * 0.5);

      if (p.type === "spring") {
        // Pink/red spring platform
        const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        g.addColorStop(0, "#ff8faa");
        g.addColorStop(0.5, "#e8305a");
        g.addColorStop(1, "#c01840");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7);
        ctx.fill();

        ctx.strokeStyle = "#801030";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Spring coil
        ctx.strokeStyle = "#ffd0e0";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        const coilH = 18 + bounce * 2;
        for (let i = 0; i < 3; i++) {
          const cy = -p.h / 2 - 6 - i * 7;
          ctx.beginPath();
          ctx.moveTo(-8, cy);
          ctx.quadraticCurveTo(0, cy - 6, 8, cy);
          ctx.stroke();
        }
        ctx.strokeStyle = "#e8305a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -p.h / 2 - coilH);
        ctx.lineTo(-6, -p.h / 2);
        ctx.moveTo(6, -p.h / 2 - coilH);
        ctx.lineTo(6, -p.h / 2);
        ctx.stroke();

      } else if (p.type === "broken" || p.cracked) {
        // Brown crumbling platform
        ctx.fillStyle = p.cracked ? "#a06830" : "#c87840";
        ctx.strokeStyle = "#7a4818";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 5);
        ctx.fill();
        ctx.stroke();

        // Crack lines
        ctx.strokeStyle = "#7a4818";
        ctx.lineWidth = 1.5;
        if (p.cracked) {
          ctx.globalAlpha = 1 - p.crackedTimer / 30;
          ctx.beginPath();
          ctx.moveTo(-p.w / 4, -p.h / 2);
          ctx.lineTo(-p.w / 6, p.h / 2);
          ctx.moveTo(p.w / 5, -p.h / 2 + 2);
          ctx.lineTo(p.w / 3, p.h / 2);
          ctx.moveTo(0, -p.h / 2);
          ctx.lineTo(-p.w / 8, p.h / 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(-10, -p.h / 2 + 3);
          ctx.lineTo(-5, p.h / 2 - 2);
          ctx.moveTo(10, -p.h / 2 + 2);
          ctx.lineTo(6, p.h / 2 - 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,200,140,0.3)";
        ctx.fillRect(-p.w / 2 + 4, -p.h / 2 + 3, p.w - 8, 3);

      } else if (p.type === "moving") {
        // Blue platform
        const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        g.addColorStop(0, "#80c8ff");
        g.addColorStop(0.5, "#2090e8");
        g.addColorStop(1, "#0060b8");
        ctx.fillStyle = g;
        ctx.strokeStyle = "#004090";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 3, p.w - 10, 4);

        // Arrows indicating movement
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.vx > 0 ? "▶▶" : "◀◀", 0, 3);

      } else if (p.type === "disappear") {
        // Cloud / disappearing
        ctx.globalAlpha = p.used ? 0.3 : 1;
        ctx.fillStyle = "#e8f8ff";
        ctx.strokeStyle = "#90c8e8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.ellipse(-p.w / 4, -p.h / 2 - 5, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(p.w / 4, -p.h / 2 - 5, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

      } else {
        // Green normal platform
        const g = ctx.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        g.addColorStop(0, "#90e870");
        g.addColorStop(0.5, "#38c020");
        g.addColorStop(1, "#208010");
        ctx.fillStyle = g;
        ctx.strokeStyle = "#186010";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillRect(-p.w / 2 + 5, -p.h / 2 + 3, p.w - 10, 4);
      }

      ctx.restore();
    }

    // ─── DRAW DERPY FROG ─────────────────────────────────────────
    function drawDoodler(gs: GS) {
      const sx = gs.px;
      const sy = toScreen(gs.py);
      const f = gs.pface;
      const t = gs.animT;
      const falling = gs.pvy > 2;
      const rising = gs.pvy < -3;

      ctx.save();
      ctx.translate(sx + PLAYER_W / 2, sy + PLAYER_H / 2 - 4);
      ctx.scale(f, 1);

      // Squish on land, stretch on rise
      const sqX = rising ? 0.84 : falling ? 1.12 : 1;
      const sqY = rising ? 1.16 : falling ? 0.88 : 1;
      ctx.scale(sqX * 0.68, sqY * 0.68);

      // ── Jetpack (on back) ──
      if (gs.jetpack > 0) {
        ctx.fillStyle = "#cc3010";
        ctx.strokeStyle = "#881000"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-28, -10, 10, 22, 4); ctx.fill(); ctx.stroke();
        const flameH = 10 + Math.sin(t * 0.5) * 5;
        ctx.fillStyle = "#ff5020";
        ctx.beginPath();
        ctx.moveTo(-27, 12); ctx.lineTo(-22, 12 + flameH); ctx.lineTo(-17, 12);
        ctx.closePath(); ctx.fill();
      }

      // ── Two small feet at the bottom ──
      const footKick = rising ? -6 : falling ? 4 : Math.sin(t * 0.2) * 3;
      ctx.strokeStyle = "#186004"; ctx.lineWidth = 1.5;
      // Left foot
      ctx.fillStyle = "#50cc20";
      ctx.beginPath();
      ctx.ellipse(-10, 18 + footKick, 9, 5, -0.15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Right foot
      ctx.beginPath();
      ctx.ellipse(10, 18 + footKick, 9, 5, 0.15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // ── Main round body ──
      const bodyG = ctx.createRadialGradient(-5, -6, 3, 0, 0, 22);
      bodyG.addColorStop(0, "#88f044");
      bodyG.addColorStop(0.5, "#4acc18");
      bodyG.addColorStop(0.85, "#2e9a08");
      bodyG.addColorStop(1, "#1a6004");
      ctx.fillStyle = bodyG;
      ctx.strokeStyle = "#186004"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 2, 21, 20, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Shine on body
      ctx.fillStyle = "rgba(200,255,140,0.22)";
      ctx.beginPath(); ctx.ellipse(-5, -7, 9, 6, -0.4, 0, Math.PI * 2); ctx.fill();

      // Belly patch
      ctx.fillStyle = "rgba(200,255,160,0.45)";
      ctx.beginPath(); ctx.ellipse(1, 7, 11, 9, 0, 0, Math.PI * 2); ctx.fill();

      // ── Nostrils ──
      ctx.fillStyle = "#1a5800";
      ctx.beginPath(); ctx.ellipse(-4, -4, 2, 1.5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, -4, 2, 1.5, 0.2, 0, Math.PI * 2); ctx.fill();

      // ── Wide goofy smile ──
      ctx.strokeStyle = "#0a4000"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-12, 5);
      ctx.quadraticCurveTo(0, 15, 12, 5);
      ctx.stroke();
      // Mouth fill
      ctx.fillStyle = "#bb1a3a";
      ctx.beginPath();
      ctx.moveTo(-9, 6);
      ctx.quadraticCurveTo(0, 14, 9, 6);
      ctx.quadraticCurveTo(0, 10, -9, 6);
      ctx.fill();

      // ── Tongue (wiggles) ──
      const wag = Math.sin(t * 0.22) * 2.5;
      ctx.fillStyle = "#ff3d88";
      ctx.strokeStyle = "#cc1060"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, 11);
      ctx.quadraticCurveTo(wag * 0.4, 14, 1, 20 + wag);
      ctx.quadraticCurveTo(4 + wag, 24 + wag, 0, 24 + wag);
      ctx.quadraticCurveTo(-4 + wag, 24 + wag, -1, 20 + wag);
      ctx.quadraticCurveTo(wag * 0.3, 14, 3, 11);
      ctx.fill(); ctx.stroke();
      // Tongue centre line
      ctx.strokeStyle = "#ff70bb"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 21 + wag); ctx.lineTo(0, 24 + wag); ctx.stroke();

      // ── Eye stalks (bumps on top) ──
      const eyeSocketL = ctx.createRadialGradient(-9, -19, 1, -9, -19, 11);
      eyeSocketL.addColorStop(0, "#88f044");
      eyeSocketL.addColorStop(0.7, "#4acc18");
      eyeSocketL.addColorStop(1, "#2a8808");
      ctx.fillStyle = eyeSocketL;
      ctx.strokeStyle = "#186004"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-9, -19, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      const eyeSocketR = ctx.createRadialGradient(9, -19, 1, 9, -19, 11);
      eyeSocketR.addColorStop(0, "#88f044");
      eyeSocketR.addColorStop(0.7, "#4acc18");
      eyeSocketR.addColorStop(1, "#2a8808");
      ctx.fillStyle = eyeSocketR;
      ctx.strokeStyle = "#186004"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(9, -19, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Eye whites
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-9, -19, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9, -19, 8, 0, Math.PI * 2); ctx.fill();

      // Pupils — derpy: left tracks cursor, right wanders
      const aimAngleAdj = gs.pface === 1 ? gs.aimAngle : Math.PI - gs.aimAngle;
      const pDx = Math.cos(aimAngleAdj) * 3.5;
      const pDy = Math.sin(aimAngleAdj) * 3.5;
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(-9 + pDx, -19 + pDy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9 - pDx * 0.25 + 1, -19 + pDy * 0.6 + 1.5, 4, 0, Math.PI * 2); ctx.fill();
      // Shines
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-9 + pDx * 0.4 + 1.5, -19 + pDy * 0.4 - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9 - pDx * 0.1 + 2, -19 + pDy * 0.25 - 1.5, 1.8, 0, Math.PI * 2); ctx.fill();

      // ── Cheek blush ──
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ff7799";
      ctx.beginPath(); ctx.ellipse(-16, 1, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16, 1, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // ── Propeller hat ──
      if (gs.hat > 0) {
        const spin = t * 0.22;
        ctx.fillStyle = "#2222cc"; ctx.strokeStyle = "#111188"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, -31, 12, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#3333ee";
        ctx.beginPath(); ctx.roundRect(-8, -46, 16, 15, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#6677ff"; ctx.fillRect(-8, -44, 16, 4);
        ctx.save(); ctx.translate(0, -48); ctx.rotate(spin);
        ["#ff4040", "#44cc44", "#4444ff", "#ff44cc"].forEach((c, i) => {
          ctx.fillStyle = c;
          ctx.save(); ctx.rotate((i * Math.PI) / 2);
          ctx.beginPath(); ctx.ellipse(9, 0, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });
        ctx.fillStyle = "#ccc"; ctx.strokeStyle = "#888"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    // ─── DRAW BULLET ─────────────────────────────────────────────
    function drawBullet(b: Bullet) {
      const sy = toScreen(b.y);
      ctx.save();
      ctx.translate(b.x, sy);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
      g.addColorStop(0, "#ffe860");
      g.addColorStop(0.4, "#ff9010");
      g.addColorStop(1, "rgba(255,100,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ─── DRAW MONSTER ────────────────────────────────────────────
    function drawMonster(m: Monster) {
      const sy = toScreen(m.y);
      if (sy > H + 40 || sy < -50) return;
      ctx.save();
      ctx.translate(m.x + m.w / 2, sy + m.h / 2);

      if (m.type === "worm") {
        ctx.scale(m.vx > 0 ? 1 : -1, 1);
        const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 22);
        g.addColorStop(0, "#ff8888");
        g.addColorStop(0.5, "#dd2020");
        g.addColorStop(1, "#880808");
        ctx.fillStyle = g;
        ctx.strokeStyle = "#660000";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(12, -5, 5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.ellipse(13, -5, 3, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(14, -6, 1, 1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Spikes
        ctx.fillStyle = "#cc0000";
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 8, -14);
          ctx.lineTo(i * 8 - 5, -5);
          ctx.lineTo(i * 8 + 5, -5);
          ctx.fill();
        }

      } else if (m.type === "ufo") {
        // UFO disc
        const gDisc = ctx.createLinearGradient(0, -m.h / 2, 0, m.h / 2);
        gDisc.addColorStop(0, "#d0d0ff");
        gDisc.addColorStop(0.5, "#8080dd");
        gDisc.addColorStop(1, "#4040aa");
        ctx.fillStyle = gDisc;
        ctx.strokeStyle = "#2020aa";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 4, 26, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Dome
        ctx.fillStyle = "rgba(180,255,200,0.7)";
        ctx.strokeStyle = "#60cc80";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -2, 14, 12, 0, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        // Lights
        const phase = m.frame * 0.1;
        const lightColors = ["#ff4040", "#40ff40", "#4040ff", "#ffff40"];
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + phase;
          ctx.fillStyle = lightColors[i];
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * 18, 6 + Math.sin(angle) * 3, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

      } else {
        // Bat
        ctx.scale(m.vx > 0 ? 1 : -1, 1);
        const wingFlap = Math.sin(m.frame * 0.25) * 0.4;
        // Wings
        ctx.fillStyle = "#553388";
        ctx.strokeStyle = "#221133";
        ctx.lineWidth = 1.5;
        ctx.save();
        ctx.rotate(-wingFlap);
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.quadraticCurveTo(-30, -20, -38, 5);
        ctx.quadraticCurveTo(-28, 8, -5, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.rotate(wingFlap);
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.quadraticCurveTo(30, -20, 38, 5);
        ctx.quadraticCurveTo(28, 8, 5, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        // Body
        ctx.fillStyle = "#442266";
        ctx.strokeStyle = "#221133";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 2, 13, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Eyes
        ctx.fillStyle = "#ff2222";
        ctx.beginPath();
        ctx.arc(-5, -1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(5, -1, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(-4, -1, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(6, -1, 2, 0, Math.PI * 2);
        ctx.fill();
        // Fangs
        ctx.fillStyle = "#fffbe8";
        ctx.beginPath();
        ctx.moveTo(-3, 10);
        ctx.lineTo(-6, 17);
        ctx.lineTo(0, 10);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(3, 10);
        ctx.lineTo(6, 17);
        ctx.lineTo(0, 10);
        ctx.fill();
      }

      // HP dots
      for (let i = 0; i < m.hp; i++) {
        ctx.fillStyle = "#ff4040";
        ctx.beginPath();
        ctx.arc(-6 + i * 8, -m.h / 2 - 8, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // ─── DRAW AIM LINE ───────────────────────────────────────────
    function drawAimLine(gs: GS) {
      if (gs.phase !== "playing") return;
      const sx = gs.px + PLAYER_W / 2;
      const sy = toScreen(gs.py + PLAYER_H / 2);
      const angle = gs.pface === 1 ? gs.aimAngle : Math.PI - gs.aimAngle;
      const len = 55;
      const ex = sx + Math.cos(angle) * len;
      const ey = sy + Math.sin(angle) * len;

      ctx.save();
      ctx.strokeStyle = "rgba(255,180,0,0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -(gs.frameN * 0.5);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ─── DRAW HUD ────────────────────────────────────────────────
    function drawHUD(gs: GS) {
      ctx.save();

      // Score - hand-drawn font style
      ctx.font = "bold 28px 'Segoe Script', 'Comic Sans MS', cursive";
      ctx.fillStyle = "#1a1a2e";
      ctx.textAlign = "left";
      ctx.fillText(gs.score.toString(), 60, 42);

      if (gs.jetpack > 0) {
        ctx.font = "bold 14px 'Comic Sans MS', cursive";
        ctx.fillStyle = "#e04020";
        ctx.fillText("🚀 " + Math.ceil(gs.jetpack / 60) + "s", 60, 65);
      }
      if (gs.hat > 0) {
        ctx.font = "bold 14px 'Comic Sans MS', cursive";
        ctx.fillStyle = "#4040dd";
        ctx.fillText("🎩 " + Math.ceil(gs.hat / 60) + "s", 60, 65);
      }

      // Best score top-right
      ctx.textAlign = "right";
      ctx.font = "bold 14px 'Comic Sans MS', cursive";
      ctx.fillStyle = "#555";
      ctx.fillText("Best: " + gs.hi, W - 10, 42);

      // Controls hint (fades out)
      if (gs.scrolled < 200) {
        const alpha = Math.max(0, 1 - gs.scrolled / 200);
        ctx.globalAlpha = alpha * 0.6;
        ctx.font = "12px 'Comic Sans MS', cursive";
        ctx.fillStyle = "#888";
        ctx.textAlign = "center";
        ctx.fillText("← → move  |  click/tap to shoot", W / 2, H - 12);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    // ─── DRAW MENU ───────────────────────────────────────────────
    function drawMenu(gs: GS) {
      const t = gs.frameN;

      // Semi-transparent overlay
      ctx.fillStyle = "rgba(245,240,232,0.92)";
      ctx.fillRect(0, 0, W, H);

      // Title with hand-drawn style
      ctx.save();
      ctx.textAlign = "center";

      // Title shadow
      ctx.fillStyle = "#38c020";
      ctx.font = "bold 62px 'Segoe Script', 'Comic Sans MS', cursive";
      ctx.fillText("Doodle", W / 2 + 3, 153);
      ctx.fillText("Jump", W / 2 + 3, 223);

      // Title main
      ctx.fillStyle = "#2a9010";
      ctx.fillText("Doodle", W / 2, 150);
      ctx.fillText("Jump", W / 2, 220);

      // Subtitle
      ctx.font = "16px 'Comic Sans MS', cursive";
      ctx.fillStyle = "#888";
      ctx.fillText("Ultra Edition", W / 2, 248);

      // Play button
      const pulse = 1 + Math.sin(t * 0.08) * 0.04;
      ctx.save();
      ctx.translate(W / 2, 310);
      ctx.scale(pulse, pulse);
      const btnGrad = ctx.createLinearGradient(-85, -24, 85, 24);
      btnGrad.addColorStop(0, "#50e030");
      btnGrad.addColorStop(1, "#20b000");
      ctx.fillStyle = btnGrad;
      ctx.strokeStyle = "#186010";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-85, -24, 170, 48, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 22px 'Comic Sans MS', cursive";
      ctx.fillText("PLAY!", 0, 9);
      ctx.restore();

      // Instructions
      ctx.font = "13px 'Comic Sans MS', cursive";
      ctx.fillStyle = "#666";
      ctx.fillText("Use ← → keys or touch to move", W / 2, 370);
      ctx.fillText("Click / tap to shoot monsters", W / 2, 392);

      if (gs.hi > 0) {
        ctx.font = "bold 15px 'Comic Sans MS', cursive";
        ctx.fillStyle = "#c87820";
        ctx.fillText("Best: " + gs.hi.toLocaleString(), W / 2, 430);
      }

      ctx.restore();
    }

    // ─── DRAW GAME OVER ──────────────────────────────────────────
    function drawGameOver(gs: GS) {
      ctx.fillStyle = "rgba(245,240,232,0.88)";
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.textAlign = "center";

      ctx.fillStyle = "#cc1111";
      ctx.font = "bold 52px 'Segoe Script', 'Comic Sans MS', cursive";
      ctx.fillText("Game", W / 2, 200);
      ctx.fillText("Over!", W / 2, 262);

      ctx.fillStyle = "#333";
      ctx.font = "22px 'Comic Sans MS', cursive";
      ctx.fillText("Score: " + gs.score.toLocaleString(), W / 2, 308);

      if (gs.score >= gs.hi) {
        const t = gs.frameN;
        ctx.fillStyle = `hsl(${(t * 4) % 360}, 90%, 45%)`;
        ctx.font = "bold 18px 'Comic Sans MS', cursive";
        ctx.fillText("New High Score!", W / 2, 338);
      } else {
        ctx.fillStyle = "#c87820";
        ctx.font = "bold 16px 'Comic Sans MS', cursive";
        ctx.fillText("Best: " + gs.hi.toLocaleString(), W / 2, 338);
      }

      const t = gs.frameN;
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.1);
      ctx.globalAlpha = pulse;
      const btnGrad = ctx.createLinearGradient(W / 2 - 80, 370, W / 2 + 80, 418);
      btnGrad.addColorStop(0, "#8030cc");
      btnGrad.addColorStop(1, "#e020a0");
      ctx.fillStyle = btnGrad;
      ctx.strokeStyle = "#501888";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(W / 2 - 80, 370, 160, 48, 14);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px 'Comic Sans MS', cursive";
      ctx.fillText("Play Again", W / 2, 401);

      ctx.fillStyle = "#999";
      ctx.font = "13px 'Comic Sans MS', cursive";
      ctx.fillText("Space / click to restart", W / 2, 448);

      ctx.restore();
    }

    // ─── DRAW PARTICLES ──────────────────────────────────────────
    function drawParticles(gs: GS) {
      gs.particles.forEach((p) => {
        const sy = toScreen(p.y);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, sy, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // ─── DRAW FLOATING TEXTS ────────────────────────────────────
    function drawFloats(gs: GS) {
      gs.floats.forEach((f) => {
        const sy = toScreen(f.y);
        ctx.globalAlpha = f.life;
        ctx.fillStyle = f.color;
        ctx.font = "bold 16px 'Comic Sans MS', cursive";
        ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, sy);
      });
      ctx.globalAlpha = 1;
    }

    // ─── RENDER ──────────────────────────────────────────────────
    function render() {
      const gs = gsRef.current;
      ctx.clearRect(0, 0, W, H);

      drawBg();

      if (gs.phase === "menu") {
        gs.platforms.forEach(drawPlatform);
        drawDoodler(gs);
        drawMenu(gs);
        return;
      }

      gs.platforms.forEach(drawPlatform);
      gs.powerups.forEach((pu) => {
        if (pu.collected) return;
        const sy = toScreen(pu.y);
        ctx.save();
        ctx.translate(pu.x + 15, sy + 15);
        const t = gs.frameN;
        ctx.rotate(Math.sin(t * 0.05) * 0.2);
        if (pu.type === "jetpack") {
          ctx.fillStyle = "#e04020";
          ctx.fillRect(-10, -15, 20, 30);
          ctx.fillStyle = "#ff8040";
          ctx.fillRect(-6, -18, 12, 8);
          ctx.fillStyle = "#ffcc00";
          const fh = 8 + Math.sin(t * 0.3) * 4;
          ctx.beginPath();
          ctx.moveTo(-8, 15);
          ctx.lineTo(0, 15 + fh);
          ctx.lineTo(8, 15);
          ctx.fill();
        } else {
          ctx.fillStyle = "#4040dd";
          ctx.beginPath();
          ctx.ellipse(0, 5, 15, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(-10, -10, 20, 15);
          ctx.fillStyle = "#8888ff";
          ctx.fillRect(-10, -8, 20, 4);
        }
        ctx.restore();
      });

      drawParticles(gs);
      gs.bullets.forEach(drawBullet);
      gs.monsters.forEach(drawMonster);
      drawDoodler(gs);
      drawFloats(gs);
      drawHUD(gs);

      if (gs.phase === "dead") drawGameOver(gs);
    }

    // ─── UPDATE ──────────────────────────────────────────────────
    function update() {
      const gs = gsRef.current;
      gs.frameN++;
      gs.animT++;

      if (gs.phase !== "playing") return;

      const left = gs.keys["ArrowLeft"] || gs.keys["KeyA"];
      const right = gs.keys["ArrowRight"] || gs.keys["KeyD"];

      if (left) {
        gs.pvx = Math.max(gs.pvx - 1.2, -MOVE_SPEED * 1.5);
        gs.pface = -1;
      } else if (right) {
        gs.pvx = Math.min(gs.pvx + 1.2, MOVE_SPEED * 1.5);
        gs.pface = 1;
      } else {
        gs.pvx *= 0.82;
      }

      gs.px += gs.pvx;
      if (gs.px > W) gs.px = -PLAYER_W;
      if (gs.px + PLAYER_W < 0) gs.px = W;

      // Gravity / jetpack
      if (gs.jetpack > 0) {
        gs.jetpack--;
        gs.pvy = Math.max(gs.pvy - 0.6, -11);
        addParticles(gs, gs.px + PLAYER_W / 2, gs.py + PLAYER_H, "#ff8040", 1);
      } else if (gs.hat > 0) {
        gs.hat--;
        gs.pvy = Math.max(gs.pvy - 0.3, -7);
      } else {
        gs.pvy += GRAVITY;
      }

      gs.py += gs.pvy;

      // Camera scroll
      const screenPY = gs.py - gs.camY;
      if (screenPY < H / 2.5) {
        const d = H / 2.5 - screenPY;
        gs.camY -= d;
        gs.scrolled += d;
        gs.score = Math.max(gs.score, Math.floor(gs.scrolled / 4));
      }

      // Platform collisions (only when falling)
      if (gs.pvy > 0) {
        for (const p of gs.platforms) {
          const prevPy = gs.py - gs.pvy;
          const overlapsX = gs.px + 8 < p.x + p.w - 8 && gs.px + PLAYER_W - 8 > p.x + 8;
          const landedOn = prevPy + PLAYER_H <= p.y + 4 && gs.py + PLAYER_H >= p.y && gs.py + PLAYER_H <= p.y + p.h + 12;

          if (overlapsX && landedOn) {
            if (p.type === "broken") {
              if (!p.cracked) {
                p.cracked = true;
                p.crackedTimer = 0;
              } else {
                continue;
              }
            }
            if (p.type === "disappear") {
              p.used = true;
            }
            if (p.type === "spring") {
              gs.pvy = SPRING_JUMP;
              p.bounceTimer = 12;
              addParticles(gs, p.x + p.w / 2, p.y, "#ff6090", 8);
              addFloat(gs, p.x + p.w / 2, p.y - 20, "BOING!", "#e8305a");
            } else {
              gs.pvy = BASE_JUMP;
              p.bounceTimer = 8;
              if (p.type !== "disappear") {
                addParticles(gs, p.x + p.w / 2, p.y, "#70dd40", 4);
              }
            }
            gs.py = p.y - PLAYER_H;
            break;
          }
        }
      }

      // Update platforms
      gs.platforms.forEach((p) => {
        if (p.bounceTimer > 0) p.bounceTimer--;
        if (p.type === "moving") {
          p.x += p.vx;
          if (p.x <= 0 || p.x + p.w >= W) p.vx *= -1;
        }
        if (p.cracked) {
          p.crackedTimer++;
        }
      });

      // Remove off-screen / crumbled platforms
      gs.platforms = gs.platforms.filter(
        (p) => {
          if (p.cracked && p.crackedTimer > 28) return false;
          if (p.used && p.type === "disappear") return false;
          return toScreen(p.y) < H + 30;
        }
      );

      // Generate platforms
      const topY = gs.platforms.length ? Math.min(...gs.platforms.map((p) => p.y)) : gs.camY;
      while (gs.platforms.length < 22 || topY > gs.camY - 80) {
        const highest = gs.platforms.length ? Math.min(...gs.platforms.map((p) => p.y)) : gs.camY;
        gs.platforms.push(makePlat(gs.pid++, 0, highest - platGap(gs.score), gs.score));
        break;
      }

      // Powerup collisions
      gs.powerups.forEach((pu) => {
        if (pu.collected) return;
        const dx = gs.px + PLAYER_W / 2 - (pu.x + 15);
        const dy = (gs.py + PLAYER_H / 2) - (pu.y + 15);
        if (Math.abs(dx) < 28 && Math.abs(dy) < 28) {
          pu.collected = true;
          if (pu.type === "jetpack") {
            gs.jetpack = 180;
            addFloat(gs, gs.px + PLAYER_W / 2, gs.py, "JETPACK!", "#e04020");
          } else {
            gs.hat = 300;
            addFloat(gs, gs.px + PLAYER_W / 2, gs.py, "PROPELLER!", "#4040dd");
          }
          addParticles(gs, pu.x + 15, pu.y + 15, "#ffcc00", 12);
        }
      });
      gs.powerups = gs.powerups.filter((pu) => !pu.collected && toScreen(pu.y) < H + 30);

      // Spawn powerups occasionally
      if (gs.score > 200 && Math.random() < 0.0008) {
        const tY = gs.camY - 100 - Math.random() * 150;
        gs.powerups.push({
          id: gs.puid++,
          x: Math.random() * (W - 40),
          y: tY,
          type: Math.random() < 0.5 ? "jetpack" : "hat",
          collected: false,
        });
      }

      // Bullets
      gs.bullets = gs.bullets.filter((b) => {
        b.x += b.vx;
        b.y += b.vy;
        const sy = toScreen(b.y);
        return sy > -50 && sy < H + 50;
      });

      // Shoot cooldown
      if (gs.shootCooldown > 0) gs.shootCooldown--;

      // Monsters
      const toSpawn = gs.score > 300 && gs.monsters.filter((m) => m.alive).length < Math.min(Math.floor(gs.score / 800) + 1, 4);
      if (toSpawn && Math.random() < 0.004) {
        gs.monsters.push(makeMonster(gs.mid++, gs.camY, gs.score));
      }

      gs.monsters.forEach((m) => {
        if (!m.alive) return;
        m.x += m.vx;
        m.frame++;
        if (m.x <= 0 || m.x + m.w >= W) m.vx *= -1;
        if (m.type === "ufo") {
          m.y += Math.sin(m.frame * 0.04) * 0.8;
        }
        if (m.type === "bat") {
          m.y += Math.sin(m.frame * 0.06) * 1.2 - 0.1;
        }

        // Bullet hits monster
        gs.bullets.forEach((b) => {
          const bsy = b.y;
          if (
            b.x > m.x && b.x < m.x + m.w &&
            bsy > m.y && bsy < m.y + m.h
          ) {
            m.hp--;
            addParticles(gs, b.x, b.y, "#ff3030", 6);
            b.vy = 1e9; // remove bullet
            if (m.hp <= 0) {
              m.alive = false;
              addParticles(gs, m.x + m.w / 2, m.y + m.h / 2, "#ff6030", 16);
              const bonus = m.type === "ufo" ? 200 : m.type === "bat" ? 150 : 100;
              gs.score += bonus;
              addFloat(gs, m.x + m.w / 2, m.y, "+" + bonus, "#ff4020");
            }
          }
        });

        // Monster kills player (touch from side/top)
        if (!m.alive) return;
        const mRight = m.x + m.w;
        const mBottom = m.y + m.h;
        const pRight = gs.px + PLAYER_W;
        const pBottom = gs.py + PLAYER_H;
        const overlap =
          gs.px + 10 < mRight - 10 &&
          pRight - 10 > m.x + 10 &&
          gs.py + 8 < mBottom - 8 &&
          pBottom - 8 > m.y + 8;

        if (overlap) {
          // Stomp from above
          if (gs.pvy > 0 && gs.py + PLAYER_H < m.y + m.h * 0.5) {
            m.hp--;
            if (m.hp <= 0) {
              m.alive = false;
              addParticles(gs, m.x + m.w / 2, m.y + m.h / 2, "#ff6030", 16);
              const bonus = m.type === "ufo" ? 200 : 100;
              gs.score += bonus;
              addFloat(gs, m.x + m.w / 2, m.y, "+" + bonus, "#ff4020");
            }
            gs.pvy = BASE_JUMP;
          } else {
            // Hurt player
            die(gs);
          }
        }
      });
      gs.monsters = gs.monsters.filter(
        (m) => m.alive || true // keep for death anim
      ).filter((m) => m.alive && toScreen(m.y) < H + 80);

      // Aim angle
      const cx = gs.px + PLAYER_W / 2;
      const cy = toScreen(gs.py + PLAYER_H / 2);
      gs.aimAngle = Math.atan2(gs.mouse.y - cy, gs.mouse.x - cx);

      // Particles & floats
      gs.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.life -= 0.025;
      });
      gs.particles = gs.particles.filter((p) => p.life > 0);

      gs.floats.forEach((f) => {
        f.y += f.vy;
        f.life -= 0.018;
      });
      gs.floats = gs.floats.filter((f) => f.life > 0);

      // Fall off screen
      if (toScreen(gs.py) > H + 60) {
        die(gs);
      }
    }

    function die(gs: GS) {
      if (gs.phase !== "playing") return;
      gs.phase = "dead";
      if (gs.score > hiRef.current) {
        hiRef.current = gs.score;
        gs.hi = gs.score;
        localStorage.setItem("djhi", String(gs.score));
      }
    }

    function loop() {
      update();
      render();
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const shoot = useCallback(() => {
    const gs = gsRef.current;
    if (gs.phase !== "playing" || gs.shootCooldown > 0) return;
    const angle = gs.pface === 1 ? gs.aimAngle : Math.PI - gs.aimAngle;
    const speed = 14;
    gs.bullets.push({
      id: gs.bid++,
      x: gs.px + PLAYER_W / 2 + Math.cos(angle) * 20,
      y: gs.py + PLAYER_H / 2 + Math.sin(angle) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
    gs.shootCooldown = 12;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    gsRef.current.mouse.x = (e.clientX - rect.left) * (W / rect.width);
    gsRef.current.mouse.y = (e.clientY - rect.top) * (H / rect.height);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const gs = gsRef.current;
    if (gs.phase === "menu") {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      if (mx > W / 2 - 85 && mx < W / 2 + 85 && my > 286 && my < 334) {
        startGame();
      }
      return;
    }
    if (gs.phase === "dead") {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      if (mx > W / 2 - 80 && mx < W / 2 + 80 && my > 370 && my < 418) {
        startGame();
      }
      return;
    }
    shoot();
  }, [startGame, shoot]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const gs = gsRef.current;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    const mx = (t.clientX - rect.left) * (W / rect.width);
    const my = (t.clientY - rect.top) * (H / rect.height);

    gs.mouse.x = mx;
    gs.mouse.y = my;

    if (gs.phase === "menu") {
      if (mx > W / 2 - 85 && mx < W / 2 + 85 && my > 286 && my < 334) startGame();
      return;
    }
    if (gs.phase === "dead") {
      if (mx > W / 2 - 80 && mx < W / 2 + 80 && my > 370 && my < 418) startGame();
      return;
    }

    // Touch left/right side moves, tap middle area shoots
    if (mx < W * 0.3) {
      gs.keys["ArrowLeft"] = true;
      gs.keys["ArrowRight"] = false;
    } else if (mx > W * 0.7) {
      gs.keys["ArrowRight"] = true;
      gs.keys["ArrowLeft"] = false;
    } else {
      shoot();
    }
  }, [startGame, shoot]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const gs = gsRef.current;
    if (gs.phase !== "playing") return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    const mx = (t.clientX - rect.left) * (W / rect.width);
    const my = (t.clientY - rect.top) * (H / rect.height);
    gs.mouse.x = mx;
    gs.mouse.y = my;
    if (mx < W * 0.3) {
      gs.keys["ArrowLeft"] = true;
      gs.keys["ArrowRight"] = false;
    } else if (mx > W * 0.7) {
      gs.keys["ArrowRight"] = true;
      gs.keys["ArrowLeft"] = false;
    } else {
      gs.keys["ArrowLeft"] = false;
      gs.keys["ArrowRight"] = false;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const gs = gsRef.current;
    gs.keys["ArrowLeft"] = false;
    gs.keys["ArrowRight"] = false;
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a2e",
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 3px #2a9010",
        }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            display: "block",
            maxHeight: "92vh",
            width: "auto",
            cursor: "crosshair",
            touchAction: "none",
            userSelect: "none",
          }}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>
    </div>
  );
}
