import { resolvePrintingCalibration } from './printing-calibration.js';
import { validateSymbolAdjustment } from './symbol-adjustment.js';
import type { RenderedCardInput } from './face-layout.js';
import { artPlacementSupport } from './art-placement.js';
import {
  normalizeColors,
  resolveCardProfile,
  resolveFrameColors,
  type FrameColor,
} from './profile.js';
import {
  printingPresets,
  printingPresetCompatibility,
  printingElementSupport,
  resolvePrintingPreset,
  type PrintingOverrides,
  type PrintingSelection,
} from './printing-presets.js';

import {
  validatePrintingLayer,
  validatePrintingStyle,
  validatePrintingStyleChoice,
} from './printing-style-schema.js';
import type {
  PrintingLayer,
  PrintingStyle,
  PrintingStyleChoice,
  PrintingStyleResult,
  PrintingFrameCondition,
  PrintingSymbolPack,
  PrintingFrameOption,
  PrintingFrameRule,
} from './printing-style-types.js';
export * from './printing-style-types.js';
export { validatePrintingStyle } from './printing-style-schema.js';
function defined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(defined) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([key, v]) => [key, defined(v)]),
    ) as T;
  return value;
}
/** Deep merge the bounded semantic groups; never mutate source data or spread arbitrary keys. */
export function composePrintingSelection(
  base: PrintingSelection,
  ...layers: readonly PrintingLayer[]
): PrintingSelection {
  const result = structuredClone(base);
  for (const item of layers) {
    validatePrintingLayer(item);
    if (item.art)
      result.art = { mode: 'window', ...result.art, ...defined(structuredClone(item.art)) };
    if (!item.overrides) continue;
    const previous = result.overrides || {},
      next = defined(structuredClone(item.overrides));
    const merged: PrintingOverrides = { ...previous, ...next };
    if (next.elements) {
      merged.elements = structuredClone(previous.elements || {});
      for (const name of Object.keys(next.elements) as (keyof NonNullable<
        PrintingOverrides['elements']
      >)[])
        merged.elements[name] = { ...merged.elements[name], ...next.elements[name] };
    }
    if (next.symbolAdjustment) {
      merged.symbolAdjustment = { ...previous.symbolAdjustment, ...next.symbolAdjustment };
      for (const group of ['mana', 'set'] as const)
        if (next.symbolAdjustment[group])
          merged.symbolAdjustment[group] = {
            ...previous.symbolAdjustment?.[group],
            ...next.symbolAdjustment[group],
          };
      if (next.symbolAdjustment.mana?.glyphs) {
        merged.symbolAdjustment.mana!.glyphs = { ...previous.symbolAdjustment?.mana?.glyphs };
        for (const color of Object.keys(next.symbolAdjustment.mana.glyphs) as FrameColor[])
          merged.symbolAdjustment.mana!.glyphs[color] = {
            ...previous.symbolAdjustment?.mana?.glyphs?.[color],
            ...next.symbolAdjustment.mana.glyphs[color],
          };
      }
    }
    if (Object.hasOwn(next, 'setSymbol')) delete merged.setSymbolCode;
    if (Object.hasOwn(next, 'setSymbolCode')) delete merged.setSymbol;
    if (Object.hasOwn(next, 'styleSetCode')) delete merged.setCode;
    if (Object.hasOwn(next, 'setCode')) delete merged.styleSetCode;
    result.overrides = merged;
  }
  return result;
}
function matches(input: RenderedCardInput, condition: PrintingFrameCondition): boolean {
  const children = input.faces?.length ? input.faces : [input];
  const colors = normalizeColors(
    children.flatMap((child) =>
      condition.colorSource === 'card'
        ? [...(child.colors || [])]
        : resolveFrameColors({ ...child, frameColors: undefined }),
    ),
  );
  if (condition.colors && normalizeColors(condition.colors).join('') !== colors.join(''))
    return false;
  if (
    condition.colorCount &&
    (colors.length < condition.colorCount[0] || colors.length > condition.colorCount[1])
  )
    return false;
  const profile = resolveCardProfile(input);
  for (const field of ['artifact', 'land', 'legendary'] as const)
    if (condition[field] !== undefined && condition[field] !== profile[field]) return false;
  const types = (input.canonicalTypeLine ?? input.typeLine ?? '')
    .split(/[—–]/)[0]!
    .split(/\s+/)
    .map((t) => t.toLowerCase());
  for (const [trait, type] of [
    ['creature', 'creature'],
    ['artifact', 'artifact'],
    ['land', 'land'],
    ['legendary', 'legendary'],
  ] as const)
    if (profile[trait] && !types.includes(type)) types.push(type);
  if (condition.types && !condition.types.some((t) => types.includes(t.toLowerCase())))
    return false;
  for (const [field, value] of [
    ['layouts', input.layout || 'normal'],
    ['templates', input.frameTemplate || 'normal'],
    ['treatments', input.futureTreatment || input.frameTreatment || 'regular'],
    ['rarities', input.rarity || 'common'],
  ] as const) {
    const choices = condition[field];
    if (choices && !choices.includes(value)) return false;
  }
  return true;
}
function identity(style: PrintingStyle, input: RenderedCardInput): PrintingLayer {
  const overrides: PrintingOverrides = {};
  if (style.collectorSetCode !== undefined) overrides.collectorSetCode = style.collectorSetCode;
  if (style.symbols) {
    const rarity = input.rarity || 'common';
    const symbol = Object.hasOwn(style.symbols, rarity)
      ? style.symbols[rarity as keyof PrintingSymbolPack]
      : style.symbols.default;
    const explicitNull =
      Object.hasOwn(style.symbols, rarity) &&
      style.symbols[rarity as keyof PrintingSymbolPack] === null;
    if (explicitNull || symbol !== undefined) overrides.setSymbol = explicitNull ? null : symbol;
  }
  return { overrides };
}
export function printingStyleOptions(
  input: RenderedCardInput,
  style: PrintingStyle,
  card: PrintingStyleChoice = {},
  face: PrintingStyleChoice = {},
) {
  const valid = printingStyles.includes(style) ? style : validatePrintingStyle(style);
  return valid.frames.map((frame) => {
    try {
      const result = resolvePrintingStyle(input, valid, card, { ...face, frame: frame.id });
      return {
        id: frame.id,
        label: frame.label,
        supported: true,
        notices: result.notices,
        calibration: result.calibration,
      };
    } catch (error) {
      return {
        id: frame.id,
        label: frame.label,
        supported: false,
        reason: (error as Error).message,
      };
    }
  });
}
function withPalette(
  input: RenderedCardInput,
  colors: PrintingOverrides['frameColors'],
): RenderedCardInput {
  return colors === undefined
    ? input
    : {
        ...input,
        frameColors: colors,
        ...(input.faces
          ? { faces: input.faces.map((child) => ({ ...child, frameColors: colors })) }
          : {}),
      };
}
/** Defaults are evaluated once. A frame's own palette cannot recursively select another rule. */
export function resolvePrintingStyle(
  input: RenderedCardInput,
  style: PrintingStyle,
  card: PrintingStyleChoice = {},
  face: PrintingStyleChoice = {},
): PrintingStyleResult {
  const valid = printingStyles.includes(style) ? style : validatePrintingStyle(style);
  for (const choice of [card, face]) {
    validatePrintingStyleChoice(choice);
    if (choice.frame !== undefined && !valid.frames.some((f) => f.id === choice.frame))
      throw Error('Unknown chosen frame');
  }
  const { frame: cardFrame, ...cardLayer } = card,
    { frame: faceFrame, ...faceLayer } = face;
  const explicit = faceFrame ?? cardFrame;
  // Recoloring is a rendering override, never an automatic frame-selection input.
  const rule = valid.rules?.find((rule) => matches(input, rule.when));
  let frameSource: PrintingStyleResult['frameSource'] =
    faceFrame !== undefined ? 'face' : cardFrame !== undefined ? 'card' : rule ? 'rule' : 'default';
  let frame = valid.frames.find((f) => f.id === (explicit ?? rule?.frame ?? valid.defaultFrame))!;
  const notices: string[] = [];
  const selectionFor = (option: PrintingFrameOption, preset = option.selection.preset) =>
    composePrintingSelection(
      { ...option.selection, preset },
      valid.defaults || {},
      identity(valid, input),
      rule?.defaults || {},
      cardLayer,
      faceLayer,
    );
  let selection = selectionFor(frame);
  const supports = (option: PrintingFrameOption) => {
    const choice = selectionFor(option);
    const support = printingPresetCompatibility(
      withPalette(input, choice.overrides?.frameColors),
      choice.preset,
    );
    if (!support.supported) return support;
    try {
      resolvePrintingPreset(input, {
        preset: choice.preset,
        overrides: Object.fromEntries(
          Object.entries(choice.overrides || {}).filter(
            ([key]) => !['elements', 'symbolAdjustment'].includes(key),
          ),
        ) as PrintingOverrides,
      });
      return support;
    } catch (error) {
      return { supported: false, reason: (error as Error).message };
    }
  };
  const support = supports(frame);
  if (!support.supported) {
    if (explicit !== undefined) throw Error(support.reason);
    frameSource = 'fallback';
    const fallback = valid.frames.find((f) => f.id === valid.defaultFrame)!;
    if (fallback.id !== frame.id && supports(fallback).supported) {
      frame = fallback;
      selection = selectionFor(frame);
      notices.push('Automatic frame is unsupported; using the default frame. ' + support.reason);
    } else {
      selection = selectionFor(frame, 'match');
      notices.push('Keeping the native layout. ' + support.reason);
    }
  }
  // Inspect inherited controls before adding per-card values, so invalid local edits still fail.
  const inspect = resolvePrintingPreset(input, {
    preset: selection.preset,
    overrides: Object.fromEntries(
      Object.entries(selection.overrides || {}).filter(
        ([key]) => !['elements', 'symbolAdjustment', 'futureTreatment'].includes(key),
      ),
    ) as PrintingOverrides,
  });
  if (selection.overrides?.futureTreatment !== undefined) {
    if (inspect.frameTemplate !== 'future') {
      if (card.overrides?.futureTreatment || face.overrides?.futureTreatment)
        throw Error('Future treatment requires a Futureshifted frame.');
      delete selection.overrides.futureTreatment;
      notices.push('Inherited Future treatment is unavailable for this layout.');
    } else inspect.futureTreatment = selection.overrides.futureTreatment;
  }
  if (selection.overrides?.elements && !printingElementSupport(inspect).supported) {
    if (card.overrides?.elements || face.overrides?.elements)
      throw Error(printingElementSupport(inspect).reason);
    delete selection.overrides.elements;
    notices.push('Inherited element positioning is unavailable for this layout.');
  }
  if (selection.overrides?.symbolAdjustment) {
    try {
      if (inspect.frameTemplate) throw Error('Fine symbol adjustments require an ordinary frame.');
      validateSymbolAdjustment({
        ...inspect,
        symbolAdjustment: selection.overrides.symbolAdjustment,
      });
    } catch (error) {
      if (card.overrides?.symbolAdjustment || face.overrides?.symbolAdjustment) throw error;
      delete selection.overrides.symbolAdjustment;
      notices.push('Inherited symbol adjustments are unavailable for this layout.');
    }
  }
  if (selection.art && !artPlacementSupport(inspect).modes.includes(selection.art.mode)) {
    if (card.art || face.art)
      throw Error('This frame does not support the selected art placement.');
    delete selection.art;
    notices.push('Inherited artwork placement is unavailable for this frame.');
  }
  selection = structuredClone(selection);
  const resolved = resolvePrintingPreset(input, selection);
  const calibration = resolvePrintingCalibration(resolved);
  return {
    face: resolved,
    calibration,
    selection,
    frame: frame.id,
    frameSource,
    ...(rule ? { rule: rule.id } : {}),
    notices: [...notices, ...calibration.notices],
  };
}
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
/** Built-ins may expose several frames without duplicating their set identity. */
export const printingStyles: readonly PrintingStyle[] = Object.freeze(
  printingPresets
    .filter((p) => !['plc-colorshifted', 'fut'].includes(p.id))
    .map((p) => {
      const options: PrintingFrameOption[] = [
        {
          id: 'regular',
          label: p.id === 'fut-regular' ? 'Regular' : p.label,
          selection: { preset: p.id },
        },
      ];
      const rules: PrintingFrameRule[] = [];
      if (p.id === 'plc')
        options.push({
          id: 'colorshifted',
          label: 'Colorshifted',
          selection: { preset: 'plc-colorshifted' },
        });
      if (p.id === 'fut-regular') {
        options.push({ id: 'futureshifted', label: 'Futureshifted', selection: { preset: 'fut' } });
        for (const [id, label] of [
          ['full-art', 'Futureshifted · Full art'],
          ['clear', 'Futureshifted · Clear'],
        ] as const) {
          options.push({
            id,
            label,
            selection: { preset: 'fut', overrides: { futureTreatment: id } },
          });
          rules.push({
            id: 'existing-' + id,
            when: { templates: ['future'], treatments: [id] },
            frame: id,
          });
        }
        rules.push({
          id: 'existing-futureshifted',
          when: { templates: ['future'] },
          frame: 'futureshifted',
        });
      }
      if (p.id === 'plc')
        rules.push({
          id: 'existing-colorshifted',
          when: { treatments: ['colorshifted'] },
          frame: 'colorshifted',
        });
      return immutable({
        version: 1 as const,
        id: p.id === 'fut-regular' ? 'fut' : p.id,
        label: p.id === 'fut-regular' ? 'Future Sight' : p.label,
        defaultFrame: 'regular',
        frames: options,
        ...(rules.length ? { rules } : {}),
      });
    }),
);
