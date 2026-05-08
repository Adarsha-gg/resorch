# Visual Geometry Research Harness

This is the one-phone path for testing VGGT / MASt3R / DUSt3R style relocalization on the Mac.

## Recommended Path

Use the native Android ARCore app first:

```text
native-android/
```

Native captures include synchronized camera image, pose, projection, and intrinsics. That is the correct substrate for serious geometry experiments.

After pulling native captures to `output/native-captures`, inspect them:

```bash
python3 research/scripts/index_captures.py
python3 research/scripts/quick_image_check.py output/native-captures/sdp-captures/<session>
```

Export native metadata into a COLMAP-style text model:

```bash
python3 research/scripts/export_colmap_text.py \
  output/native-captures/sdp-captures/<session> \
  output/experiments/colmap/<session>
```

Create cross-session pair manifests for MASt3R / DUSt3R:

```bash
python3 research/scripts/make_pair_manifest.py \
  output/native-captures/sdp-captures/<session-a> \
  output/native-captures/sdp-captures/<session-b> \
  output/experiments/pairs/session-a_session-b.json
```

## Capture Protocol

### Browser Capture

Run the HTTPS client and server, then open the phone URL:

```text
https://192.168.1.223:5173/?room=TEST
```

Important limitation: browser WebXR passthrough camera pixels are not readable from the rendered canvas. If auto capture runs inside immersive AR, the saved JPEGs can be black/transparent because the browser composites the real camera outside WebGL.

For image sequences intended for VGGT / MASt3R / DUSt3R, capture outside immersive AR using `getUserMedia`:

```text
https://192.168.1.223:5173/?room=TEST&research=auto&frames=16&interval=900
```

Then, before pressing **Start AR**:

1. Point the phone at a textured area.
2. Let it upload 16 frames while moving slowly sideways.
3. Reload the page to create a second capture session.
4. Repeat from the same area.

Manual capture also works outside immersive AR:

1. Point at a textured area.
2. Tap **Upload Research Frame** 5-10 times while slowly moving the phone sideways.
4. Close/reopen AR, or walk away and come back.
5. Tap **Upload Research Frame** 5-10 more times from a similar viewpoint.

The Mac server writes:

```text
output/research-captures/<session-id>/
  frames/
    0000.jpg
    0001.jpg
    ...
  metadata.jsonl
```

Each metadata row includes the frame name, timestamp, WebXR pose matrix when available, projection matrix when available, and whether XR was active.

## Model Plan

Use the saved `frames/*.jpg` folder as input to one of:

- VGGT: estimate camera poses, point maps, depth, and tracks for the full sequence.
- MASt3R: estimate dense 3D-grounded matches between sequence A and sequence B.
- DUSt3R: reconstruct pairwise point maps when camera intrinsics/poses are unavailable.

The first target is not browser deployment. The first target is proving:

```text
old AR session image sequence + new AR session image sequence -> reliable T_old_new
```

If this works on saved frames, then we optimize toward on-device/browser inference later.
