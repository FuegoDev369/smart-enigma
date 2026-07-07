// src/js/qr/qr-encoder.js
//
// QR encoder (no DOM dependency).
//
// Hand-written byte-mode QR encoder (versions 1-40, EC level M), built from
// scratch against the public ISO/IEC 18004 algorithm — GF(256) Reed-Solomon
// error correction, standard block-size and alignment-pattern tables, auto
// version + mask selection. No external library. Chosen deliberately over a
// "homemade" 2D code format so the result is scannable by any standard QR
// reader, not just Smart Enigma itself. Verified against an independent
// Python reference pipeline (qrcode + pyzbar/OpenCV) during development:
// exact matrix match at fixed mask, and successful end-to-end decode across
// small/medium/large payloads.
//
// Only `encode` is exported; all internal functions and tables (gfMul,
// rsGeneratorPoly, RS_BLOCKS_M, placeFinder, applyMask, penaltyScore, etc.)
// stay module-private.

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function buildGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]; }

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}
function rsRemainder(dataCodewords, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const buf = dataCodewords.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < dataCodewords.length; i++) {
    const coeff = buf[i];
    if (coeff === 0) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], coeff);
  }
  return buf.slice(dataCodewords.length);
}

// Standard tables (ISO/IEC 18004), EC level M only.
const RS_BLOCKS_M = [
  [1,26,16],[1,44,28],[1,70,44],[2,50,32],[2,67,43],
  [4,43,27],[4,49,31],[2,60,38,2,61,39],[3,58,36,2,59,37],
  [4,69,43,1,70,44],[1,80,50,4,81,51],[6,58,36,2,59,37],
  [8,59,37,1,60,38],[4,64,40,5,65,41],[5,65,41,5,66,42],
  [7,73,45,3,74,46],[10,74,46,1,75,47],[9,69,43,4,70,44],
  [3,70,44,11,71,45],[3,67,41,13,68,42],[17,68,42],
  [17,74,46],[4,75,47,14,76,48],[6,73,45,14,74,46],
  [8,75,47,13,76,48],[19,74,46,4,75,47],[22,73,45,3,74,46],
  [3,73,45,23,74,46],[21,73,45,7,74,46],[19,75,47,10,76,48],
  [2,74,46,29,75,47],[10,74,46,23,75,47],[14,74,46,21,75,47],
  [14,74,46,23,75,47],[12,75,47,26,76,48],[6,75,47,34,76,48],
  [29,74,46,14,75,47],[13,74,46,32,75,47],[40,75,47,7,76,48],
  [18,75,47,31,76,48]
];
const ALIGNMENT_POSITIONS = [
  [],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],
  [6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],
  [6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
  [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],
  [6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],
  [6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],
  [6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],
  [6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],
  [6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],
  [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],
  [6,30,58,86,114,142,170]
];
const EC_LEVEL_BITS_M = 0b00;

function versionCapacity(version) {
  const rows = RS_BLOCKS_M[version - 1];
  let totalData = 0;
  for (let g = 0; g < rows.length; g += 3) totalData += rows[g] * rows[g + 2];
  return totalData;
}
function charCountBits(version) { return version <= 9 ? 8 : 16; }

function buildCodewords(version, bytes) {
  const totalData = versionCapacity(version);
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, charCountBits(version));
  for (const byte of bytes) put(byte, 8);
  const maxBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataCodewords.push(v);
  }
  const padBytes = [0xEC, 0x11];
  let p = 0;
  while (dataCodewords.length < totalData) dataCodewords.push(padBytes[p++ % 2]);

  const rows = RS_BLOCKS_M[version - 1];
  const blocks = [];
  let offset = 0;
  for (let g = 0; g < rows.length; g += 3) {
    const count = rows[g], total = rows[g + 1], data = rows[g + 2];
    const ecLen = total - data;
    for (let b = 0; b < count; b++) {
      const dataBlock = dataCodewords.slice(offset, offset + data);
      offset += data;
      blocks.push({ data: dataBlock, ec: rsRemainder(dataBlock, ecLen) });
    }
  }
  const maxDataLen = Math.max(...blocks.map(b => b.data.length));
  const maxEcLen = Math.max(...blocks.map(b => b.ec.length));
  const out = [];
  for (let i = 0; i < maxDataLen; i++) for (const blk of blocks) if (i < blk.data.length) out.push(blk.data[i]);
  for (let i = 0; i < maxEcLen; i++) for (const blk of blocks) if (i < blk.ec.length) out.push(blk.ec[i]);
  return out;
}

