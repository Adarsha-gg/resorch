# Spatial Handshake MVP

Day 1/2 implementation of the markerless spatial handshake plan:

- Vite + TypeScript client with a Three.js WebXR AR scene.
- Four-letter room code UI for pairing two browsers.
- Socket.io signaling server for room join and WebRTC offer/answer/ICE relay.
- WebRTC data channels for descriptor payloads and pose transforms.
- Binary feature payload codec, descriptor matching, RANSAC, and a lightweight rigid transform solver.

## Run

Install dependencies are already split by app:

```bash
cd server
npm run dev
```

```bash
cd client
VITE_SIGNALING_URL=http://localhost:3001 npm run dev -- --host 0.0.0.0
```

For LAN WebXR testing, generate local certificates and pass them to both processes:

```bash
SIGNALING_HTTPS_KEY=./localhost-key.pem SIGNALING_HTTPS_CERT=./localhost.pem npm run dev
VITE_HTTPS_KEY=./localhost-key.pem VITE_HTTPS_CERT=./localhost.pem VITE_SIGNALING_URL=https://192.168.x.x:3001 npm run dev
```

Open the client URL on two devices with the same `?room=ABCD` code. Click **Join Room** on both. Once the data channels open, click **Capture Features** on each device to capture a camera frame, extract patch descriptors, exchange the binary feature payload, and solve `T_AB`.

## Notes

Chrome Android WebXR camera access and depth sensing still need the Origin Trial/token flow described in `PLAN.md`. The current feature extraction path uses real camera frames with a local corner/patch descriptor extractor and uses XR pose/depth when the browser exposes them. If camera capture fails, the app falls back to synthetic descriptors so the networking path remains testable. The next accuracy step is replacing `createImageFeatures()` with SuperPoint ONNX inference.
