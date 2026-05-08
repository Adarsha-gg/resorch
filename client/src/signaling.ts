import { io, type Socket } from 'socket.io-client'

export type SignalEnvelope = {
  roomCode: string
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit
}

export type SignalingClient = {
  connect: () => void
  disconnect: () => void
  sendSignal: (payload: SignalEnvelope['payload']) => void
  onPeerJoined: (callback: () => void) => void
  onSignal: (callback: (payload: SignalEnvelope['payload']) => void) => void
  onStatus: (callback: (status: string) => void) => void
}

export function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export function createSignalingClient(roomCode: string): SignalingClient {
  const url = import.meta.env.VITE_SIGNALING_URL ?? `${window.location.protocol}//${window.location.hostname}:3001`
  const socket: Socket = io(url, { autoConnect: false, transports: ['websocket'] })
  const peerJoinedCallbacks = new Set<() => void>()
  const signalCallbacks = new Set<(payload: SignalEnvelope['payload']) => void>()
  const statusCallbacks = new Set<(status: string) => void>()

  socket.on('connect', () => {
    emitStatus('signaling connected')
    socket.emit('join', roomCode)
  })
  socket.on('disconnect', () => emitStatus('signaling offline'))
  socket.on('connect_error', (error) => emitStatus(`signaling error: ${error.message}`))
  socket.on('peer-joined', () => peerJoinedCallbacks.forEach((callback) => callback()))
  socket.on('signal', (payload: SignalEnvelope['payload']) => {
    signalCallbacks.forEach((callback) => callback(payload))
  })

  function emitStatus(status: string): void {
    statusCallbacks.forEach((callback) => callback(status))
  }

  return {
    connect() {
      socket.connect()
    },
    disconnect() {
      socket.disconnect()
    },
    sendSignal(payload) {
      socket.emit('signal', { roomCode, payload } satisfies SignalEnvelope)
    },
    onPeerJoined(callback) {
      peerJoinedCallbacks.add(callback)
    },
    onSignal(callback) {
      signalCallbacks.add(callback)
    },
    onStatus(callback) {
      statusCallbacks.add(callback)
    },
  }
}
