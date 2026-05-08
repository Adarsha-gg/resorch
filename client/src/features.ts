import type { Vec3 } from './geometry'

export type ImageFeatureFrame = {
  width: number
  height: number
  grayscale: Uint8ClampedArray
  projectionMatrix?: Float32Array | number[]
  worldFromCamera?: Float32Array | number[]
  depthAt?: (normalizedX: number, normalizedY: number) => number | null
}

export type FeaturePoint = {
  position: Vec3
  descriptor: Float32Array
  score: number
}

export type FeatureMatch = {
  local: FeaturePoint
  remote: FeaturePoint
  distance: number
}

const DESCRIPTOR_SIZE = 384 // all-MiniLM-L6-v2 outputs 384-dimensional embeddings
const HEADER_BYTES = 4
const POINT_BYTES = 3 * Float32Array.BYTES_PER_ELEMENT
const DESCRIPTOR_BYTES = DESCRIPTOR_SIZE * Float32Array.BYTES_PER_ELEMENT
const FEATURE_BYTES = POINT_BYTES + DESCRIPTOR_BYTES
const PATCH_RADIUS = 8

// Setup WebWorker for Neural Feature Extraction
const worker = new Worker(new URL('./feature-worker.ts', import.meta.url), { type: 'module' })
let workerId = 0
const pendingRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>()

worker.onmessage = (e) => {
  const { id, type, descriptor, error } = e.data
  const req = pendingRequests.get(id)
  if (!req) return

  if (type === 'error') {
    req.reject(new Error(error))
  } else {
    req.resolve(descriptor)
  }
  pendingRequests.delete(id)
}

// Initialize the worker immediately
worker.postMessage({ id: workerId++, type: 'init' })

async function extractNeuralDescriptorBatch(patchDataUrls: string[]): Promise<Float32Array> {
  const id = workerId++
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    worker.postMessage({ id, type: 'extract_batch', payload: patchDataUrls })
  })
}

// Helper to convert a patch to a data URL
function patchToDataUrl(frame: ImageFeatureFrame, u: number, v: number): string {
  const canvas = document.createElement('canvas')
  const size = PATCH_RADIUS * 2
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(size, size)
  
  let i = 0
  for (let y = -PATCH_RADIUS; y < PATCH_RADIUS; y++) {
    for (let x = -PATCH_RADIUS; x < PATCH_RADIUS; x++) {
      const px = clamp(Math.round(u + x), 0, frame.width - 1)
      const py = clamp(Math.round(v + y), 0, frame.height - 1)
      const val = frame.grayscale[py * frame.width + px]
      imgData.data[i++] = val // R
      imgData.data[i++] = val // G
      imgData.data[i++] = val // B
      imgData.data[i++] = 255 // A
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export function encodeFeatures(features: FeaturePoint[]): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + features.length * FEATURE_BYTES)
  const view = new DataView(buffer)
  view.setUint32(0, features.length, true)

  let offset = HEADER_BYTES
  for (const feature of features) {
    view.setFloat32(offset, feature.position.x, true)
    view.setFloat32(offset + 4, feature.position.y, true)
    view.setFloat32(offset + 8, feature.position.z, true)
    offset += POINT_BYTES

    for (let i = 0; i < DESCRIPTOR_SIZE; i += 1) {
      view.setFloat32(offset + i * 4, feature.descriptor[i] ?? 0, true)
    }
    offset += DESCRIPTOR_BYTES
  }

  return buffer
}

export function decodeFeatures(buffer: ArrayBuffer): FeaturePoint[] {
  const view = new DataView(buffer)
  const count = view.getUint32(0, true)
  const expectedBytes = HEADER_BYTES + count * FEATURE_BYTES
  if (buffer.byteLength < expectedBytes) {
    throw new Error(`Feature payload is truncated: ${buffer.byteLength}/${expectedBytes} bytes`)
  }

  const features: FeaturePoint[] = []
  let offset = HEADER_BYTES
  for (let i = 0; i < count; i += 1) {
    const position = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }
    offset += POINT_BYTES

    const descriptor = new Float32Array(DESCRIPTOR_SIZE)
    for (let j = 0; j < DESCRIPTOR_SIZE; j += 1) {
      descriptor[j] = view.getFloat32(offset + j * 4, true)
    }
    offset += DESCRIPTOR_BYTES

    features.push({ position, descriptor, score: 1 })
  }

  return features
}

