import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';
const evidence = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/printing-blackpoints.json'),
);
for (const [file, hash] of Object.entries(evidence.sourceGuards))
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
      .digest('hex'),
    hash,
    'Black-level calibration evidence is stale: ' + file,
  );
assert.equal(evidence.coverage.sets.length, 37);
assert.equal(evidence.coverage.accepted, 1021);
assert.equal(evidence.coverage.rejected, 16);
for (const m of evidence.materials.filter((m) => m.status === 'accepted'))
  for (const s of Object.values(m.native.summary)) {
    assert.ok(s.count >= 3 && s.after < s.before - 0.5 && s.after < s.before * 0.9);
    assert.ok(s.worstRegression <= 1);
  }
for (const g of Object.values(evidence.groups)) assert.equal(g.invariants.alphaChanged, 0);
for (const a of Object.values(evidence.artworkInvariants)) {
  assert.equal(a.centralArtworkChanged, 0);
  assert.equal(a.alphaChanged, 0);
}
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
try {
  const { printingBlackPointMaterials } = await server.ssrLoadModule(
    '/games/magic/src/presentation/printing-blackpoint.ts',
  );
  const { colorFrame } = await server.ssrLoadModule('/games/magic/src/presentation/frame-hsb.ts');
  const { earlyHsbMaterialKey } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-hsb-material.ts',
  );
  const profiles = JSON.parse(
    await readFile('games/magic/src/presentation/printing-blackpoint-values.json'),
  );
  for (const p of profiles)
    for (const binding of p.materials) {
      const original = JSON.parse(binding.adjustment),
        materials = { [binding.url]: original },
        saved = JSON.stringify(materials);
      const face = { setCode: p.set, colorCalibration: 'set-hsb-v1', borderColor: 'black' };
      const result = printingBlackPointMaterials(face, materials);
      assert.equal(JSON.stringify(materials), saved, 'Must not mutate shared HSB tables');
      if (binding.lift) {
        assert.deepEqual(
          result.materials[binding.url].blackPoint.lift,
          binding.lift.map((v) => v / 255),
        );
        assert.notEqual(
          earlyHsbMaterialKey(binding.url, 768, 1076, original),
          earlyHsbMaterialKey(binding.url, 768, 1076, result.materials[binding.url]),
        );
      }
      if (original.blackPoint)
        assert.deepEqual(
          result.materials[binding.url].blackPoint,
          original.blackPoint,
          'PLC curves remain exact',
        );
      assert.equal(result.stock, p.stock ?? undefined);
      assert.equal(
        printingBlackPointMaterials({ ...face, borderColor: 'white' }, materials).stock,
        undefined,
      );
      assert.deepEqual(
        printingBlackPointMaterials({ ...face, colorCalibration: undefined }, materials),
        { materials },
      );
      const stale = { [binding.url]: { ...original, unreviewed: true } };
      assert.deepEqual(printingBlackPointMaterials(face, stale), { materials: stale });
      const other = { [binding.url + '?different-source']: original };
      assert.deepEqual(printingBlackPointMaterials(face, other), { materials: other });
    }
  const { calibratedFrameMaterials, calibratedPrintingStock } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  const { colorCalibrationCoverage } = await server.ssrLoadModule(
    '/games/magic/src/presentation/color-calibration-coverage.ts',
  );
  // Stock is set/family-wide even when this color's pigment fit was rejected.
  for (const color of 'WUBRG') {
    const face = {
      name: 'Stock transfer',
      setCode: 'leb',
      frameStyle: 'retro',
      typeLine: 'Creature',
      colors: [color],
      colorCalibration: 'set-hsb-v1',
    };
    assert.equal(calibratedPrintingStock(face), '#1b1b1b');
    assert.ok(Object.values(calibratedFrameMaterials(face)).some((m) => m.outerStockMaskSource));
    assert.equal(calibratedPrintingStock({ ...face, colorCalibration: undefined }), undefined);
    const modern = { ...face, setCode: 'm21', frameStyle: 'modern' };
    assert.equal(calibratedPrintingStock(modern), '#16130e');
    assert.equal(calibratedPrintingStock({ ...modern, layout: 'token' }), undefined);
    if (color === 'G') assert.equal(colorCalibrationCoverage(face).frame, false);
  }
  // A land's procedural paper is deliberately uncalibrated. That must not
  // suppress the independently measured border stock on the same component
  // family, including the two-color frame and matching legendary crown.
  for (const colors of [
    [],
    ...[...'WUBRG'].map((c) => [c]),
    ['U', 'R'],
    ['W', 'B'],
    ['W', 'U', 'B'],
  ]) {
    const land = {
      name: 'Border stock transfer',
      setCode: 'M21',
      frameStyle: 'modern',
      typeLine: 'Legendary Land',
      colors: [],
      frameColors: colors,
      manaSymbols: ['B'],
      colorCalibration: 'set-hsb-v1',
    };
    const saved = JSON.stringify(land);
    assert.equal(calibratedPrintingStock(land), '#16130e');
    assert.equal(colorCalibrationCoverage(land).frame, false, 'Stock is not a land pigment fit');
    assert.deepEqual(calibratedFrameMaterials(land), {}, 'Do not recolor land-paper blends');
    assert.equal(
      JSON.stringify(land),
      saved,
      'Preserve palette overrides, mana and logical colors',
    );
    for (const changes of [
      { colorCalibration: undefined },
      { borderColor: 'white' },
      { borderColor: 'silver' },
      { setCode: 'FORGE' },
      { setCode: 'M15' },
      { layout: 'token' },
      { frameTemplate: 'future' },
    ])
      assert.equal(calibratedPrintingStock({ ...land, ...changes }), undefined);
  }
  const modernStock = JSON.parse(
    await readFile('games/magic/src/presentation/printing-stock-values.json'),
  ).find((p) => p.set === 'm21');
  const stockFace = { setCode: 'M21', colorCalibration: 'set-hsb-v1' };
  const stockSource = { url: modernStock.prefix + 'UR.webp', geometry: modernStock.geometry };
  assert.equal(printingBlackPointMaterials(stockFace, {}, stockSource).stock, '#16130e');
  for (const source of [
    { ...stockSource, url: stockSource.url + '?changed-source' },
    { ...stockSource, url: stockSource.url.replace('b52888c', '0000000') },
    { ...stockSource, geometry: '[0,0,1,1]' },
  ])
    assert.equal(printingBlackPointMaterials(stockFace, {}, source).stock, undefined);
  const identity = { hueDegrees: 0, saturationScale: 1, brightnessScale: 1 },
    stock = [24 / 255, 21 / 255, 16 / 255];
  const im = { width: 100, height: 140, data: new Uint8ClampedArray(100 * 140 * 4) };
  for (let y = 0; y < 140; y++)
    for (let x = 0; x < 100; x++)
      im.data.set(
        x < 3 || x > 96 || y < 3 || y > 136 ? [0, 0, 0, 255] : [190, 180, 160, 255],
        4 * (y * 100 + x),
      );
  // Interior islands (including one within the outer band), colored edge pixels,
  // and transparent corners must not become connected stock.
  for (const [x, y, rgb] of [
    [1, 1, [2, 3, 4, 0]],
    [0, 50, [18, 7, 3, 255]],
    [5, 50, [0, 0, 0, 255]],
    [50, 50, [0, 0, 0, 255]],
  ])
    im.data.set(rgb, 4 * (y * 100 + x));
  const before = im.data.slice();
  colorFrame(im, { ...identity, outerStock: stock });
  assert.deepEqual([...im.data.slice(0, 3)], [24, 21, 16]);
  for (const [x, y] of [
    [1, 1],
    [0, 50],
    [5, 50],
    [50, 50],
    [50, 60],
  ]) {
    const i = 4 * (y * 100 + x);
    assert.deepEqual(im.data.slice(i, i + 4), before.slice(i, i + 4));
  }
  for (let i = 3; i < before.length; i += 4)
    assert.equal(im.data[i], before[i], 'Alpha must be exact');
  const ramp = { width: 256, height: 1, data: new Uint8ClampedArray(256 * 4) };
  for (let i = 0; i < 256; i++) ramp.data.set([i, i, i, 255], i * 4);
  colorFrame(ramp, { ...identity, outerStock: stock });
  for (let i = 1; i < 256; i++)
    for (let c = 0; c < 3; c++) {
      assert.ok(
        ramp.data[i * 4 + c] >= ramp.data[(i - 1) * 4 + c],
        'Stock ramp must stay monotone',
      );
      if (i >= 96) assert.equal(ramp.data[i * 4 + c], i);
    }
  const mask = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 255]),
  };
  const masked = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 190, 190, 190, 255]),
  };
  colorFrame(
    masked,
    { ...identity, outerStock: stock, outerStockMaskSource: 'native.svg' },
    undefined,
    mask,
  );
  assert.deepEqual([...masked.data], [24, 21, 16, 255, 12, 11, 8, 255, 190, 190, 190, 255]);
  for (const invalid of [
    [NaN, 0, 0],
    [-1, 0, 0],
    [0.5, 0, 0],
  ]) {
    const input = { width: 3, height: 1, data: masked.data.slice() };
    assert.throws(
      () => colorFrame(input, { ...identity, brightnessScale: 0.5, outerStock: invalid }),
      /Invalid baked stock/,
    );
    assert.deepEqual(input.data, masked.data, 'Invalid stock must not partially recolor a frame');
  }
  assert.throws(
    () =>
      colorFrame(masked, { ...identity, outerStock: stock, outerStockMaskSource: 'native.svg' }),
    /needs its source selection/,
  );
  console.log(
    'Printing black points: exact source/HSB guards, cache isolation, preserved PLC fits, connected-stock selection and monotone tones passed.',
  );
} finally {
  await server.close();
}
