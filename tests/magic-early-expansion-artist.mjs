import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

const receipt = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-artist.json'),
);
assert.deepEqual(receipt.native.summary, {
  cards: 316,
  changed: 316,
  outsideChanged: 0,
  proposalParity: 268,
});
assert.equal(receipt.rows.filter((r) => r.status === 'normalization-review').length, 34);
assert.equal(receipt.rows.filter((r) => r.scores).length, 282);
for (const row of receipt.rows) {
  assert.equal(row.outsideChanged, 0, row.name);
  if (row.proposalChanged !== null) assert.equal(row.proposalChanged, 0, row.name);
}
for (const group of Object.values(receipt.reserved)) {
  assert.equal(group.improved, group.cards);
  assert.equal(group.worstRegression, 0);
}
const scores = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/early-expansion-artist-scores.json'),
);
assert.equal(scores.rendererHash, receipt.rendererHash);
assert.equal(scores.aggregation, 'reviewed-early-credits-v1');
for (const row of scores.rows.filter((r) => r.reviewed)) {
  assert.equal(row.legacy.before, row.legacy.after, 'Old policy excludes credits');
  assert.equal(row.reviewed.coverage, 1);
  assert.ok(row.reviewed.after > row.reviewed.before, row.name);
}
assert.equal(scores.rows.filter((r) => r.reviewed).length, 282);
for (const [file, expected] of Object.entries({
  ...receipt.sourceGuards,
  ...Object.fromEntries(Object.entries(receipt.sourceExtension).map(([f, h]) => [f, h.after])),
}))
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
      .digest('hex'),
    expected,
    'Stale artist painter: ' + file,
  );

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const { paintEarlyExpansionArtist } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-expansion-artist.ts',
  );
  const untouched = new Proxy(
    {},
    {
      get() {
        throw Error('Out-of-scope artist touched canvas');
      },
    },
  );
  for (const setCode of [undefined, 'lea', 'leb', '2ed', '3ed', 'leg', '4ed', '8ed', 'm21'])
    assert.equal(paintEarlyExpansionArtist(untouched, { setCode, artist: 'Test Artist' }), false);
  for (const setCode of ['arn', 'atq', 'drk'])
    assert.equal(paintEarlyExpansionArtist(untouched, { setCode, artist: '' }), false);
  console.log(
    'Early artists: 316 native cards, 268 exact proposal replays, frozen references and scope pass.',
  );
} finally {
  await server.close();
}
