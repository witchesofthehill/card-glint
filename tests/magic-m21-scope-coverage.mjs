import { assertNativeMagicSourceHash } from './magic-native-source-guard.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hash } from '../games/magic/tools/accuracy/common.mjs';
import { calibrationReport } from '../games/magic/tools/accuracy/calibration-report.mjs';
import {
  applyM21BoundaryRefinement,
  applyM21StockTransfer,
  applyM21WhiteDefault,
  applyM21OriginalWording,
} from '../games/magic/tools/accuracy/calibration-m21-scope.mjs';
const read = async (f) => JSON.parse(await readFile('games/magic/fixtures/accuracy/' + f));
const boundaries = await read('m21-component-boundaries-v2.json'),
  stock = await read('modern-land-stock-transfer.json');
for (const receipt of [boundaries, stock])
  for (const [f, expected] of Object.entries(receipt.sourceGuards))
    await assertNativeMagicSourceHash('games/magic/src/presentation/' + f, expected);
assert.equal(boundaries.summary.cards, 239);
assert.equal(boundaries.summary.accepted, 231);
assert.equal(boundaries.summary.rejected.length, 8);
assert.equal(boundaries.knownPoses.total, 80);
assert.equal(boundaries.knownPoses.passed, 80);
assert.ok(boundaries.knownPoses.maxResidual < 0.3);
for (const r of boundaries.knownPoses.rows) {
  assert.equal(r.passed, true);
  assert.equal(r.fitAccepted, true);
  assert.equal(r.certificationAccepted, true);
  assert.ok(r.maxResidual < 0.3);
}
const old = await read('m21-mono-boundaries.json');
assert.deepEqual(
  boundaries.templates.mono,
  old.templates,
  'Keep original templates and cohorts frozen',
);
for (const r of boundaries.rows.filter((r) => r.accepted)) {
  for (const k of ['fit', 'selection', 'certification', 'rasterReplay'])
    assert.equal(r[k].accepted, true, r.name + ': ' + k);
  assert.equal(r.transform.matrix.length, 6);
  assert.ok(r.transform.matrix.every(Number.isFinite));
}
assert.equal(stock.native.summary.cards, 305);
assert.equal(stock.native.summary.changed, 45);
assert.equal(stock.native.summary.unchanged, 260);
assert.equal(stock.native.summary.controls, 13);
assert.equal(stock.native.rows.filter((r) => r.stockChanged && r.set === 'm21').length, 45);
for (const r of [...stock.native.rows, ...stock.native.controls]) {
  assert.ok(r.maxInteriorDelta <= 1, 'Only sub-byte stock blending at translucent component edges');
  for (const k of ['alphaChanged', 'artworkChanged', 'paperChanged', 'invalidStockDelta'])
    assert.equal(r[k], 0, r.name + ': ' + k);
  if (r.stockChanged === false) assert.equal(r.beforeHash, r.afterHash);
}
assert.equal(stock.compatibility.summary.probes, 645);
assert.equal(stock.compatibility.summary.materialsUnchanged, 645);
assert.equal(stock.compatibility.summary.manaUnchanged, 645);
assert.equal(stock.metrics.status, 'gates-pass');
assert.equal(stock.metrics.rows.length, 26);
for (const s of Object.values(stock.metrics.summary)) {
  assert.equal(s.passed, true);
  assert.ok(s.names >= 3 && s.before - s.after > 0.5 && s.after < s.before * 0.9);
  assert.ok(s.worstRegression <= 1 && s.maxTargetShift <= 1);
}
const ledger = await read('calibration-progress.json'),
  m21 = ledger.sets.find((s) => s.set === 'm21');
const white = await read('m21-white-default.json');
const wording = await read('m21-original-wording.json');
assert.equal(wording.rows.length, 292);
assert.equal(wording.summary.originalBody['mtgjson-original'], 287);
assert.equal(wording.summary.originalBody['scan-reviewed'], 5);
assert.equal(wording.native.summary.cards, 33);
assert.equal(wording.native.summary.renders, 66);
const inputExtension = await read('early-expansion-input-extension.json');
assert.equal(inputExtension.summary.unchangedM21, 292);
const breaks = await read('early-expansion-break-inputs.json');
assert.equal(breaks.summary.unchangedM21, 292);
const followup = await read('early-expansion-followup-wording.json');
assert.equal(followup.summary.unchangedM21, 292);
function withWordingFollowup(file, expected) {
  const guard = followup.guards[file];
  if (!guard) return expected;
  assert.equal(guard.before, expected, 'Original input proof must extend the recorded adapter');
  return guard.after;
}
for (const [file, expected] of Object.entries(wording.methodGuards)) {
  const next = inputExtension.guards[file];
  if (next) assert.equal(next.before, expected, 'Input replay must begin at the recorded adapter');
  assert.equal(
    hash(await readFile(file)),
    next?.after ?? expected,
    'Stale wording adapter: ' + file,
  );
}
for (const [file, guard] of Object.entries(inputExtension.guards)) {
  const next = breaks.guards[file];
  if (next) assert.equal(next.before, guard.after);
  assert.equal(
    hash(await readFile(file)),
    withWordingFollowup(file, next?.after ?? guard.after),
    'Stale input replay: ' + file,
  );
}
for (const row of wording.native.rows)
  for (const version of Object.values(row.versions))
    assert.deepEqual(version.changedPixelsInMeasuredRegions, { stock: 0, frameRails: 0, art: 0 });
