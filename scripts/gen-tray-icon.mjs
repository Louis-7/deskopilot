// Generates a 16x16 macOS-template tray icon. Template icons must be black-
// on-transparent; macOS auto-tints them for light/dark menu bars.
//
// Output: resources/tray-iconTemplate.png  (the "Template" suffix tells
// Electron/macOS to treat it as a template image).

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'resources', 'tray-iconTemplate.png');

const SIZE = 16;

function set(png, x, y, alpha) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (SIZE * y + x) << 2;
  png.data[i] = 0;
  png.data[i + 1] = 0;
  png.data[i + 2] = 0;
  png.data[i + 3] = alpha;
}

function disk(png, cx, cy, r, alpha = 255) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) set(png, cx + dx, cy + dy, alpha);
    }
  }
}

const png = new PNG({ width: SIZE, height: SIZE });
png.data.fill(0);

// A tiny pet silhouette: rounded body + two ears
disk(png, 8, 10, 5);        // body
disk(png, 5, 5, 1.6);       // left ear
disk(png, 11, 5, 1.6);      // right ear
// eyes (transparent dots, leave black)
set(png, 6, 9, 0);
set(png, 10, 9, 0);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, PNG.sync.write(png));
console.log(`wrote ${OUT}`);
