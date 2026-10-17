import type { PrintingCalibrationChoice } from './printing-calibration-types.js';
import type { ArtPlacement } from './art-placement.js';
import type { PrintingElements } from './printing-elements.js';
import type { SymbolAdjustment } from './symbol-adjustment.js';
import type { CardProfileInput } from './profile.js';

export type CardBorderColor = 'black' | 'white' | 'silver';
export type SecurityStamp = 'none' | 'oval' | 'triangle' | 'acorn' | 'circle' | 'arena' | 'heart';

export interface RulesRun {
  /** Plain text with optional {mana} symbols. Style is explicit, not inferred from punctuation. */
  text: string;
  italic?: boolean;
}
export interface RulesParagraph {
  role: 'rules' | 'flavor';
  runs: readonly RulesRun[];
  /** Explicit printing alignment; takes precedence over automatic set policies. */
  align?: 'left' | 'center' | 'right';
}

export interface TextInkSpan {
  start: number;
  end?: number;
  color: string;
}

export interface CardTextInk {
  omitInk?: boolean;
  typeLine?: readonly TextInkSpan[];
  stats?: readonly TextInkSpan[];
}

/** Presentation inputs shared by DOM faces and Canvas2D texture composition. */
export interface RenderedCardInput extends CardProfileInput {
  name: string;
  textInk?: CardTextInk;
  /** Optional semantic printing controls, shared by raster/export and editor callers. */
  printingElements?: PrintingElements;
  collectorTotal?: number | null;
  collectorLanguage?: string;
  collectorSetCode?: string;
  /** Editor-only omission of text ink in normalized physical-card regions.
   * Layout, frame selection, calibrated materials and mana remain unchanged. */
  printingOmissions?: readonly {
    rect: FaceRect;
    rotation?: number;
    texts: readonly string[];
  }[];
  frameStyle?: 'modern' | 'retro';
  /** Standard template families with pinned sources; calibration is family-specific. */
  frameTemplate?: 'future' | 'flip' | 'battle';
  /** Physical Future Sight treatment; retained when switching printed wording. */
  futureTreatment?: 'regular' | 'full-art' | 'clear';
  /** Printed Battle defense, independent of creature and planeswalker stats. */
  defense?: string | number | null;
  /** Opt-in full frame plates, with their own art and text geometry. Omitted
   * retains the calibrated component frames. Ordinary modern faces and
   * validated spell splits ('eighth') only. */
  frameAssetFamily?: 'eighth' | 'm15-accurate';
  /** Planar Chaos's physical colorshifted treatment. Requires the eighth plate
   * family; retained independently of original versus Oracle wording. */
  frameTreatment?: 'colorshifted';
  borderColor?: CardBorderColor;
  /** Optional minimum black-border ink level in sRGB, 0..0.2. Omitted preserves source black. */
  blackBorderLift?: number;
  /** Physical printing layout, independent of rules identity. */
  layout?: string;
  faces?: RenderedCardInput[];
  /** Normalized source-image crop, for shared split-card illustration sheets. */
  illustrationCrop?: FaceRect;
  /** Normalized card rectangle occupied by the supplied artwork. Omitted covers
   * the art aperture. Use for an incomplete crop: retain its scale/position and
   * fill uncovered areas with a solid edge color. Does not move the frame. */
  illustrationPlacement?: FaceRect;
  /** User fit, independent of frame preset and source crop corrections. */
  artPlacement?: ArtPlacement;
  manaSymbols?: string[];
  /** Experimental ordinary-face symbol placement; omitted preserves printing defaults. */
  symbolAdjustment?: SymbolAdjustment;
  rulesText?: string;
  /** Ordinary-face printing. When present this replaces rulesText for layout and painting. */
  rulesParagraphs?: readonly RulesParagraph[];
  /** Automatic historical centering uses the displayed paragraphs unless a
   * reference is supplied. Explicit paragraph alignment still wins. */
  rulesAlignment?: { mode: 'left' } | { mode: 'auto'; reference?: readonly RulesParagraph[] };
  /** Wording is supplied by the host. This selects historical vs modern symbols
   * and disables automatic historical vocabulary in Oracle mode. Omitted keeps
   * the legacy set-based symbol policy. */
  wordingMode?: 'original' | 'oracle';
  /** Select glyph era independently of wording; omitted follows wordingMode
   * (or the legacy set policy when neither choice is supplied). */
  symbolStyle?: 'original' | 'modern';
  /** Opt-in measured frame/paper and mana colors. set-hsb-v1 includes admitted
   * old-frame set/stock/material profiles, FUT cost medallions, and ELD/WOE Adventure spell paper;
   * early-hsb-v1 limits these to the first
   * four sets. Omitted preserves source colors. Art and lettering are unchanged. */
  colorCalibration?: 'early-hsb-v1' | 'set-hsb-v1';
  /** Explicit appearance policy, independent of frame selection and printed identity. */
  calibration?: PrintingCalibrationChoice;
  illustration?: string | null;
  etchedIllustration?: string | null;
  credit?: string | null;
  artist?: string | null;
  /** Optional guild identity, drawn by supported split frames. A single supplied
   * guild is shared across missing halves when their combined colors match it.
   * Each half's colors select mono/two-color ink. Unknown keys are ignored. */
  watermark?: string | null;
  /** Explicit printed legal line; null suppresses a known set's default. */
  legalText?: string | null;
  /** Printed number when the set footer includes one; no Oracle identity inference. */
  collectorNumber?: string | null;
  /** Collector-line style. Prepared defaults to
   * rarity first; Adventure uses known printing styles, then number first. */
  collectorFormat?: 'number-first' | 'rarity-first';
  power?: string | number | null;
  toughness?: string | number | null;
  loyalty?: string | number | null;
  /** Visible reverse-face P/T reminder on a transforming Saga's front. */
  reverseStats?: { power: string | number; toughness: string | number };
  setCode?: string | null;
  /** Optional host-owned symbol URL; setCode remains the printed label. */
  setSymbol?: string | null;
  /** Auto prefers complete styled vectors, falling back to Keyrune if unavailable.
   * Explicit selection is useful for asset comparisons. Custom URLs win. */
  setSymbolSource?: 'auto' | 'keyrune' | 'cardconjurer';
  /** Etched/Opal mark only. Auto extracts dark ink from styled common symbols,
   * retaining alpha for Keyrune and host images. Ink removes opaque white
   * backing/holes from a custom dark symbol; alpha keeps its whole silhouette. */
  setSymbolMask?: 'auto' | 'alpha' | 'ink';
  rarity?: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
  /** Physical printing mark, independent of rarity and wording. Omitted uses
   * the current modern rare/mythic oval default; use none for older printings.
   * Only oval is drawn currently; other shapes are retained without replacing
   * them with an incorrect oval. The artwork-only layer never includes it. */
  securityStamp?: SecurityStamp;
  /** WebGL oval reflection defaults to holographic. Static keeps its printed
   * appearance; this option never changes Canvas2D reference/accuracy rasters. */
  securityStampEffect?: 'static' | 'holographic';
}

