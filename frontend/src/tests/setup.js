// =============================================================================
// src/tests/setup.js
//
// Vitest + React Testing Library global setup.
// Loaded before every test file via vite.config.js → test.setupFiles.
//
// Verified on: Node 22.x (LTS) with Vitest 1.6, jsdom 24, RTL 16.
//
// Request / AbortSignal compatibility note
// ─────────────────────────────────────────
// Node 18+ exposes globalThis.Request and globalThis.AbortSignal via its
// bundled undici implementation.  These are NOT identical to the browser
// Web API versions that jsdom provides on window.Request / window.AbortSignal,
// and some packages (axios interceptors, msw, etc.) can behave incorrectly if
// they receive the undici variant in what is supposed to be a jsdom environment.
//
// The guard below prefers jsdom's implementations when they are present on
// window, ensuring the test environment stays self-consistent regardless of
// the Node version.  It is a no-op when jsdom does not expose them (older
// jsdom) or when Node does not shadow them (Node < 18).
//
// All current test files mock @/api/evaluationApi entirely, so no real HTTP
// requests are made and these globals are not exercised at runtime.  The guard
// exists as a safety net for future tests that use msw or real Axios calls.
// =============================================================================

import '@testing-library/jest-dom';

// Prefer jsdom's Request / AbortSignal over Node's undici variants.
if (typeof window !== 'undefined') {
  if (typeof window.Request !== 'undefined') {
    globalThis.Request = window.Request;
  }
  if (typeof window.AbortSignal !== 'undefined') {
    globalThis.AbortSignal = window.AbortSignal;
  }
}
