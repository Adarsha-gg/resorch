export type PeerController = {
  createOffer: () => Promise<void>
  handleSignal: (payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => Promise<void>
  sendDescriptorBlob: (buffer: ArrayBuffer) => void
  sendPose: (matrix: Float32Array | number[]) => void
  sendPing: () => void
  onDescriptorBlob: (callback: (buffer: ArrayBuffer) => void) => void
  onPose: (callback: (matrix: Float32Array) => void) => void
  onMessage: (callback: (message: string) => void) => void
  onStatus: (callback: (status: string) => void) => void
  close: () => void
}

export function createPeerController(
  sendSignal: (payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => void,
): PeerController {
  const connection = new RTCPeerConnection({ iceServers: [] })
  const statusCallbacks = new Set<(status: string) => void>()
  const messageCallbacks = new Set<(message: string) => void>()
  const descriptorCallbacks = new Set<(buffer: ArrayBuffer) => void>()
  const poseCallbacks = new Set<(matrix: Float32Array) => void>()

  let descriptorChannel = createChannel('descriptors', { ordered: true, maxRetransmits: 0 })
  let poseChannel = createChannel('pose', { ordered: true })

  connection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(event.candidate.toJSON())
    }
  }
  connection.onconnectionstatechange = () => emitStatus(connection.connectionState)
  connection.ondatachannel = (event) => {
    if (event.channel.label === 'descriptors') {
      descriptorChannel = event.channel
      wireDescriptorChannel(descriptorChannel)
    }
    if (event.channel.label === 'pose') {
      poseChannel = event.channel
      wirePoseChannel(poseChannel)
    }
  }

  wireDescriptorChannel(descriptorChannel)
  wirePoseChannel(poseChannel)

  function createChannel(label: string, options: RTCDataChannelInit): RTCDataChannel {
    const channel = connection.createDataChannel(label, options)
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => emitStatus(`${label} channel open`)
    channel.onclose = () => emitStatus(`${label} channel closed`)
    channel.onerror = () => emitStatus(`${label} channel error`)
    return channel
  }

  function wireDescriptorChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        messageCallbacks.forEach((callback) => callback(event.data))
        return
      }
      descriptorCallbacks.forEach((callback) => callback(event.data as ArrayBuffer))
    }
    channel.onopen = () => emitStatus('descriptors channel open')
    channel.onclose = () => emitStatus('descriptors channel closed')
  }

  function wirePoseChannel(channel: RTCDataChannel): void {
    channel.binaryType = 'arraybuffer'
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        messageCallbacks.forEach((callback) => callback(event.data))
        return
      }
      poseCallbacks.forEach((callback) => callback(new Float32Array(event.data as ArrayBuffer)))
    }
    channel.onopen = () => emitStatus('pose channel open')
    channel.onclose = () => emitStatus('pose channel closed')
  }

  function emitStatus(status: string): void {
    statusCallbacks.forEach((callback) => callback(status))
  }

  async function handleSignal(payload: RTCSessionDescriptionInit | RTCIceCandidateInit): Promise<void> {
    if ('type' in payload && payload.type) {
      await connection.setRemoteDescription(payload)
      if (payload.type === 'offer') {
        const answer = await connection.createAnswer()
        await connection.setLocalDescription(answer)
        sendSignal(answer)
      }
      return
    }

    await connection.addIceCandidate(payload as RTCIceCandidateInit)
  }

  return {
    async createOffer() {
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      sendSignal(offer)
    },
    handleSignal,
    sendDescriptorBlob(buffer) {
      if (descriptorChannel.readyState === 'open') {
        descriptorChannel.send(buffer)
      }
    },
    sendPose(matrix) {
      if (poseChannel.readyState === 'open') {
        poseChannel.send(new Float32Array(matrix).buffer)
      }
    },
    sendPing() {
      if (descriptorChannel.readyState === 'open') {
        descriptorChannel.send('ping')
      }
    },
    onDescriptorBlob(callback) {
      descriptorCallbacks.add(callback)
    },
    onPose(callback) {
      poseCallbacks.add(callback)
    },
    onMessage(callback) {
      messageCallbacks.add(callback)
    },
    onStatus(callback) {
      statusCallbacks.add(callback)
    },
    close() {
      descriptorChannel.close()
      poseChannel.close()
      connection.close()
    },
  }
}
