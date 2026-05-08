import type { FeatureMatch } from './features'

export type Vec3 = {
  x: number
  y: number
  z: number
}

export type Mat4 = Float32Array<ArrayBufferLike>

export type RansacResult = {
  matrix: Mat4
  inliers: FeatureMatch[]
  error: number
}

const IDENTITY_VALUES = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

export function umeyama(srcPts: Vec3[], dstPts: Vec3[]): Mat4 {
  if (srcPts.length !== dstPts.length || srcPts.length < 3) {
    throw new Error('umeyama requires at least three paired points')
  }

  const srcMean = mean(srcPts)
  const dstMean = mean(dstPts)
  const covariance = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]

  for (let i = 0; i < srcPts.length; i += 1) {
    const src = sub(srcPts[i], srcMean)
    const dst = sub(dstPts[i], dstMean)
    covariance[0][0] += src.x * dst.x
    covariance[0][1] += src.x * dst.y
    covariance[0][2] += src.x * dst.z
    covariance[1][0] += src.y * dst.x
    covariance[1][1] += src.y * dst.y
    covariance[1][2] += src.y * dst.z
    covariance[2][0] += src.z * dst.x
    covariance[2][1] += src.z * dst.y
    covariance[2][2] += src.z * dst.z
  }

  const rotation = rotationFromCovariance(covariance)
  const rotatedMean = applyRotation(rotation, srcMean)
  const translation = sub(dstMean, rotatedMean)

  return new Float32Array([
    rotation[0][0],
    rotation[1][0],
    rotation[2][0],
    0,
    rotation[0][1],
    rotation[1][1],
    rotation[2][1],
    0,
    rotation[0][2],
    rotation[1][2],
    rotation[2][2],
    0,
    translation.x,
    translation.y,
    translation.z,
    1,
  ])
}

export function ransac(matches: FeatureMatch[], iters = 200, threshold = 0.05): RansacResult {
  if (matches.length < 3) {
    return { matrix: new Float32Array(IDENTITY_VALUES), inliers: [], error: Number.POSITIVE_INFINITY }
  }

  let bestMatrix: Mat4 = new Float32Array(IDENTITY_VALUES)
  let bestInliers: FeatureMatch[] = []
  let bestError = Number.POSITIVE_INFINITY

  for (let i = 0; i < iters; i += 1) {
    const sample = sampleThree(matches, i)
    const matrix = umeyama(
      sample.map((match) => match.remote.position),
      sample.map((match) => match.local.position),
    )
    const inliers = matches.filter((match) => {
      const transformed = transformPoint(matrix, match.remote.position)
      return distance(transformed, match.local.position) < threshold
    })

    if (inliers.length >= 3 && inliers.length > bestInliers.length) {
      const refined = umeyama(
        inliers.map((match) => match.remote.position),
        inliers.map((match) => match.local.position),
      )
      bestMatrix = refined
      bestInliers = inliers
      bestError = meanError(refined, inliers)
    }
  }

  return {
    matrix: bestMatrix,
    inliers: bestInliers,
    error: bestError,
  }
}

export function transformPoint(matrix: Mat4 | number[], point: Vec3): Vec3 {
  return {
    x: matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12],
    y: matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13],
    z: matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14],
  }
}

function mean(points: Vec3[]): Vec3 {
  const total = points.reduce((acc, point) => add(acc, point), { x: 0, y: 0, z: 0 })
  return scale(total, 1 / points.length)
}

function meanError(matrix: Mat4, matches: FeatureMatch[]): number {
  if (matches.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  const total = matches.reduce((acc, match) => {
    return acc + distance(transformPoint(matrix, match.remote.position), match.local.position)
  }, 0)
  return total / matches.length
}

function rotationFromCovariance(s: number[][]): number[][] {
  const sxx = s[0][0]
  const sxy = s[0][1]
  const sxz = s[0][2]
  const syx = s[1][0]
  const syy = s[1][1]
  const syz = s[1][2]
  const szx = s[2][0]
  const szy = s[2][1]
  const szz = s[2][2]
  const trace = sxx + syy + szz

  const n = [
    [trace, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ]

  const q = dominantEigenvector(n)
  return quaternionToMatrix(q)
}

function dominantEigenvector(matrix: number[][]): [number, number, number, number] {
  let vector: [number, number, number, number] = [1, 0, 0, 0]
  for (let iter = 0; iter < 32; iter += 1) {
    const next: [number, number, number, number] = [0, 0, 0, 0]
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        next[row] += matrix[row][col] * vector[col]
      }
    }
    const norm = Math.hypot(next[0], next[1], next[2], next[3]) || 1
    vector = [next[0] / norm, next[1] / norm, next[2] / norm, next[3] / norm]
  }
  return vector
}

function quaternionToMatrix([w, x, y, z]: [number, number, number, number]): number[][] {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ]
}

function sampleThree(matches: FeatureMatch[], seed: number): [FeatureMatch, FeatureMatch, FeatureMatch] {
  const first = seededIndex(seed + 13, matches.length)
  let second = seededIndex(seed + 37, matches.length)
  let third = seededIndex(seed + 71, matches.length)

  if (second === first) {
    second = (second + 1) % matches.length
  }
  while (third === first || third === second) {
    third = (third + 1) % matches.length
  }

  return [matches[first], matches[second], matches[third]]
}

function seededIndex(seed: number, length: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return Math.floor((value - Math.floor(value)) * length)
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(a: Vec3, value: number): Vec3 {
  return { x: a.x * value, y: a.y * value, z: a.z * value }
}

function applyRotation(rotation: number[][], point: Vec3): Vec3 {
  return {
    x: rotation[0][0] * point.x + rotation[0][1] * point.y + rotation[0][2] * point.z,
    y: rotation[1][0] * point.x + rotation[1][1] * point.y + rotation[1][2] * point.z,
    z: rotation[2][0] * point.x + rotation[2][1] * point.y + rotation[2][2] * point.z,
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
