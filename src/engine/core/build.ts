/**
 * Build identity. The badge is the one thing every view must show, so it is
 * mounted from `buildMaterials()`, which every 3D page calls before it draws
 * anything — no view can forget it.
 */
export const BUILD_NUMBER = 18;
export const BUILD_STAMP = '2026-10-02 14:03';
export const BUILD_LABEL = `build v${BUILD_NUMBER} · ${BUILD_STAMP}`;

let mounted = false;

/** Idempotent: calling it from ten places still yields exactly one badge. */
export function mountBadge(): void {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  const el = document.createElement('div');
  el.className = 'gs-build-badge';
  el.textContent = BUILD_LABEL;
  el.style.cssText = [
    'position:fixed', 'top:10px', 'left:12px', 'z-index:2147483000',
    'font:700 11.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
    'letter-spacing:.06em', 'color:#0d1b2a',
    'background:linear-gradient(180deg,#ffe9a8,#ffcf5c)',
    'border:1.5px solid rgba(40,28,10,.55)', 'border-radius:999px',
    'padding:6px 12px', 'pointer-events:none',
    'box-shadow:0 3px 10px rgba(30,20,0,.28), inset 0 1px 0 rgba(255,255,255,.7)',
  ].join(';');
  document.body.appendChild(el);
}