// Bullseye rule shared by finder (n=7) and alignment (n=5) patterns:
// black border, white ring at edge-distance 1, black center.
function bullseyeDark(r, c, n) {
  const edgeDist = Math.min(r, c, n - 1 - r, n - 1 - c);
  return edgeDist !== 1;
}
function placeFinder(m, isFn, row, col) {
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = row + r, cc = col + c;
    if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
    const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
    m[rr][cc] = inner ? bullseyeDark(r, c, 7) : false;
    isFn[rr][cc] = true;
  }
}
function placeAlignment(m, isFn, version) {
  const positions = ALIGNMENT_POSITIONS[version - 1];
  if (!positions.length) return;
  const size = m.length;
  for (const row of positions) for (const col of positions) {
    if ((row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8)) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      m[row + r][col + c] = bullseyeDark(r + 2, c + 2, 5);
      isFn[row + r][col + c] = true;
    }
  }
}
function placeTiming(m, isFn) {
  const size = m.length;
  for (let i = 8; i < size - 8; i++) {
    if (!isFn[6][i]) { m[6][i] = i % 2 === 0; isFn[6][i] = true; }
    if (!isFn[i][6]) { m[i][6] = i % 2 === 0; isFn[i][6] = true; }
  }
}
function reserveFormatAreas(m, isFn) {
  const size = m.length;
  for (let i = 0; i <= 8; i++) {
    if (!isFn[8][i]) { m[8][i] = false; isFn[8][i] = true; }
    if (!isFn[i][8]) { m[i][8] = false; isFn[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    m[8][size - 1 - i] = false; isFn[8][size - 1 - i] = true;
    m[size - 1 - i][8] = false; isFn[size - 1 - i][8] = true;
  }
  m[size - 8][8] = true; // dark module
}
function reserveVersionAreas(m, isFn, version) {
  if (version < 7) return;
  const size = m.length;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
    m[r][size - 11 + c] = false; isFn[r][size - 11 + c] = true;
    m[size - 11 + c][r] = false; isFn[size - 11 + c][r] = true;
  }
}
const MASK_FUNCS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
  (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0
];
function placeData(m, isFn, codewords) {
  const size = m.length;
  const bits = [];
  for (const byte of codewords) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  let bitIndex = 0;
  let col = size - 1;
  let goingUp = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = goingUp ? size - 1 - i : i;
      for (const cc of [col, col - 1]) {
        if (!isFn[row][cc]) {
          const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
          bitIndex++;
          m[row][cc] = !!bit;
        }
      }
    }
    goingUp = !goingUp;
    col -= 2;
  }
}
function applyMask(m, isFn, maskIndex) {
  const size = m.length;
  const fn = MASK_FUNCS[maskIndex];
  const out = m.map(row => row.slice());
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!isFn[r][c] && fn(r, c)) out[r][c] = !out[r][c];
  }
  return out;
}
function bchRemainder(data, genDeg, gen) {
  let val = data << genDeg;
  const dataBits = 32 - Math.clz32(data || 1);
  for (let i = dataBits - 1 + genDeg; i >= genDeg; i--) {
    if ((val >> i) & 1) val ^= gen << (i - genDeg);
  }
  return val;
}
function formatBits(maskIndex) {
  const data = (EC_LEVEL_BITS_M << 3) | maskIndex;
  const gen = 0b10100110111; // degree 10
  const rem = bchRemainder(data, 10, gen);
  let full = (data << 10) | rem;
  full ^= 0b101010000010010;
  return full & 0x7FFF;
}
function versionBits(version) {
  const gen = 0b1111100100101; // degree 12
  const rem = bchRemainder(version, 12, gen);
  return (version << 12) | rem;
}
function applyFormatInfo(m, maskIndex) {
  const size = m.length;
  const bits = formatBits(maskIndex);
  const bit = (i) => (bits >> (14 - i)) & 1; // MSB-first
  for (let i = 0; i <= 5; i++) m[8][i] = !!bit(i);
  m[8][7] = !!bit(6);
  m[8][8] = !!bit(7);
  m[7][8] = !!bit(8);
  for (let i = 9; i <= 14; i++) m[14 - i][8] = !!bit(i);
  for (let i = 0; i <= 6; i++) m[size - 1 - i][8] = !!bit(i);
  for (let k = 0; k <= 7; k++) m[8][size - 8 + k] = !!bit(7 + k);
}
function applyVersionInfo(m, version) {
  if (version < 7) return;
  const size = m.length;
  const bits = versionBits(version);
  const bit = (i) => (bits >> i) & 1; // LSB-first (differs from format info)
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    m[row][size - 11 + col] = !!bit(i);
    m[size - 11 + col][row] = !!bit(i);
  }
}
function penaltyScore(m) {
  const size = m.length;
  let score = 0;
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
  }
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  const pattern = [true, false, true, true, true, false, true];
  function matchesAt(arr, i) {
    for (let k = 0; k < 7; k++) if (arr[i + k] !== pattern[k]) return false;
    return true;
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 7; c++) {
      if (matchesAt(m[r], c)) {
        const before = c - 4 >= 0 && m[r].slice(c - 4, c).every(v => v === false);
        const after = c + 11 <= size && m[r].slice(c + 7, c + 11).every(v => v === false);
        if (before || after) score += 40;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    const col = m.map(row => row[c]);
    for (let r = 0; r <= size - 7; r++) {
      if (matchesAt(col, r)) {
        const before = r - 4 >= 0 && col.slice(r - 4, r).every(v => v === false);
        const after = r + 11 <= size && col.slice(r + 7, r + 11).every(v => v === false);
        if (before || after) score += 40;
      }
    }
  }
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  score += (Math.floor(Math.abs(percent - 50) / 5) / 5) * 10;
  return score;
}

