# Spatial Handshake MVP — Implementation Plan

**Project:** Spatial DNS Protocol (SDP) — Day 1 demo
**Goal:** Two devices in the same room agree on a shared 3D coordinate system over P2P WebRTC, with no cloud. A virtual cube appears in the same physical spot for both users.
**Timeline:** 14 days
**Target devices:** Android Chrome (Pixel 6+, Galaxy S21+), Quest 3 Browser

---

## Decisions (locked before coding)

1. **Three.js, not PlayCanvas.** Better WebXR camera-access samples, larger community, same WebGPU/WebXR underneath. Flip back for v2 if needed.
2. **Skip Rust/Wasm/SciRS2 for v1.** Umeyama (SE(3) solver) is ~50 lines of TS. <2ms for ≤500 points. Premature optimization costs 3 days.
3. **Skip LightGlue for v1.** Brute-force NN + Lowe's ratio test gets 95% of the way. LightGlue is a v1.1 upgrade.
4. **Drop iOS from MVP scope.** Safari has no WebXR camera-access, no depth sensing. iPhone WebXR is dead for AR. Be honest about it. iOS is a separate native bet.

---

## The algorithm

```
Device A:                              Device B:
  capture frame + WebXR pose             (same)
  SuperPoint → keypoints + descriptors   (same)
  depth at each keypoint → 3D point      (same)
  send list: [(p3d_A, descriptor)]   ─►  receive
                                         brute-force match descriptors
                                         RANSAC + Umeyama → T_AB
                                         place cube at T_AB · p_shared
  receive T_AB                       ◄── send back T_AB
  place cube at p_shared
```

Both devices end up rendering the cube at the same physical location.

---

## Repo structure

```
spatial-handshake-mvp/
├── client/                  ← Vite + TS + Three.js
│   ├── index.html
│   ├── src/
│   │   ├── main.ts          ← entry, scene setup
│   │   ├── xr-session.ts    ← WebXR boilerplate
│   │   ├── signaling.ts     ← Socket.io client
│   │   ├── peer.ts          ← WebRTC + DataChannel
│   │   ├── features.ts      ← SuperPoint via ort-web
│   │   ├── geometry.ts      ← Umeyama, RANSAC, intrinsics
│   │   └── handshake.ts     ← orchestrator
├── server/                  ← Node signaling
│   └── signaling.ts         ← Socket.io rooms
├── public/
│   └── superpoint.onnx      ← model weights (~5MB)
└── README.md
```

Setup:
```bash
npm create vite@latest client -- --template vanilla-ts
cd client
npm i three @types/three onnxruntime-web socket.io-client
# server
cd ../server && npm init -y
npm i express socket.io https
# HTTPS for WebXR
mkcert -install && mkcert localhost 192.168.x.x
```

---

## Phase 0 — Scaffold (Day 1, 2 hrs)

- Vite + TS + Three.js
- HTTPS dev server (mkcert)
- WebXR session entry button
- Cube renders in AR

**Deliverable:** Cube renders in WebXR on Pixel/Quest at `https://192.168.x.x:5173`.

---

## Phase 1 — Signaling + DataChannel (Day 2, 4 hrs)

- Node + Socket.io server. Endpoint: `join(roomCode)` → broadcasts `peer-joined`.
- Client: 4-letter room code on screen, both devices join same room.
- WebRTC offer/answer/ICE over Socket.io.
- DataChannel `ordered: true, maxRetransmits: 0` for descriptor blob (one-shot, big), separate channel `ordered: true` for tiny pose updates.
- Smoke test: device A sends `"ping"`, device B alerts.

**Deliverable:** Two devices in same room, ping/pong works.

---

## Phase 2 — WebXR camera access + frame capture (Day 3, 4 hrs)

- Session with `requiredFeatures: ['camera-access', 'depth-sensing', 'hit-test']`.
- Each `XRFrame`: `XRWebGLBinding.getCameraImage(view)` → bind to texture → `gl.readPixels` → ImageBitmap → Float32Array RGBA at 640×480.
- Cache `XRView.projectionMatrix` (intrinsics) and `XRView.transform` (pose).
- HUD overlay shows captured frame to verify.

**Gotcha:** Camera access is gated by Origin Trial on Chrome Android. Register at chromestatus.com, add token to `<meta>`. Test EARLY — silent failure can eat half a day.

**Deliverable:** Grab 640×480 RGBA + camera pose every frame.

---

## Phase 3 — SuperPoint feature extraction (Day 4–5, 8 hrs)

