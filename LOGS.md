# Spatial Handshake MVP Logs

Date: 2026-05-08

## Goal

Build and test a markerless spatial handshake prototype:

```text
two devices -> same room -> no cloud map -> solve shared coordinate frame -> same virtual cube location
```

The hard proof is two AR-capable devices independently starting AR, exchanging local visual/depth information, solving `T_AB`, and rendering a cube within ~10 cm of the same physical point.

## Web MVP Implemented

Created a Vite/TypeScript client and Socket.io signaling server.

Implemented:

- Three.js WebXR scene with a cube.
- Room code UI.
- Socket.io signaling.
- WebRTC peer connection.
- Data channels for descriptor blobs and pose transforms.
- Binary feature payload codec.
- Camera frame capture via `getUserMedia`.
- Local patch/corner descriptor matcher.
- RANSAC + Umeyama-style rigid transform solver.
- Trust gate: reject transforms with fewer than 15 inliers.
- HTTPS dev setup with `mkcert` certificates.

Verification:

```bash
cd client && npm run build
cd server && npm run typecheck
```

Both passed.

## Web Tests That Worked

### Phone/Mac WebRTC

Worked:

- Same room join.
- Data channels opened.
- Ping worked.
- Feature payload exchange worked.
- Matching and RANSAC ran.

Observed logs included:

```text
descriptors channel open
pose channel open
peer: ping
107 matches found
T_AB solved with 97 inliers
```

### Android WebXR Session

Worked after reducing WebXR session options:

- Android Chrome entered AR.
- Cube stayed fixed during a single active AR session.

Fixes made:

- Removed aggressive default `camera-access` and `depth-sensing` WebXR features.
- Made depth opt-in via `?depth=1`.
- Made Three.js scene transparent for AR passthrough.
- Avoided renderer resizing while XR is presenting.

## Web Tests That Failed / Were Limited

### `AR NOT SUPPORTED`

Expected on Mac/desktop browsers. Desktop does not provide mobile ARCore-style `immersive-ar`.

### Two Browsers on One Phone

Not useful for the real proof. Mobile browsers generally allow one immersive AR session at a time, and background tabs pause camera/AR.

### DOM Overlay in AR

Tried WebXR DOM Overlay to show Save/Relocalize controls inside AR.

Result:

- It interfered with the phone AR compositor.
- Removed it.

### One-Phone Local Anchor Workaround

Implemented:

- Save Local Anchor.
- Relocalize.
- Tap/double-tap gestures attempted for AR.

Result:

- Conceptually useful, but browser input/camera limitations made it unreliable.
- Not a replacement for two AR devices.

### WebXR Canvas Capture

Tried to auto-upload AR frames by calling `canvas.toBlob()` during WebXR.

Result:

- Saved JPEGs were black.
- Cause: browser WebXR composites the real passthrough camera outside the readable WebGL canvas for privacy.
- Conclusion: WebXR passthrough pixels are not reliably readable from browser canvas.

### `getUserMedia` During AR

Tried using `getUserMedia` while immersive AR was active.

Result:

```text
couldn't start video source
```

Cause:

- WebXR/ARCore already owns the camera.
- Browser cannot open a second camera stream concurrently.

## Browser Research Capture

Implemented a browser capture endpoint:

```text
POST /research/captures
```

It saves:

```text
output/research-captures/<session-id>/
  frames/
  metadata.jsonl
```

Vite proxy added so phone can post same-origin:

```text
/research -> https://localhost:3001
```

This fixed earlier `failed to fetch` upload errors.

Captured sessions:

```text
output/research-captures/2026-05-08T07-28-12-047Z-leyst3
output/research-captures/2026-05-08T07-29-37-262Z-c2esqa
```

But these are not useful for visual-geometry models when captured inside AR, because JPEGs were black.

## Native Android Pivot

Reason for pivot:

WebXR cannot reliably expose synchronized camera image + AR pose + intrinsics. Native ARCore can.

Created:

```text
native-android/
```

Native app:

- Java Android app.
- ARCore session.
- Camera preview.
- `Frame.acquireCameraImage()` for CPU camera frames.
- `Camera.getPose()` for AR pose.
- `Camera.getDisplayOrientedPose()`.
- `Camera.getImageIntrinsics()`.
- Projection and view matrix export.
- JPEG frames + `metadata.jsonl`.

Build result:

```text
BUILD SUCCESSFUL
```

APK:

```text
native-android/app/build/outputs/apk/debug/app-debug.apk
```

Install command:

```bash
cd /Users/adarsha/spatial-handshake-mvp/native-android
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Phone was not visible to `adb` during this session:

```text
List of devices attached
```

No devices listed.

## Native Capture Output Plan

The native app saves captures on-device:

```text
/sdcard/Android/data/com.spatialhandshake.capture/files/Pictures/sdp-captures/
```

Pull command:

```bash
mkdir -p output/native-captures
~/Library/Android/sdk/platform-tools/adb pull \
  /sdcard/Android/data/com.spatialhandshake.capture/files/Pictures/sdp-captures \
  output/native-captures
```

Expected structure:

```text
output/native-captures/sdp-captures/<session>/
  frames/
    0000.jpg
    0001.jpg
  metadata.jsonl
```

## Research Tooling Added

Created scripts:

```text
research/scripts/index_captures.py
research/scripts/export_colmap_text.py
research/scripts/make_pair_manifest.py
research/scripts/quick_image_check.py
```

Usage:

```bash
python3 research/scripts/index_captures.py

python3 research/scripts/export_colmap_text.py \
  output/native-captures/sdp-captures/<session> \
  output/experiments/colmap/<session>

python3 research/scripts/make_pair_manifest.py \
  output/native-captures/sdp-captures/<session-a> \
  output/native-captures/sdp-captures/<session-b> \
  output/experiments/pairs/session-a_session-b.json
```

Experiment notes:

```text
research/experiments/vggt.md
research/experiments/mast3r_dust3r.md
```

## Research Direction

Promising models:

- VGGT: camera poses, depth, point maps, tracks from image sequences.
- MASt3R: strong 3D-grounded image matching.
- DUSt3R: geometry from image pairs/sets without known calibration.

Generic VLMs are not the core tool here. The useful class is visual geometry foundation models.

## Current State

Working:

- Web signaling/WebRTC scaffold.
- Android WebXR single-session cube.
- Camera descriptor pipeline in browser, with known limitations.
- Native Android ARCore capture app builds.
- Research scripts ready for native captures.

Blocked:

- Need phone visible to `adb` to install native APK.
- Need native captures before running VGGT/MASt3R/DUSt3R meaningfully.
- Need second AR-capable device to prove the true two-device shared coordinate frame demo.

## Next Steps

1. Enable USB debugging on Android and verify:

```bash
~/Library/Android/sdk/platform-tools/adb devices
```

2. Install native APK.

3. Capture two native ARCore sessions of the same textured area.

4. Pull captures to Mac.

5. Run `index_captures.py` and `quick_image_check.py`.

6. Try VGGT first on the native frames.

7. Try MASt3R/DUSt3R for cross-session pair matching.

8. Use outputs to estimate old-session-to-new-session transform.

9. Later, repeat with two Android devices for the actual golden proof.
