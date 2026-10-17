import { assertNativeMagicSourceHash } from './magic-native-source-guard.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { hash } from '../games/magic/tools/accuracy/common.mjs';
import { applyM21RedColor } from '../games/magic/tools/accuracy/calibration-m21-scope.mjs';
const read = async (f) => JSON.parse(await readFile('games/magic/fixtures/accuracy/' + f));
const receipt = await read('m21-red-color-adoption.json');
for (const [file, expected] of Object.entries({
  ...Object.fromEntries(
    Object.entries(receipt.sourceGuards).map(([f, h]) => ['games/magic/src/presentation/' + f, h]),
  ),
  ...receipt.methodGuards,
}))
  await assertNativeMagicSourceHash(file, expected);
assert.equal(receipt.profile.legendary, false);
assert.equal(receipt.metrics.status, 'native-regional-gates-pass');
assert.equal(receipt.metrics.rows.length, 42);
assert.equal(receipt.rawPixelClipping, 0);
for (const s of Object.values(receipt.metrics.summaries)) {
  assert.deepEqual(s.flags, []);
  assert.ok(s.after < s.before);
  assert.ok(s.after < 5);
  assert.ok(s.worstRegression <= 2);
  assert.deepEqual(s.absoluteOutliers, []);
}
assert.equal(receipt.metrics.summaries.calibration.names, 7);
assert.equal(receipt.metrics.summaries.validation.names, 10);
assert.equal(receipt.native.summary.cards, 292);
assert.equal(receipt.native.summary.changed, 42);
assert.equal(receipt.native.summary.unchanged, 250);
for (const r of receipt.native.rows) {
  assert.ok(['mtgjson-original', 'scan-reviewed'].includes(r.wording.rules));
  for (const field of ['artworkChanged', 'paperChanged', 'stockChanged', 'alphaChanged'])
    assert.equal(r[field], 0, r.name + ': ' + field);
  if (!r.changed) assert.equal(r.beforeHash, r.afterHash);
}
assert.equal(receipt.compatibility.summary.probes, 645);
assert.equal(receipt.compatibility.summary.unchanged, 601);
assert.equal(receipt.compatibility.summary.manaUnchanged, 645);
assert.equal(receipt.compatibility.summary.stockUnchanged, 645);
const ledger = await read('calibration-progress.json');
let covered = 0;
for (const g of ledger.sets.find((s) => s.set === 'm21').groups) {
  const rows = receipt.metrics.rows.filter((r) => g.printingIds.includes(r.id));
  if (!rows.length) continue;
  assert.equal(g.palette, 'R');
  assert.equal(g.legendary, false);
  assert.equal(g.tasks.frameColor.status, 'validated');
  assert.equal(rows.length, g.printings);
  covered += rows.length;
  const changed = structuredClone(g);
  applyM21RedColor(changed, receipt.source, receipt, false);
  assert.equal(changed.tasks.frameColor.status, 'stale');
  applyM21RedColor(changed, { source: 'replaced-asset' }, receipt, true);
  assert.equal(changed.tasks.frameColor.status, 'stale');
}
assert.equal(covered, 42);
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const { ORDINARY_COLOR_PROFILES } = await server.ssrLoadModule(
    '/games/magic/src/presentation/ordinary-color-profiles.ts',
  );
  const { PRINTING_COLOR_PROFILES } = await server.ssrLoadModule(
    '/games/magic/src/presentation/printing-color-profiles.ts',
  );
  const { calibratedFrameMaterials } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  assert.deepEqual(ORDINARY_COLOR_PROFILES[receipt.key], receipt.profile);
  const source = receipt.source;
  assert.deepEqual(
    receipt.profile.materials[source.frame].paper,
    PRINTING_COLOR_PROFILES[receipt.key].materials[source.frame].paper,
  );
  assert.ok(!receipt.profile.materials[source.assets.crown]);
  const face = {
    name: 'Red probe',
    typeLine: 'Creature',
    colors: ['R'],
    setCode: 'm21',
    colorCalibration: 'set-hsb-v1',
  };
  assert.deepEqual(calibratedFrameMaterials(face), receipt.profile.materials);
  assert.deepEqual(
    calibratedFrameMaterials({ ...face, legendary: true }),
    PRINTING_COLOR_PROFILES[receipt.key].materials,
  );
  assert.deepEqual(calibratedFrameMaterials({ ...face, colorCalibration: undefined }), {});
} finally {
  await server.close();
}
console.log(
  'M21 red: 42 gated references, 292 original-wording native cards, 645 scope controls; crown/paper/stock isolation passes.',
);
