import * as THREE from 'three'
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js'

export type XRTrackingSnapshot = {
  isXRActive: boolean
  hasDepth: boolean
  projectionMatrix?: Float32Array
  worldFromCamera?: Float32Array
  depthAt?: (normalizedX: number, normalizedY: number) => number | null
}

type ARSessionOptions = NonNullable<Parameters<typeof ARButton.createButton>[1]>

export type XRSceneController = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sharedCube: THREE.Mesh
  getTrackingSnapshot: () => XRTrackingSnapshot
  setSharedTransform: (matrix: Float32Array | number[]) => void
  onSessionState: (callback: (state: string) => void) => void
  dispose: () => void
}

export function createXRScene(root: HTMLElement): XRSceneController {
  const scene = new THREE.Scene()
  scene.background = null

  const camera = new THREE.PerspectiveCamera(70, root.clientWidth / root.clientHeight, 0.01, 30)
  camera.position.set(0, 1.45, 2.4)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearAlpha(0)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(root.clientWidth, root.clientHeight)
  renderer.xr.enabled = true
  root.append(renderer.domElement)

  const ambient = new THREE.HemisphereLight(0xd7e7ff, 0x20302d, 2.2)
  scene.add(ambient)

  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(2, 3, 1)
  scene.add(key)

  const grid = new THREE.GridHelper(4, 16, 0x60d394, 0x263238)
  grid.position.y = -0.01
  scene.add(grid)

  const sharedCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x5eead4,
      emissive: 0x0f766e,
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.15,
    }),
  )
  sharedCube.position.set(0, 1, -1)
  scene.add(sharedCube)

  const axes = new THREE.AxesHelper(0.55)
  axes.position.set(0, 1, -1)
  scene.add(axes)

  const arSessionInit = createARSessionInit()
  const isDepthEnabled = Boolean(arSessionInit.depthSensing)
  const arButton = ARButton.createButton(renderer, arSessionInit)
  arButton.classList.add('xr-button')
  root.append(arButton)

  const stateCallbacks = new Set<(state: string) => void>()
  let isXRActive = false
  let frameCount = 0
  let latestProjectionMatrix: Float32Array | undefined
  let latestWorldFromCamera: Float32Array | undefined
  let latestDepth: { width: number; height: number; meters: Float32Array } | undefined
  renderer.xr.addEventListener('sessionstart', () => {
    isXRActive = true
    stateCallbacks.forEach((callback) => callback('AR session active'))
  })
  renderer.xr.addEventListener('sessionend', () => {
    isXRActive = false
    latestDepth = undefined
    stateCallbacks.forEach((callback) => callback('WebXR idle'))
  })

  const resizeObserver = new ResizeObserver(() => {
    if (renderer.xr.isPresenting) {
      return
    }

    const width = root.clientWidth
    const height = root.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  })
  resizeObserver.observe(root)

  renderer.setAnimationLoop((_timestamp, frame) => {
    if (frame) {
      const referenceSpace = renderer.xr.getReferenceSpace()
      const pose = referenceSpace ? frame.getViewerPose(referenceSpace) : null
      const view = pose?.views[0]
      if (view) {
        latestProjectionMatrix = new Float32Array(view.projectionMatrix)
        latestWorldFromCamera = new Float32Array(view.transform.matrix)

        frameCount += 1
        if (frameCount % 10 === 0 && isDepthEnabled) {
          latestDepth = copyDepthInformation(frame, view)
        }
      }
    }

    sharedCube.rotation.x += 0.006
    sharedCube.rotation.y += 0.01
    renderer.render(scene, camera)
  })

  return {
    renderer,
    scene,
    camera,
    sharedCube,
    getTrackingSnapshot() {
      const depthSnapshot = latestDepth
      return {
        isXRActive,
        hasDepth: Boolean(depthSnapshot),
        projectionMatrix: latestProjectionMatrix,
        worldFromCamera: latestWorldFromCamera,
        depthAt: depthSnapshot
          ? (normalizedX, normalizedY) => sampleDepth(depthSnapshot, normalizedX, normalizedY)
          : undefined,
      }
    },
    setSharedTransform(matrix) {
      const transform = new THREE.Matrix4().fromArray(Array.from(matrix))
      sharedCube.position.setFromMatrixPosition(transform)
      axes.position.copy(sharedCube.position)
    },
    onSessionState(callback) {
      stateCallbacks.add(callback)
    },
    dispose() {
      resizeObserver.disconnect()
      renderer.setAnimationLoop(null)
      renderer.dispose()
      root.replaceChildren()
      stateCallbacks.clear()
    },
  }
}

function createARSessionInit(): ARSessionOptions {
  const params = new URLSearchParams(window.location.search)
  const enableDepth = params.get('depth') === '1'

  if (!enableDepth) {
    return {
      requiredFeatures: [],
      optionalFeatures: ['local-floor', 'hit-test'],
    }
  }

  return {
    requiredFeatures: [],
    optionalFeatures: ['local-floor', 'hit-test', 'depth-sensing'],
    depthSensing: {
      usagePreference: ['cpu-optimized'],
      dataFormatPreference: ['float32', 'luminance-alpha'],
    },
  } as unknown as ARSessionOptions
}

function copyDepthInformation(frame: XRFrame, view: XRView): { width: number; height: number; meters: Float32Array } | undefined {
  const depth = typeof frame.getDepthInformation === 'function' ? frame.getDepthInformation(view) : null
  if (!depth || depth.width <= 0 || depth.height <= 0) {
    return undefined
  }

  const meters = new Float32Array(depth.width * depth.height)
  for (let y = 0; y < depth.height; y += 1) {
    for (let x = 0; x < depth.width; x += 1) {
      meters[y * depth.width + x] = depth.getDepthInMeters(x, y)
    }
  }

  return { width: depth.width, height: depth.height, meters }
}

function sampleDepth(depth: { width: number; height: number; meters: Float32Array }, normalizedX: number, normalizedY: number): number | null {
  const x = Math.max(0, Math.min(depth.width - 1, Math.round(normalizedX * (depth.width - 1))))
  const y = Math.max(0, Math.min(depth.height - 1, Math.round(normalizedY * (depth.height - 1))))
  const meters = depth.meters[y * depth.width + x]
  return Number.isFinite(meters) && meters > 0 ? meters : null
}
