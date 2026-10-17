import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { assertExpansionSourceHash } from './magic-expansion-source-guard.mjs';

const evidence = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-colors.json'),
);
const red = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-red-frame.json'),
);
const groups = { ...evidence.groups, ...red.groups };
for (const [file, hash] of Object.entries(evidence.sourceGuards))
  await assertExpansionSourceHash('games/magic/src/presentation/' + file, hash);
assert.equal(evidence.native.summary.cards, 316);
assert.equal(evidence.native.summary.unchanged, 34);
assert.equal(evidence.native.summary.centralArtworkByteExact, 316);
assert.equal(evidence.compatibility.summary.unchanged, 276);
assert.equal(evidence.compatibility.summary.manaUnchanged, 288);
for (const row of evidence.compatibility.rows.filter((r) => r.scope === 'unchanged'))
  assert.equal(row.beforeHash, row.afterHash);
const identity = { hueDegrees: 0, saturationScale: 1, brightnessScale: 1 };
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const { earlyExpansionFrame } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-expansion-frame.ts',
  );
  const { earlyExpansionColors } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-expansion-colors.ts',
  );
  const { EARLY_EXPANSION_COLORS } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-expansion-color-values.ts',
  );
  const { calibratedFrameMaterials, calibratedPrintingStock } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  assert.equal(Object.keys(EARLY_EXPANSION_COLORS).length, 20);
  let adopted = 0;
  for (const [key, profile] of Object.entries(EARLY_EXPANSION_COLORS)) {
    const [setCode, material] = key.split('/');
    const face = {
      name: 'Shared material probe',
      setCode,
      colors: /^[WUBRG]$/.test(material) ? [material] : [],
      typeLine: material === 'L' ? 'Land' : material === 'A' ? 'Mono Artifact' : 'Summon Goblins',
      colorCalibration: 'set-hsb-v1',
    };
    const frame = earlyExpansionFrame(face);
    assert.equal(profile.source, JSON.stringify([frame.asset, frame.frame]));
    const record = groups[key];
    assert.deepEqual(profile, record.profile);
    const result = earlyExpansionColors(face);
    assert.deepEqual(result, {
      materials: { [frame.asset]: profile.adjustment },
      stock: '#181510',
    });
    assert.deepEqual(calibratedFrameMaterials(face), result.materials);
    assert.equal(calibratedPrintingStock(face), result.stock);
    assert.equal(profile.adjustment.blackPoint, undefined, 'No obsolete source ink curve');
    assert.equal(profile.adjustment.outerStock, undefined, 'Stock is recut independently');
    for (const component of ['frame', 'paper']) {
      const c = record.components[component];
      if (!c.selected) {
        assert.deepEqual(profile.adjustment[component], identity, 'Rejected fit must stay raw');
        continue;
      }
      adopted++;
      assert.ok(c.passes, key + '/' + component);
      const v = c.summary.validation;
      assert.ok(v.cards >= 2 && v.names >= 2);
      assert.ok(v.after <= v.before + 0.15 && v.after <= 5 && v.maxRegression <= 2);
      assert.ok(c.clipping <= 0.03);
      for (const [metric, value] of Object.entries(v.texture ?? {}))
        assert.ok(value.after <= value.before + (metric === 'contrastError' ? 0.5 : 0.25));
    }
    // Custom layouts, opt-out, unrelated sets and explicit stock must not
    // inherit a calibration from an ordinary black-border source.
    for (const override of [
      { colorCalibration: undefined },
      { colorCalibration: 'early-hsb-v1' },
      { borderColor: 'white' },
      { borderColor: 'silver' },
      { frameStyle: 'modern' },
      { frameTemplate: 'future' },
      { layout: 'split' },
      { setCode: 'leg' },
      { setCode: 'lea' },
      { setCode: 'leb' },
      { setCode: '2ed' },
      { setCode: '3ed' },
    ])
      assert.equal(earlyExpansionColors({ ...face, ...override }), undefined);
    const source = profile.source;
    try {
      profile.source += '?unreviewed';
      assert.equal(earlyExpansionColors(face), undefined, 'Stale source/geometry must fail shut');
    } finally {
      profile.source = source;
    }
  }
  assert.equal(adopted, evidence.native.summary.selected + red.summary.selectedComponents);
  for (const face of [
    { setCode: 'arn', name: 'Mountain', typeLine: 'Land' },
    { setCode: 'drk', typeLine: 'Land' },
    { setCode: 'drk', typeLine: 'Summon', colors: ['G', 'R'] },
  ])
    assert.equal(earlyExpansionColors({ ...face, colorCalibration: 'set-hsb-v1' }), undefined);
  console.log(
    `${adopted} native component fits pass; rejected fits, source guards and scope pass.`,
  );
} finally {
  await server.close();
}
