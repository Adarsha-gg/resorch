# Native Android ARCore Capture

This app is the research harness for the serious path: synchronized ARCore camera images, camera pose, projection matrix, and image intrinsics.

## Build

```bash
cd native-android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
~/.gradle/wrapper/dists/gradle-9.3.1-bin/23ovyewtku6u96viwx3xl3oks/gradle-9.3.1/bin/gradle :app:assembleDebug
```

APK:

```text
native-android/app/build/outputs/apk/debug/app-debug.apk
```

## Install

Enable USB debugging on the Android phone, connect it, then:

```bash
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Capture

1. Open **SDP Capture** on the phone.
2. Grant camera permission.
3. Wait for `Tracking`.
4. Tap **Start Capture**.
5. Move slowly around a textured area.
6. Tap **Stop Capture**.

Captures are saved on-device under:

```text
/sdcard/Android/data/com.spatialhandshake.capture/files/Pictures/sdp-captures/
```

Pull them to the Mac:

```bash
mkdir -p ../output/native-captures
~/Library/Android/sdk/platform-tools/adb pull /sdcard/Android/data/com.spatialhandshake.capture/files/Pictures/sdp-captures ../output/native-captures
```

Each capture contains:

```text
frames/
  0000.jpg
  0001.jpg
metadata.jsonl
```

`metadata.jsonl` includes ARCore pose, display pose, image intrinsics, projection matrix, view matrix, frame timestamp, and image dimensions.
