// Generates a placeholder 8x9 (1536x1872) atlas for the default pet, used in
// dev / M1 before we have real art. Each row is a distinct hue (one PetState),
// and each frame within a row varies in lightness so frame-cycling is visible.
//
// Run: node scripts/gen-default-atlas.mjs

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'pets', 'default', 'spritesheet.png');

const COLS = 8;
const ROWS = 9;
const FW = 192;
const FH = 208;
const W = COLS * FW;
const H = ROWS * FH;

// Row → label + hue. Rows 0..7 align with PetState order; row 8 is unused.
const ROW_LABELS = [
  ['idle', 210],
  ['greet', 50],
  ['working', 130],
  ['waiting', 270],
  ['review', 30],
  ['failed', 0],
  ['success', 100],
  ['jump', 190],
  ['extra', 320],
];

function hslToRgb(h, s, l) {
  h /= 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function drawDigit(png, digit, cx, cy, size, rgb) {
  // 3x5 dot-matrix digits
  const FONT = {
    0: ['111', '101', '101', '101', '111'],
    1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'],
    7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'],
  };
  const glyph = FONT[digit];
  if (!glyph) return;
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      if (glyph[gy][gx] !== '1') continue;
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const x = cx + gx * size + px;
          const y = cy + gy * size + py;
          if (x < 0 || x >= png.width || y < 0 || y >= png.height) continue;
          const idx = (png.width * y + x) << 2;
          png.data[idx] = rgb[0];
          png.data[idx + 1] = rgb[1];
          png.data[idx + 2] = rgb[2];
          png.data[idx + 3] = 255;
        }
      }
    }
  }
}

function main() {
  const png = new PNG({ width: W, height: H });
  // start transparent
  png.data.fill(0);

  for (let row = 0; row < ROWS; row++) {
    const [, hue] = ROW_LABELS[row];
    for (let col = 0; col < COLS; col++) {
      // Lightness sweeps across columns so frame cycling is visible.
      const light = 0.35 + 0.35 * (col / (COLS - 1));
      const [r, g, b] = hslToRgb(hue, 0.7, light);

      const x0 = col * FW;
      const y0 = row * FH;

      // Rounded-ish "body": filled circle in cell center
      const cx = x0 + FW / 2;
      const cy = y0 + FH / 2;
      const rr = Math.min(FW, FH) * 0.42;
      for (let dy = -rr; dy <= rr; dy++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dy * dy > rr * rr) continue;
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const idx = (W * y + x) << 2;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 255;
        }
      }

      // Draw "row.col" label in cell center for visual diagnostics
      const labelDigits = [String(row), String(col)];
      const digitSize = 8;
      const charWidth = 3 * digitSize + digitSize;
      const totalWidth = labelDigits.length * charWidth - digitSize;
      let dx = x0 + (FW - totalWidth) / 2;
      const dy = y0 + FH / 2 - (5 * digitSize) / 2;
      for (const d of labelDigits) {
        drawDigit(png, parseInt(d, 10), dx, dy, digitSize, [255, 255, 255]);
        dx += charWidth;
      }
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, PNG.sync.write(png));
  console.log(`wrote ${OUT} (${W}x${H})`);
}

main();
