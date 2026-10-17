import { supportsModernCalibration } from './calibration-modern-sources.js';
import { calibrationFace } from './calibration-input.js';
import { validatePrintingCalibration } from './printing-calibration-types.js';
import { validateFutureTreatment } from './future-frame.js';
import { validateSymbolAdjustment, type SymbolAdjustment } from './symbol-adjustment.js';
import { faceSetSymbol } from './assets.js';
import { resolveArtPlacement, type ArtPlacement } from './art-placement.js';
import type { RenderedCardInput } from './face-layout.js';
import { framePlate } from './frame-plates.js';
import { validatePrintingElements, type PrintingElements } from './printing-elements.js';

export type PrintingFrameFamily = 'match' | 'retro' | 'eighth' | 'modern' | 'future';
export interface PrintingPreset {
  id: string;
  label: string;
  family: PrintingFrameFamily;
  /** Styling set, including glyph era, symbol, numbering and legal defaults. */
  setCode?: string;
  treatment?: 'colorshifted';
  /** Family choice; actual calibration coverage remains source guarded. */
  note: string;
}
const entries: PrintingPreset[] = [
  {
    id: 'match',
    label: 'Match printing',
    family: 'match',
    note: 'Keep all supplied printing fields.',
  },
  {
    id: 'lea',
    label: 'Alpha',
    family: 'retro',
    setCode: 'LEA',
    note: 'Early black-border printing.',
  },
  {
    id: 'leb',
    label: 'Beta',
    family: 'retro',
    setCode: 'LEB',
    note: 'Early black-border printing.',
  },
  {
    id: '2ed',
    label: 'Unlimited',
    family: 'retro',
    setCode: '2ED',
    note: 'Early white-border printing.',
  },
  {
    id: '3ed',
    label: 'Revised',
    family: 'retro',
    setCode: '3ED',
    note: 'Revised printing and original mana.',
  },
  {
    id: '4ed',
    label: 'Fourth Edition',
    family: 'retro',
    setCode: '4ED',
    note: 'Fourth Edition lettering and credits.',
  },
  {
    id: 'leg',
    label: 'Legends',
    family: 'retro',
    setCode: 'LEG',
    note: 'Legends stock and symbol policy.',
  },
  {
    id: 'mir',
    label: 'Mirage',
    family: 'retro',
    setCode: 'MIR',
    note: 'Mirage lettering, symbols and legal line.',
  },
  { id: '7ed', label: 'Seventh Edition', family: 'retro', setCode: '7ED', note: 'Late old frame.' },
  {
    id: '8ed',
    label: 'Eighth Edition',
    family: 'eighth',
    setCode: '8ED',
    note: 'Complete Eighth-family plates.',
  },
  {
    id: 'plc',
    label: 'Planar Chaos',
    family: 'eighth',
    setCode: 'PLC',
    note: 'Regular 2007 printing.',
  },
  {
    id: 'plc-colorshifted',
    label: 'Planar Chaos · Colorshifted',
    family: 'eighth',
    setCode: 'PLC',
    treatment: 'colorshifted',
    note: 'Monocolored spells and artifacts only.',
  },
  {
    id: 'fut-regular',
    label: 'Future Sight · Regular',
    family: 'eighth',
    setCode: 'FUT',
    note: 'Ordinary printing; the set does not imply Futureshifted.',
  },
  {
    id: 'fut',
    label: 'Future Sight · Futureshifted',
    family: 'future',
    setCode: 'FUT',
    note: 'Shaped frame with curved mana rail.',
  },
  {
    id: 'm15',
    label: 'Magic 2015',
    family: 'modern',
    setCode: 'M15',
    note: 'Modern component frame and footer.',
  },
  {
    id: 'm21',
    label: 'Core Set 2021',
    family: 'modern',
    setCode: 'M21',
    note: 'Modern set-specific printing.',
  },
];
export const printingPresets: readonly Readonly<PrintingPreset>[] = Object.freeze(
  entries.map((p) => Object.freeze(p)),
);
export interface PrintingOverrides {
  calibration?: RenderedCardInput['calibration'];
  /** Undefined follows preset, null hides the component, string replaces it. */
  artist?: string | null;
  legalText?: string | null;
  collectorNumber?: string | null;
  collectorTotal?: number | null;
  collectorFormat?: RenderedCardInput['collectorFormat'];
  collectorLanguage?: string;
  collectorSetCode?: string;
  setCode?: string;
  /** Calibration/typography source, independent of the printed collector code. */
  styleSetCode?: string;
  /** Presentation palette only; never changes semantic colors or mana cost. */
  frameColors?: RenderedCardInput['frameColors'];
  /** Explicit geometry variant of an existing Futureshifted template. */
  futureTreatment?: RenderedCardInput['futureTreatment'];
  symbolAdjustment?: SymbolAdjustment;
  setSymbol?: string | null;
  setSymbolMask?: RenderedCardInput['setSymbolMask'];
  /** Select a symbol without changing the styling set or collector code. */
  setSymbolCode?: string;
  symbolStyle?: RenderedCardInput['symbolStyle'];
  borderColor?: RenderedCardInput['borderColor'];
  securityStamp?: RenderedCardInput['securityStamp'];
  elements?: PrintingElements;
}
/** Contract version for persisted selections. Unknown preset IDs/options throw. */
export const printingPresetApiVersion = 1 as const;
export interface PrintingSelection {
  art?: ArtPlacement;
  preset: string;
  overrides?: PrintingOverrides;
}
function candidate(input: RenderedCardInput, preset: Readonly<PrintingPreset>): RenderedCardInput {
  if (preset.family === 'match') return { ...input };
  const {
    frameStyle: _style,
    frameTemplate: _template,
    frameAssetFamily: _asset,
    frameTreatment: _treatment,
    futureTreatment: _future,
    borderColor: _border,
    setSymbol: _symbol,
    symbolAdjustment: _adjustment,
    setSymbolSource: _symbolSource,
    setSymbolMask: _symbolMask,
    legalText: _legal,
    collectorFormat: _format,
    collectorTotal: _total,
    collectorLanguage: _language,
    collectorSetCode: _code,
    printingElements: _elements,
    illustrationPlacement: _importPosition,
    artPlacement: _art,
    ...content
  } = input;
  return {
    ...content,
    ...(['transform', 'modal_dfc', 'reversible_card', 'meld'].includes(input.layout ?? '')
      ? { layout: 'normal' }
      : {}),
    setCode: preset.setCode,
    symbolStyle: 'original',
    colorCalibration: 'set-hsb-v1',
    ...(preset.family === 'retro' ? { frameStyle: 'retro', securityStamp: 'none' } : {}),
    ...(preset.family === 'eighth'
      ? { frameStyle: 'modern', frameAssetFamily: 'eighth', securityStamp: 'none' }
      : {}),
    ...(preset.family === 'modern' ? { frameStyle: 'modern', securityStamp: undefined } : {}),
    ...(preset.family === 'future' ? { frameTemplate: 'future', securityStamp: 'none' } : {}),
    ...(preset.treatment ? { frameTreatment: preset.treatment } : {}),
  };
}
export function printingPresetCompatibility(
  input: RenderedCardInput,
  id: string,
): { supported: boolean; reason?: string } {
  const preset = printingPresets.find((p) => p.id === id);
  if (!preset) return { supported: false, reason: 'Unknown printing preset.' };
  if (preset.family === 'match') return { supported: true };
  const split = input.layout === 'split' && input.faces?.length === 2;
  if (split) {
    if (preset.family === 'future' || preset.treatment)
      return { supported: false, reason: 'This preset has no split-card painter.' };
    if (
      input.faces!.some(
        (f) => !/^(Instant|Sorcery)\b/.test(f.canonicalTypeLine ?? f.typeLine ?? ''),
      )
    )
      return { supported: false, reason: 'Native split frames require two spell faces.' };
    return { supported: true };
  }
  if (
    input.faces?.length ||
    (input.layout &&
      !['normal', 'token', 'transform', 'modal_dfc', 'reversible_card', 'meld'].includes(
        input.layout,
      )) ||
    /\b(Saga|Class|Planeswalker|Battle)\b/.test(input.canonicalTypeLine ?? input.typeLine ?? '') ||
    /^Level up\b/m.test(input.rulesText ?? '')
  )
    return {
      supported: false,
      reason:
        'This prototype supports ordinary single faces and spell splits; retain the layout-specific painter.',
    };
  try {
    if (preset.family === 'eighth') framePlate(candidate({ ...input, layout: 'normal' }, preset));
  } catch (error) {
    return { supported: false, reason: (error as Error).message };
  }
  return { supported: true };
}
/** Resolve only presentation. The caller retains the source card and this
 * selection separately; resetting an override reveals the selected preset. */