/**
 * Encodes bytes into a QR code matrix (ISO/IEC 18004), picking the smallest version
 * that fits and the best data mask, from scratch with no external library.
 * @param {Uint8Array} bytes - Payload bytes to encode.
 * @returns {{size: number, modules: boolean[][]}} The QR matrix size and its dark/light module grid.
 */
export function encode(bytes) {
  let version = 1;
  for (; version <= 40; version++) {
    const totalData = versionCapacity(version);
    const bitsNeeded = 4 + charCountBits(version) + 8 * bytes.length;
    if (Math.ceil(bitsNeeded / 8) <= totalData) break;
  }
  if (version > 40) return null;

  const codewords = buildCodewords(version, bytes);
  const size = 4 * version + 17;
  const base = Array.from({ length: size }, () => new Array(size).fill(null));
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));

  placeFinder(base, isFn, 0, 0);
  placeFinder(base, isFn, 0, size - 7);
  placeFinder(base, isFn, size - 7, 0);
  placeAlignment(base, isFn, version);
  placeTiming(base, isFn);
  reserveFormatAreas(base, isFn);
  reserveVersionAreas(base, isFn, version);
  placeData(base, isFn, codewords);

  let best = null, bestScore = Infinity;
  for (let mi = 0; mi < 8; mi++) {
    const masked = applyMask(base, isFn, mi);
    applyFormatInfo(masked, mi);
    applyVersionInfo(masked, version);
    const score = penaltyScore(masked);
    if (score < bestScore) { bestScore = score; best = masked; }
  }
  return { version, size, modules: best };
}
