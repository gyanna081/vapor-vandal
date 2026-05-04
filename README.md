# VaporVandal

An experimental browser experience where you shatter the world with your hands, and to help me understand how mediapipe works.

Point your **index finger** to aim. **Curl your thumb** to fire.

Built with MediaPipe Hands, Canvas 2D API, and Vite + TypeScript.

![VaporVandal](https://img.shields.io/badge/built%20with-MediaPipe-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue) ![Vite](https://img.shields.io/badge/Vite-5.0-purple)

---

## How it works

- **Webcam feed** fills the entire screen as the background
- **MediaPipe Hands** tracks your hand in real time
- **Raise your index finger** to aim — the crosshair follows your fingertip
- **Curl your thumb** to shoot — the screen shatters at the crosshair position
- On impact: a region of the camera feed explodes into physics-driven shards with a bullet hole effect and spark particles

## Tech stack

| Layer | Tech |
|---|---|
| Hand tracking | `@mediapipe/hands` (WASM, CDN) |
| Shard physics | Canvas 2D API — `drawImage`, `destination-out`, `clip` |
| Bundler | Vite + TypeScript |
| Tests | Vitest + fast-check (property-based) |

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — allow camera access when prompted.

> Requires HTTPS or localhost (browser security requirement for `getUserMedia`).

## Controls

| Gesture | Action |
|---|---|
| Raise index finger | Crosshair appears and tracks your finger |
| Curl thumb inward | Fire — shatters the camera feed at the crosshair position |

## Project structure

```
src/
  main.ts          — orchestrator, boot sequence, shot lifecycle
  handTracker.ts   — MediaPipe integration, gesture detection, smoothing
  shatterEngine.ts — Canvas 2D shard physics (holes, shards, sparks)
  camera.ts        — getUserMedia, mirror, error handling
  coords.ts        — normalised → viewport pixel coordinate conversion
  constants.ts     — tunable physics and gesture constants
  types.ts         — shared TypeScript interfaces
```

## Running tests

```bash
npm test
```

25 tests covering coordinate math, gesture detection, and physics properties using `fast-check` property-based testing.

## Attribution

Shard physics approach inspired by [Wes Bos's website-shatter-shooter](https://github.com/wesbos/hot-tips/blob/main/html-in-canvas/demos/wicg/website-shatter-shooter.html).

Inspired by the TikTok of [funwithcomputervision.com](https://www.funwithcomputervision.com/).
