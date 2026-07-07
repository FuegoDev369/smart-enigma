// src/js/features/file-payload.js
//
// File payload wrapper: a small 2-byte length + filename header,
// prepended to a file's raw bytes so the original filename can be
// restored after decryption. Falls back to 'decrypted_file' if the
// header is absent or invalid.
//
// This module is fully self-contained (no DOM, i18n, or shared-state
// dependency) — TextEncoder/TextDecoder are native APIs. It doesn't
// depend on any other module in src/js/, and never calls the crypto
// core directly: encryptAction/decryptAction/fileEncryptAction/
// fileDecryptAction (text-actions.js, file-actions.js) orchestrate the
// call between this wrapper and the crypto core.

/* -------- File payload wrapper (v4.0.0) --------
   Thin layer built ENTIRELY OUTSIDE the crypto core: it prepends a
   small 2-byte length + filename header to the file's raw bytes
   before they reach encryptBytes(), so the original filename can be
   restored automatically after decryptBytes(). No cryptographic
   parameter is touched here — this only shapes the plaintext byte
   layout that the untouched AES-256-GCM core then encrypts/decrypts
   as an opaque blob, exactly like it already does for text. */
export function encodeFilePayload(file, contentBytes) {
  const nameBytes = new TextEncoder().encode(file.name);
  const len = Math.min(nameBytes.length, 65535);
  const header = new Uint8Array(2 + len);
  header[0] = (len >> 8) & 0xff;
  header[1] = len & 0xff;
  header.set(nameBytes.slice(0, len), 2);
  const total = new Uint8Array(header.length + contentBytes.length);
  total.set(header, 0);
  total.set(contentBytes, header.length);
  return total;
}

export function decodeFilePayload(bytes) {
  const fallback = { name: 'decrypted_file', content: bytes };
  if (bytes.length < 2) return fallback;
  const len = (bytes[0] << 8) | bytes[1];
  if (2 + len > bytes.length) return fallback;
  const nameBytes = bytes.slice(2, 2 + len);
  const name = new TextDecoder().decode(nameBytes) || 'decrypted_file';
  return { name, content: bytes.slice(2 + len) };
}
