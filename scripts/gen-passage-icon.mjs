/**
 * 生成「短文记词」tabBar 线描图标（81×81，4x 超采样抗锯齿），无第三方依赖。
 * 用法：npm run gen:passage-icon
 * 输出：miniprogram/assets/tab/passage{,-active}.png
 * 配色与 app.json tabBar 一致：普通态 #7A7168、选中态 #17283B，透明背景。
 * 图形：摊开的书页 + 文字线，与生词本的书签图标区分。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'miniprogram', 'assets', 'tab');
const SIZE = 81;
const S = 4;
const W = 22;
const CANVAS = SIZE * S;

// 坐标基于 324×324 超采样画布：左右书页轮廓 + 中缝 + 页内文字线
const POLYLINES = [
  [[58, 70], [150, 70], [150, 250], [58, 250], [58, 70]],
  [[162, 70], [264, 70], [264, 250], [162, 250], [162, 70]],
  [[78, 122], [132, 122]],
  [[78, 158], [132, 158]],
  [[180, 122], [246, 122]],
  [[180, 158], [246, 158]]
];
const SEGMENTS = POLYLINES.flatMap((line) =>
  line.slice(0, -1).map((point, index) => [point, line[index + 1]])
);

function distanceToSegment(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function renderAlpha() {
  const hi = new Float32Array(CANVAS * CANVAS);
  for (let y = 0; y < CANVAS; y += 1) {
    for (let x = 0; x < CANVAS; x += 1) {
      let nearest = Infinity;
      for (const [a, b] of SEGMENTS) {
        const distance = distanceToSegment(x + 0.5, y + 0.5, a, b);
        if (distance < nearest) nearest = distance;
      }
      hi[y * CANVAS + x] = Math.max(0, Math.min(1, W / 2 + 0.75 - nearest));
    }
  }
  const alpha = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let sum = 0;
      for (let sy = 0; sy < S; sy += 1) {
        for (let sx = 0; sx < S; sx += 1) sum += hi[(y * S + sy) * CANVAS + x * S + sx];
      }
      alpha[y * SIZE + x] = Math.round((sum / (S * S)) * 255);
    }
  }
  return alpha;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(rgb, alpha) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < SIZE; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = alpha[y * SIZE + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const alpha = renderAlpha();
for (const variant of [
  { suffix: '', rgb: [0x7a, 0x71, 0x68] },
  { suffix: '-active', rgb: [0x17, 0x28, 0x3b] }
]) {
  const target = path.join(OUT, `passage${variant.suffix}.png`);
  fs.writeFileSync(target, encodePng(variant.rgb, alpha));
  console.log(`passage${variant.suffix}.png`);
}
