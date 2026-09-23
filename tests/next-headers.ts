/**
 * Minimal stand-in for `next/headers`, aliased only in the integration
 * vitest config (see vitest.integration.config.ts). Route handlers call
 * `cookies()` (via lib/server/auth.ts) to read/write the session cookie;
 * outside a real Next.js request lifecycle there is no AsyncLocalStorage
 * context for it to read, so tests get this in-memory store instead.
 * Call resetTestCookies() between tests to avoid session leakage.
 */
let store = new Map<string, { value: string }>();

export function resetTestCookies() {
  store = new Map();
}

export async function cookies() {
  return {
    get(name: string) {
      return store.get(name);
    },
    set(name: string, value: string) {
      store.set(name, { value });
    },
    delete(name: string) {
      store.delete(name);
    },
  };
}

export async function headers() {
  return new Headers();
}
