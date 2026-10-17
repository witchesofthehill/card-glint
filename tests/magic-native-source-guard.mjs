import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hash } from '../games/magic/tools/accuracy/common.mjs';
import { assertCacheOnlySourceBytes } from './magic-source-guard.mjs';
import {
  assertNativeDefaultCompatibility,
  nativeHostSources,
} from './magic-native-host-compatibility.mjs';
import { readNativeReference } from './magic-native-reference.mjs';

export async function readNativeCompatibleSource(file) {
  const bytes = await readFile(file);
  const change = nativeHostSources.files[file];
  if (!change || hash(bytes) === change.before) return bytes;
  assert.equal(hash(bytes), change.after, 'Unreviewed native host change: ' + file);
  assert.ok(change.before, 'New modules have no historical calibration ancestry: ' + file);
  await assertNativeDefaultCompatibility();
  const reference = await readNativeReference(file);
  assert.equal(hash(reference), change.before, 'Pinned source ancestry mismatch: ' + file);
  return reference;
}

export async function assertNativeMagicSourceHash(file, expected) {
  const bytes = await readNativeCompatibleSource(file);
  await assertCacheOnlySourceBytes(file, bytes, expected);
}
