import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { assertExpansionSourceHash } from './magic-expansion-source-guard.mjs';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const receipt = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/early-expansion-calibration.json'),
  );
  const integration = receipt.geometryIntegration;
  const red = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/early-expansion-red-frame.json'),
  );
  const measuredGroups = {
    ...integration.groups,
    ...Object.fromEntries(Object.entries(red.groups).map(([key, value]) => [key, value.geometry])),
  };
  const artist = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/early-expansion-artist.json'),
  );
  assert.equal(integration.summary.cards, 316);
  assert.equal(integration.summary.changed, 282);
  assert.equal(integration.summary.unchanged, 34);
  for (const [file, hash] of Object.entries(integration.sourceGuards)) {
    const extension = artist.sourceExtension[file];
    if (extension) {
      assert.equal(extension.before, hash, 'Artist integration must extend the measured painter');
      assert.equal(artist.native.summary.cards, 316);
      assert.equal(artist.native.summary.outsideChanged, 0);
    }
    await assertExpansionSourceHash(
      'games/magic/src/presentation/' + file,
      extension?.after ?? hash,
    );
  }
  for (const [file, hash] of Object.entries(artist.sourceGuards))
    assert.equal(
      createHash('sha256')
        .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
        .digest('hex'),
      hash,
      'Artist isolation proof is stale: ' + file,
    );
  assert.equal(Object.keys(integration.groups).length, 18);
  for (const group of Object.values(integration.groups)) {
    assert.ok(group.native.summary.validation.after > group.native.summary.validation.before);
    assert.deepEqual(group.native.summary.validation.regressions, []);
  }
  assert.equal(receipt.redTextureTrial.status, 'rejected-do-not-adopt');
  assert.equal(receipt.redTextureTrial.acceptedScanPosesAdded, 0);
  const { earlyExpansionFrame } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-expansion-frame.ts',
  );
  const { retroFrameAsset, retroFrameRect, retroRects } = await server.ssrLoadModule(
    '/games/magic/src/presentation/retro-frame.ts',
  );
  const { calibratedDualFrameProfile } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  for (const setCode of ['arn', 'atq', 'drk']) {
    for (const material of ['W', 'U', 'B', 'R', 'G', 'A']) {
      const face = {
        name: 'Probe',
        setCode,
        colors: material === 'A' ? [] : [material],
        typeLine: material === 'A' ? 'Mono Artifact' : 'Summon Goblins',
        artifact: material === 'A',
      };
      const frame = earlyExpansionFrame(face);
      assert.ok(frame);
      const oracle = {
        ...face,
        typeLine: material === 'A' ? 'Artifact' : 'Creature — Goblin',
        wordingMode: 'oracle',
      };
      assert.deepEqual(earlyExpansionFrame(oracle), frame);
      assert.equal(retroFrameAsset(face), frame.asset);
      assert.deepEqual(retroFrameRect(face), frame.frame);
      assert.deepEqual(retroRects(face).art, frame.art);
      const [x, y, w, h] = frame.art;
      const [sx, sy, sw, sh] = frame.stockWindow;
      assert.ok(x > sx && y > sy && x + w < sx + sw && y + h < sy + sh);
      assert.ok(frame.asset.endsWith(`/${material.toLowerCase()}.png`));
      assert.deepEqual(frame.frame, measuredGroups[`${setCode}/${material}`].frame);
      assert.deepEqual(frame.art, measuredGroups[`${setCode}/${material}`].art);
      // Source/geometry replacement must invalidate prior pigment coefficients.
      assert.equal(
        calibratedDualFrameProfile({ ...face, colorCalibration: 'set-hsb-v1' }),
        undefined,
      );
      for (const override of [
        { setCode: 'leg' },
        { setCode: 'lea' },
        { setCode: 'leb' },
        { setCode: '2ed' },
        { setCode: '3ed' },
        { setCode: '4ed' },
        { borderColor: 'white' },
        { borderColor: 'silver' },
        { frameStyle: 'modern' },
        { frameTemplate: 'future' },
        { layout: 'split' },
        { typeLine: 'Enchantment — Saga' },
      ])
        assert.equal(earlyExpansionFrame({ ...face, ...override }), undefined);
    }
  }
  const land = { name: 'Oasis', setCode: 'arn', typeLine: 'Land', colors: ['G'] };
  assert.ok(retroFrameAsset(land).endsWith('/fourth/l.png'));
  assert.deepEqual(
    earlyExpansionFrame(land),
    earlyExpansionFrame({ ...land, typeLine: '', land: true }),
  );
  for (const typeLine of ['Land', 'Basic Land — Mountain'])
    assert.equal(earlyExpansionFrame({ ...land, name: 'Mountain', typeLine }), undefined);
  assert.ok(
    retroFrameAsset({ ...land, name: 'Mountain', typeLine: 'Basic Land — Mountain' }).endsWith(
      '/seventh/regular/rl.png',
    ),
  );
  // Sparse or rejected scan cohorts cannot silently borrow another set's fit.
  assert.equal(earlyExpansionFrame({ ...land, setCode: 'drk' }), undefined);
  assert.equal(
    earlyExpansionFrame({ ...land, setCode: 'drk', typeLine: 'Summon', colors: ['G', 'R'] }),
    undefined,
  );
  assert.deepEqual(Object.keys(red.groups), ['atq/R', 'drk/R']);
  for (const group of Object.values(red.groups)) {
    assert.ok(
      group.nativeGeometry.summary.validation.after >
        group.nativeGeometry.summary.validation.before,
    );
    assert.deepEqual(group.nativeGeometry.summary.validation.regressions, []);
  }
  console.log('Early expansion sources, artwork placement, wording independence and scope pass.');
} finally {
  await server.close();
}
