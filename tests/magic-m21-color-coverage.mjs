import assert from 'node:assert/strict';
import { assertNativeMagicSourceHash } from './magic-native-source-guard.mjs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { hash } from '../games/magic/tools/accuracy/common.mjs';
import { applyM21Evidence } from '../games/magic/tools/accuracy/calibration-m21-evidence.mjs';
const read = async (file) => JSON.parse(await readFile('games/magic/fixtures/accuracy/' + file));
const evidence = await read('m21-normal-color-adoption.json'),
  normal = await read('m21-normal-boundaries.json');
const mono = await read('m21-mono-boundaries.json');
assert.equal(mono.rows.length, 206);
assert.equal(mono.rows.filter((r) => r.accepted).length, 163);
assert.equal(mono.knownPoses.passed, 48);
assert.equal(mono.knownPoses.total, 50);
assert.equal(mono.materials.R.methodPassed, false);
assert.ok(mono.materials.R.maxResidual > 0.3);
for (const material of ['W', 'U', 'B', 'G']) {
  assert.equal(mono.materials[material].methodPassed, true);
  assert.ok(mono.materials[material].maxResidual < 0.3);
}
for (const row of normal.rows) {
  const extended = mono.rows.find((r) => r.id === row.id);
  assert.deepEqual(extended.transform, row.transform);
  assert.equal(extended.accepted, row.accepted);
}
for (const [file, expected] of Object.entries(evidence.sourceGuards))
  await assertNativeMagicSourceHash('games/magic/src/presentation/' + file, expected);
assert.equal(normal.templateHash, evidence.normalization.templateHash);
assert.equal(normal.knownPoses.passed, 20);
assert.equal(normal.knownPoses.total, 20);
assert.ok(normal.knownPoses.maxResidual < 0.3);
assert.equal(normal.rows.length, 82);
assert.equal(normal.rows.filter((r) => r.accepted).length, 81);
for (const row of normal.rows.filter((r) => r.accepted))
  for (const key of ['fit', 'selection', 'certification', 'rasterReplay'])
    assert.equal(row[key].accepted, true, row.name + ': ' + key);
const { templateHash, schema, ...spec } = normal.templates;
assert.equal(hash(JSON.stringify(spec)), templateHash, 'Frozen template identity');
assert.equal(evidence.rawPixelClipping, 0);
assert.equal(evidence.metrics.rows.length, 39);
for (const m of Object.values(evidence.metrics.summaries)) {
  assert.deepEqual(m.flags, []);
  assert.ok(m.after <= m.before + 0.15);
  assert.ok(m.after <= 5);
  assert.ok(m.worstRegression <= 2);
  assert.ok(m.maxBlankReplayDifference <= 0.5);
  for (const [k, limit] of [
    ['shadowChroma', 0.25],
    ['shadowLightness', 0.25],
    ['contrastError', 0.5],
  ])
    assert.ok(m.texture[k].after <= m.texture[k].before + limit);
}
assert.equal(evidence.native.summary.cards, 292);
assert.equal(evidence.native.summary.changed, 40);
assert.equal(evidence.native.excluded.length, 5);
assert.equal(evidence.native.rows.filter((r) => !r.changed).length, 252);
for (const row of evidence.native.rows) {
  assert.equal(row.artworkChanged, 0);
  assert.equal(row.paperChanged, 0);
  assert.equal(row.stockUnchanged, true);
  if (!row.changed) assert.equal(row.beforeHash, row.afterHash);
}
assert.equal(evidence.compatibility.summary.probes, 580);
for (const row of evidence.compatibility.rows.filter((r) => r.scope === 'unchanged'))
  assert.equal(row.beforeHash, row.afterHash);
