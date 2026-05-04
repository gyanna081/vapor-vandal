// coords.ts — Coordinate utility
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 14.1

import { RESIZE_DEBOUNCE_MS } from './constants';

// Module-level cache for viewport dimensions.
// Initialised lazily on first use so that test environments can stub
// window.innerWidth / window.innerHeight before the cache is populated.
let cachedWidth: number | undefined;
let cachedHeight: number | undefined;

function ensureCache(): void {
  if (cachedWidth === undefined) cachedWidth = window.innerWidth;
  if (cachedHeight === undefined) cachedHeight = window.innerHeight;
}

/**
 * Force the viewport cache to re-read from window.
 * Exported for use in tests that need to stub window dimensions after module load.
 */
export function resetCache(): void {
  cachedWidth = window.innerWidth;
  cachedHeight = window.innerHeight;
}

// Debounce helper
function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// Update the cached viewport dimensions
function updateCache(): void {
  cachedWidth = window.innerWidth;
  cachedHeight = window.innerHeight;
}


// Register debounced resize listener
window.addEventListener('resize', debounce(updateCache, RESIZE_DEBOUNCE_MS));

/**
 * Convert normalised MediaPipe coordinates to viewport pixel coordinates.
 *
 * @param normX   - Normalised x coordinate in [0, 1]
 * @param normY   - Normalised y coordinate in [0, 1]
 * @param mirrorX - When true, flips the x-axis to match the CSS-mirrored video feed
 * @returns       - { px, py } in viewport pixel space
 *
 * Postconditions: px ∈ [0, cachedWidth], py ∈ [0, cachedHeight]
 */
export function toPixel(
  normX: number,
  normY: number,
  mirrorX?: boolean,
): { px: number; py: number } {
  ensureCache();
  const px = mirrorX ? (1 - normX) * cachedWidth! : normX * cachedWidth!;
  const py = normY * cachedHeight!;
  return { px, py };
}

/**
 * Return the current cached viewport dimensions.
 * The cache is refreshed on window resize (debounced at RESIZE_DEBOUNCE_MS).
 */
export function viewportSize(): { width: number; height: number } {
  ensureCache();
  return { width: cachedWidth!, height: cachedHeight! };
}
