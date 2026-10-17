import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
const load = (name) => server.ssrLoadModule('/games/magic/src/presentation/' + name + '.ts');
try {
  const api = await load('printing-calibration');
  const { resolvePrintingPreset } = await load('printing-presets');
  const { resolvePrintingStyle, printingStyles, printingStyleOptions, composePrintingSelection } =
    await load('printing-style');
  const exact = await load('calibration-profiles');
  const material = await load('printing-calibration-materials');
  const { cardTextureKey } = await load('canvas-face');
  const { canvasAssetUrls } = await load('canvas-assets');
  const { colorFrame } = await load('frame-hsb');
  const face = {
    name: 'Probe',
    setCode: 'NEO',
    typeLine: 'Creature',
    colors: ['R'],
    manaSymbols: ['2', 'R'],
    colorCalibration: 'set-hsb-v1',
  };
  const original = structuredClone(face);
  for (const setCode of [
    'LEA',
    'LEB',
    '2ED',
    '3ED',
    '4ED',
    'LEG',
    'ARN',
    'ATQ',
    'DRK',
    'MIR',
    '7ED',
    '8ED',
    'M15',
    'M21',
    'NEO',
  ])
    for (const color of 'WUBRG') {
      const f = { ...face, setCode, colors: [color] };
      assert.deepEqual(
        material.calibratedFrameMaterials(f),
        exact.calibratedFrameMaterials(f),
        'Omitted policy preserves measured materials',
      );
      assert.equal(material.calibratedPrintingStock(f), exact.calibratedPrintingStock(f));
      const auto = material.calibratedFrameMaterials({ ...f, calibration: 'auto' });
      for (const [url, correction] of Object.entries(exact.calibratedFrameMaterials(f)))
        assert.deepEqual(auto[url], correction, 'Auto preserves each exact correction');
    }
  assert.deepEqual(face, original);
  const report = api.resolvePrintingCalibration({ ...face, calibration: 'auto' });
  assert.equal(report.components.border.color, '#16130e');
  assert.equal(report.components.border.status, 'fallback');
  assert.equal(report.components.frame.status, 'fallback');
  assert.equal(report.components.interiorInk.status, 'source');
  const chosen = resolvePrintingPreset(face, {
    preset: 'match',
    overrides: { calibration: 'auto' },
  });
  assert.equal(chosen.setCode, 'NEO');
  assert.equal(chosen.typeLine, face.typeLine);
  assert.deepEqual(chosen.manaSymbols, face.manaSymbols);
  const source = resolvePrintingPreset(
    { ...face, setCode: 'M21' },
    { preset: 'match', overrides: { calibration: 'source' } },
  );
  assert.equal(source.colorCalibration, undefined);
  assert.deepEqual(material.calibratedFrameMaterials(source), {});
  assert.equal(material.calibratedPrintingStock(source), undefined);
  for (const calibration of [
    'bad',
    null,
    {},
    { profile: 'missing' },
    { profile: 'm21-modern', extra: 1 },
  ])
    assert.throws(() =>
      resolvePrintingPreset(face, { preset: 'match', overrides: { calibration } }),
    );
  assert.throws(
    () =>
      resolvePrintingPreset(
        { ...face, setCode: 'LEA', frameStyle: 'retro' },
        { preset: 'match', overrides: { calibration: { profile: 'm21-modern' } } },
      ),
    /modern/,
  );
  for (const calibration of ['auto', 'printing', 'source', { profile: 'm21-modern' }]) {
    const result = resolvePrintingStyle(
      face,
      printingStyles.find((s) => s.id === 'match'),
      { overrides: { calibration } },
    );
    assert.deepEqual(result.calibration.mode, calibration);
    assert.deepEqual(result.selection.overrides.calibration, calibration);
    assert.ok(
      printingStyleOptions(
        face,
        printingStyles.find((s) => s.id === 'match'),
        { overrides: { calibration } },
      )[0].calibration,
    );
  }
  assert.equal(
    composePrintingSelection(
      { preset: 'match', overrides: { calibration: 'auto' } },
      { overrides: { calibration: 'source' } },
    ).overrides.calibration,
    'source',
  );
  const key = (calibration) =>
    cardTextureKey(
      { face: { ...face, calibration }, printingId: 'probe', printedImage: null },
      'inspect',
    );
  assert.equal(
    new Set([
      key(undefined),
      key('auto'),
      key('printing'),
      key('source'),
      key({ profile: 'm21-modern' }),
    ]).size,
    5,
  );
  for (const borderColor of ['white', 'silver'])
    assert.equal(
      material.calibratedPrintingStock({ ...face, calibration: 'auto', borderColor }),
      undefined,
    );
  for (const layout of ['transform', 'modal_dfc', 'reversible_card', 'meld']) {
    const f = { ...face, layout, calibration: 'auto' };
    const r = api.resolvePrintingCalibration(f);
    assert.equal(r.components.border.color, '#16130e');
    assert.equal(r.components.frame.status, 'fallback');
    assert.equal(f.layout, layout);
  }
  assert.throws(
    () =>
      api.resolvePrintingCalibration({
        ...face,
        calibration: 'auto',
        layout: 'split',
        faces: [{ ...face, calibration: 'source' }, face],
      }),
    /Composite panels/,
  );
  const specials = [
    { ...face, frameAssetFamily: 'm15-accurate' },
    { ...face, typeLine: 'Legendary Planeswalker' },
    { ...face, typeLine: 'Enchantment — Class' },
    { ...face, layout: 'transform', typeLine: 'Enchantment — Saga' },
    { ...face, frameTemplate: 'battle', typeLine: 'Battle — Siege' },
    {
      ...face,
      layout: 'adventure',
      faces: [face, { ...face, colors: ['U'], typeLine: 'Instant' }],
    },
    { ...face, layout: 'prepare', faces: [face, { ...face, colors: ['U'], typeLine: 'Instant' }] },
    {
      ...face,
      layout: 'aftermath',
      faces: [
        { ...face, typeLine: 'Sorcery' },
        { ...face, colors: ['U'], typeLine: 'Sorcery' },
      ],
    },
    {
      ...face,
      layout: 'split',
      faces: [
        { ...face, typeLine: 'Instant' },
        { ...face, colors: ['U'], typeLine: 'Instant' },
      ],
    },
    {
      ...face,
      layout: 'room',
      faces: [
        { ...face, typeLine: 'Enchantment — Room' },
        { ...face, colors: ['U'], typeLine: 'Enchantment — Room' },
      ],
    },
  ];
  for (const special of specials) {
    const f = { ...special, calibration: 'auto' };
    const m = material.printingCalibrationMaterials(f);
    assert.equal(m.border, '#16130e', JSON.stringify(special));
    const urls = new Set(canvasAssetUrls(f));
    for (const url of Object.keys(m.materials))
      assert.ok(urls.has(url), 'Only actual loaded sources receive corrections: ' + url);
    if (
      ['adventure', 'prepare', 'aftermath', 'split'].includes(f.layout) ||
      f.frameTemplate ||
      f.typeLine.includes('Saga')
    ) {
      assert.ok(
        Object.values(m.materials).some((c) => c.outerStock),
        'Baked black borders require a material correction',
      );
      assert.ok(
        Object.values(m.materials).every((c) => !('mask' in c)),
        'Never transfer ordinary paper rectangles to different plates',
      );
    }
  }
  for (const layout of ['prepare', 'adventure']) {
    const composite = {
      ...face,
      layout,
      calibration: 'auto',
      colors: ['W', 'U'],
      faces: [
        { ...face, colors: ['W', 'U'] },
        { ...face, colors: ['B', 'R'], typeLine: 'Instant' },
      ],
    };
    assert.equal(
      Object.keys(material.calibratedFrameMaterials(composite)).length,
      1,
      'Inset sources must not consume additional calibrated-plate leases',
    );
  }
  // Outer-stock transfer preserves enclosed ink, saturated color and alpha.
  const w = 100,
    h = 100,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data.set(x < 5 || x > 94 || y < 5 || y > 94 ? [0, 0, 0, 255] : [140, 80, 40, 255], i);
    }
  data.set([0, 0, 0, 255], (50 * w + 50) * 4);
  const before = data.slice();
  colorFrame(
    { width: w, height: h, data },
    {
      hueDegrees: 0,
      saturationScale: 1,
      brightnessScale: 1,
      outerStock: [22 / 255, 19 / 255, 14 / 255],
    },
  );
  assert.deepEqual([...data.slice(0, 4)], [22, 19, 14, 255]);
  for (let y = 6; y < 94; y++)
    for (let x = 6; x < 94; x++) {
      let i = (y * w + x) * 4;
      assert.deepEqual(data.slice(i, i + 4), before.slice(i, i + 4));
    }
  console.log(
    'Printing calibration policies, identity, per-component defaults, special-frame sources, stock pixels and cache isolation passed.',
  );
} finally {
  await server.close();
}
