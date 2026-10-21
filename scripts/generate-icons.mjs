/**
 * Generates the PWA app icons from the mark the app already uses: a white
 * gauge dial on the brand indigo square (the `GaugeCircle` glyph that appears
 * in the sidebar and on the auth screens).
 *
 * Kept as a script rather than committing opaque binaries, so the icons can be
 * regenerated when the brand colour changes and their provenance is obvious.
 *
 * No image dependency: PNG is signature + IHDR + IDAT (zlib) + IEND, and Node
 * ships zlib. Shapes are drawn at 4x and box-downsampled for antialiasing.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(import.meta.dirname, '../apps/web/public');

/** brand-600 from tailwind.config.js */
const BRAND = [0x4f, 0x46, 0xe5];
const WHITE = [0xff, 0xff, 0xff];
/** Supersampling factor; 4x is plenty for flat shapes. */
const SS = 4;

/* ---------------------------------------------------------------- PNG ---- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes an RGBA pixel buffer as a PNG. */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type (0 = none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- drawing --- */

function createCanvas(size) {
  return { size, pixels: new Uint8Array(size * size * 4) };
}

function paint(canvas, x, y, colour, alpha = 1) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  const existing = canvas.pixels[i + 3] / 255;
  const out = alpha + existing * (1 - alpha);
  for (let c = 0; c < 3; c += 1) {
    const src = colour[c] * alpha;
    const dst = canvas.pixels[i + c] * existing * (1 - alpha);
    canvas.pixels[i + c] = out === 0 ? 0 : Math.round((src + dst) / out);
  }
  canvas.pixels[i + 3] = Math.round(out * 255);
}

/** Fills where `inside(x, y)` is true. */
function fill(canvas, colour, inside) {
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      if (inside(x + 0.5, y + 0.5)) paint(canvas, x, y, colour);
    }
  }
}

function roundedSquare(x0, y0, side, radius) {
  const x1 = x0 + side;
  const y1 = y0 + side;
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
    const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
}

function ring(cx, cy, outer, inner) {
  return (x, y) => {
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    return d2 <= outer ** 2 && d2 >= inner ** 2;
  };
}

function disc(cx, cy, radius) {
  return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Thick line segment, used for the gauge needle. */
function segment(ax, ay, bx, by, thickness) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const half = thickness / 2;
  return (x, y) => {
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    return (x - px) ** 2 + (y - py) ** 2 <= half * half;
  };
}

/** Averages each SS x SS block down to one pixel. */
function downsample(canvas, target) {
  const out = new Uint8Array(target * target * 4);
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * canvas.size + (x * SS + sx)) * 4;
          const alpha = canvas.pixels[i + 3] / 255;
          r += canvas.pixels[i] * alpha;
          g += canvas.pixels[i + 1] * alpha;
          b += canvas.pixels[i + 2] * alpha;
          a += alpha;
        }
      }
      const count = SS * SS;
      const o = (y * target + x) * 4;
      out[o] = a === 0 ? 0 : Math.round(r / a);
      out[o + 1] = a === 0 ? 0 : Math.round(g / a);
      out[o + 2] = a === 0 ? 0 : Math.round(b / a);
      out[o + 3] = Math.round((a / count) * 255);
    }
  }
  return out;
}

/**
 * @param size   final pixel size
 * @param bleed  true for maskable/apple icons, where the platform applies its
 *               own mask and the artwork must reach every edge
 */
function renderIcon(size, { bleed }) {
  const canvas = createCanvas(size * SS);
  const W = canvas.size;

  if (bleed) {
    fill(canvas, BRAND, () => true);
  } else {
    const pad = W * 0.06;
    fill(canvas, BRAND, roundedSquare(pad, pad, W - pad * 2, W * 0.22));
  }

  // Maskable icons must keep their content inside the central 80% safe zone.
  const glyph = bleed ? W * 0.3 : W * 0.34;
  const cx = W / 2;
  const cy = W / 2;

  // Dial.
  fill(canvas, WHITE, ring(cx, cy, glyph, glyph * 0.78));

  // Needle, pointing to roughly "2 o'clock" like the lucide gauge.
  const angle = -Math.PI / 4;
  fill(
    canvas,
    WHITE,
    segment(cx, cy, cx + Math.cos(angle) * glyph * 0.58, cy + Math.sin(angle) * glyph * 0.58, W * 0.055),
  );

  // Hub.
  fill(canvas, WHITE, disc(cx, cy, W * 0.055));

  return encodePng(downsample(canvas, size), size);
}

/* ---------------------------------------------------------------- run ---- */

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  ['pwa-192x192.png', 192, { bleed: false }],
  ['pwa-512x512.png', 512, { bleed: false }],
  ['maskable-icon-512x512.png', 512, { bleed: true }],
  ['apple-touch-icon.png', 180, { bleed: true }],
  ['favicon-48x48.png', 48, { bleed: false }],
];

for (const [name, size, options] of icons) {
  const png = renderIcon(size, options);
  writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`${name.padEnd(28)} ${size}x${size}  ${png.length} bytes`);
}
