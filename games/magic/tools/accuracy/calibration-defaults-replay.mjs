import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';
import { openBrowser } from './browser.mjs';
import { cachedFetch } from './cache.mjs';
import { cacheRoot, root, hash, mapLimit, writeJson } from './common.mjs';
import { presentation } from './adapter.mjs';
const baseline = process.argv[2];
if (!baseline) throw Error('Supply a clean 0.4.9 source checkout.');
const entries = [];
for (const set of [
  'lea',
  'leb',
  '2ed',
  '3ed',
  '4ed',
  'mir',
  'tmp',
  'm15',
  'm19',
  'm20',
  'm21',
  'war',
]) {
  const snapshot = JSON.parse(await readFile(path.join(cacheRoot, 'sets', set + '.json')));
  const chosen = new Set();
  for (const color of ['W', 'U', 'B', 'R', 'G', 'A', 'L']) {
    const entry = snapshot.entries.find(
      (e) =>
        !e.issue &&
        e.art &&
        e.card.layout === 'normal' &&
        (color === 'A'
          ? /Artifact/.test(e.card.type_line)
          : color === 'L'
            ? /Land/.test(e.card.type_line)
            : e.card.colors?.join('') === color),
    );
    if (entry && !chosen.has(entry.id)) {
      entries.push(entry);
      chosen.add(entry.id);
    }
  }
}
const faces = entries.map((e) => ({ ...presentation(e).face, colorCalibration: 'set-hsb-v1' }));
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
const { canvasAssetUrls } = await server.ssrLoadModule(
  '/games/magic/src/presentation/canvas-assets.ts',
);
const { RETRO_FONT, RETRO_SYMBOL_FONT } = await server.ssrLoadModule(
  '/games/magic/src/presentation/retro-frame.ts',
);
const css = await readFile('games/magic/fonts.css', 'utf8');
const urls = [
  ...new Set(
    [...css.matchAll(/url\('([^']+)'\)/g)]
      .map((m) => m[1])
      .concat(RETRO_FONT, RETRO_SYMBOL_FONT, faces.flatMap(canvasAssetUrls))
      .filter((u) => u?.startsWith('https:')),
  ),
];
const components = await mapLimit(urls, 3, (u) => cachedFetch(u));
await server.close();
const captures = [];
for (const sourceRoot of [baseline, root]) {
  const session = await openBrowser({ entries, components }, { sourceRoot });
  try {
    const rows = [];
    for (let i = 0; i < faces.length; i++) {
      const png = await session.page.evaluate(async (face) => {
        const { composeCardTexture } = await import('/games/magic/src/presentation/canvas-face.ts');
        const canvas = await composeCardTexture(
          { face, printingId: 'replay', printedImage: null },
          'inspect',
          new AbortController().signal,
        );
        const png = canvas.toDataURL('image/png').split(',')[1];
        canvas.width = canvas.height = 0;
        return png;
      }, faces[i]);
      rows.push({
        id: entries[i].id,
        set: entries[i].card.set,
        name: faces[i].name,
        sha256: hash(Buffer.from(png, 'base64')),
      });
      if (i % 14 === 0)
        console.log(sourceRoot === root ? 'current' : 'baseline', i + 1, faces.length);
    }
    if (session.faults.length) throw Error(session.faults.join('\n'));
    captures.push(rows);
  } finally {
    await session.close();
  }
}
const rows = captures[0].map((r, i) => ({
  ...r,
  after: captures[1][i].sha256,
  identical: r.sha256 === captures[1][i].sha256,
}));
const files = execFileSync('git', ['diff', '--name-only', '8000228', '--', 'games/magic/src'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
const sourceGuards = Object.fromEntries(
  await Promise.all(files.map(async (file) => [file, hash(await readFile(file))])),
);
const receipt = {
  schemaVersion: 1,
  baselineCommit: '8000228d77c91ceed98e604c50290aac4271ba7e',
  scope:
    'Full native Chromium PNG replay, existing set-hsb-v1 callers without the optional calibration policy. Original cached source assets and identical inputs on both versions.',
  cards: rows.length,
  changed: rows.filter((r) => !r.identical).length,
  sourceGuards,
  rows,
};
await writeJson('games/magic/fixtures/accuracy/printing-calibration-legacy-replay.json', receipt);
console.log({ cards: rows.length, changed: receipt.changed });
if (receipt.changed) throw Error('Legacy rendering changed');
