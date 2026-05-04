// camera.ts — Webcam acquisition
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 12.1, 12.5

import type { CameraReadyPayload } from './types';

interface CameraModule {
  init(constraints?: MediaStreamConstraints): Promise<HTMLVideoElement>;
  destroy(): void;
}

let _stream: MediaStream | null = null;
let _video: HTMLVideoElement | null = null;

/**
 * Get or create the <video id="webcam-feed"> element.
 */
function getOrCreateVideoElement(): HTMLVideoElement {
  let video = document.getElementById('webcam-feed') as HTMLVideoElement | null;
  if (!video) {
    video = document.createElement('video');
    video.id = 'webcam-feed';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    document.body.appendChild(video);
  }
  return video;
}

/**
 * Render a permission-error overlay with a Retry button.
 * Requirement 2.7, 2.8
 */
function showPermissionError(retryFn: () => void): void {
  // Remove any existing error overlay first
  const existing = document.getElementById('camera-error');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'camera-error';
  overlay.style.cssText = [
    'position: fixed',
    'inset: 0',
    'background: rgba(0, 0, 0, 0.85)',
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'z-index: 9999',
    'color: #fff',
    'font-family: monospace',
    'text-align: center',
    'padding: 2rem',
  ].join('; ');

  const message = document.createElement('p');
  message.textContent = 'Camera permission is required to use VaporVandal. Please allow camera access and try again.';
  message.style.cssText = 'font-size: 1.1rem; margin-bottom: 1.5rem; max-width: 480px; line-height: 1.6;';

  const retryBtn = document.createElement('button');
  retryBtn.textContent = 'Retry';
  retryBtn.style.cssText = [
    'padding: 0.6rem 1.8rem',
    'font-size: 1rem',
    'font-family: monospace',
    'background: transparent',
    'color: #fff',
    'border: 2px solid #fff',
    'cursor: pointer',
    'letter-spacing: 0.1em',
  ].join('; ');

  retryBtn.addEventListener('click', () => {
    overlay.remove();
    retryFn();
  });

  overlay.appendChild(message);
  overlay.appendChild(retryBtn);
  document.body.appendChild(overlay);
}

export const camera: CameraModule = {
  /**
   * Request camera access, attach stream to <video id="webcam-feed">,
   * await metadata load, then dispatch vv:camera-ready.
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 12.1, 12.5
   */
  async init(constraints?: MediaStreamConstraints): Promise<HTMLVideoElement> {
    try {
      const mergedConstraints: MediaStreamConstraints = {
        video: { facingMode: 'user' },
        ...constraints,
      };

      // Requirement 2.1 — acquire camera stream
      const stream = await navigator.mediaDevices.getUserMedia(mergedConstraints);
      _stream = stream;

      // Requirement 2.2 — get or create video element
      const video = getOrCreateVideoElement();
      _video = video;

      // Requirement 2.3 — attach stream
      video.srcObject = stream;

      // Requirement 2.4 — await metadata before proceeding
      await new Promise<void>((resolve) => {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve();
        } else {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        }
      });

      // Requirement 2.5 — apply mirror + cover styles
      video.style.transform = 'scaleX(-1)';
      video.style.objectFit = 'cover';

      // Requirement 2.6 — start playback
      await video.play();

      // Requirement 12.1, 12.5 — dispatch typed vv:camera-ready event
      const payload: CameraReadyPayload = { videoEl: video };
      window.dispatchEvent(
        new CustomEvent<CameraReadyPayload>('vv:camera-ready', { detail: payload })
      );

      return video;
    } catch (err) {
      // Requirement 2.7 — handle NotAllowedError (and other errors)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showPermissionError(() => this.init(constraints));
      } else {
        // For other errors, still show the overlay so the user can retry
        showPermissionError(() => this.init(constraints));
        console.error('[camera] getUserMedia failed:', err);
      }
      // Do NOT dispatch vv:camera-ready on error (Requirement 2.8)
      throw err;
    }
  },

  /**
   * Stop all media tracks and detach the stream from the video element.
   * Requirements: 12.1
   */
  destroy(): void {
    if (_stream) {
      _stream.getTracks().forEach((track) => track.stop());
      _stream = null;
    }
    if (_video) {
      _video.srcObject = null;
      _video = null;
    }
  },
};
