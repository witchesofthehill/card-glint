import { framePlate } from './frame-plates.js';
import type { RenderedCardInput } from './face-layout.js';
import { profileAssets } from './assets.js';
import { resolveCardProfile, resolveFrameColors } from './profile.js';
import { faceFrame } from './special-frames.js';
import { isRetro } from './retro-frame.js';
import { sagaFrameAsset } from './saga-frame.js';
import { isAdventure, adventurePlate, adventureHybrid, ADVENTURE_ROOT } from './adventure-frame.js';
import { isPrepared, preparePlate } from './prepare-frame.js';
import { isAftermath, aftermathAssets } from './aftermath-frame.js';
import { nativeSplitEra } from './split-frame.js';
import { splitPanels } from './split-layout.js';
import { modernSplitAssets } from './split-modern-frame.js';
import { standardTemplateParts } from './standard-frame-templates.js';

export function supportsModernCalibration(face: RenderedCardInput): boolean {
  if (
    isRetro(face) ||
    face.frameAssetFamily === 'eighth' ||
    face.frameTemplate === 'future' ||
    face.frameTemplate === 'flip'
  )
    return false;
  const era = nativeSplitEra(face);
  return !era || era === 'm15' || isAftermath(face);
}
/** Identify actual frame plates only. Masks, art, ink glyphs and stamps never receive stock tint. */
export function modernCalibrationSources(face: RenderedCardInput) {
  if (!supportsModernCalibration(face)) return { shared: [] as string[], stock: [] as string[] };
  const plates = (urls: string[]) => ({ shared: [] as string[], stock: urls });
  if (face.frameAssetFamily === 'm15-accurate') {
    const plate = framePlate(face);
    return plates(
      plate ? [plate.frame, ...(plate.rightFrame ? [plate.rightFrame] : []), plate.border] : [],
    );
  }
  if (face.frameTemplate === 'battle') {
    const parts = standardTemplateParts(face);
    return plates(parts?.kind === 'battle' ? [parts.border] : []);
  }
  // Only the physical outer plates need stock correction. Inset spell/color
  // sources are masked to interior panels; preparing all of them wastes the bounded cache.
  if (isAdventure(face))
    return plates(
      adventureHybrid(face)
        ? resolveFrameColors(face).map((color) => `${ADVENTURE_ROOT}/${color.toLowerCase()}.png`)
        : [adventurePlate(face)],
    );
  if (isPrepared(face)) return plates([preparePlate(face)]);
  if (isAftermath(face))
    return plates(aftermathAssets(face).filter((u) => u.includes('/aftermath/')));
  if (nativeSplitEra(face) === 'm15')
    return plates(
      splitPanels(face).flatMap((p) =>
        modernSplitAssets(p.face).filter((u) => /\/[wubrgma]\.png$/.test(u)),
      ),
    );
  if (faceFrame(face) === 'saga') return plates([sagaFrameAsset(face)]);
  const assets = profileAssets(resolveCardProfile(face), faceFrame(face));
  // Component frames have transparent margins; their outer stock is painted beneath them.
  return {
    shared: [
      assets.frame,
      assets.background,
      assets.boxes,
      assets.pt,
      ...(resolveCardProfile(face).legendary ? [assets.crown] : []),
    ],
    stock: [] as string[],
  };
}
