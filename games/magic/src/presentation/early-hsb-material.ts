import { calibrationFace } from './calibration-input.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput } from './face-layout.js';
import {
  buildHistoricalMana,
  hexManaColor,
  type ManaGlyphPalette,
} from './historical-mana-material.js';
import { historicalManaAsset, historicalManaFamily } from './historical-mana.js';
import { manaSymbolAsset } from './assets.js';
import { rgbToHsb, type HsbAdjustment, type Rgb } from './hsb.js';
import { outsetFrameMask } from './frame-material-mask.js';
import { blendFrameMaterial } from './frame-material-blend.js';
import { colorFrame, type FrameHsb } from './frame-hsb.js';
import { BITMAP_MANA_COLORS } from './mana-colors.js';
import { earlyHsbBitmapCache, type MaterialBitmapLease } from './material-bitmap-cache.js';
import {
  calibratedFrameMaterials,
  calibratedManaTarget,
} from './printing-calibration-materials.js';
import { eighthBasicMaterialJobs } from './eighth-basic-material.js';
import { securityStampMaterialJobs } from './security-stamp-material.js';
import { futureManaMaterialJobs } from './future-mana-material.js';
export { calibratedDualFrameProfile as earlyHsbProfile } from './calibration-profiles.js';

/** Static composition leases shared derived bitmaps. Original assets and their
 * owner remain untouched; no work happens during animated frames. */
export async function prepareEarlyHsb(
  face: RenderedCardInput,
  images: CanvasImages,
  signal: AbortSignal,
): Promise<{ images: CanvasImages; dispose: () => void }> {
  face = calibrationFace(face);
  const unchanged = { images, dispose() {} };
  const adjustments = new Map<string, FrameHsb>(Object.entries(calibratedFrameMaterials(face))),
    colors: Record<string, string> = {},
    manaGlyphScales: Record<string, number> = {},
    originalManaGlyphs = new Set<string>(),
    originalMaterials: {
      url: string;
      source: ImageBitmap;
      palette: ManaGlyphPalette;
      target: Rgb;
    }[] = [];
  const symbols = new Set([
    ...(face.manaSymbols ?? []),
    ...[...(face.rulesText ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!),
  ]);
  // rulesParagraphs can carry symbols independently of rulesText.
  for (const p of face.rulesParagraphs ?? [])
    for (const run of p.runs) for (const m of run.text.matchAll(/\{([^}]+)\}/g)) symbols.add(m[1]!);
  for (const symbol of symbols) {
    const key = /^\d+$/.test(symbol) ? 'N' : symbol,
      original = historicalManaAsset(face, symbol),
      source = original?.discColor ?? BITMAP_MANA_COLORS[key],
      // Glyph replacement preserves the existing disc palette. Measured color
      // targets are independently rebound to the actual source bitmap color.
      target =
        calibratedManaTarget(face, key) ??
        (original && BITMAP_MANA_COLORS[key]
          ? hexManaColor(key === 'W' ? '#efe7cb' : BITMAP_MANA_COLORS[key]!)
          : undefined);
    if (original) originalManaGlyphs.add(symbol);
    if (original?.glyphScale !== undefined) manaGlyphScales[symbol] = original.glyphScale;
    if (!target || !source) continue;
    const url = original?.url ?? manaSymbolAsset(symbol);
    if (original) {
      const bitmap = images.get(original.url);
      if (!bitmap) throw Error(`Historical mana asset unavailable: ${symbol}`);
      originalMaterials.push({ url: original.url, source: bitmap, palette: original, target });
    } else if (url) adjustments.set(url, manaSourceAdjustment(source, target));
    colors[symbol] = `rgb(${target.map((v) => Math.round(v * 255)).join(' ')})`;
  }
  const originalWhiteGlyph =
    symbols.has('W') && historicalManaFamily(face, 'W') === 'historic-font';
  const basicJobs = eighthBasicMaterialJobs(face, images),
    stampJobs = securityStampMaterialJobs(face, images),
    futureJobs = futureManaMaterialJobs(face, images);
  if (
    !adjustments.size &&
    !originalMaterials.length &&
    !basicJobs.length &&
    !stampJobs.length &&
    !futureJobs.length &&
    !Object.keys(colors).length &&
    !originalWhiteGlyph
  )
    return unchanged;
  const derived = Object.assign(new Map(images), {
    manaColors: colors,
    originalManaGlyphs,
    originalWhiteGlyph,
    manaGlyphScales,
  });
  const materials = [...adjustments].flatMap(([url, adjustment]) => {
    const source = images.get(url);
    return source ? [{ url, source, adjustment }] : [];
  });
  const jobs = [
    ...basicJobs,
    ...stampJobs,
    ...futureJobs,
    ...materials.map(({ url, source, adjustment }) => ({
      url,
      key: earlyHsbMaterialKey(url, source.width, source.height, adjustment),
      bytes: source.width * source.height * 4,
      build: () => buildMaterial(source, adjustment, images),
    })),
    ...originalMaterials.map(({ url, source, palette, target }) => ({
      url,
      key: JSON.stringify([
        'historical-mana-palette-v1',
        url,
        source.width,
        source.height,
        palette,
        target,
      ]),
      bytes: source.width * source.height * 4,
      build: () => buildHistoricalMana(source, palette, target),
    })),
  ];
  let leases: MaterialBitmapLease[] = [];
  try {
    leases = await earlyHsbBitmapCache.acquireMany(jobs, signal);
    jobs.forEach(({ url }, i) => derived.set(url, leases[i]!.value));
    for (const symbol of originalManaGlyphs) {
      const source = historicalManaAsset(face, symbol)!,
        bitmap = derived.get(source.url),
        logical = manaSymbolAsset(symbol);
      if (!bitmap || !logical) throw Error(`Historical mana asset unavailable: ${symbol}`);
      derived.set(logical, bitmap);
    }
    return { images: derived, dispose: () => leases.forEach((lease) => lease.release()) };
  } catch (error) {
    leases.forEach((lease) => lease.release());
    throw error;
  }
}

