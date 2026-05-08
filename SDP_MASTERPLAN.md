# Project: Spatial DNS Protocol (SDP)
## Subtitle: The TCP/IP of Reality
**Founder:** Adarsha (CS/Math Sophomore)
**Thesis:** AR is a Networking problem, not a Graphics problem. Whoever owns the "Handshake" that allows different devices to agree on 3D coordinates in the same room without a central server owns the Spatial Web.

---

### 1. The "Thielian" Secret
Existing AR (Apple, Meta, Google) is built on **Centralized Spatial Extraction**. They require you to upload a 3D scan of your room to their clouds to "anchor" objects. This creates three massive failures:
1. **Privacy:** It is an illegal data-harvesting machine for enterprise/defense.
2. **Latency:** Cloud round-trips (>200ms) kill "social" presence.
3. **Walled Gardens:** An iPhone can't "see" what a Quest 3 sees in the same room.

**SDP's Contrarian Truth:** 3D coordinates should be resolved **locally via peer-to-peer consensus**, treating physical space as a routable network address.

---

### 2. The Core Hard-Tech Research (The "1000 Papers" Foundation)
We are not building a "wrapper." We are implementing the bleeding edge of 2025/2026 research.

#### A. Data Representation: Spatially Ordered Gaussians (SOG)
*   **The Paper:** *PlayCanvas / SuperSplat SOG Format (2025)*
*   **Why:** We compress 3D rooms into 2D WebP images using Morton-ordering. This allows us to stream "Reality" over low-bandwidth P2P connections (WebRTC) and render it at 90FPS on mobile GPUs.

#### B. The Privacy Moat: Sphere Clouds
*   **The Paper:** *Moon et al. (May 2026) "Sphere Clouds: Centroid-Convergent Line Clouds for Privacy"*
*   **Why:** We convert raw point clouds into line clouds that pass through a common centroid. It makes the data "human-unreadable" (protects against inversion attacks) while allowing our WebGPU solvers to align devices with millimeter precision.

#### C. The Consensus Engine: MAC-Ego3D & CoMA-SLAM
*   **The Paper:** *MAC-Ego3D (CVPR 2025) / CoMA-SLAM (AAAI 2025)*
*   **Why:** We use "Multi-Agent Gaussian Consensus." Instead of a central server, our devices "vote" on the 3D geometry of the room to eliminate "ghost objects" and drift.

#### D. The Global Registry: S2-DHT Mapping
*   **The Project:** *Berty / libp2p Spatial Discovery*
*   **Why:** We use Google's S2 Geometry (Level 31) to map every 1cm cube on earth to a 64-bit ID. This ID serves as a key in a libp2p DHT, allowing any device to find a "Spatial Anchor" for its location without a central database.

---

### 3. The Product: "Spatial DNS" SDK
We don't build a consumer app. We build the **Infrastructure Layer**.

*   **Step 1: SDP Handshake Library:** An NPM package that allows an AR developer to sync two users in a room with 3 lines of code.
*   **Step 2: Spatial DNS Registry:** A decentralized naming service where `room.lobby.sns` resolves to a specific 3D volume, allowing any AR glass to pull the "authorized" digital layer for that space.
*   **Step 3: The Coordinate Monopoly:** Once every AR game and enterprise app uses SDP for their LAN-sync, we control the "Index of Physical Reality."

---

### 4. Technical Architecture (The Implementation Stack)
*   **Frontend:** PlayCanvas (WebGPU/WebXR).
*   **Inference:** Transformers.js + LightGlue-ONNX (WebGPU feature extraction).
*   **Solvers:** SciRS2 (Rust-to-Wasm/WebGPU PnP & Essential Matrix).
*   **Networking:** Socket.io-WebTransport (Signaling) + PeerJS (WebRTC DataChannels for 6-DoF state).

---

### 5. Why this is the "Adarsha" Monopoly
1. **Uniquely Cross-Platform:** It's the only protocol that works on iOS, Android, and Quest via the browser.
2. **Zero-Trust Security:** It's the only protocol legal for use in hospitals and military bases (Sphere Clouds).
3. **The Hustle Moat:** While Big Tech fights over "Splat Quality," you are building the "Plumbing." By the time they realize AR is a networking problem, you already own the "Registry."

---

### 6. Immediate Execution (The "Day 1" Goal)
Build a **Markerless Handshake Demo**:
1. Two devices open a WebXR session.
2. They identify 5 shared visual features using WebGPU-LightGlue.
3. They exchange the 6-DoF offset via P2P WebRTC.
4. A virtual "Spatial DNS" cube appears in the exact same spot for both users. **Offline.**
