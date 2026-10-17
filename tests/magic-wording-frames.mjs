import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { presentation } from '../games/magic/tools/accuracy/adapter.mjs';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

const receipt = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-wording-frame-compatibility.json'),
);
const extension = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-input-extension.json'),
);
const breaks = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-break-inputs.json'),
);
const followup = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-followup-wording.json'),
);
assert.deepEqual(followup.summary, { earlyPrintings: 316, changedBodies: 5, unchangedM21: 292 });
assert.equal(followup.inputRows.filter((r) => r.changedBody).length, 5);
assert.ok(followup.inputRows.every((r) => r.otherFieldsIdentical));
for (const [file, guard] of Object.entries(receipt.guards)) {
  const next = extension.guards[file];
  if (next) assert.equal(next.before, guard.after, 'Compatibility chain must start at prior proof');
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource(file))
      .digest('hex'),
    next?.after ?? guard.after,
    'Stale wording compatibility: ' + file,
  );
}
for (const [file, guard] of Object.entries(extension.guards)) {
  const next = breaks.guards[file];
  if (next) assert.equal(next.before, guard.after);
  const latest = followup.guards[file];
  if (latest) assert.equal(latest.before, next?.after ?? guard.after);
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource(file))
      .digest('hex'),
    latest?.after ?? next?.after ?? guard.after,
    file,
  );
}
assert.deepEqual(breaks.summary, { earlyPrintings: 316, changedBodies: 7, unchangedM21: 292 });
assert.equal(breaks.rows.length, 316);
assert.equal(breaks.rows.filter((row) => row.changedBody).length, 7);
assert.ok(breaks.rows.every((row) => row.otherFieldsIdentical));
assert.deepEqual(extension.summary, {
  earlyPrintings: 316,
  changedArtists: 19,
  changedBodies: 2,
  unchangedM21: 292,
});
assert.equal(extension.rows.length, 316);
assert.ok(extension.rows.every((row) => row.otherFieldsIdentical));
assert.deepEqual(receipt.summary, {
  historicalEarlyInputs: 316,
  originalEarlyInputs: 316,
  m21Inputs: 292,
});
for (const row of [...receipt.rows, ...receipt.m21Rows]) assert.equal(row.after, row.before);
assert.equal(receipt.native.rows.length, 316);
assert.equal(receipt.native.summary.frameAndOtherRegionsUnchanged, 316);
assert.deepEqual(receipt.native.summary.regressions, []);
for (const row of receipt.native.rows) {
  assert.equal(row.outsideTextChanged, 0);
  assert.ok(row.isolationPassed);
}

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const { withCardWording } = await server.ssrLoadModule(
    '/games/magic/src/presentation/wording.ts',
  );
  const { retroFrameAsset, retroFrameRect, retroRects, retroFrameFilter } =
    await server.ssrLoadModule('/games/magic/src/presentation/retro-frame.ts');
  const { cardTextureKey } = await server.ssrLoadModule(
    '/games/magic/src/presentation/canvas-face.ts',
  );
  const { providerLandPalette } = await server.ssrLoadModule(
    '/games/magic/src/presentation/provider-appearance.ts',
  );
  const frame = (face) => ({
    asset: retroFrameAsset(face),
    rect: retroFrameRect(face),
    art: retroRects(face).art,
    filter: retroFrameFilter(face),
  });
  for (const setCode of ['lea', 'leb', '2ed', '3ed', '4ed', '5ed', '6ed', '7ed', 'mir', 'tmp']) {
    for (const [i, name] of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].entries()) {
      const color = 'WUBRG'[i],
        face = {
          name,
          setCode,
          colors: [],
          typeLine: `Basic Land — ${name}`,
          rulesText: `{T}: Add {${color}}.`,
        };
      const wordings = {
        oracle: face,
        original: { typeLine: 'Land', rulesText: `Tap to add {${color}} to your mana pool.` },
      };
      const original = withCardWording(face, wordings, 'original');
      assert.deepEqual(original.frameColors, [color]);
      assert.deepEqual(frame(original), frame(face), `${setCode} ${name} keeps its frame`);
      assert.deepEqual(withCardWording(original, wordings, 'oracle').frameColors, [color]);
      assert.deepEqual(
        withCardWording({ ...face, frameColors: [] }, wordings, 'original').frameColors,
        [],
      );
      assert.deepEqual(
        withCardWording({ ...face, frameColors: ['U'] }, wordings, 'original').frameColors,
        ['U'],
      );
      for (const frameColors of [[], ['U']]) {
        const explicit = { ...face, frameColors };
        assert.deepEqual(frame(withCardWording(explicit, wordings, 'original')), frame(explicit));
      }
    }
  }
  for (const [setCode, name, oracleType, printedType, colors] of [
    ['arn', 'Mountain', 'Basic Land — Mountain', 'Land', []],
    ['drk', 'Goblin Caves', 'Enchantment — Aura', 'Enchant Land', ['R']],
    ['drk', 'Goblin Shrine', 'Enchantment — Aura', 'Enchant Land', ['R']],
    ['3ed', 'Probe', 'Enchantment — Aura', 'Enchant Land', ['G']],
    ['atq', 'Probe', 'Enchantment — Aura', 'Enchant Artifact', ['U']],
    ['7ed', 'Probe', 'Enchantment — Aura', 'Enchant Land', ['G']],
  ]) {
    const card = {
      id: 'probe',
      name,
      set: setCode,
      frame: '1993',
      type_line: oracleType,
      oracle_text: 'Oracle.',
      colors,
    };
    const entry = { card, id: card.id, reference: { sha256: 'scan' } };
    const annotation = {
      probe: { reviewedFields: ['typeLine'], referenceHash: 'scan', typeLine: printedType },
    };
    const original = presentation(entry, annotation).face;
    assert.equal(original.land, oracleType.startsWith('Basic Land'));
    assert.equal(original.artifact, false);
    assert.deepEqual(frame(original), frame(presentation(entry).face), name);
    const selected = withCardWording(
      presentation(entry).face,
      {
        oracle: { typeLine: oracleType, rulesText: 'Oracle.' },
        original: { typeLine: printedType, rulesText: 'Original.' },
      },
      'original',
    );
    assert.deepEqual(
      frame(selected),
      frame(original),
      name + ' public and accuracy adapters agree',
    );
  }
  const mountain = {
    name: 'Mountain',
    setCode: 'arn',
    typeLine: 'Land',
    land: true,
    colors: [],
    frameColors: ['R'],
  };
  assert.match(retroFrameAsset(mountain), /\/rl\.png$/);
  assert.match(retroFrameAsset({ ...mountain, frameColors: [] }), /\/l\.png$/);
  const key = (face) => cardTextureKey({ face, printingId: null, printedImage: null }, 'inspect');
  assert.notEqual(
    key(mountain),
    key({ ...mountain, frameColors: [] }),
    'Changing the selected plate invalidates the texture key',
  );
  for (const setCode of ['lea', 'leb', '2ed', '3ed']) {
    const face = { name: 'Bayou', setCode, colors: [], typeLine: 'Land — Swamp Forest' };
    const selected = withCardWording(
      face,
      {
        oracle: { typeLine: face.typeLine, rulesText: 'Oracle.' },
        original: { typeLine: 'Land', rulesText: 'Original.' },
      },
      'original',
    );
    assert.deepEqual(selected.frameColors, ['B', 'G']);
    assert.deepEqual(frame(selected), frame(face));
  }
  assert.equal(
    providerLandPalette('Land — Plains Island Swamp', [], 'm21', '2015', ['W']),
    undefined,
  );
  assert.equal(
    providerLandPalette('Land', [], 'm21', '2015', ['W', 'U', 'B', 'R', 'G']),
    undefined,
  );
  assert.equal(providerLandPalette('Land — Forest', ['G'], 'fut', 'future', ['G']), undefined);
  console.log(
    'Original wording preserves basic/dual palettes, enchantment semantics, explicit overrides and frame cache identity.',
  );
} finally {
  await server.close();
}
