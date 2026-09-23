import "@testing-library/jest-dom/vitest"

// jsdom does not implement matchMedia, which next-themes calls when
// `enableSystem` is set. Provide a minimal, non-matching stub for tests.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

// jsdom ships no IndexedDB; the offline store tests exercise the real `idb`
// API against an in-memory implementation.
import "fake-indexeddb/auto"
