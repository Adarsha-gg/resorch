# Gemini Research Findings: Edge Geometry, Map-Free Relocalization & Decentralized SLAM (2026 Edition)

This document synthesizes the absolute bleeding-edge academic research from early **2026** across computer vision, robotics, and WebGPU architectures. These papers provide the theoretical and mathematical foundation for the Spatial Handshake MVP and the Spatial DNS Protocol (SDP).

## 1. One-Shot Anchoring: Map-Free Visual Relocalization (2026 SOTA)
The traditional AR approach requires pre-building and storing dense 3D point clouds. In 2026, the academic consensus has moved fully to "Map-Free" paradigms, and the architectures are shifting away from heavy Transformers towards State-Space Models (SSMs).

*   **FastForward (ICLR 2026):** Proposes a method to relocalize a query image *on-the-fly* in a single feed-forward pass. Instead of pre-building a map, it predicts image-to-scene correspondences directly from reference frames, achieving SOTA accuracy with near-zero map preparation time.
*   **DeMT / DMT-Loc (AAAI 2026):** Introduces the "Debiased Multiplex Tokenizer" built on a **Vision Mamba** encoder. It addresses the speed-accuracy dilemma by achieving linear time complexity for multi-view correspondences. It is explicitly designed for lightweight deployment on edge devices.
*   **Xiao et al. (IEEE 2026):** Demonstrated that integrating instance-level knowledge and monocular depth significantly improves scale recovery and reduces translation errors in map-free settings by over 1 meter.

**SDP Application:** This validates the "handshake" concept. Devices do not need to share a massive point cloud. Using models like FastForward or Mamba-based encoders, SDP devices can estimate a precise metric 6-DoF relative pose dynamically using only the initial handshake reference frames.

## 2. The Consensus Engine: Decentralized Pose Graph Optimization (PGO)
To achieve "TCP/IP of Reality", devices must agree on a coordinate frame without a central server. Research in 2026 has successfully deployed these systems in the harshest communication-constrained environments.

*   **riMESA (March 2026, arXiv:2603.01178):** A robust, incremental, and distributed back-end algorithm that uses Consensus Alternating Direction Method of Multipliers (C-ADMM). It specifically handles outlier measurements and limited P2P communication, outperforming prior distributed solvers by over **7x in accuracy**.
*   **Planetary Analogue C-SLAM (Jan 2026, arXiv:2601.21063):** Lajoie et al. proved decentralized C-SLAM works over highly constrained peer-to-peer networks (simulating Mars/Moon deployments). This research produced the first real-world P2P latency datasets for multi-robot C-SLAM.
*   **LPFE Framework (IEEE RA-L, Feb 2026):** Introduces "predictive coordination," allowing agents to anticipate peers' movements without explicit communication, drastically reducing the bandwidth needed for map exploration.

**SDP Application:** Once the initial handshake is made, SDP devices must employ decentralized PGO (like riMESA's C-ADMM) over WebRTC DataChannels. This allows continuous map merging and drift correction without a central server, resilient to the latency and jitter of real-world WiFi/5G.

## 3. Next-Gen Edge Representation: 3D Gaussian Splatting (3DGS)
For persistent spaces, storing massive point clouds is inefficient. In 2026, Point Cloud Data (PCD) is being actively replaced by Gaussian Splatting for spatial tracking and sharing.

*   **Structured Gaussian Mapping (IEEE VRW 2026):** Uses KD-tree guided approaches to reconstruct compact scenes from sequential RGB-D SLAM. It reduces the required number of Gaussians by up to 82% while maintaining visual fidelity, making high-fidelity SLAM practical for memory-constrained edge nodes.
*   **ACE Zero (ECCV 2024/2025):** Niantic's framework trains a tiny neural network (~4MB) to represent the coordinates of a specific scene. 

**SDP Application:** Spatial DNS entries should resolve to heavily culled, KD-tree optimized Spatially Ordered Gaussians (SOGs) or ~4MB ACE weight files. This enables instant loading and rendering over WebRTC.

## 4. Client-Side Inference: WebGPU-Native Vision (2026)
The hardware constraint of running SDP on Android Chrome/Quest browsers requires bypassing WebAssembly (WASM) and leaning entirely into WebGPU.

*   **WebSplatter (Feb 2026, arXiv:2602.03207):** An end-to-end framework enabling efficient 3DGS entirely in the browser via WebGPU. It implements a custom **wait-free hierarchical radix sort** in compute shaders to overcome WebGPU's lack of global atomics, achieving up to 4.5x speedups over previous web viewers.
*   **Visionary (Dec 2025 / 2026):** Unifies per-frame ONNX inference with WebGPU rendering. This allows the browser to perform dynamic neural processing natively without a backend.
*   **Subgroups API & WGSL (Chrome 128+ / 2026):** The adoption of the Subgroups API enables SIMD-level parallelism within WebGPU workgroups. Research shows that running feature extraction (like ORB or SIFT) natively in WGSL using Subgroups provides up to **100x speedup** over traditional WASM implementations.

**SDP Application:** WebGPU is no longer experimental; it is the 2026 production standard. The SDP solver stack must migrate away from TypeScript/WASM and utilize raw WGSL compute shaders with Subgroup parallelism to handle real-time feature matching and RANSAC consensus at sub-30ms latency.
