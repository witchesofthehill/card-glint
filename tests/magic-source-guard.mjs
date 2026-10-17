import { calibrationLegacySource } from './magic-calibration-source-guard.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hash } from '../games/magic/tools/accuracy/common.mjs';

/** A cache-label bump can preserve historical pixel evidence only when undoing
 * that exact replacement reproduces the complete measured source byte-for-byte. */
export async function assertCacheOnlySourceBytes(file, bytes, expected) {
  if (hash(bytes) === expected) return;
  const proof = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/early-expansion-cache-compatibility.json'),
  );
  let source = bytes.toString();
  for (const step of proof.steps ?? [proof]) {
    assert.equal(file, step.file, 'Unproven source change: ' + file);
    if (hash(source) !== step.after) continue;
    assert.equal(source.split(step.to).length, 2);
    source = source.replace(step.to, step.from);
    assert.equal(hash(source), step.before, 'Painter changed: ' + file);
    if (hash(source) === expected) return;
  }
  assert.fail('No verified cache-only ancestry for: ' + file);
}

export async function assertMagicSourceHash(file, expected) {
  await assertCacheOnlySourceBytes(file, await calibrationLegacySource(file), expected);
}
