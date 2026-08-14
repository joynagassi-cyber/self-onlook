import type { OnlookDesktopApi } from './types';

/**
 * Renderer-side access to the Onlook Desktop bridge.
 *
 * The preload script exposes `window.onlook` only inside the Electron
 * renderer. In a plain browser (web app served over HTTP) it is absent, so
 * the same web code can feature-detect the desktop runtime and fall back to
 * the cloud path. Consumers must never import Electron code directly.
 */
declare global {
    interface Window {
        onlook?: OnlookDesktopApi;
    }
}

/** True when running inside the Onlook Desktop renderer. */
export function isDesktopRuntime(): boolean {
    return typeof window !== 'undefined' && typeof window.onlook === 'object';
}

/**
 * Returns the desktop bridge when available, otherwise `null`.
 *
 * Use it to switch data sources: `getDesktopApi()` present means local
 * storage (filesystem/JSON store); absent means the cloud path (tRPC).
 */
export function getDesktopApi(): OnlookDesktopApi | null {
    return isDesktopRuntime() ? (window.onlook ?? null) : null;
}