/** Pinned URL includes source revision; policy version includes ink protection. */
export function earlyHsbMaterialKey(
  url: string,
  width: number,
  height: number,
  adjustment: FrameHsb,
) {
  return JSON.stringify(['frame-hsb-paper-mask-v3', url, width, height, adjustment]);
}

async function buildMaterial(source: ImageBitmap, adjustment: FrameHsb, images: CanvasImages) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  try {
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) throw Error('HSB preparation needs Canvas2D.');
    c.drawImage(source, 0, 0);
    const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
    const readMask = (url: string) => {
      const mask = images.get(url);
      if (!mask) throw Error(`Frame material mask unavailable: ${url}`);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.drawImage(mask, 0, 0, canvas.width, canvas.height);
      return c.getImageData(0, 0, canvas.width, canvas.height);
    };
    const textureSource = adjustment.blackPoint?.textureMaskSource;
    const textureMask = textureSource ? readMask(textureSource) : undefined;
    const selection = adjustment.blend ? readMask(adjustment.blend.maskSource) : undefined;
    if (adjustment.blend && selection) {
      const outer =
        adjustment.blend.outerMaskSource === textureSource && textureMask
          ? textureMask
          : readMask(adjustment.blend.outerMaskSource);
      outsetFrameMask(selection, outer, Math.round(adjustment.blend.outset * canvas.width));
      // Contrast and bevel brightness must not compete for the same pixels.
      if (textureMask)
        for (let i = 3; i < textureMask.data.length; i += 4)
          textureMask.data[i] = Math.round(textureMask.data[i]! * (1 - selection.data[i]! / 255));
    }
    const stockMask = adjustment.outerStockMaskSource
      ? readMask(adjustment.outerStockMaskSource)
      : undefined;
    colorFrame(pixels, adjustment, textureMask, stockMask);
    if (adjustment.blend && selection) blendFrameMaterial(pixels, selection, adjustment.blend);
    c.putImageData(pixels, 0, 0);
    return await createImageBitmap(canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
/** Whole-material helper retained for mana discs and unmasked profiles. */
export function colorEarlyFrame(
  image: { width: number; height: number; data: Uint8ClampedArray },
  adjustment: HsbAdjustment,
) {
  colorFrame(image, adjustment);
}

/** Bind the measured target to the bitmap's actual disc color. Applying the
 * historical sun's coefficients to a modern white SVG changes the target. */
export function manaSourceAdjustment(hex: string, target: Rgb): HsbAdjustment {
  const rgb = hexManaColor(hex);
  const [h, s, b] = rgbToHsb(rgb),
    [th, ts, tb] = rgbToHsb(target);
  if (s <= 0 || b <= 0) throw Error('Mana source requires a chromatic disc.');
  return {
    hueDegrees: ((th - h + 540) % 360) - 180,
    saturationScale: ts / s,
    brightnessScale: tb / b,
  };
}
