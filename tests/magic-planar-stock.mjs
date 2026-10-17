import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

const evidence = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/planar-stock-edges.json'),
);
for (const [file, hash] of Object.entries(evidence.sourceGuards))
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
      .digest('hex'),
    hash,
    'Revalidate outer boundaries after geometry changes',
  );
assert.equal(evidence.rows.length, 44);
assert.equal(evidence.rows.filter((r) => r.cohort === 'calibration').length, 15);
assert.equal(evidence.validation.improved, evidence.validation.cardsWithReliableEdges);
assert.ok(evidence.validation.afterMeanAbsolutePixels < 0.25);
assert.ok(evidence.rows.every((r) => r.interiorChangedPixels === 0));

// Original synthetic plate/mask pair: no external card assets or network.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.route('https://**/*', (r) => r.abort());
      await page.goto(server.resolvedUrls.local[0]);
      const rows = await page.evaluate(async () => {
        const { paintPlanarFrame } = await import(
          '/games/magic/src/presentation/planar-frame-geometry.ts'
        );
        const { paintPlateStockBorder } = await import(
          '/games/magic/src/presentation/frame-plate-border.ts'
        );
        const make = (width, height) => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          return canvas;
        };
        const source = make(1952, 2720),
          mask = make(1952, 2720),
          s = source.getContext('2d', { willReadFrequently: true }),
          m = mask.getContext('2d', { willReadFrequently: true });
        s.scale(4, 4);
        m.scale(4, 4);
        s.fillStyle = '#090806';
        s.fillRect(0, 0, 488, 680);
        s.fillStyle = '#58a060';
        s.fillRect(25, 25.5, 438, 629);
        // Interior features make a shifted/rescaled center detectable.
        s.fillStyle = '#a08555';
        for (let y = 35; y < 635; y += 7) s.fillRect(32, y, 424, 2);
        m.fillRect(0, 0, 488, 680);
        m.clearRect(25, 25.5, 438, 629);
        const rows = [];
        for (const width of [244, 732])
          for (const colorshifted of [false, true]) {
            const scale = width / 488,
              geometry = colorshifted ? 'colorshifted' : 'planar';
            const render = (kind) => {
              const canvas = make(width, (width * 680) / 488),
                c = canvas.getContext('2d', { willReadFrequently: true });
              c.scale(scale, scale);
              paintPlanarFrame(c, source, kind === 'center-control' ? false : colorshifted);
              if (kind === 'fixed') paintPlateStockBorder(c, mask, '#181510', geometry);
              if (kind === 'old-mask') paintPlateStockBorder(c, mask, '#181510');
              return c.getImageData(0, 0, canvas.width, canvas.height);
            };
            const plate = render('plate'),
              fixed = render('fixed'),
              old = render('old-mask'),
              center = render('center-control');
            let lostTexture = 0,
              oldLostTexture = 0,
              badStock = 0,
              centerChanges = 0;
            for (let y = 0; y < fixed.height; y++)
              for (let x = 0; x < fixed.width; x++) {
                const i = 4 * (y * width + x),
                  px = (x + 0.5) / scale,
                  py = (y + 0.5) / scale;
                if (px > 30 && px < 458 && py > 30 && py < 637)
                  for (let k = 0; k < 4; k++)
                    centerChanges += Number(plate.data[i + k] !== center.data[i + k]);
                if (px < 15 || px > 473 || py < 15 || py > 667)
                  badStock += Number(
                    fixed.data[i] !== 24 ||
                      fixed.data[i + 1] !== 21 ||
                      fixed.data[i + 2] !== 16 ||
                      fixed.data[i + 3] !== 255,
                  );
                // A fully green pixel and its neighbors are clear of raster AA.
                if (x < 2 || x >= width - 2 || y < 2 || y >= fixed.height - 2) continue;
                let solid = true;
                for (let dy = -1; dy <= 1; dy++)
                  for (let dx = -1; dx <= 1; dx++) {
                    const j = 4 * ((y + dy) * width + x + dx);
                    solid &&=
                      plate.data[j] === 88 && plate.data[j + 1] === 160 && plate.data[j + 2] === 96;
                  }
                if (solid) {
                  lostTexture += Number(fixed.data[i + 1] !== 160);
                  oldLostTexture += Number(old.data[i + 1] !== 160);
                }
              }
            rows.push({ width, geometry, lostTexture, oldLostTexture, badStock, centerChanges });
          }
        return rows;
      });
      for (const row of rows) {
        assert.equal(row.lostTexture, 0, JSON.stringify(row));
        assert.equal(row.badStock, 0, JSON.stringify(row));
        assert.equal(row.centerChanges, 0, JSON.stringify(row));
      }
      assert.ok(
        rows.some((r) => r.oldLostTexture > 0),
        'Regression does not expose the old clipping',
      );
      console.log(engine.name(), rows);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