for (const file of ['early-expansion-colors.json', 'printing-blackpoints.json']) {
  const prior = await read(file),
    extension = prior.compatibleExtensions.find((e) => e.id === 'm21-normal-black-component-tone');
  assert.deepEqual(
    extension.files['calibration-profiles.ts'],
    evidence.compatibility.files['calibration-profiles.ts'],
  );
  const stock = prior.compatibleExtensions.find((e) => e.id === 'm21-component-stock-transfer');
  assert.equal(
    stock.files['calibration-profiles.ts'].before,
    extension.files['calibration-profiles.ts'].after,
  );
  assert.equal(
    prior.compatibleExtensions.find((e) => e.id === 'm21-ordinary-red-pigment').files[
      'calibration-profiles.ts'
    ].before,
    stock.files['calibration-profiles.ts'].after,
  );
  assert.equal(
    prior.sourceGuards['calibration-profiles.ts'],
    prior.compatibleExtensions.find((e) => e.id === 'm21-ordinary-red-pigment').files[
      'calibration-profiles.ts'
    ].after,
  );
}
const ledger = await read('calibration-progress.json'),
  m21 = ledger.sets.find((s) => s.set === 'm21');
for (const g of m21.groups) {
  if (g.palette === 'R' && mono.rows.some((r) => g.printingIds.includes(r.id)))
    assert.equal(
      g.tasks.normalization.status,
      'validated',
      'Red now needs the separately validated refined method, not the historical failed method',
    );
  if (g.tasks.frameColor.status === 'validated') {
    if (g.palette === 'R') {
      assert.ok(
        g.tasks.frameColor.evidence.includes(
          'games/magic/fixtures/accuracy/m21-red-color-adoption.json',
        ),
      );
      continue; // Red's independent scope and native invariants have their own test.
    }
    assert.equal(g.palette, 'B');
    assert.equal(g.legendary, false);
    assert.ok(!g.kind.includes('artifact'));
    assert.equal(g.tasks.frameColor.proof.coveredPrintings, g.printings);
  }
}
const scorn = m21.groups.find((g) =>
  g.printingIds.includes(evidence.normalization.unresolved[0].id),
);
assert.equal(scorn.tasks.normalization.status, 'partial');
assert.equal(scorn.tasks.frameColor.status, 'partial');
const stale = structuredClone(scorn);
applyM21Evidence(
  stale,
  { key: evidence.key, source: evidence.profile.source },
  evidence,
  normal,
  false,
);
assert.equal(stale.tasks.frameColor.status, 'stale');
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const { PRINTING_COLOR_PROFILES } = await server.ssrLoadModule(
    '/games/magic/src/presentation/printing-color-profiles.ts',
  );
  const { calibratedFrameMaterials, hasCalibratedFramePigment } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  assert.deepEqual(PRINTING_COLOR_PROFILES[evidence.key], evidence.profile);
  const face = {
    name: 'Scope probe',
    setCode: 'm21',
    colors: ['B'],
    typeLine: 'Creature',
    colorCalibration: 'set-hsb-v1',
  };
  const pigment = Object.fromEntries(
    Object.entries(calibratedFrameMaterials(face)).map(
      ([url, { blackPoint, outerStock, outerStockMaskSource, ...value }]) => [url, value],
    ),
  );
  assert.deepEqual(pigment, evidence.profile.materials);
  assert.equal(hasCalibratedFramePigment(face), true);
  for (const excluded of [
    { typeLine: 'Legendary Creature' },
    { typeLine: 'Artifact' },
    { typeLine: 'Planeswalker' },
    { typeLine: 'Land', colors: [] },
    { setCode: 'unmeasured' },
    { colorCalibration: undefined },
    { frameAssetFamily: 'm15-accurate' },
    { borderColor: 'white' },
    { layout: 'token' },
  ])
    assert.equal(
      hasCalibratedFramePigment({ ...face, ...excluded }),
      false,
      JSON.stringify(excluded),
    );
  assert.ok(!Object.keys(pigment).some((url) => url.includes('/legendary_crowns/')));
} finally {
  await server.close();
}
console.log(
  'M21: bounded normal-black adoption, 292-card native invariants, 81 scan poses, rejected cases and source guards passed.',
);