assert.equal(
  m21.groups.reduce((n, g) => n + (g.tasks.rules.originalInput?.coveredPrintings ?? 0), 0),
  292,
);
const textScope = structuredClone(m21.groups.find((g) => g.tasks.rules.originalInput));
const priorTextStatus = textScope.tasks.rules.status;
applyM21OriginalWording(textScope, wording, false);
assert.equal(textScope.tasks.rules.originalInput.status, 'stale');
assert.equal(
  textScope.tasks.rules.status,
  priorTextStatus,
  'Wording cannot approve text alignment',
);
const [wordingReport] = await calibrationReport({ sets: [m21] });
assert.equal(wordingReport.originalRulesInputs.ready, 292);
assert.equal(wordingReport.originalRulesInputs.stale, 0);
const currentInputs = await read('m21-original-input-compatibility.json');
assert.equal(currentInputs.summary.originalInputs, 292);
assert.equal(currentInputs.checks.length, 292);
assert.ok(currentInputs.checks.every((r) => r.beforeHash === r.afterHash));
assert.deepEqual(currentInputs.rows, wording.rows);
for (const [file, expected] of Object.entries(currentInputs.methodGuards)) {
  const next = breaks.guards[file];
  if (next) assert.equal(next.before, expected);
  assert.equal(
    hash(await readFile(file)),
    withWordingFollowup(file, next?.after ?? expected),
    'Stale original-input replay: ' + file,
  );
}
const changedWording = structuredClone(m21);
const changedScope = changedWording.groups.find((g) => g.tasks.rules.originalInput);
changedScope.tasks.rules.originalInput.guards = { 'missing-wording-source': '0'.repeat(64) };
const [changedReport] = await calibrationReport({ sets: [changedWording] });
assert.equal(changedReport.originalRulesInputs.stale, changedScope.printings);
assert.equal(changedReport.originalRulesInputs.ready, 292 - changedScope.printings);
assert.equal(white.rows.length, 42);
assert.equal(white.choice, 'source-default');
assert.equal(white.normalization.knownPosePassed, 10);
for (const r of white.rows) {
  assert.ok(r.regionalColorError < 5);
  assert.equal(r.textureBinErrors.length, 10);
  assert.ok(r.textureBinErrors.every((v) => v < 5));
  assert.ok(boundaries.rows.some((b) => b.id === r.id && b.accepted));
}
for (const [file, expected] of Object.entries({
  ...Object.fromEntries(
    Object.entries(white.sourceGuards).map(([f, h]) => ['games/magic/src/presentation/' + f, h]),
  ),
  ...white.methodGuards,
}))
  await assertNativeMagicSourceHash(file, expected);
let whiteCount = 0;
for (const g of m21.groups) {
  if (g.tasks.frameColor.status === 'validated-default') {
    assert.equal(g.palette, 'W');
    assert.equal(g.legendary, false);
    assert.equal(g.tasks.frameColor.proof.choice, 'source-default');
    assert.equal(white.rows.filter((r) => g.printingIds.includes(r.id)).length, g.printings);
    whiteCount += g.printings;
    const stale = structuredClone(g);
    applyM21WhiteDefault(stale, white.source, white, false);
    assert.equal(stale.tasks.frameColor.status, 'stale');
    applyM21WhiteDefault(stale, { source: 'different-asset' }, white, true);
    assert.equal(stale.tasks.frameColor.status, 'stale');
  }
  const r = boundaries.rows.filter((r) => g.printingIds.includes(r.id));
  if (r.length) {
    const accepted = r.filter((r) => r.accepted).length;
    assert.equal(g.tasks.normalization.coveredPrintings, accepted);
    assert.equal(g.tasks.normalization.status, accepted === g.printings ? 'validated' : 'partial');
    const stale = structuredClone(g);
    applyM21BoundaryRefinement(stale, boundaries, false);
    assert.equal(stale.tasks.normalization.status, 'stale');
  }
  if (stock.native.rows.some((r) => r.stockChanged && g.printingIds.includes(r.id))) {
    assert.equal(g.tasks.blackLevels.status, 'partial', 'Outer stock cannot certify interior ink');
    const stale = structuredClone(g);
    applyM21StockTransfer(stale, stock, false);
    assert.equal(stale.tasks.blackLevels.status, 'stale');
  }
}
assert.equal(whiteCount, 42);
console.log(
  'M21 scope: 239 scan poses, 80 known transforms, 305 native cards, 645 selector controls; failed scans and interior-ink obligations retained.',
);
