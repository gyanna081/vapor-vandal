// handTracker.test.ts — Tests for calcPinchDistance and isThumbBent

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calcPinchDistance, isThumbBent } from './handTracker';

const landmarkArb = fc.record({
  x: fc.float({ min: 0, max: 1, noNaN: true }),
  y: fc.float({ min: 0, max: 1, noNaN: true }),
});

describe('calcPinchDistance', () => {
  it('Property 4 — Symmetry: calcPinchDistance(L4, L8) === calcPinchDistance(L8, L4)', () => {
    fc.assert(
      fc.property(landmarkArb, landmarkArb, (L4, L8) => {
        const forward = calcPinchDistance(L4, L8);
        const backward = calcPinchDistance(L8, L4);
        expect(forward).toBeCloseTo(backward, 10);
      }),
    );
  });

  it('Property 5 — Non-Negativity: result is always >= 0', () => {
    fc.assert(
      fc.property(landmarkArb, landmarkArb, (L4, L8) => {
        const dist = calcPinchDistance(L4, L8);
        expect(dist).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

describe('isThumbBent', () => {
  it('returns true when thumb tip (L4) is close to thumb base (L2) — curled', () => {
    // L4 very close to L2 → curled
    expect(isThumbBent({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.51 })).toBe(true);
    expect(isThumbBent({ x: 0.3, y: 0.4 }, { x: 0.35, y: 0.42 })).toBe(true);
  });

  it('returns false when thumb tip (L4) is far from thumb base (L2) — extended', () => {
    // L4 far from L2 → extended
    expect(isThumbBent({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 })).toBe(false);
    expect(isThumbBent({ x: 0.3, y: 0.3 }, { x: 0.6, y: 0.5 })).toBe(false);
  });

  it('returns false just above the threshold', () => {
    // Distance = 0.13 > 0.12 → not bent
    expect(isThumbBent({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.63 })).toBe(false);
  });

  it('Property — result is always boolean and consistent with distance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (l2x, l2y, l4x, l4y) => {
          const L2 = { x: l2x, y: l2y };
          const L4 = { x: l4x, y: l4y };
          const result = isThumbBent(L2, L4);
          expect(typeof result).toBe('boolean');
          const dist = Math.sqrt((l4x - l2x) ** 2 + (l4y - l2y) ** 2);
          // If bent, distance must be < 0.12
          if (result) {
            expect(dist).toBeLessThan(0.12);
          }
          // If not bent, distance must be >= 0.12
          if (!result) {
            expect(dist).toBeGreaterThanOrEqual(0.12);
          }
        },
      ),
    );
  });
});
