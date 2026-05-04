// shatterEngine.ts
// Shattering logic ported from Wes Bos's website-shatter-shooter.html
// https://github.com/wesbos/hot-tips/blob/main/html-in-canvas/demos/wicg/website-shatter-shooter.html
//
// Key approach:
//   1. Keep a `sourceLayer` canvas — a clean snapshot of the video frame at impact time
//   2. Shards are rectangular crops from sourceLayer (drawImage with sx,sy,sw,sh)
//   3. Holes punch through using destination-out composite operation
//   4. Physics uses real dt (seconds) — framerate-independent
//   5. Sparks are orange particles that fly out on impact

import type { Shard, Point } from './types';
import { OFFSCREEN_MARGIN } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RectShard {
  // Source rect in sourceLayer coords
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  // Current world position (centre of shard)
  x: number;
  y: number;
  // Velocity (px/s)
  vx: number;
  vy: number;
  // Rotation (radians) and angular velocity (rad/s)
  rot: number;
  vr: number;
  // Opacity
  alpha: number;
  settled: boolean;
}

interface Hole {
  x: number;
  y: number;
  r: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

// ---------------------------------------------------------------------------
// Constants (matching Wes's values, tuned for full-viewport)
// ---------------------------------------------------------------------------

const GRAVITY = 1400;          // px/s²
const MAX_HOLES = 60;
const MAX_SHARDS = 300;
const SHARDS_PER_SHOT = 10;
const SPARKS_PER_SHOT = 14;
const SHARD_MIN_SIZE = 60;     // px
const SHARD_MAX_SIZE = 140;    // px

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

// sourceLayer holds a clean snapshot of the video at the moment of impact
let _sourceLayer: OffscreenCanvas | null = null;
let _sourceCtx: OffscreenCanvasRenderingContext2D | null = null;

let _holes: Hole[] = [];
let _shards: RectShard[] = [];
let _sparks: Spark[] = [];

let _rafId: number | null = null;
let _lastTime = performance.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Snapshot the current video frame into the sourceLayer canvas,
 * accounting for CSS mirror (scaleX(-1)) and object-fit: cover.
 */
function snapshotVideoToSource(videoEl: HTMLVideoElement): void {
  if (!_sourceLayer || !_sourceCtx || !_canvas) return;

  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  const vpW = _canvas.width;
  const vpH = _canvas.height;

  _sourceCtx.clearRect(0, 0, vpW, vpH);

  if (vw === 0 || vh === 0) {
    // Video not ready — fill grey so shards are still visible
    _sourceCtx.fillStyle = '#555';
    _sourceCtx.fillRect(0, 0, vpW, vpH);
    return;
  }

  // object-fit: cover scale
  const scale = Math.max(vpW / vw, vpH / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const offsetX = (vpW - renderedW) / 2;
  const offsetY = (vpH - renderedH) / 2;

  // Draw mirrored to match CSS scaleX(-1) on the video element
  _sourceCtx.save();
  _sourceCtx.translate(vpW, 0);
  _sourceCtx.scale(-1, 1);
  _sourceCtx.drawImage(videoEl, offsetX, offsetY, renderedW, renderedH);
  _sourceCtx.restore();
}

// ---------------------------------------------------------------------------
// Physics update (dt in seconds)
// ---------------------------------------------------------------------------

function updatePhysics(dt: number): void {
  if (!_canvas) return;
  const groundY = _canvas.height + OFFSCREEN_MARGIN;

  for (const shard of _shards) {
    if (shard.settled) continue;
    shard.vy += GRAVITY * dt;
    shard.x  += shard.vx * dt;
    shard.y  += shard.vy * dt;
    shard.rot += shard.vr * dt;
    shard.alpha = Math.max(0, shard.alpha - 0.004);

    // Bounce off the bottom (or just settle when off-screen)
    if (shard.y + shard.sh * 0.5 >= groundY) {
      shard.y = groundY - shard.sh * 0.5;
      shard.vy *= -0.22;
      shard.vx *= 0.75;
      shard.vr *= 0.68;
      if (Math.abs(shard.vy) < 30 && Math.abs(shard.vx) < 30) {
        shard.vy = 0;
        shard.vx = 0;
        shard.vr = 0;
        shard.settled = true;
      }
    }
  }

  // Remove fully faded or off-screen shards
  for (let i = _shards.length - 1; i >= 0; i--) {
    const s = _shards[i];
    if (s.alpha <= 0 || s.x < -SHARD_MAX_SIZE || s.x > (_canvas?.width ?? 0) + SHARD_MAX_SIZE) {
      _shards.splice(i, 1);
    }
  }

  for (let i = _sparks.length - 1; i >= 0; i--) {
    const s = _sparks[i];
    s.life -= dt;
    if (s.life <= 0) {
      _sparks.splice(i, 1);
      continue;
    }
    s.vy += GRAVITY * 0.4 * dt;
    s.x  += s.vx * dt;
    s.y  += s.vy * dt;
  }
}

// ---------------------------------------------------------------------------
// Draw functions
// ---------------------------------------------------------------------------

function drawHoleWarps(): void {
  if (!_ctx || !_sourceLayer) return;
  const ringCount = 6;

  for (const hole of _holes) {
    const warpOuter = hole.r * 2.6;
    for (let i = 0; i < ringCount; i++) {
      const outerFrac = i / ringCount;
      const innerFrac = (i + 1) / ringCount;
      const ringOuter = warpOuter - outerFrac * (warpOuter - hole.r);
      const ringInner = warpOuter - innerFrac * (warpOuter - hole.r);
      const pull = innerFrac * innerFrac * 0.2;
      const scale = 1 - pull;

      _ctx.save();
      _ctx.beginPath();
      _ctx.arc(hole.x, hole.y, ringOuter, 0, Math.PI * 2);
      _ctx.arc(hole.x, hole.y, ringInner, 0, Math.PI * 2, true);
      _ctx.clip();
      _ctx.translate(hole.x, hole.y);
      _ctx.scale(scale, scale);
      _ctx.translate(-hole.x, -hole.y);
      _ctx.drawImage(_sourceLayer, 0, 0);
      _ctx.restore();
    }

    // Shadow around hole
    const shadow = _ctx.createRadialGradient(hole.x, hole.y, hole.r * 0.2, hole.x, hole.y, hole.r * 2.2);
    shadow.addColorStop(0, 'rgba(0,0,0,0.7)');
    shadow.addColorStop(0.45, 'rgba(0,0,0,0.25)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    _ctx.fillStyle = shadow;
    _ctx.beginPath();
    _ctx.arc(hole.x, hole.y, hole.r * 2.2, 0, Math.PI * 2);
    _ctx.fill();
  }
}

function drawHoles(): void {
  if (!_ctx) return;

  // Punch transparent holes using destination-out
  _ctx.save();
  _ctx.globalCompositeOperation = 'destination-out';
  _ctx.fillStyle = '#000';
  for (const hole of _holes) {
    const jag = hole.r * 0.2;
    _ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = hole.r
        + Math.sin(a * 6.0 + hole.x * 0.003) * jag
        + Math.cos(a * 3.7 + hole.y * 0.004) * jag * 0.6;
      const x = hole.x + Math.cos(a) * rr;
      const y = hole.y + Math.sin(a) * rr;
      if (i === 0) _ctx.moveTo(x, y);
      else _ctx.lineTo(x, y);
    }
    _ctx.closePath();
    _ctx.fill();
  }
  _ctx.restore();

  // White jagged edge around each hole
  for (const hole of _holes) {
    const jag = hole.r * 0.2;
    _ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const rr = hole.r * 1.04
        + Math.sin(a * 6.0 + hole.x * 0.003) * jag
        + Math.cos(a * 3.7 + hole.y * 0.004) * jag * 0.6;
      const x = hole.x + Math.cos(a) * rr;
      const y = hole.y + Math.sin(a) * rr;
      if (i === 0) _ctx.moveTo(x, y);
      else _ctx.lineTo(x, y);
    }
    _ctx.closePath();
    _ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    _ctx.lineWidth = 2;
    _ctx.stroke();
  }
}

function drawShards(): void {
  if (!_ctx || !_sourceLayer) return;

  for (const shard of _shards) {
    _ctx.save();
    _ctx.globalAlpha = shard.alpha;
    _ctx.translate(shard.x, shard.y);
    _ctx.rotate(shard.rot);
    // Draw the rectangular crop from the source snapshot
    _ctx.drawImage(
      _sourceLayer,
      shard.sx, shard.sy, shard.sw, shard.sh,
      -shard.sw * 0.5, -shard.sh * 0.5, shard.sw, shard.sh,
    );
    // White border on each shard — gives the "broken glass" look
    _ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    _ctx.lineWidth = 1.5;
    _ctx.strokeRect(-shard.sw * 0.5, -shard.sh * 0.5, shard.sw, shard.sh);
    _ctx.restore();
  }
}

function drawSparks(): void {
  if (!_ctx) return;

  for (const s of _sparks) {
    const t = s.life / s.maxLife;
    const r = Math.round(252 - t * 20);
    const g = Math.round(152 + t * 100);
    const b = Math.round(56 * (1 - t));
    _ctx.fillStyle = `rgba(${r},${g},${b},${0.25 + t * 0.75})`;
    _ctx.beginPath();
    _ctx.arc(s.x, s.y, 2 + t * 3, 0, Math.PI * 2);
    _ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Main render loop
// ---------------------------------------------------------------------------

function renderLoop(): void {
  if (!_ctx || !_canvas || !_sourceLayer) {
    _rafId = null;
    return;
  }

  const now = performance.now();
  const dt = Math.min((now - _lastTime) / 1000, 0.05); // cap at 50ms
  _lastTime = now;

  updatePhysics(dt);

  // Clear the overlay canvas — keep it transparent so the live video shows through
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  // Draw effects on top of the live video feed
  // NOTE: do NOT draw _sourceLayer as background here — that would freeze the camera.
  // _sourceLayer is only used as the texture source for shards and hole warps.
  drawHoleWarps();
  drawHoles();
  drawShards();
  drawSparks();

  // Keep looping while there's anything to animate
  if (_holes.length > 0 || _shards.length > 0 || _sparks.length > 0) {
    _rafId = requestAnimationFrame(renderLoop);
  } else {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    window.dispatchEvent(new CustomEvent('vv:shard-cleanup-done', { detail: {} }));
    _rafId = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const shatterEngine = {
  init(canvasEl: HTMLCanvasElement): void {
    _canvas = canvasEl;
    _ctx = canvasEl.getContext('2d');
    canvasEl.style.pointerEvents = 'none';
    canvasEl.style.zIndex = '100';
    canvasEl.width = window.innerWidth;
    canvasEl.height = window.innerHeight;

    // Create the source layer at the same size
    _sourceLayer = new OffscreenCanvas(canvasEl.width, canvasEl.height);
    _sourceCtx = _sourceLayer.getContext('2d') as OffscreenCanvasRenderingContext2D | null;

    window.addEventListener('resize', () => {
      if (!_canvas || !_sourceLayer) return;
      _canvas.width = window.innerWidth;
      _canvas.height = window.innerHeight;
      _sourceLayer = new OffscreenCanvas(_canvas.width, _canvas.height);
      _sourceCtx = _sourceLayer.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    });
  },

  /**
   * Fire a shot at (originPx, originPy) using the live video feed as the texture source.
   */
  shatterWorld(videoEl: HTMLVideoElement, originPx: number, originPy: number): void {
    if (!_canvas || !_ctx || !_sourceLayer) return;

    // Snapshot the current video frame into sourceLayer
    snapshotVideoToSource(videoEl);

    const radius = rand(28, 48);

    // Add a hole at the impact point
    _holes.push({ x: originPx, y: originPy, r: radius });
    if (_holes.length > MAX_HOLES) _holes.shift();

    // Spawn rectangular shards radiating outward (Wes's approach)
    for (let i = 0; i < SHARDS_PER_SHOT; i++) {
      const ang = rand(0, Math.PI * 2);
      const dist = Math.sqrt(Math.random()) * radius;
      const cx = originPx + Math.cos(ang) * dist;
      const cy = originPy + Math.sin(ang) * dist;
      const sw = rand(SHARD_MIN_SIZE, SHARD_MAX_SIZE);
      const sh = rand(SHARD_MIN_SIZE, SHARD_MAX_SIZE);

      // Source rect clamped to canvas bounds
      const sx = Math.max(0, Math.min(_sourceLayer.width - sw, cx - sw * 0.5));
      const sy = Math.max(0, Math.min(_sourceLayer.height - sh, cy - sh * 0.5));

      // Direction from impact centre
      const dirX = cx - originPx;
      const dirY = cy - originPy;
      const len = Math.hypot(dirX, dirY) || 1;
      const nX = dirX / len;
      const nY = dirY / len;

      _shards.push({
        sx, sy, sw, sh,
        x: sx + sw * 0.5,
        y: sy + sh * 0.5,
        vx: nX * rand(250, 750) + rand(-80, 80),
        vy: nY * rand(200, 650) - rand(300, 700),
        rot: rand(-0.3, 0.3),
        vr: rand(-6, 6),
        alpha: 1.0,
        settled: false,
      });
    }

    if (_shards.length > MAX_SHARDS) {
      _shards.splice(0, _shards.length - MAX_SHARDS);
    }

    // Spawn sparks
    for (let i = 0; i < SPARKS_PER_SHOT; i++) {
      const ang = rand(0, Math.PI * 2);
      const speed = rand(250, 800);
      const life = rand(0.2, 0.5);
      _sparks.push({
        x: originPx,
        y: originPy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life,
        maxLife: life,
      });
    }

    // Start the render loop if not already running
    if (_rafId === null) {
      _lastTime = performance.now();
      _rafId = requestAnimationFrame(renderLoop);
    }
  },

  // Kept for interface compatibility
  async shatter(_el: HTMLElement, originPx: number, originPy: number): Promise<void> {
    const videoEl = document.getElementById('webcam-feed') as HTMLVideoElement | null;
    if (videoEl) this.shatterWorld(videoEl, originPx, originPy);
  },

  destroy(): void {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _holes = [];
    _shards = [];
    _sparks = [];
    if (_ctx && _canvas) {
      _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }
  },
};

// ---------------------------------------------------------------------------
// Exports for testing (keep existing test surface working)
// ---------------------------------------------------------------------------

export function generateShards(
  _snapshot: OffscreenCanvas,
  boundingRect: { x: number; y: number; width: number; height: number },
  originPx: number,
  originPy: number,
): Shard[] {
  // Thin wrapper used only by unit tests — returns minimal Shard objects
  const shards: Shard[] = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const cx = originPx + Math.cos(ang) * (boundingRect.width / 4);
    const cy = originPy + Math.sin(ang) * (boundingRect.height / 4);
    const dx = cx - originPx;
    const dy = cy - originPy;
    const dist = Math.max(Math.hypot(dx, dy), 1);
    const speed = 8;
    shards.push({
      polygon: [
        { x: cx - 20, y: cy - 20 },
        { x: cx + 20, y: cy - 20 },
        { x: cx,      y: cy + 20 },
      ] as Point[],
      texture: new OffscreenCanvas(1, 1),
      x: cx, y: cy,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed - 3,
      omega: (Math.random() * 2 - 1) * 0.15,
      angle: 0,
      alpha: 1.0,
      alive: true,
    });
  }
  return shards;
}

export function physicsTickAllShards(
  shards: Shard[],
  _ctx: CanvasRenderingContext2D,
  viewportHeight: number,
): Shard[] {
  const alive: Shard[] = [];
  for (const s of shards) {
    s.vy += 0.35;
    s.x  += s.vx;
    s.y  += s.vy;
    s.angle += s.omega;
    s.alpha -= 0.008;
    if (s.y > viewportHeight + 120 || s.alpha <= 0) {
      s.alive = false;
      continue;
    }
    alive.push(s);
  }
  return alive;
}
