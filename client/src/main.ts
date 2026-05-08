import './style.css'
import { HandshakeController } from './handshake'
import { createRoomCode } from './signaling'
import { createXRScene } from './xr-session'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <section class="viewport" aria-label="AR scene preview">
      <div id="scene-root" class="scene-root"></div>
      <div class="reticle" aria-hidden="true"></div>
      <div class="status-strip">
        <span id="xr-status">WebXR idle</span>
        <span id="peer-status">Peer offline</span>
        <span id="match-status">0 matches</span>
      </div>
    </section>

    <aside class="panel" aria-label="Spatial handshake controls">
      <div class="brand-block">
        <p class="eyebrow">Spatial DNS Protocol</p>
        <h1>Room Handshake</h1>
      </div>

      <div class="room-code" aria-live="polite">
        <span>Room</span>
        <strong id="room-code"></strong>
      </div>

      <div class="controls">
        <button id="connect-button" type="button">Join Room</button>
        <button id="ping-button" type="button" disabled>Send Ping</button>
        <button id="capture-button" type="button" disabled>Capture Features</button>
        <button id="save-anchor-button" type="button">Save Local Anchor</button>
        <button id="relocalize-button" type="button">Relocalize</button>
        <button id="research-capture-button" type="button">Upload Research Frame</button>
      </div>

      <dl class="metrics">
        <div>
          <dt>Data channel</dt>
          <dd id="channel-state">closed</dd>
        </div>
        <div>
          <dt>Inliers</dt>
          <dd id="inlier-count">0</dd>
        </div>
        <div>
          <dt>Transform</dt>
          <dd id="transform-state">not solved</dd>
        </div>
      </dl>

      <pre id="log" class="log" aria-live="polite"></pre>
    </aside>
  </main>
`

const roomCode = new URLSearchParams(window.location.search).get('room') ?? createRoomCode()
const scene = createXRScene(document.querySelector<HTMLDivElement>('#scene-root')!)

const controller = new HandshakeController({
  roomCode,
  scene,
  elements: {
    roomCode: document.querySelector<HTMLElement>('#room-code')!,
    xrStatus: document.querySelector<HTMLElement>('#xr-status')!,
    peerStatus: document.querySelector<HTMLElement>('#peer-status')!,
    matchStatus: document.querySelector<HTMLElement>('#match-status')!,
    channelState: document.querySelector<HTMLElement>('#channel-state')!,
    inlierCount: document.querySelector<HTMLElement>('#inlier-count')!,
    transformState: document.querySelector<HTMLElement>('#transform-state')!,
    log: document.querySelector<HTMLElement>('#log')!,
    connectButton: document.querySelector<HTMLButtonElement>('#connect-button')!,
    pingButton: document.querySelector<HTMLButtonElement>('#ping-button')!,
    captureButton: document.querySelector<HTMLButtonElement>('#capture-button')!,
    saveAnchorButton: document.querySelector<HTMLButtonElement>('#save-anchor-button')!,
    relocalizeButton: document.querySelector<HTMLButtonElement>('#relocalize-button')!,
    researchCaptureButton: document.querySelector<HTMLButtonElement>('#research-capture-button')!,
  },
})

controller.start()
