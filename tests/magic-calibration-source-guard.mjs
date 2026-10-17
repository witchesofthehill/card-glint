import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hash } from '../games/magic/tools/accuracy/common.mjs';
const verified = new WeakMap();
async function proof(readSource) {
  let verification = verified.get(readSource);
  if (!verification) {
    verification = (async () => {
      const evidence = JSON.parse(
        await readFile('games/magic/fixtures/accuracy/printing-calibration-legacy-replay.json'),
      );
      const extension = JSON.parse(
        await readFile(
          'games/magic/fixtures/accuracy/printing-calibration-source-compatibility.json',
        ),
      );
      assert.equal(evidence.baselineCommit, extension.baselineCommit);
      assert.ok(evidence.cards >= 80);
      assert.equal(evidence.changed, 0);
      assert.equal(evidence.rows.length, evidence.cards);
      for (const row of evidence.rows) {
        assert.equal(row.identical, true);
        assert.equal(row.sha256, row.after);
      }
      for (const [file, expected] of Object.entries(extension.dependencies))
        assert.equal(
          hash(await readSource(file)),
          expected,
          'Unreviewed calibration-policy dependency: ' + file,
        );
      return extension;
    })();
    verified.set(readSource, verification);
  }
  return verification;
}
/** Historical receipts keep their original hashes. Reconstruct the entire prior
 * module using a bounded, hash-checked opt-in extension, backed by native replay.
 * New policy tests always run the current code; this applies only to old evidence.
 * A supplied reader must independently prove any host extension before returning
 * upstream bytes, including every policy dependency verified above. */
export async function calibrationLegacySource(file, readSource = readFile) {
  const bytes = await readSource(file),
    extension = await proof(readSource),
    change = extension.files[file];
  if (!change) return bytes;
  assert.equal(hash(bytes), change.after, 'Unreviewed calibration source change: ' + file);
  const lines = bytes.toString().match(/[^\n]*\n|[^\n]+$/g) || [];
  for (const edit of change.reverseEdits) lines.splice(edit.start, edit.count, ...edit.lines);
  const before = Buffer.from(lines.join(''));
  assert.equal(hash(before), change.before, 'Legacy source reconstruction failed: ' + file);
  return before;
}
