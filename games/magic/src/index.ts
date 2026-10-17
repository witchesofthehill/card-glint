import type {
  GamePack,
  CardDocument,
  FaceRecipe,
  Tier,
  EdgeSource,
  RasterHost,
} from '../../../packages/browser/src/index.js';
import { composeCardTexture, cardTextureKey } from './presentation/canvas-face.js';
import { faceEtchingSymbol } from './presentation/assets.js';
import { canvasAssetWidth } from './presentation/canvas-assets.js';
import { clearEarlyHsbBitmaps } from './presentation/material-bitmap-cache.js';
import { setSymbolMaskCache } from './presentation/set-symbol-mask.js';
import {
  aliasCanvasImages,
  clearHistoricalSymbolSources,
  resolveCanvasSources,
} from './presentation/historical-symbol-sources.js';
import { faceRects } from './presentation/special-frames.js';
import { visibleArt } from './presentation/art-apertures.js';
import { illustrationTarget } from './presentation/illustration-layout.js';
import { splitPanels, panelRect } from './presentation/split-layout.js';
import type { RenderedCardInput } from './presentation/face-layout.js';
import { faceCornerRadius } from './presentation/face-silhouette.js';
import { isPrepared, PREPARE_SPELL_RECTS } from './presentation/prepare-frame.js';
import { securityStampHologram } from './presentation/security-stamp-hologram.js';
export type { RenderedCardInput as MtgCard, SecurityStamp } from './presentation/face-layout.js';
export { setSymbolAsset, manaSymbolAsset, profileAssets } from './presentation/assets.js';
export { FACE_RECTS, FACE_TEXT } from './presentation/face-layout.js';
export {
  withCardWording,
  type CardWording,
  type WordingAlignment,
} from './presentation/wording.js';

export { resolvePrintingWording } from './printing/resolve.js';
export { resolvePrintingArtist } from './printing/artist.js';
export type { ResolvedPrintingArtist, PrintingArtistProvenance } from './printing/artist.js';
export type {
  PrintingText,
  ResolvedPrintingWording,
  PrintingWordingProvenance,
  ReviewedWordingField,
} from './printing/types.js';

function loader(host: RasterHost) {
  return async (urls: readonly (string | null | undefined)[], signal: AbortSignal) => {
    const sources = await resolveCanvasSources(urls, signal);
    try {
      const lease = await host.images(
        sources.urls.map((url) => ({ url, width: canvasAssetWidth(url) })),
        signal,
      );
      return {
        images: aliasCanvasImages(sources.aliases, lease.value),
        dispose: () => lease.release(),
      };
    } finally {
      sources.dispose();
    }
  };
}
/** Game semantics and geometry stop at this adapter; GPU code sees only rasters. */
export const mtg: GamePack<RenderedCardInput> = {
  id: 'mtg',
  dispose() {
    clearHistoricalSymbolSources();
    clearEarlyHsbBitmaps();
    setSymbolMaskCache.clear();
  },
  describe(value: RenderedCardInput, tier: Tier): FaceRecipe {
    const face = structuredClone({
      ...value,
      setCode: value.setCode ?? 'GLINT',
    });
    const size = (tier === 'table' ? [244, 340] : [732, 1020]) as readonly [number, number];
    const input = { printingId: null, printedImage: null, face };
    const panels = splitPanels(face);
    const children = panels.length
      ? panels.map((panel) => ({ face: panel.face, panel }))
      : [{ face, panel: undefined }];
    const edges: EdgeSource[] = children.flatMap((child) => {
      if (!child.face.illustration) return [];
      const target = illustrationTarget(child.face, faceRects(child.face).art),
        clip = visibleArt(child.face);
      return [
        {
          key: JSON.stringify([
            'mtg-art-v1',
            child.face.illustration,
            child.face.etchedIllustration,
            512,
            20,
          ]),
          asset: { url: child.face.illustration, width: 512 },
          threshold: 20,
          ...(child.face.artPlacement
            ? {
                fit: {
                  focalPoint: child.face.artPlacement.focalPoint,
                  zoom: child.face.artPlacement.zoom,
                },
              }
            : {}),
          crop: child.face.illustrationCrop ?? [0, 0, 1, 1],
          destination: child.panel ? panelRect(child.panel, target) : target,
          clip: child.panel ? panelRect(child.panel, clip) : clip,
          rotation: (child.panel?.rotation ?? 0) as -90 | 0 | 90,
          importedMask: child.face.etchedIllustration
            ? { url: child.face.etchedIllustration, width: 512 }
            : undefined,
        },
      ];
    });
    const stampInput = { ...input, layer: 'etching' as const };
    return {
      pack: 'mtg',
      hologram: securityStampHologram(face),
      color: {
        key: cardTextureKey(input, tier),
        size,
        paint: (host, signal, underArt) =>
          composeCardTexture(input, tier, signal, {
            loadImages: loader(host),
            underArt,
          }),
      },
      stamp: {
        key: JSON.stringify([
          'mtg-stamp-v6',
          tier,
          face.setCode,
          ...(face.printingElements?.setSymbol?.hidden ? [['hidden-set-symbol']] : []),
          children.map((child) => [
            faceRects(child.face).stamp,
            child.face.setCode,
            faceEtchingSymbol(child.face),
            child.face.setSymbolMask ?? 'auto',
            ...(child.face.printingElements?.setSymbol?.hidden ? [['hidden-set-symbol']] : []),
            ...(child.face.printingElements?.setSymbol?.offset
              ? [['set-symbol-offset', child.face.printingElements.setSymbol.offset]]
              : []),
            child.panel
              ? [
                  child.panel.x,
                  child.panel.y,
                  child.panel.width,
                  child.panel.height,
                  child.panel.rotation,
                ]
              : null,
          ]),
        ]),
        size,
        paint: (host, signal) =>
          composeCardTexture(stampInput, tier, signal, {
            loadImages: loader(host),
          }),
      },
      edges,
      artWindows: children.map((child) =>
        child.panel ? panelRect(child.panel, visibleArt(child.face)) : visibleArt(child.face),
      ),
      cornerRadius: faceCornerRadius(face),
      regions: [
        ...Object.entries(faceRects(face)).map(([id, rect]) => ({ id, rect })),
        ...(isPrepared(face)
          ? Object.entries(PREPARE_SPELL_RECTS).map(([id, rect]) => ({ id: `spell-${id}`, rect }))
          : []),
      ],
    };
  },
};
export const disclaimer =
  'This Magic game pack is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.';

