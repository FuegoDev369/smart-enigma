// src/js/sound/sound-transfer.js
//
// AudioContext/microphone orchestration for data-over-sound transfer
// (FSK emit and listen). Kept separate from fsk-codec.js, which holds
// the pure computation (Goertzel, frames) and never touches the DOM.

import { fskPlayTones, fskDecodeFromSamples } from './fsk-codec.js';
import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { state } from '../state.js';
import { soundEmitBtn, soundStatusText, soundListenBtn, inputArea, output } from '../dom.js';

/**
 * Emits the current output text as FSK-modulated audio tones through the speakers.
 * @returns {Promise<void>} Resolves once emission completes (or a toast error is shown).
 */
export async function soundEmitAction() {
  const d = t();
  const text = state.hasResult ? output.textContent : '';
  if (!text) { showToast(d.noInput); return; }
  try {
    soundEmitBtn.disabled = true;
    soundStatusText.hidden = false;
    soundStatusText.textContent = d.soundEmitting;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bytes = Array.from(new TextEncoder().encode(text));
    await fskPlayTones(audioCtx, bytes);
    await audioCtx.close();
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  } finally {
    soundEmitBtn.disabled = false;
    soundStatusText.hidden = true;
  }
}

/**
 * Stops any in-progress microphone listening session and releases its audio resources.
 * @returns {void}
 */
export function stopSoundListening() {
  if (!state.soundListenState) return;
  const { audioCtx, stream, processor, silentGain, pollTimer } = state.soundListenState;
  clearInterval(pollTimer);
  try { processor.disconnect(); } catch (e) {}
  try { silentGain.disconnect(); } catch (e) {}
  try { stream.getTracks().forEach(tr => tr.stop()); } catch (e) {}
  try { audioCtx.close(); } catch (e) {}
  state.soundListenState = null;
  soundListenBtn.classList.remove('active');
  soundStatusText.hidden = true;
}

/**
 * Starts (or stops, if already listening) microphone capture and decodes any incoming
 * FSK-modulated audio into the input textarea.
 * @returns {Promise<void>} Resolves once listening has started or microphone access failed.
 */
export async function soundListenAction() {
  const d = t();
  if (state.soundListenState) { stopSoundListening(); return; }
  try {
    // Fix (v5.0.2): plain {audio:true} lets the browser apply its
    // default voice-call processing — echo cancellation, noise
    // suppression and automatic gain control. Noise suppression in
    // particular is tuned to remove exactly this kind of signal (a
    // steady, non-speech-like tone), which is almost certainly why a
    // real two-phone test failed even in a quiet room. Explicitly
    // requesting raw/unprocessed audio fixes this on browsers that
    // honor the constraint (most desktop and Android Chrome do).
    // Some phones may still apply irreducible hardware-level
    // processing the Web Audio API cannot turn off — kept as an
    // honest limitation, not silently hidden.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    // A muted gain node is required so the ScriptProcessor keeps firing
    // in every browser, WITHOUT ever routing the live mic signal to the
    // speakers (would otherwise risk audible feedback/echo).
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    const chunks = [];
    let totalSamples = 0;
    const maxSeconds = 30;

    function tryDecode() {
      const full = new Float32Array(totalSamples);
      let off = 0;
      for (const c of chunks) { full.set(c, off); off += c.length; }
      const decoded = fskDecodeFromSamples(full, audioCtx.sampleRate);
      if (decoded) {
        inputArea.value = new TextDecoder().decode(decoded);
        stopSoundListening();
      } else if (totalSamples / audioCtx.sampleRate > maxSeconds) {
        showToast(d.soundDecodeFail);
        stopSoundListening();
      }
    }

    processor.onaudioprocess = (e) => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      totalSamples += e.inputBuffer.getChannelData(0).length;
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    const pollTimer = setInterval(tryDecode, 400);
    state.soundListenState = { audioCtx, stream, processor, silentGain, pollTimer };
    soundListenBtn.classList.add('active');
    soundStatusText.hidden = false;
    soundStatusText.textContent = d.soundListening;
  } catch (err) {
    console.error(err);
    showToast(d.soundMicPermission);
  }
}
