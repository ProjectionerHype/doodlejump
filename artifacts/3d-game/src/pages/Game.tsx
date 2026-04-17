import { useEffect, useRef, useState, useCallback } from "react";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 40;
const PLATFORM_WIDTH = 70;
const PLATFORM_HEIGHT = 14;
const GRAVITY = 0.35;
const JUMP_FORCE = -13;
const PLAYER_SPEED = 5;
const PLATFORM_COUNT = 14;
const SCROLL_THRESHOLD = CANVAS_HEIGHT / 3;

type PlatformType = "normal" | "moving" | "breakable" | "spring" | "cloud";

interface Platform {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: PlatformType;
  vx?: number;
  broken?: boolean;
  bounceAnim?: number;
  opacity?: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  vx: number;
  width: number;
  height: number;
  alive: boolean;
  phase: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkle: number;
  speed: number;
}

interface GameState {
  playerX: number;
  playerY: number;
  playerVX: number;
  playerVY: number;
  playerFacing: number;
  playerSquish: number;
  platforms: Platform[];
  enemies: Enemy[];
  particles: Particle[];
  score: number;
  highScore: number;
  scrollY: number;
  phase: "menu" | "playing" | "dead";
  stars: Star[];
  platformIdCounter: number;
  enemyIdCounter: number;
  particleIdCounter: number;
  keys: Record<string, boolean>;
  cameraY: number;
  bgHue: number;
  jumpCombo: number;
  lastJumpTime: number;
  animFrame: number;
  touchStartX: number | null;
}

function makePlatform(
  id: number,
  x: number,
  y: number,
  score: number
): Platform {
  const rand = Math.random();
  let type: PlatformType = "normal";
  const difficulty = Math.min(score / 3000, 1);

  if (rand < 0.08 * difficulty) type = "spring";
  else if (rand < 0.2 * difficulty) type = "breakable";
  else if (rand < 0.35 * difficulty) type = "moving";
  else if (rand < 0.42 * difficulty) type = "cloud";

  const width = type === "spring" ? 60 : type === "cloud" ? 80 : PLATFORM_WIDTH;

  return {
    id,
    x: Math.random() * (CANVAS_WIDTH - width),
    y,
    width,
    height: PLATFORM_HEIGHT,
    type,
    vx: type === "moving" ? (Math.random() > 0.5 ? 1.5 : -1.5) : 0,
    broken: false,
    bounceAnim: 0,
    opacity: 1,
  };
}

function makeStar(): Star {
  return {
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    size: Math.random() * 2 + 0.5,
    twinkle: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.5 + 0.1,
  };
}

function initGame(savedHighScore: number): GameState {
  const platforms: Platform[] = [];
  platforms.push({
    id: 0,
    x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2,
    y: CANVAS_HEIGHT - 80,
    width: PLATFORM_WIDTH,
    height: PLATFORM_HEIGHT,
    type: "normal",
    vx: 0,
    broken: false,
    bounceAnim: 0,
    opacity: 1,
  });

  for (let i = 1; i < PLATFORM_COUNT; i++) {
    platforms.push(
      makePlatform(i + 1, 0, CANVAS_HEIGHT - 80 - i * 50, 0)
    );
  }

  return {
    playerX: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
    playerY: CANVAS_HEIGHT - 80 - PLAYER_HEIGHT - 2,
    playerVX: 0,
    playerVY: 0,
    playerFacing: 1,
    playerSquish: 1,
    platforms,
    enemies: [],
    particles: [],
    score: 0,
    highScore: savedHighScore,
    scrollY: 0,
    phase: "menu",
    stars: Array.from({ length: 60 }, makeStar),
    platformIdCounter: PLATFORM_COUNT + 10,
    enemyIdCounter: 0,
    particleIdCounter: 0,
    keys: {},
    cameraY: 0,
    bgHue: 220,
    jumpCombo: 0,
    lastJumpTime: 0,
    animFrame: 0,
    touchStartX: null,
  };
}

