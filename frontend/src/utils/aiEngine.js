/**
 * Resolve the AI Face Recognition Engine base URL for browser → AI engine calls
 * (live stream, /health, /metrics, /enroll, ...).
 *
 * This logic used to be copy-pasted (identically) in 5+ components. Centralizing
 * it gives a single configuration point (PERBAIKAN_WAJAH_CCTV.md #4).
 *
 * Configuration:
 *   - Set VITE_AI_ENGINE_URL to an absolute URL (e.g. https://cctv.example.com)
 *     to point the browser at the engine. This is REQUIRED when the panel is
 *     served over HTTPS, because a plain-HTTP request from an HTTPS page is
 *     blocked by the browser as mixed content.
 *   - When unset, falls back to <page-protocol>//<hostname>:8002 (the default
 *     Docker host port mapping 8002:8001). This works for HTTP/LAN deployments.
 */
let warnedHttps = false;

export function getAiEngineUrl() {
  const envUrl = import.meta.env.VITE_AI_ENGINE_URL;

  // Prefer an explicit non-local override (the only safe option under HTTPS).
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/$/, '');
  }

  const isHttps = window.location.protocol === 'https:';
  if (isHttps && !warnedHttps) {
    warnedHttps = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[aiEngine] Panel is served over HTTPS but VITE_AI_ENGINE_URL is not set. ' +
      'Browser → AI engine requests over plain HTTP will be blocked as mixed content. ' +
      'Set VITE_AI_ENGINE_URL to an HTTPS endpoint (e.g. https://your-host) to fix CCTV ' +
      'enrollment and live monitoring.'
    );
  }

  return `${window.location.protocol}//${window.location.hostname}:8002`;
}

export default getAiEngineUrl;
