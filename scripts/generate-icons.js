import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function calculateCrc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = calculateCrc(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, pixelFn) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw scanlines: width * 4 + 1 filter byte per row
  const rowStride = width * 4 + 1;
  const rawData = Buffer.alloc(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Icon generator with brand colors: Dark slate background #090d16, gold/amber badge #f59e0b, 3D 'F' glyph
function renderGameIcon(x, y, w, h, isMaskable) {
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Background gradient: deep midnight blue to carbon black
  const bgGrad = 0.5 + 0.5 * ny;
  let r = Math.round(10 + 6 * bgGrad);
  let g = Math.round(15 + 8 * bgGrad);
  let b = Math.round(26 + 12 * bgGrad);
  let a = 255;

  // Maskable safe zone margin factor: 0.72 scale if maskable, 0.88 if any
  const scale = isMaskable ? 0.72 : 0.86;
  const sx = nx / scale;
  const sy = ny / scale;
  const sdist = Math.sqrt(sx * sx + sy * sy);

  // Outer rounded hexagonal shield badge
  const shield = Math.max(Math.abs(sx) * 0.866 + Math.abs(sy) * 0.5, Math.abs(sy));
  
  if (shield < 0.95) {
    // Shield fill
    const innerT = (sy + 1) * 0.5;
    r = Math.round(18 + innerT * 12);
    g = Math.round(24 + innerT * 18);
    b = Math.round(40 + innerT * 26);

    // Glowing amber border
    if (shield > 0.82) {
      r = 245;
      g = 158;
      b = 11;
    } else if (shield > 0.77) {
      r = 217;
      g = 119;
      b = 6;
    }

    // Modern Stylized "F" letterform & 3D speed wings
    // Main vertical stem of F: sx between -0.42 and -0.20, sy between -0.55 and 0.55
    const inStem = sx >= -0.40 && sx <= -0.18 && sy >= -0.52 && sy <= 0.52;
    // Top bar of F: sy between -0.52 and -0.32, sx between -0.18 and 0.42
    const inTopBar = sy >= -0.52 && sy <= -0.32 && sx >= -0.18 && sx <= 0.40;
    // Mid bar of F: sy between -0.12 and 0.08, sx between -0.18 and 0.26
    const inMidBar = sy >= -0.10 && sy <= 0.08 && sx >= -0.18 && sx <= 0.24;
    // Bottom 3D vehicle wedge accent: sy between 0.30 and 0.48, sx between -0.10 and 0.46
    const inBottomAccent = sy >= 0.30 && sy <= 0.44 && sx >= -0.10 && sx <= 0.38 && (sx - sy * 0.5 < 0.28);

    if (inStem || inTopBar || inMidBar) {
      // Emerald / Gold gradient
      const fT = (sx + 0.4) / 0.8;
      r = Math.round(245 + fT * 10);
      g = Math.round(180 + fT * 50);
      b = Math.round(20 + fT * 40);
    } else if (inBottomAccent) {
      // Emerald green accent (Sierra Leone flag color)
      r = 16;
      g = 185;
      b = 129;
    }
  }

  return [r, g, b, a];
}

// Screenshot preview generator for PWABuilder rich previews
function renderScreenshot(x, y, w, h, isMobile) {
  const ny = y / h;
  const nx = x / w;

  // Sky gradient
  let r, g, b;
  if (ny < 0.5) {
    const t = ny / 0.5;
    r = Math.round(56 + t * 40);
    g = Math.round(110 + t * 50);
    b = Math.round(180 - t * 40);
  } else {
    // Road / ground
    const t = (ny - 0.5) / 0.5;
    r = Math.round(30 + t * 10);
    g = Math.round(32 + t * 12);
    b = Math.round(38 + t * 15);
  }

  // Road lines
  if (ny > 0.55 && Math.abs(nx - 0.5) < 0.012 && Math.sin(ny * 40) > 0) {
    r = 250;
    g = 204;
    b = 21;
  }

  return [r, g, b, 255];
}

const iconsDir = path.resolve('public', 'icons');
const publicDir = path.resolve('public');
fs.mkdirSync(iconsDir, { recursive: true });

// 1. Generate icon-192x192.png
console.log('Generating icon-192x192.png...');
fs.writeFileSync(
  path.join(iconsDir, 'icon-192x192.png'),
  createPng(192, 192, (x, y, w, h) => renderGameIcon(x, y, w, h, false))
);

// 2. Generate icon-512x512.png
console.log('Generating icon-512x512.png...');
fs.writeFileSync(
  path.join(iconsDir, 'icon-512x512.png'),
  createPng(512, 512, (x, y, w, h) => renderGameIcon(x, y, w, h, false))
);

// 3. Generate maskable-icon-192x192.png
console.log('Generating maskable-icon-192x192.png...');
fs.writeFileSync(
  path.join(iconsDir, 'maskable-icon-192x192.png'),
  createPng(192, 192, (x, y, w, h) => renderGameIcon(x, y, w, h, true))
);

// 4. Generate maskable-icon-512x512.png
console.log('Generating maskable-icon-512x512.png...');
fs.writeFileSync(
  path.join(iconsDir, 'maskable-icon-512x512.png'),
  createPng(512, 512, (x, y, w, h) => renderGameIcon(x, y, w, h, true))
);

// 5. Generate apple-touch-icon.png (180x180)
console.log('Generating apple-touch-icon.png (180x180)...');
fs.writeFileSync(
  path.join(iconsDir, 'apple-touch-icon.png'),
  createPng(180, 180, (x, y, w, h) => renderGameIcon(x, y, w, h, false))
);

// 6. Generate favicon-32x32.png
console.log('Generating favicon-32x32.png...');
fs.writeFileSync(
  path.join(iconsDir, 'favicon-32x32.png'),
  createPng(32, 32, (x, y, w, h) => renderGameIcon(x, y, w, h, false))
);

// 7. Generate screenshots for PWABuilder
console.log('Generating screenshots...');
fs.writeFileSync(
  path.join(publicDir, 'screenshot-wide.png'),
  createPng(640, 360, (x, y, w, h) => renderScreenshot(x, y, w, h, false))
);

fs.writeFileSync(
  path.join(publicDir, 'screenshot-mobile.png'),
  createPng(360, 640, (x, y, w, h) => renderScreenshot(x, y, w, h, true))
);

// Also generate public/icons/icon.svg
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="emerald" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <polygon points="256,48 440,154 440,366 256,472 72,366 72,154" fill="#0f172a" stroke="url(#gold)" stroke-width="14" stroke-linejoin="round"/>
  <!-- F monogram -->
  <path d="M168,136 L344,136 L344,188 L232,188 L232,236 L312,236 L312,284 L232,284 L232,376 L168,376 Z" fill="url(#gold)"/>
  <!-- Sierra Leone emerald highway arrow -->
  <polygon points="280,316 352,352 280,388" fill="url(#emerald)"/>
</svg>`;
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);

console.log('All icons and screenshots generated successfully!');