export function matchFeatures(local: FeaturePoint[], remote: FeaturePoint[]): FeatureMatch[] {
  const matches: FeatureMatch[] = []

  for (const remoteFeature of remote) {
    let best: FeaturePoint | undefined
    let bestDistance = Number.POSITIVE_INFINITY
    let secondDistance = Number.POSITIVE_INFINITY

    for (const localFeature of local) {
      const distance = cosineDistance(remoteFeature.descriptor, localFeature.descriptor)
      if (distance < bestDistance) {
        secondDistance = bestDistance
        bestDistance = distance
        best = localFeature
      } else if (distance < secondDistance) {
        secondDistance = distance
      }
    }

    if (best && secondDistance > 0 && bestDistance / secondDistance < 0.8) {
      matches.push({ local: best, remote: remoteFeature, distance: bestDistance })
    }
  }

  return matches
}

export function createSyntheticFeatures(count = 80): FeaturePoint[] {
  const features: FeaturePoint[] = []
  for (let i = 0; i < count; i += 1) {
    const theta = i * 0.61803398875
    const radius = 0.35 + (i % 9) * 0.035
    const position = {
      x: Math.cos(theta) * radius,
      y: 0.75 + (i % 7) * 0.07,
      z: -1.2 + Math.sin(theta) * radius,
    }
    features.push({
      position,
      descriptor: descriptorForIndex(i),
      score: 1 - i / count,
    })
  }

  return features
}

export async function createImageFeatures(frame: ImageFeatureFrame, count = 160): Promise<FeaturePoint[]> {
  const candidates = findCornerCandidates(frame)
  const features: FeaturePoint[] = []
  const occupiedCells = new Set<string>()
  const cellSize = 18

  const selectedCandidates = []
  for (const candidate of candidates) {
    const cell = `${Math.floor(candidate.u / cellSize)}:${Math.floor(candidate.v / cellSize)}`
    if (occupiedCells.has(cell)) {
      continue
    }

    selectedCandidates.push(candidate)
    occupiedCells.add(cell)

    if (selectedCandidates.length >= count) {
      break
    }
  }

  const patchUrls = selectedCandidates.map(c => patchToDataUrl(frame, c.u, c.v))
  
  let descriptors: Float32Array | null = null
  try {
      if (patchUrls.length > 0) {
          descriptors = await extractNeuralDescriptorBatch(patchUrls)
      }
  } catch (e) {
      console.warn("Failed neural batch extraction, falling back to manual patch", e)
  }

  for (let i = 0; i < selectedCandidates.length; i++) {
      const candidate = selectedCandidates[i]
      let descriptor: Float32Array
      if (descriptors && descriptors.length >= (i + 1) * DESCRIPTOR_SIZE) {
          descriptor = descriptors.slice(i * DESCRIPTOR_SIZE, (i + 1) * DESCRIPTOR_SIZE)
      } else {
          descriptor = patchDescriptor(frame, candidate.u, candidate.v)
      }

      const depth = validDepth(frame.depthAt?.(candidate.u / frame.width, candidate.v / frame.height)) ?? fallbackDepth(candidate.v, frame.height)
      features.push({
        position: unprojectToWorld(frame, candidate.u, candidate.v, depth),
        descriptor,
        score: candidate.score,
      })
  }

  return features
}

function descriptorForIndex(index: number): Float32Array {
  const descriptor = new Float32Array(DESCRIPTOR_SIZE)
  let norm = 0
  for (let i = 0; i < DESCRIPTOR_SIZE; i += 1) {
    const value = Math.sin(index * 12.9898 + i * 78.233) * 43758.5453
    descriptor[i] = value - Math.floor(value) - 0.5
    norm += descriptor[i] * descriptor[i]
  }

  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < DESCRIPTOR_SIZE; i += 1) {
    descriptor[i] /= norm
  }

  return descriptor
}

