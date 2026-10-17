import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

const evidence = JSON.parse(
  await readFile('games/magic/fixtures/accuracy/planar-frame-texture.json'),
);
for (const [file, hash] of Object.entries(evidence.sourceGuards))
  assert.equal(
    createHash('sha256')
      .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
      .digest('hex'),
    hash,
    'Revalidate the texture/bevel balance after material changes',
  );
assert.equal(evidence.rows.filter((r) => r.cohort === 'calibration').length, 15);
assert.equal(evidence.rows.filter((r) => r.cohort === 'validation').length, 29);
for (const c of 'WUBRG') {
  const group = evidence.summary[c].validation;
  assert.ok(group.bevelError.after < group.bevelError.before);
  assert.equal(evidence.materials[c].alphaChanged, 0);
  assert.equal(evidence.materials[c].transparentChanged, 0);
}
assert.ok(evidence.rows.every((r) => Object.values(r.unchangedPanels).every((v) => v === 0)));

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const load = (name) => server.ssrLoadModule('/games/magic/src/presentation/' + name + '.ts');
  const { outsetFrameMask } = await load('frame-material-mask');
  const { blendFrameMaterial } = await load('frame-material-blend');
  const { colorFrame } = await load('frame-hsb');
  const { planarFrameBlackPoint, planarBevelBlend } = await load('planar-blackpoint');
  const { framePlate, framePlateUrls } = await load('frame-plates');
  const { earlyHsbMaterialKey } = await load('early-hsb-material');
  const pixels = (width, height, rgba) => ({
    width,
    height,
    data: new Uint8ClampedArray(Array.from({ length: width * height }, (_, p) => rgba(p)).flat()),
  });
  const face = {
    name: 'Texture',
    setCode: 'plc',
    colors: ['B'],
    typeLine: 'Sorcery',
    frameAssetFamily: 'eighth',
    frameTreatment: 'colorshifted',
    colorCalibration: 'set-hsb-v1',
  };
  const source = framePlate(face).frame,
    point = planarFrameBlackPoint(face, source),
    blend = planarBevelBlend(face, source);
  for (const url of [point.textureMaskSource, blend.maskSource, blend.outerMaskSource])
    assert.ok(framePlateUrls(face).includes(url));
  for (const override of [
    { colorCalibration: undefined },
    { setCode: '8ed' },
    { frameTreatment: undefined },
    { frameAssetFamily: 'm15' },
    { borderColor: 'white' },
  ]) {
    const other = { ...face, ...override };
    assert.equal(planarBevelBlend(other, source), undefined);
    if (override.frameAssetFamily === 'm15')
      assert.throws(() => framePlateUrls(other), /requires the eighth/);
    else assert.ok(!framePlateUrls(other).includes(blend.maskSource));
  }
  assert.equal(planarBevelBlend(face, source.replace('/33f254', '/unreviewed-33f254')), undefined);

  // Compare the linear-time selection expansion to an independent brute-force
  // square maximum, including partial coverage and excluded panel pixels.
  for (const [width, height] of [
    [1, 1],
    [7, 5],
    [4, 9],
  ])
    for (const radius of [0, 1, 3]) {
      if (radius > Math.max(width, height)) continue;
      const mask = pixels(width, height, (p) => [1, 2, 3, (p * 71 + 17) % 256]);
      const frame = pixels(width, height, (p) => [0, 0, 0, p % 3 ? 127 : 0]);
      const before = mask.data.slice(),
        expected = before.slice();
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          let maximum = 0;
          for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy++)
            for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx++)
              maximum = Math.max(maximum, before[4 * (yy * width + xx) + 3]);
          const i = 4 * (y * width + x) + 3;
          expected[i] = Math.max(before[i], Math.round((maximum * frame.data[i]) / 255));
        }
      outsetFrameMask(mask, frame, radius);
      assert.deepEqual(mask.data, expected);
    }
  const ramp = pixels(256, 1, (p) => [p, p, p, 255]),
    opaque = pixels(256, 1, () => [0, 0, 0, 255]),
    clear = pixels(256, 1, () => [0, 0, 0, 0]);
  const identity = { hueDegrees: 0, saturationScale: 1, brightnessScale: 1 };
  const base = structuredClone(ramp);
  let masked = structuredClone(ramp);
  colorFrame(base, { ...identity, blackPoint: { lift: point.lift, transition: point.transition } });
  colorFrame(masked, { ...identity, blackPoint: point }, clear);
  assert.deepEqual(masked, base, 'Selection must isolate the texture correction');
  colorFrame((masked = structuredClone(ramp)), { ...identity, blackPoint: point }, opaque);
  for (let v = 0; v < 256; v++)
    for (let c = 0; c < 3; c++) {
      if (v <= 12 || v === 255) assert.equal(masked.data[v * 4 + c], base.data[v * 4 + c]);
      if (v) assert.ok(masked.data[v * 4 + c] >= masked.data[(v - 1) * 4 + c]);
    }
  for (const invalid of [
    {
      ...point,
      texture: [
        [0, [1, 0, 0]],
        [1, [0, 0, 0]],
      ],
    },
    {
      ...point,
      texture: [
        [0, [0, 0, 0]],
        [0.1, [-1, 0, 0]],
        [1, [0, 0, 0]],
      ],
    },
    {
      ...point,
      texture: [
        [0, [0, 0, 0]],
        [NaN, [0, 0, 0]],
        [1, [0, 0, 0]],
      ],
    },
  ]) {
    const original = structuredClone(ramp);
    assert.throws(
      () =>
        colorFrame(original, { ...identity, brightnessScale: 0.5, blackPoint: invalid }, opaque),
      /texture curve/,
    );
    assert.deepEqual(original, ramp);
  }
  assert.throws(
    () => colorFrame(structuredClone(ramp), { ...identity, blackPoint: point }),
    /source selection/,
  );
  const shaded = structuredClone(ramp);
  blendFrameMaterial(shaded, clear, blend);
  assert.deepEqual(shaded, ramp);
  blendFrameMaterial(shaded, opaque, blend);
  for (let v = 0; v < 256; v++)
    for (let c = 0; c < 3; c++) {
      assert.ok(
        shaded.data[v * 4 + c] <= ramp.data[v * 4 + c],
        'Bevel blend must not brighten dark ink',
      );
      if (v) assert.ok(shaded.data[v * 4 + c] >= shaded.data[(v - 1) * 4 + c]);
      assert.equal(shaded.data[v * 4 + 3], 255);
    }
  const transparent = pixels(1, 1, () => [100, 120, 140, 0]);
  blendFrameMaterial(
    transparent,
    pixels(1, 1, () => [0, 0, 0, 255]),
    blend,
  );
  assert.deepEqual([...transparent.data], [100, 120, 140, 0]);
  for (const invalid of [
    { ...blend, amount: NaN },
    { ...blend, amount: 2 },
    { ...blend, backdrop: [-1, 0, 0] },
  ]) {
    const original = structuredClone(ramp);
    assert.throws(() => blendFrameMaterial(original, opaque, invalid), /Invalid/);
    assert.deepEqual(original, ramp);
  }
  const adjustment = { ...identity, blackPoint: point, blend };
  const key = (a) => earlyHsbMaterialKey(source, 256, 1, a);
  for (const changed of [
    { ...adjustment, blackPoint: { ...point, texture: undefined } },
    { ...adjustment, blend: { ...blend, amount: 0.5 } },
    { ...adjustment, blend: { ...blend, outset: 0 } },
    { ...adjustment, blend: { ...blend, maskSource: 'different' } },
  ])
    assert.notEqual(key(adjustment), key(changed));
  console.log(
    'PLC texture/bevel balance: held-out evidence, isolated selections, monotone tone curves and cache identity pass.',
  );
} finally {
  await server.close();
}