function spawnParticles(
  state: GameState,
  x: number,
  y: number,
  color: string,
  count = 8
) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = Math.random() * 3 + 1;
    state.particles.push({
      id: state.particleIdCounter++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      maxLife: 1,
      color,
      size: Math.random() * 6 + 3,
    });
  }
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initGame(0));
  const animRef = useRef<number>(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayPhase, setDisplayPhase] = useState<"menu" | "playing" | "dead">("menu");
  const [displayHighScore, setDisplayHighScore] = useState(0);

  const savedHighScore = useRef(
    parseInt(localStorage.getItem("doodle_highscore") || "0", 10)
  );

  const startGame = useCallback(() => {
    stateRef.current = initGame(savedHighScore.current);
    stateRef.current.phase = "playing";
    setDisplayPhase("playing");
    setDisplayScore(0);
  }, []);

  useEffect(() => {
    stateRef.current = initGame(savedHighScore.current);
    setDisplayHighScore(savedHighScore.current);

    const handleKey = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = e.type === "keydown";
      if (
        (e.code === "Space" || e.code === "Enter") &&
        stateRef.current.phase === "menu"
      ) {
        startGame();
      }
      if (e.code === "Space" && stateRef.current.phase === "dead") {
        startGame();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [startGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function drawRoundRect(
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    }

    function drawPlayer(state: GameState) {
      const px = state.playerX;
      const py = state.playerY - state.cameraY;
      const squish = state.playerSquish;
      const facing = state.playerFacing;
      const anim = Math.sin(state.animFrame * 0.15) * 2;

      ctx.save();
      ctx.translate(px + PLAYER_WIDTH / 2, py + PLAYER_HEIGHT / 2);
      ctx.scale(facing, squish);

      const bodyGrad = ctx.createRadialGradient(-4, -6, 2, 0, 0, 22);
      bodyGrad.addColorStop(0, "#7effa0");
      bodyGrad.addColorStop(0.5, "#2dba55");
      bodyGrad.addColorStop(1, "#1a7a35");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 2, 18, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(6, -4, 7, 6, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.ellipse(8, -4, 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(10, -5.5, 1.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ff7070";
      ctx.beginPath();
      ctx.ellipse(3, 2, 5, 3, 0, 0, Math.PI);
      ctx.fill();

      ctx.fillStyle = "#e8f5a0";
      ctx.beginPath();
      ctx.ellipse(
        -5 + anim * 0.3,
        12 + Math.abs(anim) * 0.3,
        6,
        4,
        -0.4,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(
        7 - anim * 0.3,
        12 + Math.abs(anim) * 0.3,
        6,
        4,
        0.4,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.restore();
    }

    function getPlatformColor(type: PlatformType): [string, string, string] {
      switch (type) {
        case "normal":
          return ["#5ceb8a", "#28c55e", "#1a8a42"];
        case "moving":
          return ["#7db4ff", "#3a7de6", "#1a50c0"];
        case "breakable":
          return ["#ffb35c", "#e87a1a", "#a04800"];
        case "spring":
          return ["#ff6b9e", "#e0306e", "#8a0038"];
        case "cloud":
          return ["#d0e8ff", "#9fc8f5", "#6090c0"];
      }
    }

    function drawPlatform(p: Platform, cameraY: number) {
      const py = p.y - cameraY;
      if (py > CANVAS_HEIGHT + 20 || py < -20) return;

      const [light, mid, dark] = getPlatformColor(p.type);
      const bouncePct = p.bounceAnim ? Math.abs(Math.sin(p.bounceAnim * 0.3)) : 0;
      const scaleY = 1 + bouncePct * 0.4;
      const scaleX = 1 - bouncePct * 0.1;

      ctx.save();
      ctx.globalAlpha = p.opacity ?? 1;
      ctx.translate(p.x + p.width / 2, py + p.height / 2);
      ctx.scale(scaleX, scaleY);

      const grad = ctx.createLinearGradient(
        -p.width / 2,
        -p.height / 2,
        -p.width / 2,
        p.height / 2
      );
      grad.addColorStop(0, light);
      grad.addColorStop(0.5, mid);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-p.width / 2, -p.height / 2, p.width, p.height, 7);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.roundRect(-p.width / 2 + 4, -p.height / 2 + 2, p.width - 8, 4, 3);
      ctx.fill();

      if (p.type === "spring") {
        ctx.fillStyle = "#ffe000";
        ctx.beginPath();
        ctx.roundRect(-8, -p.height / 2 - 14, 16, 14, 4);
        ctx.fill();
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath();
        ctx.roundRect(-5, -p.height / 2 - 14, 10, 5, 3);
        ctx.fill();
      }

      if (p.type === "cloud") {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.ellipse(0, -p.height / 2 - 8, 18, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-16, -p.height / 2 - 5, 12, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(16, -p.height / 2 - 5, 12, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    function drawEnemy(e: Enemy, cameraY: number) {
      const ey = e.y - cameraY;
      if (ey < -30 || ey > CANVAS_HEIGHT + 30) return;

      ctx.save();
      ctx.translate(e.x + e.width / 2, ey + e.height / 2);

      const phase = e.phase;
      const bodyGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 18);
      bodyGrad.addColorStop(0, "#ff8888");
      bodyGrad.addColorStop(0.5, "#dd2222");
      bodyGrad.addColorStop(1, "#880000");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.ellipse(-6, -4, 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(6, -4, 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-5, -5, 1.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(7, -5, 1.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffaa00";
      ctx.save();
      ctx.rotate(Math.sin(phase * 0.05) * 0.3);
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.quadraticCurveTo(-28, -12, -22, -20);
      ctx.quadraticCurveTo(-12, -28, -8, -16);
      ctx.quadraticCurveTo(-6, -12, -18, -2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.rotate(-Math.sin(phase * 0.05) * 0.3);
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.quadraticCurveTo(28, -12, 22, -20);
      ctx.quadraticCurveTo(12, -28, 8, -16);
      ctx.quadraticCurveTo(6, -12, 18, -2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    function drawBackground(state: GameState) {
      const hue = (state.bgHue + state.scrollY * 0.01) % 360;
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      grad.addColorStop(0, `hsl(${hue}, 70%, 8%)`);
      grad.addColorStop(0.4, `hsl(${(hue + 20) % 360}, 65%, 12%)`);
      grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 60%, 18%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      state.stars.forEach((star) => {
        const twinkle = 0.5 + 0.5 * Math.sin(star.twinkle + state.animFrame * 0.03);
        ctx.globalAlpha = 0.3 + 0.7 * twinkle;
        ctx.fillStyle = `hsl(${(hue + 60) % 360}, 80%, 90%)`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    function drawParticles(state: GameState) {
      state.particles.forEach((p) => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y - state.cameraY,
          p.size * alpha,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    function drawHUD(state: GameState) {
      ctx.save();

      ctx.fillStyle = "rgba(0,0,0,0.4)";
      drawRoundRect(8, 8, 120, 38, 10);

      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      ctx.fillStyle = "#aaffcc";
      ctx.textAlign = "left";
      ctx.fillText("SCORE", 16, 22);
      ctx.font = "bold 18px 'Segoe UI', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(state.score.toLocaleString(), 16, 40);

      ctx.fillStyle = "rgba(0,0,0,0.4)";
      drawRoundRect(CANVAS_WIDTH - 128, 8, 120, 38, 10);
      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      ctx.fillStyle = "#ffd700";
      ctx.textAlign = "right";
      ctx.fillText("BEST", CANVAS_WIDTH - 16, 22);
      ctx.font = "bold 18px 'Segoe UI', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(state.highScore.toLocaleString(), CANVAS_WIDTH - 16, 40);

      ctx.restore();
    }

    function drawMenu(state: GameState) {
      ctx.save();

      const t = state.animFrame;

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      drawRoundRect(30, 100, CANVAS_WIDTH - 60, 360, 24);

      const titleGrad = ctx.createLinearGradient(0, 130, 0, 180);
      titleGrad.addColorStop(0, "#00ffcc");
      titleGrad.addColorStop(0.5, "#7effa0");
      titleGrad.addColorStop(1, "#00ddff");
      ctx.fillStyle = titleGrad;
      ctx.font = "bold 54px 'Segoe UI', Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#00ffcc";
      ctx.shadowBlur = 20 + 10 * Math.sin(t * 0.05);
      ctx.fillText("DOODLE", CANVAS_WIDTH / 2, 175);
      ctx.fillText("JUMP", CANVAS_WIDTH / 2, 230);
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillText("~ Ultra Edition ~", CANVAS_WIDTH / 2, 255);

      const pulseAlpha = 0.7 + 0.3 * Math.sin(t * 0.08);
      ctx.globalAlpha = pulseAlpha;
      const btnGrad = ctx.createLinearGradient(
        CANVAS_WIDTH / 2 - 90,
        290,
        CANVAS_WIDTH / 2 + 90,
        330
      );
      btnGrad.addColorStop(0, "#2dba55");
      btnGrad.addColorStop(1, "#00aaff");
      ctx.fillStyle = btnGrad;
      drawRoundRect(CANVAS_WIDTH / 2 - 90, 285, 180, 48, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px 'Segoe UI', sans-serif";
      ctx.fillText("PLAY NOW", CANVAS_WIDTH / 2, 315);

      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillStyle = "rgba(200,220,255,0.8)";
      ctx.fillText("← → or A/D to move", CANVAS_WIDTH / 2, 360);
      ctx.fillText("Touch left/right to move on mobile", CANVAS_WIDTH / 2, 378);
      ctx.fillText("Jump on platforms!", CANVAS_WIDTH / 2, 396);

      if (state.highScore > 0) {
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 15px 'Segoe UI', sans-serif";
        ctx.fillText(
          `Best: ${state.highScore.toLocaleString()}`,
          CANVAS_WIDTH / 2,
          425
        );
      }

      ctx.restore();
    }

    function drawGameOver(state: GameState) {
      ctx.save();

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      drawRoundRect(30, 140, CANVAS_WIDTH - 60, 300, 24);

      ctx.textAlign = "center";
      ctx.font = "bold 48px 'Segoe UI', Impact, sans-serif";
      const deathGrad = ctx.createLinearGradient(0, 150, 0, 200);
      deathGrad.addColorStop(0, "#ff6b6b");
      deathGrad.addColorStop(1, "#ff0044");
      ctx.fillStyle = deathGrad;
      ctx.shadowColor = "#ff0044";
      ctx.shadowBlur = 15;
      ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, 200);
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#ffffff";
      ctx.font = "22px 'Segoe UI', sans-serif";
      ctx.fillText(`Score: ${state.score.toLocaleString()}`, CANVAS_WIDTH / 2, 245);

      if (state.score >= state.highScore) {
        const t = state.animFrame;
        ctx.fillStyle = `hsl(${(t * 3) % 360}, 100%, 65%)`;
        ctx.font = "bold 16px 'Segoe UI', sans-serif";
        ctx.fillText("NEW HIGH SCORE!", CANVAS_WIDTH / 2, 275);
      } else {
        ctx.fillStyle = "#ffd700";
        ctx.font = "16px 'Segoe UI', sans-serif";
        ctx.fillText(`Best: ${state.highScore.toLocaleString()}`, CANVAS_WIDTH / 2, 275);
      }

      const t = state.animFrame;
      const pulseAlpha = 0.7 + 0.3 * Math.sin(t * 0.08);
      ctx.globalAlpha = pulseAlpha;
      const btnGrad = ctx.createLinearGradient(
        CANVAS_WIDTH / 2 - 80,
        310,
        CANVAS_WIDTH / 2 + 80,
        350
      );
      btnGrad.addColorStop(0, "#7b2dba");
      btnGrad.addColorStop(1, "#e030a0");
      ctx.fillStyle = btnGrad;
      drawRoundRect(CANVAS_WIDTH / 2 - 80, 305, 160, 48, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px 'Segoe UI', sans-serif";
      ctx.fillText("PLAY AGAIN", CANVAS_WIDTH / 2, 335);

      ctx.fillStyle = "rgba(200,200,255,0.7)";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText("Space / Click to restart", CANVAS_WIDTH / 2, 380);

      ctx.restore();
    }

    function update(state: GameState) {
      if (state.phase !== "playing") {
        state.animFrame++;
        return;
      }

      state.animFrame++;

      const keys = state.keys;
      const left =
        keys["ArrowLeft"] ||
        keys["KeyA"] ||
        keys["Left"];
      const right =
        keys["ArrowRight"] ||
        keys["KeyD"] ||
        keys["Right"];

      if (left) {
        state.playerVX -= 1;
        state.playerFacing = -1;
      } else if (right) {
        state.playerVX += 1;
        state.playerFacing = 1;
      } else {
        state.playerVX *= 0.85;
      }

      state.playerVX = Math.max(-PLAYER_SPEED * 1.5, Math.min(PLAYER_SPEED * 1.5, state.playerVX));

      state.playerX += state.playerVX;

      if (state.playerX > CANVAS_WIDTH) state.playerX = -PLAYER_WIDTH;
      if (state.playerX + PLAYER_WIDTH < 0) state.playerX = CANVAS_WIDTH;

      state.playerVY += GRAVITY;
      state.playerY += state.playerVY;

      state.playerSquish = 1 + state.playerVY * 0.01;

      const screenPlayerY = state.playerY - state.cameraY;
      if (screenPlayerY < SCROLL_THRESHOLD) {
        const scrollAmount = SCROLL_THRESHOLD - screenPlayerY;
        state.cameraY -= scrollAmount;
        state.scrollY += scrollAmount;
        state.score = Math.max(state.score, Math.floor(state.scrollY / 5));

        state.stars.forEach((star) => {
          star.y += scrollAmount * star.speed * 0.4;
          if (star.y > CANVAS_HEIGHT) {
            star.y = 0;
            star.x = Math.random() * CANVAS_WIDTH;
          }
        });

        state.bgHue = (220 + state.scrollY * 0.015) % 360;
      }

      if (state.playerVY > 0) {
        for (const p of state.platforms) {
          if (p.broken) continue;
          const px = state.playerX;
          const py = state.playerY;
          const prevPY = py - state.playerVY;

          const onTop =
            px + PLAYER_WIDTH > p.x + 4 &&
            px < p.x + p.width - 4 &&
            prevPY + PLAYER_HEIGHT <= p.y + 4 &&
            py + PLAYER_HEIGHT >= p.y &&
            py + PLAYER_HEIGHT <= p.y + p.height + 8;

          if (onTop) {
            const now = Date.now();
            if (now - state.lastJumpTime < 600) state.jumpCombo++;
            else state.jumpCombo = 0;
            state.lastJumpTime = now;

            if (p.type === "breakable") {
              p.broken = true;
              spawnParticles(
                state,
                p.x + p.width / 2,
                p.y,
                "#ff9020",
                12
              );
            } else if (p.type === "spring") {
              state.playerVY = JUMP_FORCE * 1.7;
              p.bounceAnim = 10;
              spawnParticles(
                state,
                p.x + p.width / 2,
                p.y,
                "#ff6bbb",
                8
              );
            } else {
              state.playerVY = JUMP_FORCE;
              p.bounceAnim = 8;
              spawnParticles(
                state,
                p.x + p.width / 2,
                p.y,
                p.type === "moving" ? "#4a9fff" : "#5ceb8a",
                4
              );
            }

            if (p.type !== "cloud") {
              break;
            }
          }
        }
      }

      state.platforms.forEach((p) => {
        if (p.bounceAnim && p.bounceAnim > 0) p.bounceAnim--;
        if (p.type === "moving" && p.vx !== undefined) {
          p.x += p.vx;
          if (p.x <= 0 || p.x + p.width >= CANVAS_WIDTH) p.vx! *= -1;
        }
        if (p.broken) {
          p.opacity = Math.max(0, (p.opacity ?? 1) - 0.05);
        }
      });

      state.platforms = state.platforms.filter(
        (p) => p.y - state.cameraY < CANVAS_HEIGHT + 20 && !(p.broken && (p.opacity ?? 1) <= 0)
      );

      const highestPlatformY = Math.min(
        ...state.platforms.filter((p) => !p.broken).map((p) => p.y)
      );

      const minPlatformsOnScreen = state.platforms.filter(
        (p) => p.y - state.cameraY < CANVAS_HEIGHT
      ).length;

      while (
        minPlatformsOnScreen < PLATFORM_COUNT ||
        highestPlatformY - state.cameraY > 50
      ) {
        const topY =
          state.platforms.length === 0
            ? state.cameraY
            : Math.min(...state.platforms.map((p) => p.y));
        const gap = 40 + Math.random() * 30;
        const newP = makePlatform(
          state.platformIdCounter++,
          0,
          topY - gap,
          state.score
        );
        state.platforms.push(newP);
        break;
      }

      if (
        state.score > 500 &&
        state.enemies.length < Math.floor(state.score / 1500) + 1 &&
        Math.random() < 0.003
      ) {
        const spawnY = state.cameraY - 50;
        state.enemies.push({
          id: state.enemyIdCounter++,
          x: Math.random() * (CANVAS_WIDTH - 40),
          y: spawnY,
          vx: Math.random() > 0.5 ? 1.5 : -1.5,
          width: 36,
          height: 32,
          alive: true,
          phase: 0,
        });
      }

      state.enemies.forEach((e) => {
        if (!e.alive) return;
        e.x += e.vx;
        e.phase++;
        if (e.x <= 0 || e.x + e.width >= CANVAS_WIDTH) e.vx *= -1;

        const ey = e.y - state.cameraY;
        if (ey > CANVAS_HEIGHT + 50) {
          e.alive = false;
          return;
        }

        const playerCollide =
          state.playerX + 6 < e.x + e.width - 6 &&
          state.playerX + PLAYER_WIDTH - 6 > e.x + 6 &&
          state.playerY + 6 < e.y + e.height - 6 &&
          state.playerY + PLAYER_HEIGHT - 6 > e.y + 6;

        if (playerCollide) {
          if (state.playerVY > 0 && state.playerY + PLAYER_HEIGHT < e.y + e.height - 10) {
            e.alive = false;
            state.playerVY = JUMP_FORCE;
            state.score += 100;
            spawnParticles(state, e.x + e.width / 2, e.y + e.height / 2, "#ff4444", 14);
          } else {
            state.phase = "dead";
            if (state.score > savedHighScore.current) {
              savedHighScore.current = state.score;
              localStorage.setItem("doodle_highscore", String(state.score));
              state.highScore = state.score;
            }
          }
        }
      });
      state.enemies = state.enemies.filter((e) => e.alive);

      state.particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life -= 0.02;
      });
      state.particles = state.particles.filter((p) => p.life > 0);

      const screenPY = state.playerY - state.cameraY;
      if (screenPY > CANVAS_HEIGHT + 80) {
        state.phase = "dead";
        if (state.score > savedHighScore.current) {
          savedHighScore.current = state.score;
          localStorage.setItem("doodle_highscore", String(state.score));
          state.highScore = state.score;
        }
      }
    }

    function render(state: GameState) {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      drawBackground(state);

      state.platforms.forEach((p) => drawPlatform(p, state.cameraY));

      drawParticles(state);

      state.enemies.forEach((e) => drawEnemy(e, state.cameraY));

      if (state.phase === "playing" || state.phase === "dead") {
        drawPlayer(state);
        drawHUD(state);
      }

      if (state.phase === "menu") {
        drawPlayer(state);
        drawMenu(state);
      }

      if (state.phase === "dead") {
        drawGameOver(state);
      }
    }

    function loop() {
      const state = stateRef.current;
      update(state);
      render(state);

      if (state.phase === "playing") {
        setDisplayScore(state.score);
      }
      if (state.phase === "dead") {
        setDisplayPhase("dead");
        setDisplayScore(state.score);
        setDisplayHighScore(state.highScore);
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

      if (state.phase === "menu") {
        if (mx > CANVAS_WIDTH / 2 - 90 && mx < CANVAS_WIDTH / 2 + 90 && my > 285 && my < 333) {
          startGame();
        }
      }
      if (state.phase === "dead") {
        if (mx > CANVAS_WIDTH / 2 - 80 && mx < CANVAS_WIDTH / 2 + 80 && my > 305 && my < 353) {
          startGame();
        }
      }
    },
    [startGame]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    stateRef.current.touchStartX = e.touches[0].clientX;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.touches[0].clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const my = (e.touches[0].clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    const state = stateRef.current;
    if (state.phase === "menu") {
      if (mx > CANVAS_WIDTH / 2 - 90 && mx < CANVAS_WIDTH / 2 + 90 && my > 285 && my < 333) {
        startGame();
      }
    }
    if (state.phase === "dead") {
      if (mx > CANVAS_WIDTH / 2 - 80 && mx < CANVAS_WIDTH / 2 + 80 && my > 305 && my < 353) {
        startGame();
      }
    }
  }, [startGame]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    if (state.phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touchX = e.touches[0].clientX;
    const canvasX = (touchX - rect.left) * (CANVAS_WIDTH / rect.width);

    if (canvasX < CANVAS_WIDTH / 2) {
      state.keys["ArrowLeft"] = true;
      state.keys["ArrowRight"] = false;
      state.playerFacing = -1;
    } else {
      state.keys["ArrowRight"] = true;
      state.keys["ArrowLeft"] = false;
      state.playerFacing = 1;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const state = stateRef.current;
    state.keys["ArrowLeft"] = false;
    state.keys["ArrowRight"] = false;
    state.touchStartX = null;
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{
        background: "linear-gradient(135deg, #0a0a1a 0%, #0d1a2e 50%, #050d1a 100%)",
      }}
    >
      <div
        style={{
          position: "relative",
          boxShadow: "0 0 60px rgba(0,255,180,0.18), 0 0 120px rgba(0,100,255,0.10)",
          borderRadius: "18px",
          overflow: "hidden",
          border: "2px solid rgba(0,255,180,0.15)",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{
            display: "block",
            maxHeight: "90vh",
            width: "auto",
            cursor: "pointer",
            userSelect: "none",
            touchAction: "none",
          }}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      <div
        style={{
          marginTop: "18px",
          display: "flex",
          gap: "24px",
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              color: "rgba(160,220,255,0.7)",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "2px",
              fontFamily: "sans-serif",
            }}
          >
            Score
          </div>
          <div
            style={{
              color: "#fff",
              fontSize: "22px",
              fontWeight: "bold",
              fontFamily: "sans-serif",
            }}
          >
            {displayScore.toLocaleString()}
          </div>
        </div>
        <div
          style={{
            width: "1px",
            height: "40px",
            background: "rgba(255,255,255,0.15)",
          }}
        />
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              color: "#ffd700",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "2px",
              fontFamily: "sans-serif",
            }}
          >
            Best
          </div>
          <div
            style={{
              color: "#ffd700",
              fontSize: "22px",
              fontWeight: "bold",
              fontFamily: "sans-serif",
            }}
          >
            {displayHighScore.toLocaleString()}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "14px",
          color: "rgba(180,200,255,0.4)",
          fontSize: "12px",
          fontFamily: "sans-serif",
          textAlign: "center",
          letterSpacing: "1px",
        }}
      >
        ← → arrow keys or A/D · Touch left/right half to move
      </div>
    </div>
  );
}