export function resolvePrintingPreset(
  input: RenderedCardInput,
  selection: PrintingSelection,
): RenderedCardInput {
  if (
    !selection ||
    typeof selection !== 'object' ||
    Array.isArray(selection) ||
    Object.keys(selection).some((key) => !['preset', 'overrides', 'art'].includes(key))
  )
    throw Error('Invalid printing selection');
  const support = printingPresetCompatibility(
    selection.overrides?.frameColors === undefined
      ? input
      : { ...input, frameColors: selection.overrides.frameColors },
    selection.preset,
  );
  if (!support.supported) throw Error(support.reason);
  const preset = printingPresets.find((p) => p.id === selection.preset)!;
  let face = candidate(input, preset);
  if (selection.overrides === null) throw Error('Printing overrides must be an object');
  const overrides = selection.overrides ?? {};
  if (typeof overrides !== 'object' || Array.isArray(overrides))
    throw Error('Printing overrides must be an object');
  if (input.faces?.length && overrides.elements && Object.keys(overrides.elements).length)
    throw Error(
      'Element movement/visibility in composite layouts is not implemented in this prototype.',
    );
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (key === 'calibration') {
      validatePrintingCalibration(value);
      face.calibration = structuredClone(value);
      continue;
    }
    if (key === 'setSymbolCode') continue;
    if (key === 'styleSetCode') {
      if (typeof value !== 'string' || !/^[-A-Za-z0-9_]{1,16}$/.test(value))
        throw Error('Invalid styling set code');
      face.setCode = value;
      continue;
    }
    if (key === 'symbolAdjustment') {
      face.symbolAdjustment = structuredClone(value as SymbolAdjustment);
      continue;
    }
    if (key === 'frameColors') {
      if (
        !Array.isArray(value) ||
        value.length > 5 ||
        !value.every((c) => typeof c === 'string' && /^[WUBRG]$/.test(c)) ||
        new Set(value).size !== value.length
      )
        throw Error('Invalid frame colors');
      face.frameColors = [...value];
      continue;
    }
    if (key === 'elements') face.printingElements = structuredClone(value as PrintingElements);
    else if (
      [
        'artist',
        'legalText',
        'collectorNumber',
        'collectorTotal',
        'collectorFormat',
        'collectorLanguage',
        'collectorSetCode',
        'setCode',
        'setSymbol',
        'setSymbolMask',
        'symbolStyle',
        'borderColor',
        'securityStamp',
        'futureTreatment',
      ].includes(key)
    )
      Object.assign(face, { [key]: value });
    else throw Error('Unknown printing override: ' + key);
  }
  if (
    overrides.setSymbolMask !== undefined &&
    !['auto', 'alpha', 'ink'].includes(overrides.setSymbolMask)
  )
    throw Error('Invalid set symbol mask mode');
  if (
    overrides.futureTreatment !== undefined &&
    (!['regular', 'full-art', 'clear'].includes(overrides.futureTreatment) ||
      face.frameTemplate !== 'future')
  )
    throw Error('Future treatment requires a Futureshifted frame.');
  if (overrides.styleSetCode !== undefined && overrides.setCode !== undefined)
    throw Error('Choose one styling set code');
  if (overrides.symbolAdjustment !== undefined) {
    if (face.frameTemplate) throw Error('Fine symbol adjustments require an ordinary frame.');
    validateSymbolAdjustment(face);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (
      ['artist', 'legalText', 'collectorNumber', 'setSymbol'].includes(key) &&
      value !== null &&
      value !== undefined &&
      (typeof value !== 'string' || value.length > (key === 'setSymbol' ? 65536 : 2048))
    )
      throw Error('Invalid printing text override');
    if (key === 'setSymbol' && value === '') throw Error('Invalid symbol asset');
  }
  if (face.symbolStyle !== undefined && !['original', 'modern'].includes(face.symbolStyle))
    throw Error('Invalid mana symbol style');
  if (face.borderColor !== undefined && !['black', 'white', 'silver'].includes(face.borderColor))
    throw Error('Invalid border color');
  if (overrides.setSymbolCode !== undefined) {
    if (
      typeof overrides.setSymbolCode !== 'string' ||
      !/^[A-Za-z0-9_-]{1,16}$/.test(overrides.setSymbolCode)
    )
      throw Error('Invalid symbol set code');
    if (overrides.setSymbol !== undefined) throw Error('Choose a symbol code or URL, not both.');
    face.setSymbol = faceSetSymbol({
      name: face.name,
      setCode: overrides.setSymbolCode,
      rarity: face.rarity,
    });
  }
  if (overrides.setSymbol === null)
    face.printingElements = {
      ...face.printingElements,
      setSymbol: { ...face.printingElements?.setSymbol, hidden: true },
    };
  if (overrides.collectorNumber === null)
    face.printingElements = {
      ...face.printingElements,
      collector: { ...face.printingElements?.collector, hidden: true },
    };
  if (overrides.collectorNumber !== undefined && face.collectorTotal === undefined)
    face.collectorTotal = null;
  if (
    face.collectorFormat !== undefined &&
    !['number-first', 'rarity-first'].includes(face.collectorFormat)
  )
    throw Error('Invalid collector format');
  for (const key of ['setCode', 'collectorSetCode'] as const)
    if (
      face[key] !== undefined &&
      face[key] !== null &&
      (typeof face[key] !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(face[key]!))
    )
      throw Error('Invalid printing set code');
  if (
    face.securityStamp !== undefined &&
    !['none', 'oval', 'triangle', 'acorn', 'circle', 'arena', 'heart'].includes(face.securityStamp)
  )
    throw Error('Invalid security stamp');
  if (
    face.printingElements &&
    Object.keys(face.printingElements).length &&
    !printingElementSupport(face).supported
  )
    throw Error(printingElementSupport(face).reason);
  validatePrintingElements(face);
  if (
    face.collectorTotal !== undefined &&
    face.collectorTotal !== null &&
    (!Number.isInteger(face.collectorTotal) ||
      face.collectorTotal < 1 ||
      face.collectorTotal > 99999)
  )
    throw Error('Invalid collector total');
  if (face.collectorLanguage !== undefined && !/^[A-Za-z]{2,5}$/.test(face.collectorLanguage))
    throw Error('Invalid collector language');
  if (face.frameTemplate === 'future') validateFutureTreatment(face);
  if (selection.art !== undefined) face = resolveArtPlacement(face, selection.art);
  if (input.layout === 'split' && input.faces)
    face = {
      ...face,
      faces: input.faces.map((child) =>
        resolvePrintingPreset({ ...child, layout: 'normal' }, selection),
      ),
    };
  if (typeof face.calibration === 'object' && !supportsModernCalibration(face))
    throw Error('M21 calibration requires a modern frame.');
  return calibrationFace(face);
}

/** UI-facing controls deliberately exclude layout-specific painters that are not
 * instrumented yet; compatibility is not an assertion of scan accuracy. */
export function printingElementSupport(face: RenderedCardInput): {
  supported: boolean;
  elements: readonly string[];
  reason?: string;
} {
  const normal =
    !face.faces?.length &&
    (!face.layout || ['normal', 'token'].includes(face.layout)) &&
    (!face.frameTemplate || face.frameTemplate === 'future') &&
    !/\b(Saga|Class|Planeswalker|Battle)\b/.test(face.canonicalTypeLine ?? face.typeLine ?? '') &&
    !/^Level up\b/m.test(face.rulesText ?? '');
  return normal
    ? { supported: true, elements: ['artist', 'legal', 'collector', 'manaCost', 'setSymbol'] }
    : {
        supported: false,
        elements: [],
        reason:
          'Element controls currently require an ordinary single face or Futureshifted template.',
      };
}
