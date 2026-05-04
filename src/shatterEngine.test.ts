// shatterEngine.test.ts — Property-based tests for shatterEngine.ts
// Uses vitest + fast-check
// Validates: Requirements 5.5, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { generateShards, physicsTickAllShards } from './shatterEngine';
import { OMEGA_MAX, GRAVITY, SHARD_FADE_RATE, OFFSCREEN_MARGIN } from './constants';

// ---------------------------------------------------------------------------
// Mock OffscreenCanvas — jsdom does not support it
// ---------------------------------------------------------------------------

beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        clip: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        fillRect: () => {},
      };
    }
  } as unknown as typeof OffscreenCanvas;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock OffscreenCanvas for use as a texture. */
function makeTexture(w = 200, h = 100): OffscreenCanvas {
  return new OffscreenCanvas(w, h);
}

/** Create a minimal mock CanvasRenderingContext2D. */
function makeMockCtx(canvasWidth = 1280, canvasHeight = 720): CanvasRenderingContext2D {
  const canvas = {
    width: canvasWidth,
    height: canvasHeight,
  } as HTMLCanvasElement;

  return {
    canvas,
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    drawImage: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    clip: () => {},
    get globalAlpha() { return 1; },
    set globalAlpha(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
}

/** Bounding rect arbitrary with positive width and height. */
const boundingRectArb = fc.record({
  x: fc.integer({ min: 0, max: 500 }),
  y: fc.integer({ min: 0, max: 500 }),
  width: fc.integer({ min: 10, max: 400 }),
  height: fc.integer({ min: 10, max: 300 }),
});

// ---------------------------------------------------------------------------
// Property 7 — Shard Initial State Invariant
// ---------------------------------------------------------------------------

describe('generateShards', () => {
  /**
   * Property 7: Shard Initial State Invariant
   * Every generated shard has alpha === 1.0, alive === true, and omega ∈ [-OMEGA_MAX, OMEGA_MAX].
   * Validates: Requirements 5.7, 5.8
   */
  it('Property 7 — Initial State Invariant: alpha=1, alive=true, omega in bounds', () => {
    fc.assert(
      fc.property(boundingRectArb, (rect) => {
        const texture = makeTexture(rect.width, rect.height);
        const shards = generateShards(texture, rect, rect.x + rect.width / 2, rect.y + rect.height / 2);

        for (const shard of shards) {
          expect(shard.alpha).toBe(1.0);
          expect(shard.alive).toBe(true);
          expect(shard.omega).toBeGreaterThanOrEqual(-OMEGA_MAX);
          expect(shard.omega).toBeLessThanOrEqual(OMEGA_MAX);
        }
      }),
    );
  });

  /**
   * Property 8: Shard Velocity Direction
   * Shards should have velocity pointing away from the origin.
   * For any shard, the dot product of velocity with (centroid - origin) should be positive.
   * Validates: Requirements 5.5
   */
  it('Property 8 — Velocity Direction: velocity points away from origin', () => {
    const rect = { x: 0, y: 0, width: 400, height: 400 };
    const texture = makeTexture(rect.width, rect.height);
    const originPx = 200;
    const originPy = 200;

    let allPointingAway = true;
    for (let run = 0; run < 10; run++) {
      const shards = generateShards(texture, rect, originPx, originPy);
      for (const shard of shards) {
        const dx = shard.x - originPx;
        const dy = shard.y - originPy;
        // Only check shards that are clearly not at the origin
        if (Math.hypot(dx, dy) < 5) continue;
        const dot = shard.vx * dx + shard.vy * dy;
        // dot > 0 means velocity has a component pointing away from origin
        // (before upward bias is applied to vy)
        if (dot <= 0) {
          allPointingAway = false;
        }
      }
    }
    expect(allPointingAway).toBe(true);
  });

  /**
   * Property 9: Shard Generation Liveness
   * generateShards produces at least one shard for any bounding rect with positive width and height.
   * Validates: Requirements 5.9
   */
  it('Property 9 — Liveness: at least one shard is produced for any valid bounding rect', () => {
    fc.assert(
      fc.property(boundingRectArb, (rect) => {
        const texture = makeTexture(rect.width, rect.height);
        const shards = generateShards(texture, rect, rect.x + rect.width / 2, rect.y + rect.height / 2);
        expect(shards.length).toBeGreaterThan(0);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10 — Physics Tick Integration Correctness
// ---------------------------------------------------------------------------

describe('physicsTickAllShards', () => {
  /**
   * Property 10: Physics Tick Integration Correctness
   * After one tick: vy_new = vy + GRAVITY, y_new = y + vy_new, x_new = x + vx,
   * angle_new = angle + omega, alpha_new = alpha - SHARD_FADE_RATE.
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4
   */
  it('Property 10 — Integration Correctness: Euler integration matches formula', () => {
    const VIEWPORT_HEIGHT = 720;

    // Generate shard states that will survive the tick (not culled).
    // fc.float requires 32-bit float bounds — use Math.fround for non-integer constants.
    const shardArb = fc.record({
      x: fc.float({ min: 0, max: 1000, noNaN: true }),
      y: fc.float({ min: 0, max: 100, noNaN: true }), // well within viewport
      vx: fc.float({ min: -10, max: 10, noNaN: true }),
      vy: fc.float({ min: -10, max: 5, noNaN: true }),
      omega: fc.float({ min: Math.fround(-OMEGA_MAX), max: Math.fround(OMEGA_MAX), noNaN: true }),
      angle: fc.float({ min: Math.fround(-Math.PI), max: Math.fround(Math.PI), noNaN: true }),
      alpha: fc.float({ min: 0.5, max: 1.0, noNaN: true }), // high enough to survive
    });

    fc.assert(
      fc.property(shardArb, (state) => {
        const texture = makeTexture();
        const snapshot = makeTexture(1280, 720);
        const shard = {
          polygon: [],
          texture,
          snapshot,
          cx: state.x,
          cy: state.y,
          x: state.x,
          y: state.y,
          vx: state.vx,
          vy: state.vy,
          omega: state.omega,
          angle: state.angle,
          alpha: state.alpha,
          alive: true,
        };

        // Capture expected values before tick
        const expectedVy = state.vy + GRAVITY;
        const expectedY = state.y + expectedVy;
        const expectedX = state.x + state.vx;
        const expectedAngle = state.angle + state.omega;
        const expectedAlpha = state.alpha - SHARD_FADE_RATE;

        const ctx = makeMockCtx();
        const result = physicsTickAllShards([shard], ctx, VIEWPORT_HEIGHT);

        // Shard should survive (alpha > 0 and y within viewport)
        expect(result.length).toBe(1);
        const s = result[0];

        expect(s.vy).toBeCloseTo(expectedVy, 10);
        expect(s.y).toBeCloseTo(expectedY, 10);
        expect(s.x).toBeCloseTo(expectedX, 10);
        expect(s.angle).toBeCloseTo(expectedAngle, 10);
        expect(s.alpha).toBeCloseTo(expectedAlpha, 10);
      }),
    );
  });

  /**
   * Property 11: Shard Cull Completeness
   * Any shard with y > viewportHeight + OFFSCREEN_MARGIN OR alpha <= 0 is absent from the returned array.
   * Validates: Requirements 6.5, 6.6
   */
  it('Property 11 — Cull Completeness: dead shards are removed from the returned array', () => {
    const VIEWPORT_HEIGHT = 720;

    // Arbitrary for shards that should be culled
    const culledShardArb = fc.oneof(
      // Culled by y position: y is already past the margin before the tick
      // After tick: y += vy + GRAVITY. We set y high enough that even with
      // negative vy it will still be > viewportHeight + OFFSCREEN_MARGIN.
      fc.record({
        y: fc.float({ min: VIEWPORT_HEIGHT + OFFSCREEN_MARGIN + 20, max: VIEWPORT_HEIGHT + OFFSCREEN_MARGIN + 500, noNaN: true }),
        alpha: fc.float({ min: 0.5, max: 1.0, noNaN: true }),
        vy: fc.float({ min: 0, max: 5, noNaN: true }), // non-negative so y only increases
      }),
      // Culled by alpha: alpha is so low that after subtracting SHARD_FADE_RATE it will be <= 0
      // Use max = SHARD_FADE_RATE * 0.5 to avoid IEEE 754 edge cases where
      // fround(SHARD_FADE_RATE) - SHARD_FADE_RATE > 0 due to float precision.
      fc.record({
        y: fc.float({ min: 0, max: 100, noNaN: true }),
        alpha: fc.float({ min: 0, max: Math.fround(SHARD_FADE_RATE * 0.5), noNaN: true }),
        vy: fc.float({ min: -5, max: 5, noNaN: true }),
      }),
    );

    fc.assert(
      fc.property(culledShardArb, (state) => {
        const texture = makeTexture();
        const snapshot = makeTexture(1280, 720);
        const shard = {
          polygon: [],
          texture,
          snapshot,
          cx: 100,
          cy: state.y,
          x: 100,
          y: state.y,
          vx: 0,
          vy: state.vy,
          omega: 0,
          angle: 0,
          alpha: state.alpha,
          alive: true,
        };

        const ctx = makeMockCtx();
        const result = physicsTickAllShards([shard], ctx, VIEWPORT_HEIGHT);

        // The shard must not appear in the result
        expect(result.length).toBe(0);
      }),
    );
  });
});
