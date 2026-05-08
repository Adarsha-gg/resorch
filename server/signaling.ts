import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { Server } from 'socket.io'

type SignalEnvelope = {
  roomCode: string
  payload: unknown
}

type ResearchCaptureBody = {
  sessionId?: string
  roomCode?: string
  frameIndex?: number
  timestamp?: string
  width?: number
  height?: number
  imageBase64?: string
  tracking?: unknown
}

const port = Number(process.env.PORT ?? 3001)
const app = express()
app.use(express.json({ limit: '12mb' }))
const keyPath = process.env.SIGNALING_HTTPS_KEY ?? process.env.HTTPS_KEY
const certPath = process.env.SIGNALING_HTTPS_CERT ?? process.env.HTTPS_CERT
const tls =
  keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    : null
const server = tls ? https.createServer(tls, app) : http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
})

app.get('/health', (_request, response) => {
  response.json({ ok: true })
})

app.post('/research/captures', async (request, response) => {
  const body = request.body as ResearchCaptureBody
  const sessionId = safeSegment(body.sessionId ?? '')
  const frameIndex = Number.isInteger(body.frameIndex) ? body.frameIndex! : null

  if (!sessionId || frameIndex === null || !body.imageBase64) {
    response.status(400).json({ ok: false, error: 'sessionId, frameIndex, and imageBase64 are required' })
    return
  }

  const captureDir = path.resolve('..', 'output', 'research-captures', sessionId)
  const framesDir = path.join(captureDir, 'frames')
  await fs.promises.mkdir(framesDir, { recursive: true })

  const frameName = `${String(frameIndex).padStart(4, '0')}.jpg`
  const framePath = path.join(framesDir, frameName)
  const image = Buffer.from(body.imageBase64, 'base64')
  await fs.promises.writeFile(framePath, image)

  const metadata = {
    sessionId,
    roomCode: body.roomCode ?? null,
    frameIndex,
    frameName,
    timestamp: body.timestamp ?? new Date().toISOString(),
    width: body.width ?? null,
    height: body.height ?? null,
    tracking: body.tracking ?? null,
  }
  await fs.promises.appendFile(path.join(captureDir, 'metadata.jsonl'), `${JSON.stringify(metadata)}\n`)

  response.json({ ok: true, sessionId, frameName })
})

io.on('connection', (socket) => {
  socket.on('join', (roomCode: string) => {
    const room = normalizeRoom(roomCode)
    if (!room) {
      return
    }

    socket.join(room)
    socket.data.roomCode = room
    socket.to(room).emit('peer-joined')
  })

  socket.on('signal', (message: SignalEnvelope) => {
    const room = normalizeRoom(message.roomCode ?? socket.data.roomCode)
    if (!room) {
      return
    }

    socket.to(room).emit('signal', message.payload)
  })

  socket.on('disconnect', () => {
    const room = normalizeRoom(socket.data.roomCode)
    if (room) {
      socket.to(room).emit('peer-left')
    }
  })
})

server.listen(port, '0.0.0.0', () => {
  const protocol = tls ? 'https' : 'http'
  console.log(`signaling server listening on ${protocol}://0.0.0.0:${port}`)
})

function normalizeRoom(roomCode: unknown): string | null {
  if (typeof roomCode !== 'string') {
    return null
  }

  const room = roomCode.trim().toUpperCase()
  return /^[A-Z0-9]{4,12}$/.test(room) ? room : null
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 96)
}
