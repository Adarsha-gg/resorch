package com.spatialhandshake.capture;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.media.Image;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.os.Environment;
import android.util.Log;
import android.view.Gravity;
import android.view.Surface;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.CameraIntrinsics;
import com.google.ar.core.Config;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.NotYetAvailableException;
import com.google.ar.core.exceptions.UnavailableException;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public class MainActivity extends Activity implements GLSurfaceView.Renderer {
    private static final String TAG = "SDPCapture";
    private static final int CAMERA_PERMISSION_REQUEST = 10;

    private GLSurfaceView surfaceView;
    private TextView statusText;
    private Session session;
    private boolean installRequested;
    private boolean captureEnabled;
    private boolean viewportChanged = true;
    private int viewportWidth;
    private int viewportHeight;
    private int cameraTextureId = -1;
    private int frameIndex;
    private File sessionDir;
    private File framesDir;
    private File metadataFile;
    private int cameraProgram;
    private int cameraPositionAttrib;
    private int cameraTexCoordAttrib;
    private int cameraTextureUniform;
    private final FloatBuffer quadCoords = createFloatBuffer(new float[]{
            -1f, -1f,
            1f, -1f,
            -1f, 1f,
            1f, 1f
    });
    private final FloatBuffer cameraTexCoords = createFloatBuffer(new float[8]);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            ensureSession();
        }
        if (session != null) {
            try {
                session.resume();
            } catch (CameraNotAvailableException e) {
                setStatus("Camera unavailable: " + e.getMessage());
                session = null;
            }
        }
        surfaceView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        surfaceView.onPause();
        if (session != null) {
            session.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (session != null) {
            session.close();
            session = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            ensureSession();
        } else {
            setStatus("Camera permission denied");
        }
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0.02f, 0.03f, 0.04f, 1f);
        createCameraProgram();
        cameraTextureId = createExternalTexture();
        if (session != null) {
            session.setCameraTextureName(cameraTextureId);
        }
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        viewportWidth = width;
        viewportHeight = height;
        viewportChanged = true;
        GLES20.glViewport(0, 0, width, height);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (session == null || cameraTextureId < 0) {
            return;
        }

        if (viewportChanged) {
            int rotation = getWindowManager().getDefaultDisplay().getRotation();
            session.setDisplayGeometry(rotationToDegrees(rotation), viewportWidth, viewportHeight);
            viewportChanged = false;
        }

        try {
            Frame frame = session.update();
            drawCamera(frame);
            Camera camera = frame.getCamera();
            TrackingState trackingState = camera.getTrackingState();
            if (trackingState != TrackingState.TRACKING) {
                setStatus("Tracking: " + trackingState);
                return;
            }

            setStatus(captureEnabled ? "Capturing " + frameIndex + " frames" : "Tracking. Tap Start Capture.");
            if (captureEnabled && frameIndex % 3 == 0) {
                captureFrame(frame, camera);
            } else if (captureEnabled) {
                frameIndex++;
            }
        } catch (Throwable e) {
            Log.w(TAG, "Frame update failed", e);
            setStatus("Frame error: " + e.getClass().getSimpleName());
        }
    }

    private void buildUi() {
        surfaceView = new GLSurfaceView(this);
        surfaceView.setEGLContextClientVersion(2);
        surfaceView.setPreserveEGLContextOnPause(true);
        surfaceView.setRenderer(this);
        surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);

        FrameLayout root = new FrameLayout(this);
        root.addView(surfaceView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setGravity(Gravity.CENTER_HORIZONTAL);
        controls.setPadding(24, 24, 24, 24);
        controls.setBackgroundColor(0x99000000);

        statusText = new TextView(this);
        statusText.setTextColor(0xffffffff);
        statusText.setText("Starting ARCore...");
        controls.addView(statusText);

        Button start = new Button(this);
        start.setText("Start Capture");
        start.setOnClickListener(v -> startCapture());
        controls.addView(start);

        Button stop = new Button(this);
        stop.setText("Stop Capture");
        stop.setOnClickListener(v -> stopCapture());
        controls.addView(stop);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM);
        root.addView(controls, params);
        setContentView(root);
    }

    private void ensureSession() {
        if (session != null) {
            return;
        }

        try {
            ArCoreApk.InstallStatus installStatus = ArCoreApk.getInstance().requestInstall(this, !installRequested);
            if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                installRequested = true;
                return;
            }

            session = new Session(this);
            Config config = new Config(session);
            if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                config.setDepthMode(Config.DepthMode.AUTOMATIC);
            }
            session.configure(config);
            if (cameraTextureId >= 0) {
                session.setCameraTextureName(cameraTextureId);
            }
            setStatus("ARCore session ready");
        } catch (UnavailableException e) {
            setStatus("ARCore unavailable: " + e.getClass().getSimpleName());
        }
    }

    private void startCapture() {
        File root = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (root == null) {
            setStatus("No external files dir");
            return;
        }

        String stamp = new SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.US).format(new Date());
        sessionDir = new File(root, "sdp-captures/" + stamp);
        framesDir = new File(sessionDir, "frames");
        metadataFile = new File(sessionDir, "metadata.jsonl");
        if (!framesDir.mkdirs() && !framesDir.exists()) {
            setStatus("Could not create " + framesDir);
            return;
        }

        frameIndex = 0;
        captureEnabled = true;
        setStatus("Capturing to " + sessionDir.getAbsolutePath());
    }

    private void stopCapture() {
        captureEnabled = false;
        setStatus(sessionDir == null ? "Capture stopped" : "Saved " + frameIndex + " frames to " + sessionDir.getAbsolutePath());
    }

    private void captureFrame(Frame frame, Camera camera) {
        Image image = null;
        try {
            image = frame.acquireCameraImage();
            int index = frameIndex;
            frameIndex++;

            byte[] jpeg = yuv420ToJpeg(image, 88);
            String frameName = String.format(Locale.US, "%04d.jpg", index);
            writeBytes(new File(framesDir, frameName), jpeg);
            appendMetadata(frame, camera, image, frameName, index);
        } catch (NotYetAvailableException e) {
            frameIndex++;
        } catch (IOException e) {
            Log.w(TAG, "Capture write failed", e);
            setStatus("Write failed: " + e.getMessage());
        } finally {
            if (image != null) {
                image.close();
            }
        }
    }

    private void appendMetadata(Frame frame, Camera camera, Image image, String frameName, int index) throws IOException {
        Pose pose = camera.getPose();
        Pose displayPose = camera.getDisplayOrientedPose();
        CameraIntrinsics intrinsics = camera.getImageIntrinsics();
        float[] focal = intrinsics.getFocalLength();
        float[] principal = intrinsics.getPrincipalPoint();
        int[] imageDimensions = intrinsics.getImageDimensions();
        float[] projection = new float[16];
        float[] view = new float[16];
        camera.getProjectionMatrix(projection, 0, 0.01f, 30f);
        camera.getViewMatrix(view, 0);

        String json = "{"
                + "\"frameIndex\":" + index + ","
                + "\"frameName\":\"" + frameName + "\","
                + "\"timestampNs\":" + frame.getTimestamp() + ","
                + "\"imageWidth\":" + image.getWidth() + ","
                + "\"imageHeight\":" + image.getHeight() + ","
                + "\"intrinsics\":{\"fx\":" + focal[0] + ",\"fy\":" + focal[1]
                + ",\"cx\":" + principal[0] + ",\"cy\":" + principal[1]
                + ",\"width\":" + imageDimensions[0] + ",\"height\":" + imageDimensions[1] + "},"
                + "\"pose\":" + poseToJson(pose) + ","
                + "\"displayPose\":" + poseToJson(displayPose) + ","
                + "\"projection\":" + floatArrayToJson(projection) + ","
                + "\"view\":" + floatArrayToJson(view)
                + "}\n";
        writeBytes(metadataFile, json.getBytes(StandardCharsets.UTF_8), true);
    }

    private byte[] yuv420ToJpeg(Image image, int quality) {
        byte[] nv21 = yuv420ToNv21(image);
        YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, image.getWidth(), image.getHeight(), null);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        yuv.compressToJpeg(new Rect(0, 0, image.getWidth(), image.getHeight()), quality, out);
        return out.toByteArray();
    }

    private byte[] yuv420ToNv21(Image image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int ySize = width * height;
        int uvSize = width * height / 4;
        byte[] nv21 = new byte[ySize + uvSize * 2];

        copyPlane(image.getPlanes()[0].getBuffer(), image.getPlanes()[0].getRowStride(), image.getPlanes()[0].getPixelStride(), width, height, nv21, 0, 1);
        copyPlane(image.getPlanes()[2].getBuffer(), image.getPlanes()[2].getRowStride(), image.getPlanes()[2].getPixelStride(), width / 2, height / 2, nv21, ySize, 2);
        copyPlane(image.getPlanes()[1].getBuffer(), image.getPlanes()[1].getRowStride(), image.getPlanes()[1].getPixelStride(), width / 2, height / 2, nv21, ySize + 1, 2);
        return nv21;
    }

    private void copyPlane(ByteBuffer buffer, int rowStride, int pixelStride, int width, int height, byte[] output, int offset, int outputStride) {
        byte[] row = new byte[rowStride];
        int outputOffset = offset;
        for (int rowIndex = 0; rowIndex < height; rowIndex++) {
            int bytesToRead = rowIndex == height - 1 ? Math.min(rowStride, buffer.remaining()) : rowStride;
            buffer.get(row, 0, bytesToRead);
            for (int col = 0; col < width; col++) {
                output[outputOffset] = row[col * pixelStride];
                outputOffset += outputStride;
            }
        }
    }

    private int createExternalTexture() {
        int[] textures = new int[1];
        GLES20.glGenTextures(1, textures, 0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textures[0]);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        return textures[0];
    }

    private void createCameraProgram() {
        String vertexShader =
                "attribute vec4 a_Position;\n"
                        + "attribute vec2 a_TexCoord;\n"
                        + "varying vec2 v_TexCoord;\n"
                        + "void main() {\n"
                        + "  gl_Position = a_Position;\n"
                        + "  v_TexCoord = a_TexCoord;\n"
                        + "}\n";
        String fragmentShader =
                "#extension GL_OES_EGL_image_external : require\n"
                        + "precision mediump float;\n"
                        + "uniform samplerExternalOES u_Texture;\n"
                        + "varying vec2 v_TexCoord;\n"
                        + "void main() {\n"
                        + "  gl_FragColor = texture2D(u_Texture, v_TexCoord);\n"
                        + "}\n";
        cameraProgram = linkProgram(vertexShader, fragmentShader);
        cameraPositionAttrib = GLES20.glGetAttribLocation(cameraProgram, "a_Position");
        cameraTexCoordAttrib = GLES20.glGetAttribLocation(cameraProgram, "a_TexCoord");
        cameraTextureUniform = GLES20.glGetUniformLocation(cameraProgram, "u_Texture");
    }

    private void drawCamera(Frame frame) {
        frame.transformCoordinates2d(
                Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
                quadCoords,
                Coordinates2d.TEXTURE_NORMALIZED,
                cameraTexCoords);

        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);
        GLES20.glUseProgram(cameraProgram);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId);
        GLES20.glUniform1i(cameraTextureUniform, 0);

        quadCoords.position(0);
        GLES20.glVertexAttribPointer(cameraPositionAttrib, 2, GLES20.GL_FLOAT, false, 0, quadCoords);
        GLES20.glEnableVertexAttribArray(cameraPositionAttrib);

        cameraTexCoords.position(0);
        GLES20.glVertexAttribPointer(cameraTexCoordAttrib, 2, GLES20.GL_FLOAT, false, 0, cameraTexCoords);
        GLES20.glEnableVertexAttribArray(cameraTexCoordAttrib);

        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(cameraPositionAttrib);
        GLES20.glDisableVertexAttribArray(cameraTexCoordAttrib);
        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
    }

    private int linkProgram(String vertexSource, String fragmentSource) {
        int vertexShader = compileShader(GLES20.GL_VERTEX_SHADER, vertexSource);
        int fragmentShader = compileShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource);
        int program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, vertexShader);
        GLES20.glAttachShader(program, fragmentShader);
        GLES20.glLinkProgram(program);
        int[] linked = new int[1];
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0);
        if (linked[0] == 0) {
            throw new IllegalStateException(GLES20.glGetProgramInfoLog(program));
        }
        return program;
    }

    private int compileShader(int type, String source) {
        int shader = GLES20.glCreateShader(type);
        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);
        int[] compiled = new int[1];
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0);
        if (compiled[0] == 0) {
            throw new IllegalStateException(GLES20.glGetShaderInfoLog(shader));
        }
        return shader;
    }

    private static FloatBuffer createFloatBuffer(float[] values) {
        FloatBuffer buffer = ByteBuffer.allocateDirect(values.length * Float.BYTES)
                .order(ByteOrder.nativeOrder())
                .asFloatBuffer();
        buffer.put(values);
        buffer.position(0);
        return buffer;
    }

    private void setStatus(String message) {
        runOnUiThread(() -> statusText.setText(message));
    }

    private void writeBytes(File file, byte[] bytes) throws IOException {
        writeBytes(file, bytes, false);
    }

    private void writeBytes(File file, byte[] bytes, boolean append) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file, append)) {
            out.write(bytes);
        }
    }

    private String poseToJson(Pose pose) {
        float[] t = pose.getTranslation();
        float[] q = pose.getRotationQuaternion();
        return "{\"tx\":" + t[0] + ",\"ty\":" + t[1] + ",\"tz\":" + t[2]
                + ",\"qx\":" + q[0] + ",\"qy\":" + q[1] + ",\"qz\":" + q[2] + ",\"qw\":" + q[3] + "}";
    }

    private String floatArrayToJson(float[] values) {
        StringBuilder builder = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                builder.append(',');
            }
            builder.append(values[i]);
        }
        return builder.append(']').toString();
    }

    private int rotationToDegrees(int rotation) {
        if (rotation == Surface.ROTATION_90) return 90;
        if (rotation == Surface.ROTATION_180) return 180;
        if (rotation == Surface.ROTATION_270) return 270;
        return 0;
    }
}
