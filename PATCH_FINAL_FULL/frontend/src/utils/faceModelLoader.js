/**
 * Shared Face Model Loader Service
 * 
 * Ensures face-api.js models are loaded only once and reused across all components.
 * Models are loaded from the CDN and cached in memory after first load.
 */
import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let loadingPromise = null;

const MODEL_URL = 'https://vladmandic.github.io/face-api/model/';

/**
 * Load face recognition models (singleton pattern).
 * If models are already loaded, returns immediately.
 * If models are currently loading, returns the existing promise.
 * 
 * @returns {Promise<boolean>} true when models are ready
 */
export const loadFaceModels = async () => {
  if (modelsLoaded) return true;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      modelsLoaded = true;
      console.log('[FaceModelLoader] All models loaded successfully');
      return true;
    } catch (err) {
      console.error('[FaceModelLoader] Failed to load models:', err);
      loadingPromise = null; // Allow retry on failure
      throw err;
    }
  })();

  return loadingPromise;
};

/**
 * Check if models are already loaded
 * @returns {boolean}
 */
export const areModelsLoaded = () => modelsLoaded;

export { faceapi };
