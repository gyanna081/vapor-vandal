// handTracker.ts — Gesture recognition
// Crosshair: follows Landmark 8 (index finger tip) — smooth, stable aiming
// Fire trigger: thumb curls — L4 (thumb tip) gets close to L2 (thumb MCP base joint)

import type { LandmarkUpdatePayload, ShotFiredPayload } from './types';
import { SHOT_COOLDOWN_MS } from './constants';

// ---------------------------------------------------------------------------
// Pure utilities — exported for unit testing
// ---------------------------------------------------------------------------

export function calcPinchDistance(
  L4: { x: number; y: number },
  L8: { x: number; y: number },
): number {
  const dx = L8.x - L4.x;
  const dy = L8.y - L4.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Detect a thumb curl (fire gesture).
 * Measures distance between L4 (thumb tip) and L2 (thumb MCP base joint).
 * When thumb curls inward, L4 moves close to L2.
 * Threshold: 0.12 normalised units.
 */
export function isThumbBent(
  L2: { x: number; y: number },
  L4: { x: number; y: number },
): boolean {
  const dx = L4.x - L2.x;
  const dy = L4.y - L2.y;
  return Math.sqrt(dx * dx + dy * dy) < 0.12;
}

// ---------------------------------------------------------------------------
// Smoothing — exponential moving average applied to crosshair position
// Alpha = 0.35: higher = more responsive, lower = smoother
// ---------------------------------------------------------------------------

const SMOOTH_ALPHA = 0.35;
let smoothX = -1; // -1 = not initialised yet
let smoothY = -1;

function smoothLandmark(rawX: number, rawY: number): { x: number; y: number } {
  if (smoothX < 0) {
    // First frame — snap to position immediately
    smoothX = rawX;
    smoothY = rawY;
  } else {
    smoothX = smoothX + SMOOTH_ALPHA * (rawX - smoothX);
    smoothY = smoothY + SMOOTH_ALPHA * (rawY - smoothY);
  }
  return { x: smoothX, y: smoothY };
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let rafHandle: number | null = null;
let lastShotTime = -Infinity;
let isThumbDown = false;

// ---------------------------------------------------------------------------
// HandTrackerModule
// ---------------------------------------------------------------------------

async function init(videoEl: HTMLVideoElement): Promise<void> {
  let HandsClass: any;

  try {
    const mp = await import('@mediapipe/hands');
    HandsClass = mp.Hands ?? (mp as any).default?.Hands ?? (mp as any).default;
  } catch (err: any) {
    const message: string = err?.message ?? 'Failed to load MediaPipe Hands';
    window.dispatchEvent(new CustomEvent('vv:tracker-error', { detail: { message } }));
    return;
  }

  let hands: any;
  try {
    hands = new HandsClass({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.75,
      minTrackingConfidence: 0.75, // higher = more stable, less jitter
    });

    hands.onResults((results: any) => {
      const landmarks = results?.multiHandLandmarks;
      if (!landmarks || landmarks.length === 0) {
        isThumbDown = false;
        smoothX = -1; // reset smoothing so next appearance snaps
        smoothY = -1;
        window.dispatchEvent(new CustomEvent('vv:hand-lost'));
        return;
      }

      const lm = landmarks[0] as Array<{ x: number; y: number; z: number }>;

      // Index finger tip — crosshair position
      const L8 = lm[8];
      // Thumb landmarks — fire detection only
      const L2 = lm[2]; // thumb MCP base joint
      const L4 = lm[4]; // thumb tip

      // Apply smoothing to index finger tip position
      const smoothed = smoothLandmark(L8.x, L8.y);

      const pinchDist = calcPinchDistance(L4, L8);

      // Emit smoothed crosshair position
      const payload: LandmarkUpdatePayload = {
        normX: smoothed.x,
        normY: smoothed.y,
        pinchDist,
      };
      window.dispatchEvent(
        new CustomEvent<LandmarkUpdatePayload>('vv:landmark-update', { detail: payload }),
      );

      const now = performance.now();
      const bent = isThumbBent(L2, L4);

      if (bent) {
        if (!isThumbDown && now - lastShotTime > SHOT_COOLDOWN_MS) {
          isThumbDown = true;
          lastShotTime = now;

          // Fire at the smoothed index finger position (where crosshair is)
          const shotPayload: ShotFiredPayload = {
            normX: smoothed.x,
            normY: smoothed.y,
          };
          window.dispatchEvent(
            new CustomEvent<ShotFiredPayload>('vv:shot-fired', { detail: shotPayload }),
          );
        }
      } else {
        isThumbDown = false;
      }
    });
  } catch (err: any) {
    const message: string = err?.message ?? 'Failed to initialise MediaPipe Hands';
    window.dispatchEvent(new CustomEvent('vv:tracker-error', { detail: { message } }));
    return;
  }

  const loop = async () => {
    try {
      await hands.send({ image: videoEl });
    } catch {
      // ignore per-frame errors
    }
    rafHandle = requestAnimationFrame(loop);
  };

  rafHandle = requestAnimationFrame(loop);
}

function destroy(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  lastShotTime = -Infinity;
  isThumbDown = false;
  smoothX = -1;
  smoothY = -1;
}

export const handTracker = { init, destroy };
