export interface Point {
  x: number;
  y: number;
}

export interface Shard {
  polygon: Point[];
  texture: OffscreenCanvas;
  x: number;
  y: number;
  vx: number;
  vy: number;
  omega: number;
  angle: number;
  alpha: number;
  alive: boolean;
}

export interface LandmarkUpdatePayload {
  normX: number;
  normY: number;
  pinchDist: number;
}

export interface ShotFiredPayload {
  normX: number;
  normY: number;
}

export interface CameraReadyPayload {
  videoEl: HTMLVideoElement;
}

export interface ShardCleanupPayload {
  // empty
}

/** Payload for world-shatter: shot hit the background / video feed. */
export interface WorldShatterPayload {
  /** Viewport pixel x of the shot impact point. */
  originPx: number;
  /** Viewport pixel y of the shot impact point. */
  originPy: number;
}

// Augment WindowEventMap for typed Custom Events
declare global {
  interface WindowEventMap {
    'vv:camera-ready': CustomEvent<CameraReadyPayload>;
    'vv:landmark-update': CustomEvent<LandmarkUpdatePayload>;
    'vv:shot-fired': CustomEvent<ShotFiredPayload>;
    'vv:shard-cleanup-done': CustomEvent<ShardCleanupPayload>;
    'vv:tracker-error': CustomEvent<{ message: string }>;
    'vv:world-shatter': CustomEvent<WorldShatterPayload>;
  }
}

// ---------------------------------------------------------------------------
// Payload type guards
// Requirements: 12.5, 12.6, 12.7, 12.8
// ---------------------------------------------------------------------------

export function isCameraReadyPayload(v: unknown): v is CameraReadyPayload {
  return typeof v === 'object' && v !== null && 'videoEl' in v && (v as CameraReadyPayload).videoEl instanceof HTMLVideoElement;
}

export function isLandmarkUpdatePayload(v: unknown): v is LandmarkUpdatePayload {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as LandmarkUpdatePayload).normX === 'number' &&
    typeof (v as LandmarkUpdatePayload).normY === 'number' &&
    typeof (v as LandmarkUpdatePayload).pinchDist === 'number'
  );
}

export function isShotFiredPayload(v: unknown): v is ShotFiredPayload {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as ShotFiredPayload).normX === 'number' &&
    typeof (v as ShotFiredPayload).normY === 'number'
  );
}
