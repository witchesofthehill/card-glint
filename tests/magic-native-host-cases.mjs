const creature = {
  name: 'Native compatibility specimen',
  typeLine: 'Creature — Human Wizard',
  colors: ['U'],
  manaSymbols: ['2', 'U'],
  rulesText: 'Flying\n{T}: Add {U}.\n(A reminder in italic type.)',
  power: '2',
  toughness: '3',
  artist: 'Original test artist',
  collectorNumber: '42',
  legalText: 'Original compatibility test',
  illustration: 'native-compatibility-art',
  setSymbol: 'native-compatibility-symbol',
  securityStamp: 'none',
};
const cases = [];
const add = (id, change) => cases.push({ id, face: { ...creature, ...change } });
for (const setCode of ['lea', 'leb', '2ed', '3ed', '4ed', 'arn', 'atq', 'drk', 'leg', 'mir', '7ed'])
  for (const color of 'WUBRG')
    add(`${setCode}/${color}`, {
      setCode,
      frameStyle: 'retro',
      colors: [color],
      manaSymbols: ['2', color],
      wordingMode: 'original',
      colorCalibration: 'set-hsb-v1',
    });
for (const setCode of ['8ed', 'plc', 'm15', 'm21'])
  for (const color of 'WUBRG')
    add(`${setCode}/${color}`, {
      setCode,
      colors: [color],
      manaSymbols: ['2', color],
      ...(setCode === '8ed' || setCode === 'plc' ? { frameAssetFamily: 'eighth' } : {}),
      colorCalibration: 'set-hsb-v1',
    });
for (const color of 'WUBRG')
  add(`plc-colorshifted/${color}`, {
    setCode: 'plc',
    frameAssetFamily: 'eighth',
    frameTreatment: 'colorshifted',
    colors: [color],
    manaSymbols: ['2', color],
  });
for (const setCode of ['arn', 'atq', 'drk', 'leg', '3ed', 'plc', 'm21']) {
  add(`${setCode}/dense`, {
    setCode,
    ...(setCode === 'plc'
      ? { frameAssetFamily: 'eighth' }
      : setCode === 'm21'
        ? {}
        : { frameStyle: 'retro' }),
    rulesText: 'Whenever this creature attacks, draw a card, then discard a card. '.repeat(5),
  });
  add(`${setCode}/land`, {
    setCode,
    ...(setCode === 'plc'
      ? { frameAssetFamily: 'eighth' }
      : setCode === 'm21'
        ? {}
        : { frameStyle: 'retro' }),
    name: 'Island',
    typeLine: 'Basic Land — Island',
    colors: [],
    manaSymbols: [],
    rulesText: '{T}: Add {U}.',
    power: undefined,
    toughness: undefined,
  });
}
add('urza/footer', { setCode: 'usg', frameStyle: 'retro' });
add('future/regular', { setCode: 'fut', frameTemplate: 'future' });
add('future/clear', { setCode: 'fut', frameTemplate: 'future', futureTreatment: 'clear' });
add('future/full-art', { setCode: 'fut', frameTemplate: 'future', futureTreatment: 'full-art' });
add('flip/front', {
  setCode: 'chk',
  frameTemplate: 'flip',
  faces: [
    { ...creature },
    { ...creature, name: 'Flipped native specimen', typeLine: 'Legendary Creature — Human Wizard' },
  ],
});
add('battle/front', {
  setCode: 'mom',
  frameTemplate: 'battle',
  typeLine: 'Battle — Siege',
  defense: '4',
  power: undefined,
  toughness: undefined,
});
add('modern/legendary', { setCode: 'm21', typeLine: 'Legendary Creature — Human Wizard' });
add('modern/artifact', { setCode: 'm21', typeLine: 'Artifact Creature — Construct', colors: [] });
add('modern/multicolor', { setCode: 'm21', colors: ['U', 'R'], manaSymbols: ['U', 'R'] });
add('modern/paragraphs', {
  setCode: 'm21',
  rulesParagraphs: [
    { role: 'rules', align: 'right', runs: [{ text: 'Aligned {U} wording.' }] },
    { role: 'flavor', runs: [{ text: 'Original flavor text.', italic: true }] },
  ],
});
for (const rows of [3, 4])
  add(`planeswalker/${rows}`, {
    setCode: 'm21',
    typeLine: 'Legendary Planeswalker — Specimen',
    rulesText: [
      '+1: Draw a card.',
      '−2: Return target creature to its owner’s hand.',
      '0: Scry 1.',
      '−7: Draw seven cards.',
    ]
      .slice(0, rows)
      .join('\n'),
    power: undefined,
    toughness: undefined,
    loyalty: '3',
  });
add('saga/chapters', {
  setCode: 'dom',
  typeLine: 'Enchantment — Saga',
  layout: 'saga',
  rulesText:
    '(A reminder with a fixed space.)\nI, II — Draw a card.\nIII — Return target creature to its owner’s hand.',
  reverseStats: { power: '2', toughness: '3' },
  power: undefined,
  toughness: undefined,
});
add('class/levels', {
  typeLine: 'Enchantment — Class',
  layout: 'class',
  rulesText:
    'Draw a card.\n{2}{U}: Level 2\nCreatures you control have flying.\n{4}{U}: Level 3\nDraw two cards.',
});
add('leveler/levels', {
  typeLine: 'Creature — Human Wizard',
  layout: 'leveler',
  rulesText: 'Level up {1}{U}\nLEVEL 2-4\n3/3\nFlying\nLEVEL 5+\n5/5\nFlying',
});
for (const [layout, setCode] of [
  ['adventure', 'eld'],
  ['prepare', 'tst'],
  ['split', 'inv'],
  ['split', 'rav'],
  ['split', 'dgm'],
  ['split', 'm21'],
  ['aftermath', 'akh'],
])
  add(`${layout}/${setCode}`, {
    layout,
    setCode,
    ...(setCode === 'inv' ? { frameStyle: 'retro' } : {}),
    ...(['rav', 'dgm'].includes(setCode) ? { frameAssetFamily: 'eighth' } : {}),
    ...(setCode === 'dgm'
      ? { rulesText: 'Fuse (You may cast one or both halves of this card from your hand.)' }
      : {}),
    faces: [
      {
        ...creature,
        ...(['split', 'aftermath'].includes(layout)
          ? { typeLine: 'Instant', power: undefined, toughness: undefined }
          : {}),
      },
      {
        name: 'Second native specimen',
        typeLine: layout === 'adventure' ? 'Sorcery — Adventure' : 'Sorcery',
        colors: ['R'],
        manaSymbols: ['R'],
        rulesText: 'Draw a card.',
        illustration: 'native-compatibility-art',
      },
    ],
  });
export const nativeHostCases = cases;
