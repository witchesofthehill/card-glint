import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hash } from '../games/magic/tools/accuracy/common.mjs';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

/** Historical profiles remain valid only if removing the exact two-key data
 * extension reconstructs their entire measured module, with native isolation. */
export async function assertExpansionSourceHash(file, expected) {
  const bytes = await readNativeCompatibleSource(file);
  if (hash(bytes) === expected) return;
  const proof = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/early-expansion-red-frame.json'),
  );
  const extension = proof.sourceExtension;
  const change = extension.files[file];
  assert.ok(change, 'Unproven historical source change: ' + file);
  assert.equal(change.before, expected);
  assert.equal(hash(bytes), change.after);
  assert.deepEqual(extension.changedKeys, ['atq/R', 'drk/R']);
  assert.equal(hash(await readFile(extension.addedFile.file)), extension.addedFile.hash);
  assert.equal(proof.native.summary.cards, 316);
  assert.equal(proof.native.summary.changed, 26);
  assert.equal(proof.native.summary.unchanged, 290);
  assert.equal(proof.native.summary.unchangedTextLayouts, 316);
  for (const row of proof.native.rows) {
    const changedScope = extension.changedKeys.includes(`${row.set}/${row.material}`);
    assert.equal(row.changed, changedScope);
    if (!changedScope) assert.equal(row.renderHash, row.beforeHash);
  }
  let prior = bytes.toString();
  for (const insertion of change.insertions) {
    assert.equal(prior.split(insertion).length, 2);
    prior = prior.replace(insertion, '');
  }
  assert.equal(hash(prior), expected, 'Existing profile bytes changed: ' + file);
}
