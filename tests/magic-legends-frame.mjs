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
  const footer = JSON.parse(await readFile('games/magic/fixtures/accuracy/legends-footer.json'));
  assert.equal(footer.rows.length, 70);
  assert.ok(
    footer.rows.every((row) => row.runtime.maxDifference === 0 && !row.runtime.upperChanged),
  );
  for (const group of Object.values(footer.validation)) {
    assert.ok(group.after > group.before + 0.2);
    assert.equal(group.improved, group.cards);
  }
  assert.equal(
    footer.sourceHash,
    createHash('sha256')
      .update(await readNativeCompatibleSource('games/magic/src/presentation/legends-footer.ts'))
      .digest('hex'),
  );
  const coverage = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/legends-text-runtime.json'),
  ).coverage;
  for (const mode of ['original', 'oracle']) {
    assert.equal(coverage.summary[mode].cards, 310);
    assert.deepEqual(coverage.summary[mode].overflow, []);
    assert.deepEqual(coverage.summary[mode].contentChanged, []);
    assert.deepEqual(coverage.summary[mode].escapesBounds, []);
  }
  const { legendsRulesParagraphs } = await server.ssrLoadModule(
    '/games/magic/src/presentation/legends-rules.ts',
  );
  const genericBody = [{ role: 'rules', runs: [{ text: '{2}{T}: Add {U}. Spend {X}{X}.' }] }];
  const genericFace = {
    setCode: 'leg',
    colors: [],
    typeLine: 'Artifact',
    wordingMode: 'original',
  };
  assert.equal(
    legendsRulesParagraphs(genericFace, genericBody)[0].runs[0].text,
    '2{T}: Add {U}. Spend XX.',
  );
  for (const face of [
    { ...genericFace, symbolStyle: 'modern' },
    { ...genericFace, wordingMode: 'oracle' },
    { ...genericFace, setCode: '3ed' },
  ])
    assert.equal(legendsRulesParagraphs(face, genericBody), genericBody);
  assert.equal(
    legendsRulesParagraphs(
      { ...genericFace, wordingMode: 'oracle', symbolStyle: 'original' },
      genericBody,
    )[0].runs[0].text,
    '2{T}: Add {U}. Spend XX.',
  );
  assert.equal(genericBody[0].runs[0].text, '{2}{T}: Add {U}. Spend {X}{X}.');
  const { legendsFrame } = await server.ssrLoadModule(
    '/games/magic/src/presentation/legends-frame.ts',
  );
  const { retroFrameAsset, retroRects, retroStock } = await server.ssrLoadModule(
    '/games/magic/src/presentation/retro-frame.ts',
  );
  const { titleTranslation } = await server.ssrLoadModule(
    '/games/magic/src/presentation/title-placement.ts',
  );
  const { retroTypePlacement } = await server.ssrLoadModule(
    '/games/magic/src/presentation/retro-type.ts',
  );
  const { retroManaPlacement } = await server.ssrLoadModule(
    '/games/magic/src/presentation/retro-mana.ts',
  );
  const { calibratedStyledSymbolBounds } = await server.ssrLoadModule(
    '/games/magic/src/presentation/styled-symbol-placement.ts',
  );
  const { CONJURER_ROOT } = await server.ssrLoadModule(
    '/games/magic/src/presentation/styled-set-symbols.ts',
  );
  const symbolUrl = `${CONJURER_ROOT}/img/setSymbols/official/leg-c.svg`;
  const symbolRect = [420, 384, 22, 20];
  const symbolBounds = (face, url = symbolUrl) =>
    calibratedStyledSymbolBounds(face, url, symbolRect, 'retro');
  for (const [colors, family] of [
    [['W'], 'abu'],
    [['B'], 'abu'],
    [['U'], 'fourth'],
    [['R'], 'fourth'],
    [['G'], 'fourth'],
    [['W', 'U'], 'fourth'],
  ]) {
    const original = { name: 'Probe', setCode: 'leg', typeLine: 'Summon Legend', colors };
    const oracle = { ...original, typeLine: 'Legendary Creature — Human Wizard' };
    assert.equal(legendsFrame(original).family, family);
    const stockWindow = legendsFrame(original).stockWindow;
    assert.equal(Boolean(stockWindow), family === 'abu');
    if (stockWindow)
      assert.deepEqual(
        stockWindow.map((v, i) => v * (i % 2 ? 680 : 488)),
        [19.375, 21.125, 449.625, 639.25],
      );
    assert.equal(retroStock(original), '#080808');
    assert.equal(retroStock({ ...original, colorCalibration: 'set-hsb-v1' }), '#262626');
    for (const override of [
      { setCode: 'lea' },
      { setCode: 'leb' },
      { setCode: 'm21' },
      { frameStyle: 'modern' },
      { frameTemplate: 'future' },
      { colorCalibration: 'early-hsb-v1' },
    ])
      assert.equal(
        retroStock({ ...original, colorCalibration: 'set-hsb-v1', ...override }),
        '#080808',
      );
    assert.equal(
      retroStock({ ...original, colorCalibration: 'set-hsb-v1', borderColor: 'white' }),
      '#eeedeb',
    );
    assert.equal(retroFrameAsset(original), retroFrameAsset(oracle));
    assert.deepEqual(retroRects(original), retroRects(oracle));
    assert.deepEqual(retroTypePlacement(original), retroTypePlacement(oracle));
    assert.deepEqual(retroManaPlacement(original), retroManaPlacement(oracle));
    assert.deepEqual(symbolBounds(original), symbolBounds(oracle));
    assert.deepEqual(titleTranslation(original, 'retro'), [-18.5, -6]);
    assert.deepEqual(titleTranslation(oracle, 'retro'), [-18.5, -6]);
    assert.deepEqual(titleTranslation({ ...original, legendary: true }, 'retro'), [-18.5, -6]);
  }
  // Printed land/artifact semantics outrank their frame-color metadata.
  const land = { name: 'Karakas', setCode: 'leg', typeLine: 'Legendary Land', colors: ['W'] };
  assert.ok(retroFrameAsset(land).endsWith('/old/fourth/l.png'));
  assert.equal(
    retroFrameAsset({ ...land, typeLine: 'Land' }),
    retroFrameAsset({ ...land, typeLine: '', land: true }),
  );
  assert.ok(
    retroFrameAsset({
      ...land,
      land: false,
      artifact: true,
      typeLine: 'Artifact Creature',
    }).endsWith('/old/fourth/a.png'),
  );
  const ordinary = { name: 'Probe', setCode: 'leg', typeLine: 'Instant', colors: ['W'] };
  for (const override of [
    { setCode: 'arn' },
    { setCode: '3ed' },
    { setCode: 'chr' },
    { frameStyle: 'modern' },
    { frameTemplate: 'battle' },
    { layout: 'split' },
    { typeLine: 'Enchantment — Saga' },
  ]) {
    assert.equal(legendsFrame({ ...ordinary, ...override }), undefined);
    if (!override.setCode)
      assert.equal(retroManaPlacement({ ...ordinary, ...override }), undefined);
    assert.deepEqual(titleTranslation({ ...ordinary, ...override }, 'retro'), [0, 0]);
    assert.deepEqual(retroTypePlacement({ ...ordinary, ...override }), {
      fontSize: 21.7,
      dx: 0,
      dy: 0,
    });
  }
  assert.deepEqual(titleTranslation({ ...ordinary, borderColor: 'white' }, 'retro'), [0, 0]);
  assert.equal(retroTypePlacement({ ...ordinary, borderColor: 'white' }).fontSize, 21.7);
  assert.equal(retroManaPlacement({ ...ordinary, borderColor: 'white' }), undefined);
  for (const override of [
    { frameStyle: 'modern' },
    { frameTemplate: 'battle' },
    { layout: 'split' },
    { typeLine: 'Enchantment — Saga' },
    { setSymbol: 'https://example.test/custom.svg' },
    { borderColor: 'white' },
  ])
    assert.deepEqual(symbolBounds({ ...ordinary, ...override }), symbolRect);
  assert.deepEqual(symbolBounds(ordinary, 'https://example.test/custom.svg'), symbolRect);
  assert.deepEqual(retroTypePlacement(land), retroTypePlacement(ordinary));
  assert.deepEqual(titleTranslation(land, 'retro'), [-18.5, -6]);
  assert.ok(retroFrameAsset({ ...ordinary, setCode: 'lea' }).endsWith('/old/abu/w.png'));
  assert.ok(retroFrameAsset({ ...ordinary, setCode: '3ed' }).endsWith('/old/fourth/w.png'));
  assert.ok(retroFrameAsset({ ...ordinary, setCode: 'arn' }).endsWith('/old/fourth/w.png'));
  const { calibratedFrameMaterials, calibratedManaTarget } = await server.ssrLoadModule(
    '/games/magic/src/presentation/calibration-profiles.ts',
  );
  const { LEGENDS_COLOR_PROFILES } = await server.ssrLoadModule(
    '/games/magic/src/presentation/legends-color-profiles.ts',
  );
  const study = JSON.parse(await readFile('games/magic/fixtures/accuracy/legends-colors.json'));
  const redBevel = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/legends-red-bevel.json'),
  );
  assert.equal(redBevel.status, 'adopted-runtime-verified');
  assert.equal(redBevel.summary.paper.validation.count, 39);
  assert.equal(redBevel.summary.paper.validation.improved, 39);
  assert.ok(redBevel.summary.art.validation.after < redBevel.summary.art.validation.before);
  assert.ok(redBevel.rows.every((r) => r.unchangedRegions.changedChannels === 0));
  const refinement = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/legends-frame-refinement.json'),
  );
  assert.equal(refinement.runtimeVerified, true);
  assert.equal(refinement.rows.length, 24);
  assert.ok(
    refinement.geometryValidation.summary.after > refinement.geometryValidation.summary.before,
  );
  assert.ok(refinement.summary.after.color < refinement.summary.previous.color);
  for (const key of ['shadowChroma', 'shadowLightness', 'contrastError'])
    assert.ok(
      refinement.summary.after[key] <=
        refinement.summary.before[key] + (key === 'contrastError' ? 0.5 : 0.25),
    );
  assert.deepEqual(
    legendsFrame({ ...ordinary, colors: ['W', 'U'] }).frame,
    refinement.geometry.frame,
  );
  assert.deepEqual(legendsFrame({ ...ordinary, colors: ['W', 'U'] }).art, refinement.geometry.art);
  const titles = JSON.parse(await readFile('games/magic/fixtures/accuracy/legends-titles.json'));
  const types = JSON.parse(await readFile('games/magic/fixtures/accuracy/legends-types.json'));
  const symbols = JSON.parse(await readFile('games/magic/fixtures/accuracy/legends-symbols.json'));
  const manaColors = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/legends-mana-colors.json'),
  );
  assert.equal(manaColors.runtimeVerified.exactPixelMatches, 64);
  for (const result of manaColors.groups) {
    if (!result.accepted) {
      assert.equal(result.after, result.before);
      continue;
    }
    assert.ok(result.after < result.before - 0.25);
    assert.ok(result.worstRegression <= 3);
    const calibrated = { ...ordinary, colorCalibration: 'set-hsb-v1' };
    assert.deepEqual(calibratedManaTarget(calibrated, result.color), result.target);
    assert.deepEqual(
      calibratedManaTarget({ ...calibrated, symbolStyle: 'modern' }, result.color),
      result.target,
    );
    for (const override of [
      { colorCalibration: undefined },
      { frameStyle: 'modern' },
      { frameTemplate: 'battle' },
      { borderColor: 'white' },
    ])
      assert.equal(calibratedManaTarget({ ...calibrated, ...override }, result.color), undefined);
  }
  const { right, y, pitch, size } = symbols.mana;
  assert.deepEqual(retroManaPlacement(ordinary), [right, y, pitch, size]);
  const { dx, dy, sx, sy } = symbols.set;
  assert.deepEqual(symbolBounds(ordinary), [
    420 + 22 + dx - 22 * sx,
    384 + 10 + dy - 10 * sy,
    22 * sx,
    20 * sy,
  ]);
  assert.equal(symbols.runtimeVerified.cards, 72);
  assert.equal(symbols.runtimeVerified.components, 136);
  assert.equal(symbols.runtimeVerified.outsideSymbolRectanglesUnchanged, true);
  for (const result of symbols.results) {
    assert.ok(result.after > result.before);
    assert.equal(result.improved, result.held);
    assert.equal(result.worstRegression, 0);
  }
  const typePlacement = retroTypePlacement(ordinary);
  assert.equal(types.runtimeVerified, 72);
  assert.equal(types.typography.fontSize, typePlacement.fontSize);
  assert.deepEqual(types.typography.translation, [typePlacement.dx, typePlacement.dy]);
  assert.equal(types.typography.widthScale, 1);
  assert.equal(types.results[0].held, 36);
  for (const result of types.results) {
    assert.ok(result.after > result.before);
    assert.equal(result.improved, result.held);
    assert.equal(result.worstRegression, 0);
  }
  assert.equal(titles.runtimeVerified, 72);
  assert.deepEqual(titles.translation, titleTranslation(ordinary, 'retro'));
  assert.equal(
    titles.results.reduce((n, r) => n + r.held, 0),
    36,
  );
  for (const result of titles.results) {
    assert.ok(result.after > result.before);
    assert.equal(result.improved, result.held);
    assert.equal(result.worstRegression, 0);
  }
  const geometry = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/early-frame-source-review.json'),
  );
  assert.equal(geometry.productionIntegration.exactMatches, 83);
  assert.equal(study.groups.length, 8);
  const landPins = JSON.parse(
    await readFile('games/magic/fixtures/accuracy/legends-land-pins.json'),
  );
  const landColor = study.groups.find((g) => g.material === 'L');
  assert.equal(landPins.status, 'validated');
  assert.equal(landPins.asset, landColor.asset);
  assert.deepEqual(landPins.frame, landColor.rect);
  assert.deepEqual(landPins.accents, landColor.adjustment.accents);
  assert.equal(landColor.fit.frame.method, 'source-rgb-balance');
  assert.ok(landColor.fit.frame.pixelClipping <= 0.03);
  for (const region of Object.values(landPins.raster.regions)) {
    assert.ok(region.after < region.before && region.after <= 5);
    assert.ok(region.worstRegression <= 2);
    assert.equal(region.rows.filter((r) => r.cohort === 'calibration').length, 4);
    assert.equal(region.rows.filter((r) => r.cohort === 'validation').length, 4);
  }
  for (const group of study.groups) {
    const face = {
      ...ordinary,
      colors:
        group.material === 'M'
          ? ['W', 'U']
          : /[WUBRG]/.test(group.material)
            ? [group.material]
            : [],
      typeLine: group.material === 'A' ? 'Artifact' : group.material === 'L' ? 'Land' : 'Instant',
      colorCalibration: 'set-hsb-v1',
    };
    assert.ok(/^[a-f0-9]{64}$/.test(group.assetSha256));
    assert.equal(new Set(group.rows.map((r) => r.id)).size, group.rows.length);
    for (const cohort of ['calibration', 'validation'])
      assert.ok(group.rows.filter((r) => r.cohort === cohort).length >= 4);
    assert.deepEqual(calibratedFrameMaterials(face), {
      [group.asset]:
        group.material === 'L'
          ? { ...group.adjustment, frame: refinement.land }
          : group.material === 'R'
            ? { ...group.adjustment, accents: redBevel.accents }
            : group.adjustment,
    });
    assert.deepEqual(calibratedFrameMaterials({ ...face, colorCalibration: undefined }), {});
    assert.deepEqual(calibratedFrameMaterials({ ...face, borderColor: 'white' }), {});
    assert.deepEqual(calibratedFrameMaterials({ ...face, frameStyle: 'modern' }), {});
    for (const component of ['frame', 'paper']) {
      if (!group.accepted[component]) {
        assert.equal(group.actual[component].after, group.actual[component].before);
        continue;
      }
      assert.ok(group.actual[component].after <= 5);
      assert.ok(group.actual[component].after <= group.actual[component].before + 0.15);
      assert.ok(group.actual[component].worstRegression <= 2);
      assert.ok(group.predicted[component].clipping <= 0.03);
    }
    for (const [key, value] of Object.entries(group.actualTexture))
      assert.ok(value.after <= value.before + (key === 'contrastError' ? 0.5 : 0.25));
    // A calibration is invalidated by changed geometry/source identity. It must
    // not silently inherit a fit from the old Seventh/Legends plate.
    const profile = LEGENDS_COLOR_PROFILES['leg/black/retro/' + group.asset.split('/').at(-1)];
    const saved = profile.source;
    try {
      profile.source = 'different source or geometry';
      assert.deepEqual(calibratedFrameMaterials(face), {});
      assert.equal(retroStock(face), '#080808');
    } finally {
      profile.source = saved;
    }
  }
  console.log(
    'Legends frame sources, original/Oracle equivalence, measured color gates and source/geometry guards pass.',
  );
} finally {
  await server.close();
}
