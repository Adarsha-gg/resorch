import { CameraFrameSource } from './camera-capture'
import { createImageFeatures, createSyntheticFeatures, decodeFeatures, encodeFeatures, matchFeatures, type FeaturePoint } from './features'
import { ransac } from './geometry'
import { createPeerController, type PeerController } from './peer'
import { createSignalingClient, type SignalingClient } from './signaling'
import type { XRSceneController } from './xr-session'

const MIN_TRUSTED_INLIERS = 15
const LOCAL_ANCHOR_KEY = 'spatial-handshake.local-anchor.v1'

type SavedLocalAnchor = {
  version: 1
  createdAt: string
  features: string
  cubePosition: [number, number, number]
}

type Elements = {
  roomCode: HTMLElement
  xrStatus: HTMLElement
  peerStatus: HTMLElement
  matchStatus: HTMLElement
  channelState: HTMLElement
  inlierCount: HTMLElement
  transformState: HTMLElement
  log: HTMLElement
  connectButton: HTMLButtonElement
  pingButton: HTMLButtonElement
  captureButton: HTMLButtonElement
  saveAnchorButton: HTMLButtonElement
  relocalizeButton: HTMLButtonElement
  researchCaptureButton: HTMLButtonElement
}

type HandshakeControllerOptions = {
  roomCode: string
  scene: XRSceneController
  elements: Elements
}

export class HandshakeController {
  private readonly roomCode: string
  private readonly scene: XRSceneController
  private readonly elements: Elements
  private readonly signaling: SignalingClient
  private readonly peer: PeerController
  private readonly cameraFrames = new CameraFrameSource()
  private localFeatures: FeaturePoint[] = []
  private remoteFeatures: FeaturePoint[] = []
  private joined = false
  private researchFrameIndex = 0
  private researchAutoTimer: number | null = null
  private readonly researchSessionId = createResearchSessionId()

  constructor(options: HandshakeControllerOptions) {
    this.roomCode = options.roomCode
    this.scene = options.scene
    this.elements = options.elements
    this.signaling = createSignalingClient(this.roomCode)
    this.peer = createPeerController((payload) => this.signaling.sendSignal(payload))
  }

  start(): void {
    this.elements.roomCode.textContent = this.roomCode
    this.elements.connectButton.addEventListener('click', () => this.connect())
    this.elements.pingButton.addEventListener('click', () => this.peer.sendPing())
    this.elements.captureButton.addEventListener('click', () => {
      void this.captureAndSendFeatures()
    })
    this.elements.saveAnchorButton.addEventListener('click', () => {
      void this.saveLocalAnchor()
    })
    this.elements.relocalizeButton.addEventListener('click', () => {
      void this.relocalizeFromAnchor()
    })
    this.elements.researchCaptureButton.addEventListener('click', () => {
      void this.uploadResearchFrame()
    })
    this.scene.renderer.domElement.addEventListener('click', (event) => this.handleSceneTap(event))

    this.scene.onSessionState((state) => {
      this.elements.xrStatus.textContent = state
      this.log(state)
      if (state === 'AR session active') {
        this.startAutoResearchCapture()
      }
    })

    this.signaling.onStatus((status) => {
      this.elements.peerStatus.textContent = status
      this.log(status)
    })
    this.signaling.onPeerJoined(() => {
      this.log('peer joined room, creating WebRTC offer')
      void this.peer.createOffer()
    })
    this.signaling.onSignal((payload) => {
      void this.peer.handleSignal(payload).catch((error: Error) => this.log(error.message))
    })

    this.peer.onStatus((status) => {
      this.elements.channelState.textContent = status
      this.elements.peerStatus.textContent = status
      this.elements.pingButton.disabled = !status.includes('open')
      this.elements.captureButton.disabled = !status.includes('open')
      this.log(status)
    })
    this.peer.onMessage((message) => this.log(`peer: ${message}`))
    this.peer.onDescriptorBlob((buffer) => this.receiveFeatures(buffer))
    this.peer.onPose((matrix) => {
      this.scene.setSharedTransform(matrix)
      this.elements.transformState.textContent = 'received from peer'
      this.log('received shared transform')
    })

    this.log(`ready in room ${this.roomCode}`)
  }

  private connect(): void {
    if (this.joined) {
      return
    }
    this.joined = true
    this.elements.connectButton.disabled = true
    this.elements.connectButton.textContent = 'Joined'
    this.signaling.connect()
  }

  private async captureAndSendFeatures(): Promise<void> {
    this.elements.captureButton.disabled = true
    this.elements.captureButton.textContent = 'Capturing...'

    this.localFeatures = await this.captureFeatureSet()

    this.peer.sendDescriptorBlob(encodeFeatures(this.localFeatures))
    this.log(`sent ${this.localFeatures.length} feature points`)
    this.solveIfReady()
    this.elements.captureButton.textContent = 'Capture Features'
    this.elements.captureButton.disabled = false
  }

