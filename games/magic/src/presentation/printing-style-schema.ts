import type { ArtPlacement } from './art-placement.js';
import {
  printingPresets,
  resolvePrintingPreset,
  type PrintingOverrides,
} from './printing-presets.js';
import type { PrintingLayer, PrintingStyle, PrintingStyleChoice } from './printing-style-types.js';
const idPattern = /^[a-z0-9][a-z0-9-]{0,47}$/;
function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error('Invalid ' + label);
}
function keys(value: object, allowed: readonly string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw Error('Unknown ' + label + ' field');
}
function id(value: unknown) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw Error('Invalid printing style ID');
}
const overrideKeys = [
  'calibration',
  'artist',
  'legalText',
  'collectorNumber',
  'collectorTotal',
  'collectorFormat',
  'collectorLanguage',
  'collectorSetCode',
  'setCode',
  'styleSetCode',
  'setSymbol',
  'setSymbolCode',
  'setSymbolMask',
  'symbolStyle',
  'borderColor',
  'securityStamp',
  'frameColors',
  'futureTreatment',
  'symbolAdjustment',
  'elements',
];
export function validatePrintingLayer(value: unknown): asserts value is PrintingLayer {
  record(value, 'printing layer');
  keys(value, ['overrides', 'art'], 'printing layer');
  if (value.overrides !== undefined) {
    record(value.overrides, 'printing overrides');
    keys(value.overrides, overrideKeys, 'printing override');
    if (value.overrides.elements !== undefined) {
      record(value.overrides.elements, 'printing elements');
      keys(
        value.overrides.elements,
        ['artist', 'legal', 'collector', 'manaCost', 'setSymbol'],
        'printing element',
      );
      for (const element of Object.values(value.overrides.elements)) {
        record(element, 'printing element');
        keys(element, ['hidden', 'offset'], 'printing element');
      }
    }
    if (value.overrides.symbolAdjustment !== undefined) {
      record(value.overrides.symbolAdjustment, 'symbol adjustment');
      keys(value.overrides.symbolAdjustment, ['mana', 'set'], 'symbol adjustment');
      for (const [group, transform] of Object.entries(value.overrides.symbolAdjustment)) {
        record(transform, 'symbol transform');
        keys(
          transform,
          group === 'set'
            ? ['dx', 'dy', 'scaleX', 'scaleY']
            : [
                'dx',
                'dy',
                'scaleX',
                'scaleY',
                'spacing',
                'numberScale',
                'numberDx',
                'numberDy',
                'glyphs',
              ],
          'symbol transform',
        );
        if (transform.glyphs !== undefined) {
          record(transform.glyphs, 'mana glyphs');
          keys(transform.glyphs, ['W', 'U', 'B', 'R', 'G'], 'mana glyph');
          for (const glyph of Object.values(transform.glyphs)) {
            record(glyph, 'mana glyph');
            keys(glyph, ['scale', 'dx', 'dy'], 'mana glyph');
          }
        }
      }
    }
  }
  if (value.art !== undefined) {
    record(value.art, 'art placement');
    keys(value.art, ['mode', 'zoom', 'focalPoint', 'paperOpacity'], 'art placement');
  }
  if (
    value.overrides?.futureTreatment !== undefined &&
    !['regular', 'full-art', 'clear'].includes(value.overrides.futureTreatment as string)
  )
    throw Error('Invalid future treatment');
  resolvePrintingPreset(
    { name: 'Style validation', typeLine: 'Creature', colors: ['U'] },
    {
      preset: 'match',
      ...(value.overrides
        ? {
            overrides: Object.fromEntries(
              Object.entries(value.overrides as object).filter(
                ([key]) => key !== 'futureTreatment',
              ),
            ) as PrintingOverrides,
          }
        : {}),
    },
  );
  if (value.art)
    resolvePrintingPreset(
      { name: 'Art validation', typeLine: 'Creature', colors: ['U'], frameTemplate: 'future' },
      { preset: 'match', art: { mode: 'behind-text', ...value.art } as ArtPlacement },
    );
}
/** Validate the serializable structure, including rules that do not match this particular card. */
export function validatePrintingStyle(value: unknown): PrintingStyle {
  record(value, 'printing style');
  keys(
    value,
    [
      'version',
      'id',
      'label',
      'defaults',
      'collectorSetCode',
      'symbols',
      'defaultFrame',
      'frames',
      'rules',
    ],
    'printing style',
  );
  if (value.version !== 1) throw Error('Unsupported printing style version');
  id(value.id);
  if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160)
    throw Error('Invalid printing style label');
  if (
    value.collectorSetCode !== undefined &&
    (typeof value.collectorSetCode !== 'string' ||
      !/^[-A-Za-z0-9_]{1,16}$/.test(value.collectorSetCode))
  )
    throw Error('Invalid collector set code');
  if (value.defaults !== undefined) validatePrintingLayer(value.defaults);
  if (!Array.isArray(value.frames) || !value.frames.length || value.frames.length > 64)
    throw Error('A printing style needs 1..64 frame options');
  const frames = new Set<string>();
  for (const frame of value.frames) {
    record(frame, 'frame option');
    keys(frame, ['id', 'label', 'selection'], 'frame option');
    id(frame.id);
    if (frames.has(frame.id as string)) throw Error('Duplicate frame option');
    frames.add(frame.id as string);
    if (typeof frame.label !== 'string' || !frame.label.trim() || frame.label.length > 160)
      throw Error('Invalid frame label');
    record(frame.selection, 'frame selection');
    keys(frame.selection, ['preset', 'overrides', 'art'], 'frame selection');
    if (!printingPresets.some((p) => p.id === (frame.selection as Record<string, unknown>).preset))
      throw Error('Unknown frame preset');
    const { preset: _preset, ...rest } = frame.selection;
    validatePrintingLayer(rest);
  }
  if (!frames.has(value.defaultFrame as string)) throw Error('Unknown default frame');
  if (value.symbols !== undefined) {
    record(value.symbols, 'symbol pack');
    keys(
      value.symbols,
      ['default', 'common', 'uncommon', 'rare', 'mythic', 'special'],
      'symbol pack',
    );
    for (const symbol of Object.values(value.symbols))
      if (symbol !== null && (typeof symbol !== 'string' || !symbol || symbol.length > 65536))
        throw Error('Invalid symbol asset');
  }
  if (value.rules !== undefined) {
    if (!Array.isArray(value.rules) || value.rules.length > 128) throw Error('Invalid frame rules');
    const ids = new Set();
    for (const rule of value.rules) {
      record(rule, 'frame rule');
      keys(rule, ['id', 'when', 'frame', 'defaults'], 'frame rule');
      id(rule.id);
      if (ids.has(rule.id)) throw Error('Duplicate frame rule');
      ids.add(rule.id);
      if (!frames.has(rule.frame as string)) throw Error('Unknown rule frame');
      record(rule.when, 'frame condition');
      keys(
        rule.when,
        [
          'colors',
          'colorSource',
          'colorCount',
          'types',
          'layouts',
          'templates',
          'treatments',
          'rarities',
          'artifact',
          'land',
          'legendary',
        ],
        'frame condition',
      );
      if (
        rule.when.colors !== undefined &&
        (!Array.isArray(rule.when.colors) ||
          rule.when.colors.length > 5 ||
          !rule.when.colors.every((c) => typeof c === 'string' && /^[WUBRG]$/.test(c)) ||
          new Set(rule.when.colors).size !== rule.when.colors.length)
      )
        throw Error('Invalid rule colors');
      if (
        rule.when.colorSource !== undefined &&
        !['printing', 'card'].includes(rule.when.colorSource as string)
      )
        throw Error('Invalid rule color source');
      if (
        rule.when.colorCount !== undefined &&
        (!Array.isArray(rule.when.colorCount) ||
          rule.when.colorCount.length !== 2 ||
          !rule.when.colorCount.every((n) => Number.isInteger(n) && n >= 0 && n <= 5) ||
          rule.when.colorCount[0] > rule.when.colorCount[1])
      )
        throw Error('Invalid color count');
      for (const field of ['types', 'layouts', 'templates', 'treatments', 'rarities'])
        if (
          rule.when[field] !== undefined &&
          (!Array.isArray(rule.when[field]) ||
            !(rule.when[field] as unknown[]).length ||
            (rule.when[field] as unknown[]).length > 32 ||
            !(rule.when[field] as unknown[]).every(
              (s) => typeof s === 'string' && /^[-a-zA-Z0-9_]{1,48}$/.test(s),
            ))
        )
          throw Error('Invalid rule ' + field);
      for (const field of ['artifact', 'land', 'legendary'])
        if (rule.when[field] !== undefined && typeof rule.when[field] !== 'boolean')
          throw Error('Invalid rule trait');
      if (rule.defaults !== undefined) validatePrintingLayer(rule.defaults);
    }
  }
  return structuredClone(value) as unknown as PrintingStyle;
}

export function validatePrintingStyleChoice(value: unknown): asserts value is PrintingStyleChoice {
  record(value, 'printing style choice');
  keys(value, ['frame', 'overrides', 'art'], 'printing style choice');
  const { frame, ...rest } = value;
  if (frame !== undefined) id(frame);
  validatePrintingLayer(rest);
}