export function faceStats(face: RenderedCardInput): { text: string; label: string } | null {
  if (face.power != null && face.toughness != null)
    return {
      text: `${face.power}/${face.toughness}`,
      label: `Power ${face.power}, toughness ${face.toughness}`,
    };
  if (face.loyalty != null && face.loyalty !== '')
    return { text: String(face.loyalty), label: `Starting loyalty ${face.loyalty}` };
  if (face.defense != null && face.defense !== '')
    return { text: String(face.defense), label: `Defense ${face.defense}` };
  return null;
}

/** Normalized reference geometry; x/y/width/height, origin at the top left. */
export type FaceRect = readonly [number, number, number, number];
export const FACE_WIDTH = 488;
export const FACE_HEIGHT = 680;
/** Shared by the Canvas silhouette and the GPU recipe, in card widths. */
export const FACE_CORNER_RADIUS = 0.058;
/** Stock is independent of the colored frame; an explicit workshop choice wins. */
export function cardStock(
  setCode?: string | null,
  borderColor?: CardBorderColor,
): { border: string; ink: string } {
  if (borderColor === 'silver') return { border: '#b8bbc2', ink: '#17140f' };
  const white =
    (borderColor ??
      (['2ed', '3ed', '4ed', '5ed', '6ed', '7ed', '8ed', '9ed', 'chr'].includes(
        setCode?.toLowerCase() ?? '',
      )
        ? 'white'
        : 'black')) === 'white';
  return { border: white ? '#eeedeb' : '#090806', ink: white ? '#17140f' : '#fff' };
}
export const ETCHED_SET_MARK_PATH =
  'M50 4 88 24v52L50 96 12 76V24Z M50 13 20 29v42l30 16 30-16V29Z';
