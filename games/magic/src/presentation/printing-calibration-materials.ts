import type { RenderedCardInput } from './face-layout.js';
import { cardStock } from './face-layout.js';
import type { FrameHsb } from './frame-hsb.js';
import { calibrationFace } from './calibration-input.js';
import * as exact from './calibration-profiles.js';
import {
  modernCalibrationSources,
  supportsModernCalibration,
} from './calibration-modern-sources.js';
import { profileAssets } from './assets.js';
import { resolveCardProfile } from './profile.js';
import { planarCalibratedStock } from './planar-blackpoint.js';
import { framePlate } from './frame-plates.js';

export { supportsModernCalibration } from './calibration-modern-sources.js';
const neutral = { hueDegrees: 0, saturationScale: 1, brightnessScale: 1 };
const stock = '#16130e';
const stockRgb = [22 / 255, 19 / 255, 14 / 255] as const;

/** Pure resolution. The existing bitmap cache owns every derived pixel buffer. */
export function printingCalibrationMaterials(input: RenderedCardInput) {
  const face = calibrationFace(input),
    choice = face.calibration;
  const original = { ...face, calibration: undefined };
  const explicitProfile = typeof choice === 'object';
  if (explicitProfile && !supportsModernCalibration(face))
    throw Error('M21 calibration requires a modern frame.');
  const plate = face.frameAssetFamily ? framePlate(original) : null;
  const measuredStock =
    choice === 'source'
      ? undefined
      : ((plate ? planarCalibratedStock(original, plate.frame) : undefined) ??
        exact.calibratedPrintingStock(original));
  const measured = choice === 'source' ? {} : exact.calibratedFrameMaterials(original);
  const materials: Record<string, FrameHsb> = explicitProfile ? {} : { ...measured };
  const fallbackAssets: string[] = [];
  let border = explicitProfile ? undefined : measuredStock;
  let fallbackStock = false;
  if ((choice === 'auto' || explicitProfile) && supportsModernCalibration(face)) {
    const sources = modernCalibrationSources(face),
      profile = resolveCardProfile(face);
    const donor: RenderedCardInput = {
      name: '',
      setCode: 'M21',
      frameStyle: 'modern',
      layout: 'normal',
      typeLine: profile.land ? 'Land' : profile.artifact ? 'Artifact' : 'Creature',
      colors: face.colors,
      frameColors: face.frameColors,
      land: profile.land,
      artifact: profile.artifact,
      legendary: profile.legendary,
      colorCalibration: 'set-hsb-v1',
    };
    const available = new Set(sources.shared);
    for (const [url, correction] of Object.entries(exact.calibratedFrameMaterials(donor))) {
      // Source-local masks are safe only for the identical pinned bitmap.
      if (!available.has(url) || materials[url]) continue;
      materials[url] = correction;
      fallbackAssets.push(url);
    }
    if (!border && cardStock(face.setCode, face.borderColor).border === '#090806') {
      border = stock;
      fallbackStock = true;
      for (const url of sources.stock)
        materials[url] = { ...(materials[url] ?? neutral), outerStock: stockRgb };
    }
  }
  return {
    face,
    materials,
    measured,
    border,
    fallbackStock,
    fallbackAssets,
    assets: profileAssets(resolveCardProfile(face)),
    explicitProfile,
  };
}
export const calibratedFrameMaterials = (face: RenderedCardInput) =>
  printingCalibrationMaterials(face).materials;
export const calibratedPrintingStock = (face: RenderedCardInput) =>
  printingCalibrationMaterials(face).border;
export const calibratedManaTarget = (face: RenderedCardInput, symbol: string) => {
  const normalized = calibrationFace(face);
  // Donor color correction must not change historical glyph palettes or era.
  return normalized.calibration === 'source'
    ? undefined
    : exact.calibratedManaTarget(normalized, symbol);
};
