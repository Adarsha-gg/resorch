export type CameraFrame = {
  width: number
  height: number
  grayscale: Uint8ClampedArray
}

export type CameraImageCapture = CameraFrame & {
  jpeg: Blob
}

export class CameraFrameSource {
  private video?: HTMLVideoElement
  private canvas?: HTMLCanvasElement
  private context?: CanvasRenderingContext2D
  private stream?: MediaStream

  async capture(): Promise<CameraFrame> {
    await this.ensureStream()

    const video = this.video!
    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    const canvas = this.canvas ?? document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    this.canvas = canvas

    const context = this.context ?? canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      throw new Error('2D canvas is unavailable for camera capture')
    }
    this.context = context

    context.drawImage(video, 0, 0, width, height)
    const image = context.getImageData(0, 0, width, height)
    const grayscale = new Uint8ClampedArray(width * height)

    for (let src = 0, dst = 0; src < image.data.length; src += 4, dst += 1) {
      grayscale[dst] = Math.round(image.data[src] * 0.299 + image.data[src + 1] * 0.587 + image.data[src + 2] * 0.114)
    }

    return { width, height, grayscale }
  }

  async captureJpeg(quality = 0.85): Promise<CameraImageCapture> {
    const frame = await this.capture()
    if (!this.canvas) {
      throw new Error('camera canvas is unavailable')
    }

    const jpeg = await new Promise<Blob>((resolve, reject) => {
      this.canvas!.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('failed to encode camera frame'))
          }
        },
        'image/jpeg',
        quality,
      )
    })

    return { ...frame, jpeg }
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = undefined
    this.video?.remove()
    this.video = undefined
  }

  private async ensureStream(): Promise<void> {
    if (this.stream && this.video?.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA) {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('camera capture is unavailable in this browser')
    }

    const facingMode = new URLSearchParams(window.location.search).get('camera') === 'user' ? 'user' : 'environment'
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    })

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = stream
    await video.play()
    await waitForVideoDimensions(video)

    this.stream = stream
    this.video = video
  }
}

function waitForVideoDimensions(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true })
  })
}
