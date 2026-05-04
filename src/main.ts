// main.ts — Orchestrator

import { camera } from './camera';
import { handTracker } from './handTracker';
import { shatterEngine } from './shatterEngine';
import { toPixel } from './coords';
import type { LandmarkUpdatePayload, ShotFiredPayload, WorldShatterPayload } from './types';

// ---------------------------------------------------------------------------
// DOM element references
// ---------------------------------------------------------------------------

function getCrosshairEl(): HTMLDivElement | null {
  return document.getElementById('crosshair') as HTMLDivElement | null;
}

function getShardCanvasEl(): HTMLCanvasElement | null {
  return document.getElementById('shard-canvas') as HTMLCanvasElement | null;
}

function getWebcamEl(): HTMLVideoElement | null {
  return document.getElementById('webcam-feed') as HTMLVideoElement | null;
}

// ---------------------------------------------------------------------------
// Status bar helpers
// ---------------------------------------------------------------------------

let shotCount = 0;

function setStatus(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateHandStatus(pinchDist: number): void {
  setStatus('status-hand', 'HAND: LOCKED');
  // Show thumb bend readiness — lower pinchDist = closer to firing
  const pct = Math.max(0, Math.min(100, Math.round((1 - pinchDist / 0.1) * 100)));
  setStatus('status-thumb', `THUMB: ${pct}%`);
}

function resetHandStatus(): void {
  setStatus('status-hand', 'HAND: --');
  setStatus('status-thumb', 'THUMB: --');
}

// ---------------------------------------------------------------------------
// Screen-shake via rAF
// ---------------------------------------------------------------------------

let shakeRafId: number | null = null;
let shakeStartTime = 0;
const SHAKE_DURATION_MS = 400;

function triggerScreenShake(): void {
  if (shakeRafId !== null) {
    cancelAnimationFrame(shakeRafId);
    document.body.classList.remove('shaking');
  }
  shakeStartTime = performance.now();
  document.body.classList.add('shaking');

  const tick = (now: number) => {
    if (now - shakeStartTime >= SHAKE_DURATION_MS) {
      document.body.classList.remove('shaking');
      shakeRafId = null;
      return;
    }
    shakeRafId = requestAnimationFrame(tick);
  };
  shakeRafId = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Crosshair HUD update
// ---------------------------------------------------------------------------

export function handleLandmarkUpdate(event: CustomEvent<LandmarkUpdatePayload>): void {
  const { normX, normY, pinchDist } = event.detail;
  const { px, py } = toPixel(normX, normY, true);
  const el = getCrosshairEl();
  if (el) {
    el.style.left = px + 'px';
    el.style.top = py + 'px';
  }
  updateHandStatus(pinchDist);
}

// ---------------------------------------------------------------------------
// Shot lifecycle — always world-shatter (no DOM targets in the scene)
// ---------------------------------------------------------------------------

export function handleShotFired(event: CustomEvent<ShotFiredPayload>): void {
  const { normX, normY } = event.detail;
  const { px, py } = toPixel(normX, normY, true);

  const webcamEl = getWebcamEl();
  const shardCanvas = document.getElementById('shard-canvas');
  const crosshair = document.getElementById('crosshair');
  const xpChrome = document.getElementById('xp-chrome');

  // Check what's under the shot point
  const target = document.elementFromPoint(px, py) as HTMLElement | null;

  // These elements are all pointer-events:none so elementFromPoint should
  // return the video or body. Either way we world-shatter.
  const isProtected = target === shardCanvas || target === crosshair || target === xpChrome;
  if (isProtected) return;

  // Always shatter the world — the camera feed is the entire scene
  triggerScreenShake();
  shotCount++;
  setStatus('status-shots', `SHOTS: ${shotCount}`);

  if (webcamEl) {
    const worldPayload: WorldShatterPayload = { originPx: px, originPy: py };
    window.dispatchEvent(
      new CustomEvent<WorldShatterPayload>('vv:world-shatter', { detail: worldPayload }),
    );
    shatterEngine.shatterWorld(webcamEl, px, py);
  }
}

// ---------------------------------------------------------------------------
// Retry on capture failure
// ---------------------------------------------------------------------------

function handleShatterCaptureFailed(event: Event): void {
  const el = (event as CustomEvent<{ el: HTMLElement }>).detail?.el;
  if (el) {
    // no shatteredSet needed in world-shatter-only mode
    console.warn('[main] capture failed for', el);
  }
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

export function stop(): void {
  camera.destroy();
  handTracker.destroy();
  shatterEngine.destroy();
  if (shakeRafId !== null) {
    cancelAnimationFrame(shakeRafId);
    shakeRafId = null;
  }
}

function boot(): void {
  window.addEventListener('vv:landmark-update', handleLandmarkUpdate as EventListener);
  window.addEventListener('vv:shot-fired', handleShotFired as EventListener);
  window.addEventListener('vv:shatter-capture-failed', handleShatterCaptureFailed);

  // Reset hand status when tracker loses the hand
  window.addEventListener('vv:tracker-error', () => resetHandStatus());
  window.addEventListener('vv:hand-lost', () => resetHandStatus());

  camera.init().catch((err) => {
    console.error('[main] camera.init() failed:', err);
  });

  window.addEventListener('vv:camera-ready', async (event) => {
    const { videoEl } = event.detail;
    setStatus('status-ready', '● READY');
    try {
      await handTracker.init(videoEl);
      const canvasEl = getShardCanvasEl();
      if (canvasEl) {
        shatterEngine.init(canvasEl);
      }
    } catch (err) {
      console.error('[main] handTracker.init() failed:', err);
      setStatus('status-ready', '○ ERROR');
    }
  }, { once: true });
}

document.addEventListener('DOMContentLoaded', boot);
