import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readNativeCompatibleSource } from './magic-native-source-guard.mjs';

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
});
try {
  const evidence = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/planar-blackpoint.json'),
  );
  for (const [file, hash] of Object.entries(evidence.sourceGuards))
    assert.equal(
      createHash('sha256')
        .update(await readNativeCompatibleSource('games/magic/src/presentation/' + file))
        .digest('hex'),
      hash,
      'Revalidate the ink fit after source pigment or geometry changes',
    );
  assert.equal(evidence.rows.filter((r) => r.cohort === 'calibration').length, 15);
  assert.equal(evidence.rows.filter((r) => r.cohort === 'validation').length, 29);
  for (const group of Object.values(evidence.summary))
    assert.equal(group.validation.ink.improved, group.validation.cards);
  for (const material of Object.values(evidence.materials)) {
    assert.equal(material.brighterChanged, 0);
    assert.equal(material.alphaChanged, 0);
    assert.equal(material.transparentChanged, 0);
  }
  const { colorFrame } = await server.ssrLoadModule('/games/magic/src/presentation/frame-hsb.ts');
  const { earlyHsbMaterialKey } = await server.ssrLoadModule(
    '/games/magic/src/presentation/early-hsb-material.ts',
  );
  const { framePlate, framePlateUrls } = await server.ssrLoadModule(
    '/games/magic/src/presentation/frame-plates.ts',
  );
  const { calibratedFrameMaterials } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  const { planarCalibratedStock, planarFrameBlackPoint } = await server.ssrLoadModule(
    '/games/magic/src/presentation/planar-blackpoint.ts',
  );
  const identity = { hueDegrees: 0, saturationScale: 1, brightnessScale: 1 };
  const face = {
    name: 'Ink calibration',
    setCode: 'plc',
    colors: ['U'],
    typeLine: 'Creature',
    frameAssetFamily: 'eighth',
    frameTreatment: 'colorshifted',
    colorCalibration: 'set-hsb-v1',
  };
  for (const color of 'WUBRG') {
    const input = { ...face, colors: [color] },
      plate = framePlate(input);
    const point = planarFrameBlackPoint(input, plate.frame);
    assert.ok(point);
    assert.deepEqual(
      point.lift,
      evidence.calibration.liftRgb[color].map((v) => v / 255),
    );
    assert.equal(planarCalibratedStock(input, plate.frame), '#181510');
    assert.ok(framePlateUrls(input).includes(plate.border));
    assert.deepEqual(calibratedFrameMaterials(input)[plate.frame].blackPoint, point);
    const ramp = { width: 256, height: 1, data: new Uint8ClampedArray(256 * 4) };
    for (let v = 0; v < 256; v++) ramp.data.set([v, v, v, 255], v * 4);
    colorFrame(
      ramp,
      { ...identity, blackPoint: point },
      { width: 256, height: 1, data: new Uint8ClampedArray(256 * 4) },
    );
    for (let v = 0; v < 256; v++) {
      assert.equal(ramp.data[v * 4 + 3], 255);
      for (let c = 0; c < 3; c++) {
        if (v > 0)
          assert.ok(ramp.data[v * 4 + c] >= ramp.data[(v - 1) * 4 + c], 'Contrast reversal');
        if (v >= 96) assert.equal(ramp.data[v * 4 + c], v, 'Midtone/highlight drift');
      }
    }
    assert.notEqual(
      earlyHsbMaterialKey('frame', 256, 1, identity),
      earlyHsbMaterialKey('frame', 256, 1, { ...identity, blackPoint: point }),
    );
  }
  const plate = framePlate(face),
    selectedPoint = planarFrameBlackPoint(face, plate.frame),
    point = { lift: selectedPoint.lift, transition: selectedPoint.transition };
  for (const override of [
    { setCode: 'lea' },
    { setCode: 'leb' },
    { setCode: 'leg' },
    { setCode: 'fut' },
    { colorCalibration: undefined },
    { frameTreatment: undefined },
    { borderColor: 'white' },
    { frameTemplate: 'future' },
    { layout: 'token' },
    { frameAssetFamily: 'm15' },
  ]) {
    assert.equal(planarCalibratedStock({ ...face, ...override }, plate.frame), undefined);
    assert.equal(planarFrameBlackPoint({ ...face, ...override }, plate.frame), undefined);
  }
  assert.equal(
    planarFrameBlackPoint(face, plate.frame.replace('/33f254', '/unreviewed-33f254')),
    undefined,
  );
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255, 0, 1, 2, 0, 3, 4, 5, 127, 80, 110, 50, 255, 255, 255, 255, 255,
  ]);
  const im = { width: 5, height: 1, data: pixels.slice() };
  colorFrame(im, identity);
  assert.deepEqual(im.data, pixels, 'Legacy ink protection changed without opt-in');
  colorFrame(im, { ...identity, blackPoint: point });
  assert.deepEqual(
    [...im.data.slice(0, 3)],
    point.lift.map((v) => Math.round(v * 255)),
  );
  assert.deepEqual(im.data.slice(4, 8), pixels.slice(4, 8), 'Transparent art changed');
  assert.equal(im.data[11], 127, 'Partial alpha changed');
  assert.deepEqual(im.data.slice(12), pixels.slice(12), 'Colored midtones or highlights changed');
  for (const invalid of [
    { ...point, transition: 0 },
    { ...point, transition: NaN },
    { ...point, lift: [NaN, 0, 0] },
    { ...point, lift: [-1, 0, 0] },
    { ...point, lift: [point.transition, 0, 0] },
  ]) {
    const input = { width: 5, height: 1, data: pixels.slice() };
    assert.throws(
      () => colorFrame(input, { ...identity, brightnessScale: 0.5, blackPoint: invalid }),
      /Invalid frame black-point/,
    );
    assert.deepEqual(input.data, pixels, 'Invalid curve partially modified a material');
  }
  console.log(
    'Shadow curves preserve contrast, alpha and brighter colors; printing/source guards and material cache identity pass.',
  );
} finally {
  await server.close();
}