  private async saveLocalAnchor(): Promise<void> {
    this.elements.saveAnchorButton.disabled = true
    this.elements.saveAnchorButton.textContent = 'Saving...'

    const features = await this.captureFeatureSet()
    const position = this.scene.sharedCube.position
    const anchor: SavedLocalAnchor = {
      version: 1,
      createdAt: new Date().toISOString(),
      features: arrayBufferToBase64(encodeFeatures(features)),
      cubePosition: [position.x, position.y, position.z],
    }

    localStorage.setItem(LOCAL_ANCHOR_KEY, JSON.stringify(anchor))
    this.log(`saved local anchor with ${features.length} features`)
    this.elements.saveAnchorButton.textContent = 'Save Local Anchor'
    this.elements.saveAnchorButton.disabled = false
  }

  private async relocalizeFromAnchor(): Promise<void> {
    const anchor = loadLocalAnchor()
    if (!anchor) {
      this.elements.transformState.textContent = 'no saved anchor'
      this.log('no saved local anchor')
      return
    }

    this.elements.relocalizeButton.disabled = true
    this.elements.relocalizeButton.textContent = 'Relocalizing...'

    const currentFeatures = await this.captureFeatureSet()
    const anchorFeatures = decodeFeatures(base64ToArrayBuffer(anchor.features))
    const matches = matchFeatures(currentFeatures, anchorFeatures)
    this.elements.matchStatus.textContent = `${matches.length} matches`
    this.log(`${matches.length} anchor matches found`)

    if (matches.length < 3) {
      this.elements.transformState.textContent = 'not enough anchor matches'
      this.elements.relocalizeButton.textContent = 'Relocalize'
      this.elements.relocalizeButton.disabled = false
      return
    }

    const result = ransac(matches)
    this.elements.inlierCount.textContent = `${result.inliers.length}`
    if (result.inliers.length < MIN_TRUSTED_INLIERS) {
      this.elements.transformState.textContent = `anchor untrusted: ${result.inliers.length}/${MIN_TRUSTED_INLIERS}`
      this.log(`rejected anchor: ${result.inliers.length} inliers below ${MIN_TRUSTED_INLIERS}`)
      this.elements.relocalizeButton.textContent = 'Relocalize'
      this.elements.relocalizeButton.disabled = false
      return
    }

    const [x, y, z] = anchor.cubePosition
    const relocalizedPosition = {
      x: result.matrix[0] * x + result.matrix[4] * y + result.matrix[8] * z + result.matrix[12],
      y: result.matrix[1] * x + result.matrix[5] * y + result.matrix[9] * z + result.matrix[13],
      z: result.matrix[2] * x + result.matrix[6] * y + result.matrix[10] * z + result.matrix[14],
    }
    this.scene.setSharedTransform(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, relocalizedPosition.x, relocalizedPosition.y, relocalizedPosition.z, 1]))
    this.elements.transformState.textContent = `anchor ${Math.round(result.error * 1000)}mm`
    this.log(`relocalized anchor with ${result.inliers.length} inliers`)
    this.elements.relocalizeButton.textContent = 'Relocalize'
    this.elements.relocalizeButton.disabled = false
  }

  private async uploadResearchFrame(): Promise<void> {
    this.elements.researchCaptureButton.disabled = true
    this.elements.researchCaptureButton.textContent = 'Uploading...'

    try {
      const tracking = this.scene.getTrackingSnapshot()
      const capture = await this.cameraFrames.captureJpeg()
      const endpoint = `${getResearchServerUrl()}/research/captures`
      const frameIndex = this.researchFrameIndex
      this.researchFrameIndex += 1

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.researchSessionId,
          roomCode: this.roomCode,
          frameIndex,
          timestamp: new Date().toISOString(),
          width: capture.width,
          height: capture.height,
          source: 'get-user-media',
          imageBase64: await blobToBase64(capture.jpeg),
          tracking: {
            isXRActive: tracking.isXRActive,
            hasDepth: tracking.hasDepth,
            projectionMatrix: tracking.projectionMatrix ? Array.from(tracking.projectionMatrix) : null,
            worldFromCamera: tracking.worldFromCamera ? Array.from(tracking.worldFromCamera) : null,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`upload failed: ${response.status}`)
      }

      this.log(`uploaded research frame ${frameIndex}`)
    } catch (error) {
      this.log(error instanceof Error ? error.message : 'research frame upload failed')
    }

    this.elements.researchCaptureButton.textContent = 'Upload Research Frame'
    this.elements.researchCaptureButton.disabled = false
  }

  private startAutoResearchCapture(): void {
    const params = new URLSearchParams(window.location.search)
    if (params.get('research') !== 'auto' || this.researchAutoTimer !== null) {
      return
    }

    if (this.scene.getTrackingSnapshot().isXRActive) {
      this.log('auto image capture disabled in AR: WebXR passthrough is not readable')
      return
    }

    const totalFrames = clampInt(Number(params.get('frames') ?? 16), 1, 80)
    const intervalMs = clampInt(Number(params.get('interval') ?? 900), 300, 5000)
    let captured = 0
    this.log(`auto research capture: ${totalFrames} frames`)

    this.researchAutoTimer = window.setInterval(() => {
      if (this.scene.getTrackingSnapshot().isXRActive || captured >= totalFrames) {
        this.stopAutoResearchCapture()
        return
      }

      captured += 1
      void this.uploadResearchFrame()
    }, intervalMs)
  }

  private stopAutoResearchCapture(): void {
    if (this.researchAutoTimer === null) {
      return
    }

    window.clearInterval(this.researchAutoTimer)
    this.researchAutoTimer = null
    this.log('auto research capture stopped')
  }

  private handleSceneTap(event: MouseEvent): void {
    if (!this.scene.getTrackingSnapshot().isXRActive) {
      return
    }

    if (event.detail >= 2) {
      void this.relocalizeFromAnchor()
      return
    }

    window.setTimeout(() => {
      if (event.detail === 1) {
        void this.saveLocalAnchor()
      }
    }, 220)
  }

  private async captureFeatureSet(): Promise<FeaturePoint[]> {
    try {
      const frame = await this.cameraFrames.capture()
      const tracking = this.scene.getTrackingSnapshot()
      const features = await createImageFeatures({
        ...frame,
        projectionMatrix: tracking.projectionMatrix,
        worldFromCamera: tracking.worldFromCamera,
        depthAt: tracking.depthAt,
      })

      const depthLabel = tracking.hasDepth ? 'XR depth' : 'estimated depth'
      const poseLabel = tracking.isXRActive ? 'XR pose' : 'camera frame only'
      this.log(`captured ${frame.width}x${frame.height}, ${depthLabel}, ${poseLabel}`)

      if (features.length >= 3) {
        return features
      }


      this.log('not enough visual features; using synthetic fallback')
      return createSyntheticFeatures()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'camera capture failed'
      this.log(`${message}; using synthetic fallback`)
      return createSyntheticFeatures()
    }
  }

  private receiveFeatures(buffer: ArrayBuffer): void {
    try {
      this.remoteFeatures = decodeFeatures(buffer)
      this.log(`received ${this.remoteFeatures.length} feature points`)
      this.solveIfReady()
    } catch (error) {
      this.log(error instanceof Error ? error.message : 'failed to decode feature payload')
    }
  }

  private solveIfReady(): void {
    if (this.localFeatures.length < 3 || this.remoteFeatures.length < 3) {
      return
    }

    const matches = matchFeatures(this.localFeatures, this.remoteFeatures)
    this.elements.matchStatus.textContent = `${matches.length} matches`
    this.log(`${matches.length} matches found`)

    if (matches.length < 3) {
      this.elements.transformState.textContent = 'not enough matches'
      return
    }

    const result = ransac(matches)
    this.elements.inlierCount.textContent = `${result.inliers.length}`

    if (result.inliers.length < MIN_TRUSTED_INLIERS) {
      this.elements.transformState.textContent = `untrusted: ${result.inliers.length}/${MIN_TRUSTED_INLIERS} inliers`
      this.log(`rejected T_AB: ${result.inliers.length} inliers below ${MIN_TRUSTED_INLIERS}`)
      return
    }

    this.elements.transformState.textContent = `${Math.round(result.error * 1000)}mm mean error`
    this.scene.setSharedTransform(result.matrix)
    this.peer.sendPose(result.matrix)
    this.log(`T_AB solved with ${result.inliers.length} inliers`)
  }

  private log(message: string): void {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    this.elements.log.textContent = [`[${now}] ${message}`, ...this.elements.log.textContent.split('\n')].slice(0, 12).join('\n')
  }
}

function loadLocalAnchor(): SavedLocalAnchor | null {
  const raw = localStorage.getItem(LOCAL_ANCHOR_KEY)
  if (!raw) {
    return null
  }

  try {
    const value = JSON.parse(raw) as SavedLocalAnchor
    return value.version === 1 && typeof value.features === 'string' ? value : null
  } catch {
    return null
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function createResearchSessionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${random}`
}

function getResearchServerUrl(): string {
  // @ts-ignore
  return import.meta.env?.VITE_SIGNALING_URL ?? `${window.location.protocol}//${window.location.hostname}:3001`
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('failed to read blob'))
    reader.readAsDataURL(blob)
  })

  return dataUrl.split(',')[1] ?? ''
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.max(min, Math.min(max, Math.round(value)))
}
