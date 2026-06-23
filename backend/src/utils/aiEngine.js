/**
 * AI Engine helper — single source of truth for talking to the Python Face
 * Recognition microservice from the Node backend.
 *
 * Previously the AI engine base URL (and the cache-reload trigger) was written
 * inline in several controllers with INCONSISTENT defaults — e.g.
 * `http://sa_ai_engine:8001` in one place and `http://127.0.0.1:8002` in another.
 * Under Docker the latter is wrong (8002 is the host-side port mapping, not
 * reachable on the internal network). Centralizing here removes that drift
 * (PERBAIKAN_WAJAH_CCTV.md #1).
 */

/**
 * Resolve the AI engine base URL for backend → AI engine (server-to-server) calls.
 * Default targets the Docker service name on its INTERNAL container port (8001).
 * Override with AI_ENGINE_URL for bare-metal / custom deployments.
 * @returns {string}
 */
function getAiEngineUrl() {
  return process.env.AI_ENGINE_URL || 'http://sa_ai_engine:8001';
}

/**
 * Ask the AI engine to reload the face-embedding cache from the DB.
 * Fire-and-forget: enrollment must not fail just because the AI engine is
 * momentarily unreachable (the cache also reloads on AI engine startup).
 */
function reloadFaceCache() {
  const url = `${getAiEngineUrl()}/cache/reload`;
  fetch(url, { method: 'POST' }).catch(err => {
    console.warn(`[aiEngine] cache reload failed (${url}): ${err.message}`);
  });
}

module.exports = { getAiEngineUrl, reloadFaceCache };
