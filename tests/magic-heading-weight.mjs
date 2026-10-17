import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';
const evidence = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/planar-heading-weight.json'),
);
for (const [file, hash] of Object.entries(evidence.sourceGuards))
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
      .digest('hex'),
    hash,
  );
for (const summary of Object.values(evidence.native.summary))
  assert.ok(summary.after > summary.before);
for (const row of evidence.native.rows) {
  assert.equal(row.outsideChanged, 0);
  assert.equal(row.alphaChanged, 0);
}
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('https://**/*', (route) => route.abort());
  await page.goto(server.resolvedUrls.local[0]);
  const results = await page.evaluate(async () => {
    const { paintFittedText } = await import('/games/magic/src/presentation/canvas-text.ts');
    const results = [];
    for (const scale of [0.75, 1, 1.5, 2])
      for (const width of [350, 150]) {
        const draw = (inset) => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(400 * scale);
          canvas.height = Math.ceil(70 * scale);
          const c = canvas.getContext('2d');
          c.scale(scale, scale);
          c.translate(0.25, 0.75);
          c.fillStyle = '#fff';
          c.textBaseline = 'middle';
          const state = [c.font, c.fillStyle, c.getTransform().toString()];
          const readback = CanvasRenderingContext2D.prototype.getImageData;
          CanvasRenderingContext2D.prototype.getImageData = () => {
            throw Error('Heading preparation must not read pixels');
          };
          try {
            paintFittedText(
              c,
              'Heading III • Ag',
              10,
              30,
              width,
              30,
              true,
              1,
              'CardRenderer MTG Matrix',
              inset,
            );
          } finally {
            CanvasRenderingContext2D.prototype.getImageData = readback;
          }
          if (
            JSON.stringify(state) !==
            JSON.stringify([c.font, c.fillStyle, c.getTransform().toString()])
          )
            throw Error('Canvas state leaked');
          const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
          let mass = 0,
            opaque = 0,
            xsum = 0,
            ysum = 0;
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3] / 255;
            mass += a;
            xsum += ((i / 4) % canvas.width) * a;
            ysum += Math.floor(i / 4 / canvas.width) * a;
            if (data[i + 3] > 250) opaque++;
          }
          canvas.width = canvas.height = 0;
          return { mass, opaque, x: xsum / mass / scale, y: ysum / mass / scale };
        };
        const before = draw(0),
          after = draw(0.5);
        if (
          !(after.mass < before.mass * 0.95 && after.mass > before.mass * 0.65 && after.opaque > 10)
        )
          throw Error('Inset should reduce coverage and retain solid cores');
        if (Math.abs(before.x - after.x) > 0.4 || Math.abs(before.y - after.y) > 0.4)
          throw Error('Inset moved the heading');
        results.push({ scale, width, before, after });
      }
    const { withPrintingOmissions } = await import(
      '/games/magic/src/presentation/printing-omissions.ts'
    );
    const c = document.createElement('canvas');
    c.width = 488;
    c.height = 680;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    const draw = () =>
      paintFittedText(
        ctx,
        'Omitted heading',
        30,
        50,
        300,
        28,
        true,
        1,
        'CardRenderer MTG Matrix',
        0.5,
      );
    withPrintingOmissions(
      ctx,
      {
        name: 'Example',
        printingOmissions: [{ rect: [0, 0, 1, 0.2], texts: ['Omitted heading'] }],
      },
      draw,
    );
    if (ctx.getImageData(0, 0, 488, 100).data.some((v) => v))
      throw Error('Staged heading bypassed printing omission');
    draw();
    if (!ctx.getImageData(0, 0, 488, 100).data.some((v) => v))
      throw Error('Printing omission leaked beyond its scope');
    c.width = c.height = 0;
    return results;
  });
  assert.equal(results.length, 8);
  console.log(
    'Colorshifted heading inset reduces stroke coverage at both raster tiers, preserves advances/state and avoids pixel readbacks.',
  );
} finally {
  await browser.close();
  await server.close();
}
