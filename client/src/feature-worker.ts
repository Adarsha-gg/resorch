import { env, pipeline } from '@xenova/transformers'

env.allowLocalModels = false;
// Prefer WebGPU for performance as researched in the 2026 SOTA findings
env.backends.onnx.wasm.numThreads = 1;
// Force WebGPU if available, though Transformers.js V3 handles this better
const MODEL_ID = 'Xenova/clip-vit-base-patch32';

let extractor: any = null;

async function initExtractor() {
    if (!extractor) {
        extractor = await pipeline('image-feature-extraction', MODEL_ID, {
            device: 'webgpu'
        } as any);
    }
    return extractor;
}

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;
    
    try {
        if (type === 'init') {
            await initExtractor();
            self.postMessage({ id, type: 'init_done' });
        } else if (type === 'extract_batch') {
            const ext = await initExtractor();
            // payload is an array of Data URLs
            const output = await ext(payload, { pool: true, normalize: true } as any);
            
            // output.data is a flattened Float32Array of size (batch_size * 512)
            self.postMessage({ 
                id, 
                type: 'extract_batch_done', 
                descriptor: output.data 
            });
        }
    } catch (error) {
        self.postMessage({ id, type: 'error', error: String(error) });
    }
};
