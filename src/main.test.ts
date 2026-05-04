// main.test.ts — Unit tests for main.ts shot lifecycle
// In world-shatter-only mode, every shot calls shatterWorld (not shatter).
// The only guard is: don't fire if elementFromPoint returns shard-canvas,
// crosshair, or xp-chrome (all pointer-events:none in production, but
// testable via mock).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ShotFiredPayload, LandmarkUpdatePayload } from './types';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing main
// ---------------------------------------------------------------------------

vi.mock('./shatterEngine', () => ({
  shatterEngine: {
    init: vi.fn(),
    shatter: vi.fn().mockResolvedValue(undefined),
    shatterWorld: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('./camera', () => ({
  camera: {
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  },
}));

vi.mock('./handTracker', () => ({
  handTracker: {
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  },
}));

vi.mock('./coords', () => ({
  toPixel: vi.fn().mockReturnValue({ px: 400, py: 300 }),
  viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
  resetCache: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { handleShotFired, handleLandmarkUpdate } from './main';
import { shatterEngine } from './shatterEngine';
import { toPixel } from './coords';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShotEvent(normX = 0.5, normY = 0.5): CustomEvent<ShotFiredPayload> {
  return new CustomEvent<ShotFiredPayload>('vv:shot-fired', { detail: { normX, normY } });
}

function makeLandmarkEvent(normX = 0.5, normY = 0.5): CustomEvent<LandmarkUpdatePayload> {
  return new CustomEvent<LandmarkUpdatePayload>('vv:landmark-update', {
    detail: { normX, normY, pinchDist: 0.1 },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }

  // Ensure required DOM elements exist
  for (const [id, tag] of [['webcam-feed', 'video'], ['shard-canvas', 'canvas'], ['crosshair', 'div']] as const) {
    if (!document.getElementById(id)) {
      const el = document.createElement(tag);
      el.id = id;
      document.body.appendChild(el);
    }
  }
});

afterEach(() => {
  document.querySelectorAll('[data-test-el]').forEach((el) => el.remove());
  document.body.classList.remove('shaking');
});

// ---------------------------------------------------------------------------
// World-shatter — always fires on any non-protected target
// ---------------------------------------------------------------------------

describe('World-shatter — fires on every valid shot', () => {
  it('calls shatterWorld when elementFromPoint returns the webcam element', () => {
    const webcamEl = document.getElementById('webcam-feed')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(webcamEl);

    handleShotFired(makeShotEvent());

    expect(shatterEngine.shatterWorld).toHaveBeenCalledTimes(1);
    expect(shatterEngine.shatterWorld).toHaveBeenCalledWith(webcamEl, 400, 300);
  });

  it('calls shatterWorld when elementFromPoint returns null (open background)', () => {
    // Default stub returns null — webcam-feed exists so shatterWorld fires
    // (no spy needed — beforeEach already stubs elementFromPoint to return null)
    handleShotFired(makeShotEvent());

    expect(shatterEngine.shatterWorld).toHaveBeenCalledTimes(1);
  });

  it('calls shatterWorld when elementFromPoint returns document.body', () => {
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.body);

    handleShotFired(makeShotEvent());

    expect(shatterEngine.shatterWorld).toHaveBeenCalledTimes(1);
  });

  it('calls shatterWorld multiple times — no re-shatter guard in world mode', () => {
    const webcamEl = document.getElementById('webcam-feed')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(webcamEl);

    handleShotFired(makeShotEvent());
    handleShotFired(makeShotEvent());
    handleShotFired(makeShotEvent());

    expect(shatterEngine.shatterWorld).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Protected overlay elements — shots must NOT fire
// ---------------------------------------------------------------------------

describe('Overlay immunity — protected elements block the shot', () => {
  it('does not call shatterWorld when elementFromPoint returns shard-canvas', () => {
    const shardCanvas = document.getElementById('shard-canvas')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(shardCanvas);

    handleShotFired(makeShotEvent());

    expect(shatterEngine.shatterWorld).not.toHaveBeenCalled();
  });

  it('does not call shatterWorld when elementFromPoint returns crosshair', () => {
    const crosshairEl = document.getElementById('crosshair')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(crosshairEl);

    handleShotFired(makeShotEvent());

    expect(shatterEngine.shatterWorld).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Crosshair HUD update
// ---------------------------------------------------------------------------

describe('handleLandmarkUpdate', () => {
  it('positions the crosshair using toPixel with mirrorX=true', () => {
    const crosshairEl = document.getElementById('crosshair') as HTMLDivElement;

    handleLandmarkUpdate(makeLandmarkEvent(0.5, 0.5));

    expect(toPixel).toHaveBeenCalledWith(0.5, 0.5, true);
    expect(crosshairEl.style.left).toBe('400px');
    expect(crosshairEl.style.top).toBe('300px');
  });

  it('updates crosshair position on each event', () => {
    const crosshairEl = document.getElementById('crosshair') as HTMLDivElement;

    vi.mocked(toPixel).mockReturnValueOnce({ px: 100, py: 200 });
    handleLandmarkUpdate(makeLandmarkEvent(0.1, 0.2));
    expect(crosshairEl.style.left).toBe('100px');
    expect(crosshairEl.style.top).toBe('200px');

    vi.mocked(toPixel).mockReturnValueOnce({ px: 900, py: 600 });
    handleLandmarkUpdate(makeLandmarkEvent(0.9, 0.6));
    expect(crosshairEl.style.left).toBe('900px');
    expect(crosshairEl.style.top).toBe('600px');
  });
});

// ---------------------------------------------------------------------------
// Screen-shake
// ---------------------------------------------------------------------------

describe('screen-shake on shot', () => {
  it('adds the shaking class to document.body on a valid shot', () => {
    const webcamEl = document.getElementById('webcam-feed')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(webcamEl);

    handleShotFired(makeShotEvent());

    expect(document.body.classList.contains('shaking')).toBe(true);
  });

  it('removes the shaking class after the shake duration elapses', () => {
    vi.useFakeTimers();

    const webcamEl = document.getElementById('webcam-feed')!;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(webcamEl);

    let rafCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });

    handleShotFired(makeShotEvent());
    expect(document.body.classList.contains('shaking')).toBe(true);

    if (rafCallback) (rafCallback as FrameRequestCallback)(performance.now() + 600);
    expect(document.body.classList.contains('shaking')).toBe(false);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