function findCornerCandidates(frame: ImageFeatureFrame): Array<{ u: number; v: number; score: number }> {
  const candidates: Array<{ u: number; v: number; score: number }> = []
  const { width, height, grayscale } = frame

  for (let v = PATCH_RADIUS + 1; v < height - PATCH_RADIUS - 1; v += 4) {
    for (let u = PATCH_RADIUS + 1; u < width - PATCH_RADIUS - 1; u += 4) {
      const idx = v * width + u
      const dx = grayscale[idx + 1] - grayscale[idx - 1]
      const dy = grayscale[idx + width] - grayscale[idx - width]
      const dxy =
        Math.abs(grayscale[idx + width + 1] - grayscale[idx - width - 1]) +
        Math.abs(grayscale[idx + width - 1] - grayscale[idx - width + 1])
      const score = dx * dx + dy * dy + dxy * dxy * 0.25
      if (score > 320) {
        candidates.push({ u, v, score })
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

function patchDescriptor(frame: ImageFeatureFrame, u: number, v: number): Float32Array {
  // Fallback / legacy descriptor, zero padded to 384
  const descriptor = new Float32Array(DESCRIPTOR_SIZE)
  let mean = 0
  let slot = 0
  const maxSlots = (PATCH_RADIUS * 2) * (PATCH_RADIUS * 2)

  for (let y = -PATCH_RADIUS; y < PATCH_RADIUS; y += 1) {
    for (let x = -PATCH_RADIUS; x < PATCH_RADIUS; x += 1) {
      const px = clamp(Math.round(u + x), 0, frame.width - 1)
      const py = clamp(Math.round(v + y), 0, frame.height - 1)
      const value = frame.grayscale[py * frame.width + px] / 255
      descriptor[slot] = value
      mean += value
      slot += 1
    }
  }

  mean /= maxSlots
  let variance = 0
  for (let i = 0; i < maxSlots; i += 1) {
    descriptor[i] -= mean
    variance += descriptor[i] * descriptor[i]
  }

  const norm = Math.sqrt(variance) || 1
  for (let i = 0; i < maxSlots; i += 1) {
    descriptor[i] /= norm
  }

  return descriptor
}

function unprojectToWorld(frame: ImageFeatureFrame, u: number, v: number, depth: number): Vec3 {
  const projection = frame.projectionMatrix
  const fx = projection ? Math.abs(projection[0]) * frame.width * 0.5 : frame.width * 0.78
  const fy = projection ? Math.abs(projection[5]) * frame.height * 0.5 : frame.height * 0.78
  const cx = projection ? (1 - projection[8]) * frame.width * 0.5 : frame.width * 0.5
  const cy = projection ? (1 + projection[9]) * frame.height * 0.5 : frame.height * 0.5
  const cameraPoint = {
    x: ((u - cx) / fx) * depth,
    y: -((v - cy) / fy) * depth,
    z: -depth,
  }

  if (!frame.worldFromCamera) {
    return cameraPoint
  }

  const m = frame.worldFromCamera
  return {
    x: m[0] * cameraPoint.x + m[4] * cameraPoint.y + m[8] * cameraPoint.z + m[12],
    y: m[1] * cameraPoint.x + m[5] * cameraPoint.y + m[9] * cameraPoint.z + m[13],
    z: m[2] * cameraPoint.x + m[6] * cameraPoint.y + m[10] * cameraPoint.z + m[14],
  }
}

function validDepth(depth: number | null | undefined): number | null {
  if (!depth || !Number.isFinite(depth) || depth <= 0.15 || depth > 5) {
    return null
  }

  return depth
}

function fallbackDepth(v: number, height: number): number {
  return 0.85 + (v / height) * 1.25
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let aNorm = 0
  let bNorm = 0
  const length = Math.min(a.length, b.length)

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i]
    aNorm += a[i] * a[i]
    bNorm += b[i] * b[i]
  }

  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm)
  return denom === 0 ? Number.POSITIVE_INFINITY : 1 - dot / denom
}