- SuperPoint ONNX from `magicleap/SuperPointPretrainedNetwork` (or pre-converted from HuggingFace).
- Quantize to int8 if size matters.
- `onnxruntime-web` with `executionProviders: ['webgpu']`.
- Input: 1×1×H×W grayscale. Output: keypoints (N×2), scores (N), descriptors (N×256).
- NMS to ~200 top keypoints.
- Render keypoint dots overlay.

**Benchmark target:** <80ms per frame on Pixel 7. WASM EP fallback is 5–10x slower but fine for one-shot handshake.

**Deliverable:** Tap "capture" → 200 keypoints overlaid on the room.

---

## Phase 4 — 2D keypoints → 3D world points (Day 6, 4 hrs)

For each keypoint `(u, v)`:
1. `depth = XRDepthInformation.getDepthInMeters(u, v)`
2. Unproject: `p_camera = depth · K^-1 · [u, v, 1]`
3. Transform: `p_world = T_view · p_camera`

Drop keypoints with depth = 0 or depth > 5m.

**Visualize:** small spheres at each `p_world`, they should stick to real surfaces as you move.

**Deliverable:** ~150 reliable 3D feature points anchored to the room.

---

## Phase 5 — Descriptor exchange + matching (Day 7, 4 hrs)

Wire format (binary, no JSON):
```
[count: uint32]
[count × (px, py, pz: float32, descriptor: 256 × float32)]
≈ 200 × (12 + 1024) = ~200KB per device
```

One DataChannel message.

Matching (receiver):
- For each B descriptor, find nearest 2 in A by cosine similarity.
- Lowe's ratio test: keep if `dist1 / dist2 < 0.8`.
- Expect 30–80 matches in normal lighting.

**Deliverable:** Console logs "47 matches found."

---

## Phase 6 — RANSAC + Umeyama (Day 8, 6 hrs)

```typescript
// geometry.ts
function umeyama(srcPts: Vec3[], dstPts: Vec3[]): Mat4 {
  // mean center, SVD on cross-covariance, recover R and t (~50 lines)
}

function ransac(matches: Match[], iters = 200, threshold = 0.05): Mat4 {
  // each iter: pick 3 random matches, solve Umeyama, count inliers
  // (inlier = ||T·p_B - p_A|| < 0.05m)
  // return T from best inlier set, refined on all inliers
}
```

SVD: `numeric-1.2.6` or hand-rolled 3×3 Jacobi (60 lines).

**Sanity check:** synthetic test — random cloud with known T, verify recovery.

**Deliverable:** `T_AB` printed on both screens. Inliers >15 = trustworthy.

---

## Phase 7 — Apply transform, render shared cube (Day 9, 3 hrs)

- "Shared origin" = device A's WebXR origin (arbitrary).
- Cube position in shared frame: `(0, 1, -1)` — 1m forward, 1m up.
- Device A renders at `(0, 1, -1)` directly.
- Device B renders at `T_AB · (0, 1, -1)`.
- Send `T_AB` back to A so they agree on origin.

**Deliverable: THE DEMO.** Both phones see the cube floating in the same physical spot.

---

## Phase 8 — Stress testing (Day 10–12)

| Pair | Same room | Diff lighting | Drift after 30s |
|---|---|---|---|
| Pixel + Pixel | ✓ | ✓ | measure |
| Pixel + Quest 3 | ✓ | ✓ | measure |
| Galaxy + Pixel | ✓ | ✓ | measure |

**Hard fail criteria:**
- Cube offset >10cm at handshake → algorithm broken.
- Drift >5cm after 30s walking → WebXR pose tracking is the bottleneck.
- <15 inliers in normal lighting → SuperPoint or matching is broken.

Place a real ruler. Drop virtual ruler at same spot. Photograph both screens at same instant. Measure error. **This is the signal.**

---

## Phase 9 — Ship (Day 13–14)

- 60-second demo video, one take, two phones, real room, walk around.
- Twitter/X: *"Cross-device AR sync over WebRTC, no cloud. Open source."* — not "TCP/IP of reality."
- GitHub repo, MIT license.
- Cross-post: r/WebXR, Show HN, PlayCanvas Discord, Three.js Discord.

---

## Outcomes

- **Clean demo:** real signal. Take to AR communities, Niantic / Snap / Meta as portfolio.
- **Flaky (15–30cm drift):** classic SLAM problem. Pivot enterprise or invest in multi-frame bundle adjustment for v2.
- **Doesn't work:** bottleneck is (a) depth API unreliable, (b) WebXR pose noisy, or (c) SuperPoint missing correspondences. Each has a known v2 fix. Not failure — research problem identified.