export const FACE_RECTS = {
  background: [0.03937, 0.02531, 0.92126, 0.88976],
  legendaryBackground: [0.03937, 0.03993, 0.92126, 0.88976],
  frame: [0.04858, 0.03937, 0.90284, 0.88864],
  crown: [0.01575, 0.01687, 0.9622, 0.15748],
  title: [0.05669, 0.04499, 0.88662, 0.05737],
  art: [0.06929, 0.10742, 0.86142, 0.44882],
  type: [0.05669, 0.5613, 0.88662, 0.05737],
  rules: [0.07638, 0.62542, 0.84724, 0.29246],
  stats: [0.7704, 0.88752, 0.18236, 0.06974],
  footer: [0.06693, 0.93262, 0.86614, 0.045],
  stamp: [0.34, 0.76 - (0.16 * FACE_WIDTH) / FACE_HEIGHT, 0.32, (0.32 * FACE_WIDTH) / FACE_HEIGHT],
} as const satisfies Record<string, FaceRect>;

/** Reference-pixel typography and insets; CSS receives the equivalent card-width units. */
export const FACE_TEXT = {
  titleFont: 24,
  normalTitleFont: 26,
  titleTracking: 0.00054 * FACE_WIDTH,
  titleGap: 0.02362 * FACE_WIDTH,
  plateLeft: 0.02362 * FACE_WIDTH,
  plateRight: 0.01575 * FACE_WIDTH,
  manaSize: 0.03556 * 1.35 * FACE_WIDTH,
  manaGap: 0.00378 * FACE_WIDTH,
  manaLift: -0.0063 * FACE_WIDTH,
  typeFont: 0.044 * FACE_WIDTH,
  typeGap: 0.00945 * FACE_WIDTH,
  typeLift: -0.00315 * FACE_WIDTH,
  setHeight: 0.06142 * FACE_WIDTH,
  setMaxWidth: 0.11024 * FACE_WIDTH,
  setMargin: 0.00472 * FACE_WIDTH,
  rulesPaddingX: 0.01575 * FACE_WIDTH,
  rulesPaddingY: 0.02362 * FACE_WIDTH,
  normalRulesFont: 0.04444 * FACE_WIDTH,
  longRulesFont: 0.0381 * FACE_WIDTH,
  denseRulesFont: 0.0328 * FACE_WIDTH,
  paragraphGap: 0.00787 * FACE_WIDTH,
  statsFont: 0.05333 * FACE_WIDTH,
  statsLine: 0.08661 * FACE_WIDTH,
  footerFont: 0.02167 * FACE_WIDTH,
  footerLine: 0.02126 * FACE_WIDTH,
  footerTracking: 0.00362 * FACE_WIDTH,
  artistMarginLeft: 0.007 * FACE_WIDTH,
  artistMarginRight: 0.0035 * FACE_WIDTH,
  legendaryBackgroundLift: -0.02047 * FACE_WIDTH,
} as const;
const cssName = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
export function faceLayoutStyle(rects: Record<string, FaceRect> = FACE_RECTS) {
  return {
    ...Object.fromEntries(
      Object.entries(rects).flatMap(([name, rect]) =>
        rect.map((value, index) => [
          `--face-${cssName(name)}-${['x', 'y', 'w', 'h'][index]}`,
          `${value * 100}%`,
        ]),
      ),
    ),
    ...Object.fromEntries(
      Object.entries(FACE_TEXT).map(([name, value]) => [
        `--face-${cssName(name)}`,
        `${(value / FACE_WIDTH) * 100}cqw`,
      ]),
    ),
  };
}
export const FACE_LAYOUT_STYLE = faceLayoutStyle();

export function rulesDensity(text: string): 'dense' | 'long' | 'normal' {
  return text.length > 340 ? 'dense' : text.length > 210 ? 'long' : 'normal';
}

export function rulesFontSize(text: string): number {
  return {
    dense: FACE_TEXT.denseRulesFont,
    long: FACE_TEXT.longRulesFont,
    normal: FACE_TEXT.normalRulesFont,
  }[rulesDensity(text)];
}

export function symbolTextParts(text: string): { value: string; symbol: string | null }[] {
  return text
    .split(/(\{[^}\n]+\})/g)
    .filter(Boolean)
    .map((value) => ({
      value,
      symbol: /^\{[^}\n]+\}$/.test(value) ? value.slice(1, -1) : null,
    }));
}

export function etchedSetLabel(setCode: string): string {
  const code = setCode.trim().toUpperCase();
  return { LEA: 'α', LEB: 'β', '2ED': '∞', '3ED': 'III' }[code] ?? code.slice(0, 3);
}
