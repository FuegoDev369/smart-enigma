// src/js/state.js
//
// Shared mutable app state: hasResult, currentLang, fingerprintVisible,
// selectedFile, fileResultBlobUrl, qrDownloadBlobUrl,
// lastCompressionSavings, soundListenState.
//
// A single exported object — no store/observer pattern. That would be
// over-engineering for what this needs.
//
// Why an object instead of separate `export let` bindings (a technical
// requirement, not a style choice): an ES "live binding" exported via
// `export let x` can only be reassigned from the module that declares
// it — a consuming module doing `import { x } from './state.js'; x = 1;`
// throws a TypeError (assignment to a read-only import binding).
// Mutating a property of an imported object (`state.x = 1`), on the
// other hand, is valid from any module that imports it — that's the
// mechanism used here so that the `features/`, `i18n/`, and `sound/`
// modules can both read and write this state.

export const state = {
  hasResult: false,
  currentLang: 'en',
  fingerprintVisible: false,
  selectedFile: null,
  fileResultBlobUrl: null,

  // Offline transfer state (compression, QR, sound)
  qrDownloadBlobUrl: null,
  lastCompressionSavings: null,
  soundListenState: null // holds { audioCtx, stream, processor } while actively listening
};