/** Animated art behind sharp printing; both rasters have stable cache identities. */
export function opticalDocument(
  id: number,
  revision: number,
  value: RenderedCardInput,
  tone: 'gold' | 'silver' | 'prismatic',
  tier: Tier = 'inspect',
  rulesText = true,
): CardDocument {
  const face = structuredClone({ ...value, setCode: value.setCode ?? 'GLINT' });
  const recipe = mtg.describe(face, tier);
  const raster = (paintLayer: 'artwork' | 'printing') => {
    const input = { face, printingId: null, printedImage: null, paintLayer, rulesText };
    return {
      key: cardTextureKey(input, tier),
      size: recipe.color.size,
      paint: (host: RasterHost, signal: AbortSignal) =>
        composeCardTexture(input, tier, signal, { loadImages: loader(host) }),
    };
  };
  // The opaque printing covers everything outside the illustration. Any frame
  // portions inside it (including planeswalker panels) remain above refraction.
  // Edge maps aren't used by these finishes; do not build them unnecessarily.
  return {
    id,
    revision,
    recipe: {
      ...recipe,
      color: raster('artwork'),
      edges: [],
      stamp: undefined,
      finishCoverageBase: 0,
      overlayFoil: { tone, strength: { gold: 0.7, silver: 0.6, prismatic: 0.75 }[tone] },
    },
    layers: [
      {
        id: 'magic-printing',
        order: 0,
        stage: 'over-finish',
        raster: raster('printing'),
        finishCoverage: {
          add: {
            key: JSON.stringify(['magic-art-scope-v1', recipe.color.size, recipe.artWindows]),
            size: recipe.color.size,
            async paint() {
              const output = document.createElement('canvas');
              [output.width, output.height] = recipe.color.size;
              const ctx = output.getContext('2d')!;
              ctx.fillStyle = '#fff';
              for (const [x, y, w, h] of recipe.artWindows)
                ctx.fillRect(
                  x * output.width,
                  y * output.height,
                  w * output.width,
                  h * output.height,
                );
              return output;
            },
          },
        },
      },
    ],
  };
}

export { mtg as magic };
export type { RenderedCardInput as MagicCard } from './presentation/face-layout.js';
export { faceFrame, faceRects } from './presentation/special-frames.js';
export { isRetro, retroFamily, retroRects } from './presentation/retro-frame.js';
export { resolveCardProfile, resolveFrameColors } from './presentation/profile.js';

export * from './presentation/printing-presets.js';
export type {
  PrintingElement,
  PrintingElementOverride,
  PrintingElements,
} from './presentation/printing-elements.js';

export * from './presentation/scryfall-printing.js';

export * from './presentation/art-placement.js';

export * from './presentation/printing-style.js';

export { fromScryfallCard } from './presentation/scryfall-card.js';
export { fromMtgjsonCard } from './presentation/mtgjson-card.js';
export type { CardImportOptions } from './presentation/provider-card.js';

export * from './presentation/printing-calibration.js';
