import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import {
  assertNativeMagicSourceHash,
  readNativeCompatibleSource,
} from './magic-native-source-guard.mjs';

const receipt = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-text-runtime.json'),
);
assert.equal(receipt.native.summary.cards, 316);
assert.equal(receipt.native.summary.proposalParity, 282);
assert.equal(receipt.native.summary.outsideChanged, 0);
assert.equal(receipt.native.summary.defaultLayoutIdentical, 316);
assert.equal(receipt.native.summary.identityWidthIdentical, 316);
const scores = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-text-scores.json'),
);
assert.equal(scores.rendererHash, receipt.rendererHash);
assert.equal(scores.inputHash, receipt.inputHash);
assert.equal(scores.normalizationHash, receipt.normalizationHash);
assert.equal(scores.rows.length, 316);
assert.equal(scores.rows.filter((row) => row.legacy).length, 282);
assert.equal(scores.rows.filter((row) => row.frameBandTextOverlap).length, 220);
for (const group of Object.values(scores.summary))
  assert.ok(group.legacy.after > group.legacy.before);
assert.equal(receipt.native.rows.filter((r) => r.proposalParity === null).length, 34);
for (const row of receipt.native.rows) {
  assert.equal(row.outsideChanged, 0, row.name);
  assert.ok(!row.layout?.overflow, row.name);
  assert.ok(
    Object.values(row.oracle).every((layout) => !layout?.overflow),
    row.name,
  );
}
const dark = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-dark-short-text.json'),
);
const wording = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-followup-wording.json'),
);
assert.equal(wording.summary.changedBodies, 5);
assert.equal(wording.summary.unchangedM21, 292);
assert.equal(dark.native.summary.cards, 316);
assert.equal(dark.native.summary.proposalParity, 97);
assert.equal(dark.native.summary.defaultLayoutIdentical, 316);
assert.equal(dark.native.summary.identityWidthIdentical, 316);
assert.equal(dark.summary.improved, 17);
assert.equal(dark.summary.regressed, 0);
assert.equal(dark.normalizationHash, receipt.normalizationHash);
assert.equal(dark.inputHash, wording.native.inputHash);
for (const row of dark.native.rows) {
  assert.equal(row.outsideChanged, 0, row.name);
  assert.equal(row.beforeHash, wording.native.rows.find((r) => r.id === row.id).renderHash);
  if (row.set !== 'drk') assert.equal(row.changedPixels, 0, row.name);
  assert.ok(!row.layout?.overflow, row.name);
  assert.ok(
    Object.values(row.oracle).every((layout) => !layout?.overflow),
    row.name,
  );
}
for (const row of dark.rows) {
  assert.equal(row.gain, row.after - row.before);
  assert.ok(row.after >= row.before, row.name);
  assert.equal(row.inputHash, dark.native.rows.find((r) => r.id === row.id).inputHash);
}
for (const [file, guard] of Object.entries(receipt.native.sourceExtension)) {
  const path = 'games/magic/src/presentation/' + file;
  const extension = dark.native.sourceExtension[path];
  if (extension) assert.equal(extension.before, guard.after, file);
  await assertNativeMagicSourceHash(path, extension?.after ?? guard.after);
}
for (const [file, guard] of Object.entries(wording.guards))
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource(file))
      .digest('hex'),
    guard.after,
    file,
  );

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    const { layoutRules } = await import('/games/magic/src/presentation/rules-layout.ts');
    const { paintRulesLayout } = await import('/games/magic/src/presentation/rules-paint.ts');
    const { earlyExpansionTextLayout: fit } = await import(
      '/games/magic/src/presentation/early-expansion-text.ts'
    );
    const c = document.createElement('canvas').getContext('2d');
    const check = (yes, message) => {
      if (!yes) throw Error(message);
    };
    const style = { leading: 1, paragraphGap: 0, flavorGap: 0 };
    const paragraphs = [
      {
        role: 'rules',
        runs: [{ text: 'Letter {G} text—split ' }, { text: 'italic', italic: true }],
      },
    ];
    const frozen = JSON.stringify(paragraphs),
      bounds = { x: 10, y: 10, width: 600, height: 100 };
    const natural = layoutRules(c, paragraphs, bounds, 24, 24, style);
    check(
      JSON.stringify(natural) ===
        JSON.stringify(layoutRules(c, paragraphs, bounds, 24, 24, { ...style, textWidth: 1 })),
      'Identity letter width changes layout',
    );
    const wide = layoutRules(c, paragraphs, bounds, 24, 24, { ...style, textWidth: 1.2 });
    const a = natural.lines[0].runs,
      b = wide.lines[0].runs;
    check(a.length === b.length, 'Probe unexpectedly reflowed');
    for (let i = 0; i < a.length; i++) {
      check(
        Math.abs(b[i].width - a[i].width * (a[i].symbol ? 1 : 1.2)) < 1e-6,
        'Wrong glyph advance',
      );
      check(a[i].ascent === b[i].ascent && a[i].descent === b[i].descent, 'Width changed height');
      if (a[i].symbol) check(b[i].textWidth === undefined, 'Symbol received letter width');
    }
    let calls = 0;
    paintRulesLayout(c, wide, new Map(), (ctx, symbol, x, y, size) => {
      check(
        symbol === 'G' && size === 24 * 0.8 && ctx.getTransform().a === 1,
        'Symbol was stretched',
      );
      calls++;
    });
    check(calls === 1 && c.getTransform().a === 1, 'Painter lost symbol or transform');
    check(JSON.stringify(paragraphs) === frozen, 'Caller data mutated');
    for (const textWidth of [0, -1, NaN, Infinity]) {
      let threw = false;
      try {
        layoutRules(c, paragraphs, bounds, 24, 24, { ...style, textWidth });
      } catch (e) {
        threw = /finite and positive/.test(e.message);
      }
      check(threw, 'Invalid width accepted');
    }
    const short = [{ role: 'rules', runs: [{ text: 'Short visible text.' }] }];
    const long = [{ role: 'rules', runs: [{ text: 'A longer original reference. '.repeat(12) }] }];
    const base = { name: 'Probe', setCode: 'atq', typeLine: 'Artifact', wordingMode: 'original' };
    const large = fit(c, base, short, short),
      regular = fit(c, base, short, long);
    check(large.size > regular.size, 'Selected reference did not control centering');
    check(
      fit(c, { ...base, rulesAlignment: { mode: 'left' } }, short, short).size === regular.size,
      'Forced left ignored',
    );
    const explicit = [{ role: 'rules', align: 'right', runs: [{ text: 'Explicit alignment.' }] }];
    const right = fit(c, base, explicit, explicit);
    check(
      Math.abs(right.lines[0].x - (right.x + right.width - right.lines[0].width)) < 1e-6,
      'Explicit paragraph alignment lost',
    );
    const untouched = new Proxy(
      {},
      {
        get() {
          throw Error('Out-of-scope layout touched canvas');
        },
      },
    );
    for (const other of [
      ...[undefined, 'lea', 'leb', '2ed', '3ed', 'leg', '4ed', '8ed', 'm21'].map((setCode) => ({
        ...base,
        setCode,
      })),
      ...[
        { frameStyle: 'modern' },
        { frameTemplate: 'future' },
        { frameAssetFamily: 'eighth' },
        { borderColor: 'white' },
        { layout: 'split' },
        { typeLine: 'Enchantment — Saga' },
      ].map((change) => ({ ...base, ...change })),
    ])
      check(fit(untouched, other, short, short) === null, 'Out-of-scope profile applied');
  });
  console.log(
    'Early typography: native scope, original/Oracle fitting, explicit alignment, round symbols and default-width compatibility pass.',
  );
} finally {
  await browser.close();
  await server.close();
}
