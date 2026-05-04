// coords.test.ts — Property-based tests for coords.ts
// Uses vitest + fast-check
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 14.1, 14.2, 14.3

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { toPixel, viewportSize, resetCache } from './coords';

const MOCK_WIDTH = 1280;
const MOCK_HEIGHT = 720;

// Stub window dimensions and reset the module cache before any tests run.
// The module initialises its cache lazily, so stubbing before first call is sufficient.
beforeAll(() => {
  vi.stubGlobal('innerWidth', MOCK_WIDTH);
  vi.stubGlobal('innerHeight', MOCK_HEIGHT);
  // Force the module cache to pick up the stubbed values
  resetCache();
});

// Arbitrary for a normalised coordinate strictly within [0, 1].
// We use fc.integer to avoid floating-point values that exceed 1.0 due to
// IEEE 754 representation (e.g. 0.9375000596...).
// Dividing an integer in [0, 10000] by 10000 gives exact rationals in [0, 1].
const normArb = fc.integer({ min: 0, max: 10000 }).map((n) => n / 10000);

describe('coords.ts', () => {
  /**
   * Property 1: Mirror Symmetry
   * toPixel(normX, 0, true).px + toPixel(1 - normX, 0, true).px === window.innerWidth
   * Validates: Requirements 1.2, 14.2
   */
  it('Property 1 — Mirror Symmetry: mirrored pair sums to viewport width', () => {
    fc.assert(
      fc.property(normArb, (normX) => {
        const a = toPixel(normX, 0, true).px;
        const b = toPixel(1 - normX, 0, true).px;
        expect(a + b).toBeCloseTo(MOCK_WIDTH, 10);
      }),
    );
  });

  /**
   * Property 2: Pixel Bounds Invariant
   * px ∈ [0, innerWidth] and py ∈ [0, innerHeight] for all normX, normY ∈ [0, 1] and any mirrorX
   * Validates: Requirements 1.5, 14.3
   */
  it('Property 2 — Pixel Bounds Invariant: output is always within viewport bounds', () => {
    fc.assert(
      fc.property(normArb, normArb, fc.boolean(), (normX, normY, mirrorX) => {
        const { px, py } = toPixel(normX, normY, mirrorX);
        expect(px).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(MOCK_WIDTH);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(MOCK_HEIGHT);
      }),
    );
  });

  /**
   * Property 3: toPixel Purity
   * Identical inputs with the same cached viewport dimensions always return the same (px, py).
   * Validates: Requirements 14.1
   */
  it('Property 3 — Purity: identical inputs always produce identical outputs', () => {
    fc.assert(
      fc.property(normArb, normArb, fc.boolean(), (normX, normY, mirrorX) => {
        const first = toPixel(normX, normY, mirrorX);
        const second = toPixel(normX, normY, mirrorX);
        expect(first.px).toBe(second.px);
        expect(first.py).toBe(second.py);
      }),
    );
  });

  /**
   * Sanity check: viewportSize() returns the cached dimensions
   */
  it('viewportSize returns the cached viewport dimensions', () => {
    const { width, height } = viewportSize();
    expect(width).toBe(MOCK_WIDTH);
    expect(height).toBe(MOCK_HEIGHT);
  });
});
