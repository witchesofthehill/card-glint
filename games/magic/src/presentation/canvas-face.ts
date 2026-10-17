import { paintTextInk } from './text-ink.js';
import { rulesInkVisible, withRulesInk } from './rules-visibility.js';
import { calibrationFace } from './calibration-input.js';
import { calibratedPrintingStock } from './printing-calibration-materials.js';
import { validateArtPlacement } from './art-placement.js';
import { validatePrintingElements, paintPrintingElement } from './printing-elements.js';
import { withPrintingOmissions } from './printing-omissions.js';
import { paintPlaneswalkerLoyalty } from './planeswalker-loyalty.js';
import { paintModernFooter } from './modern-footer.js';
import { paintBasicLandSymbol } from './plate-basic-land.js';
import { paintStandardTemplate, loadStandardTemplateFonts } from './standard-frame-paint.js';
import { printingManaAdjustment } from './printing-mana-adjustment.js';
import { prepareManaNumerals } from './mana-numeral.js';
import {
  adjustedSymbolBounds,
  paintAdjustedSymbols,
  validateSymbolAdjustment,
} from './symbol-adjustment.js';
import { nativeSplitEra, splitFuseParagraphs } from './split-frame.js';
import { isAdventure } from './adventure-frame.js';
import { paintAdventureFace } from './adventure-paint.js';
import { loadAdventureFont } from './adventure-footer.js';
import { isPrepared } from './prepare-frame.js';
import { paintPrepareFace } from './prepare-paint.js';
import { paintNativeSplitFace, loadSplitFonts } from './split-paint.js';
import { paintSagaFace, loadSagaFont } from './saga-paint.js';
import { isAftermath } from './aftermath-frame.js';
import { paintAftermathFace } from './aftermath-paint.js';
import { prepareEarlyHsb } from './early-hsb-material.js';
import { titleTranslation } from './title-placement.js';
import { prepareRetroDualFrame } from './retro-dual-material.js';
import { calibratedStyledSymbolBounds } from './styled-symbol-placement.js';
import { faceCornerRadius } from './face-silhouette.js';
import { NORMAL_FRAME_GEOMETRY, normalFrameInset } from './normal-frame-geometry.js';
import { paintLandFrame, paintLandPaper, paintLandPaperHighlight } from './land-paper.js';
import { paintShapedSetSymbol, shapedSetCode } from './shaped-set-symbol.js';
import { isRetro, retroFrameAsset, retroBorder } from './retro-frame.js';
import { paintRetroFace } from './retro-paint.js';
import { loadRetroFont } from './retro-font.js';
import { historicalManaFamily } from './historical-mana.js';
import { hasExtraRules, extraRuleKey, extraRuleBlocks } from './extra-rules.js';
import { paintExtraRules } from './extra-rule-paint.js';
import { splitPanels, panelTransform, splitTextScale, splitHasFuse } from './split-layout.js';
import { faceFrame, faceRects } from './special-frames.js';
import { paintPlaneswalkerPaper, paintSpecialRules } from './special-rule-paint.js';
import { COLORLESS_PLATE_REPAINT, paintPlaneswalkerType } from './planeswalker-type.js';
import { paintPlaneswalkerFrameImage } from './planeswalker-lower-frame.js';
import { paintMountedSecurityStamp } from './security-stamp-paint.js';
import { setSymbolCrop } from './set-symbols.js';
import { CONJURER_ROOT, isStyledSetSymbol } from './styled-set-symbols.js';
import { paintFramePlateFace, loadFramePlateFonts } from './frame-plate-paint.js';
import {
  hasCoreSetShield,
  NORMAL_CORE_SYMBOL_SCALE,
  paintCoreSetSymbol,
} from './core-set-symbol.js';
import { paintNormalTypeBevel, paintNormalTypeCap } from './normal-type-bevel.js';
import {
  cardStock,
  faceStats,
  FACE_HEIGHT,
  FACE_RECTS,
  FACE_TEXT,
  FACE_WIDTH,
  type FaceRect,
  type RenderedCardInput,
} from './face-layout.js';
import { profileAssets, RENDERER_COMPONENT_ROOT, faceSetSymbol } from './assets.js';
import { resolveCardProfile } from './profile.js';
import {
  canvasAssetUrls,
  loadCanvasFonts,
  loadCanvasImages,
  type CanvasImages,
} from './canvas-assets.js';
import { paintFittedText, paintMana, paintSetSymbol } from './canvas-text.js';
import { ordinaryTextLayout, paintRulesLayout } from './rules-paint.js';
export { ordinaryTextLayout } from './rules-paint.js';
export { retroTextLayout } from './retro-rules.js';
import { paintEtchingMask, type EtchingResolver } from './canvas-etching.js';
import { fullResolutionScan } from '../scan-url.js';
import type { AbilityEmblem } from '../emblems.js';
import { paintCardStatus } from './canvas-status.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';

export type TextureTier = 'table' | 'inspect';
export interface CardTextureInput {
  /** Game-specific painter. Art bounds are bottom-up UV endpoints; corner radius is in card widths. */
  custom?: {
    key: string;
    artBounds: FaceRect;
    cornerRadius?: number;
    compose: (
      tier: TextureTier,
      signal: AbortSignal,
      layer: 'face' | 'etching',
      threshold?: number,
    ) => Promise<HTMLCanvasElement>;
  };
  layer?: 'face' | 'etching';
  paintLayer?: PaintLayer;
  rulesText?: boolean;
  etchThreshold?: number;
  /** Null denotes generated presentation with no official printing. */
  printingId: string | null;
  face: RenderedCardInput;
  /** Null forces the assembled face (etched, effective changes, or preference). */
  printedImage: string | null;
  emblems?: AbilityEmblem[];
  /** Current projected stats must also be visible over a printed scan. */
  currentStats?: Pick<RenderedCardInput, 'power' | 'toughness'>;
  /** A compact badge even when inspection temporarily uses table-resolution pixels. */
  statusLayout?: 'inspect';
}

export function inspectionCardFace(input: CardTextureInput): CardTextureInput {
  return input.currentStats?.power != null &&
    input.currentStats.toughness != null &&
    input.statusLayout !== 'inspect'
    ? { ...input, statusLayout: 'inspect' }
    : input;
}

export function cardTextureKey(input: CardTextureInput, tier: TextureTier): string {
  if (input.custom)
    return JSON.stringify([
      'custom-face-v1',
      input.custom.key,
      tier,
      input.layer ?? 'face',
      input.layer === 'etching' ? (input.etchThreshold ?? 20) : null,
    ]);
  // Only visible face content; no identity handles, finish or interaction state.
  const face = input.face;
  const content = faceContentKey(face, input.layer === 'etching');
  const stats =
    input.currentStats?.power != null && input.currentStats.toughness != null
      ? [input.currentStats.power, input.currentStats.toughness]
      : null;
  return JSON.stringify([
    RENDERER_COMPONENT_ROOT,
    CONJURER_ROOT,
    'canvas-face-v144',
    input.paintLayer ?? null,
    input.rulesText !== false,
    tier,
    input.printingId,
    input.layer === 'etching' ? null : input.printedImage,
    content,
    input.layer ?? 'face',
    input.layer === 'etching' ? (input.etchThreshold ?? 14) : null,
    input.layer === 'etching'
      ? null
      : [
          (input.emblems ?? []).map((emblem) => [
            emblem.path,
            emblem.viewBox ?? null,
            emblem.transform ?? null,
            Boolean(emblem.filled),
          ]),
          stats,
          stats ? (input.statusLayout ?? tier) : null,
        ],
  ]);
}

function faceContentKey(face: RenderedCardInput, mask: boolean): unknown {
  const options = [
    face.printingElements,
    face.collectorTotal,
    face.collectorLanguage,
    face.collectorSetCode,
    ...(face.calibration !== undefined ? [['printing-calibration-v1', face.calibration]] : []),
  ];
  const printingOptions = options.some((v) => v !== undefined)
    ? [['printing-elements-v1', ...options]]
    : [];
  const panels = splitPanels(face);
  if (panels.length)
    return [
      face.layout,
      ...printingOptions,
      face.artist ?? null,
      face.collectorNumber ?? null,
      face.legalText ?? null,
      face.borderColor ?? null,
      panels.map((p) => [p.x, p.y, p.width, p.height, p.rotation, faceContentKey(p.face, mask)]),
      !mask && splitHasFuse(face),
      !mask && splitFuseParagraphs(face),
      ...(!mask && face.printingOmissions?.length ? [face.printingOmissions] : []),
      ...(!mask && face.blackBorderLift ? [['border-ink', face.blackBorderLift]] : []),
    ];
  return mask
    ? [
        ...(face.printingElements?.setSymbol?.hidden ? [['hidden-set-symbol']] : []),
        ...(face.printingElements?.setSymbol?.offset
          ? [['set-symbol-offset', face.printingElements.setSymbol.offset]]
          : []),
        face.illustration ?? null,
        face.etchedIllustration ?? null,
        face.illustrationCrop ?? null,
        face.illustrationPlacement ?? null,
        ...(face.artPlacement ? [['art-placement-v1', face.artPlacement]] : []),
        face.setCode ?? null,
        face.setSymbol ?? null,
        face.setSymbolSource ?? null,
        ['set-symbol-mask-v1', face.setSymbolMask ?? 'auto'],
        faceRects(face),
      ]
    : [
        ...printingOptions,
        isRetro(face) ? [retroFrameAsset(face), retroBorder(face)] : null,
        face.borderColor ?? null,
        face.frameAssetFamily ?? null,
        face.frameTreatment ?? null,
        face.frameTemplate ?? null,
        face.futureTreatment ?? null,
        face.defense ?? null,
        face.faces?.map((child) => faceContentKey(child, mask)) ?? null,
        face.name,
        face.manaSymbols ?? [],
        face.symbolAdjustment ?? null,
        face.typeLine ?? '',
        face.canonicalTypeLine ?? null,
        face.rulesText ?? '',
        face.rulesParagraphs ?? null,
        face.wordingMode ?? null,
        face.symbolStyle ?? null,
        face.colorCalibration ?? null,
        face.rulesAlignment ?? null,
        face.illustration ?? null,
        face.illustrationCrop ?? null,
        face.illustrationPlacement ?? null,
        ...(face.artPlacement ? [['art-placement-v1', face.artPlacement]] : []),
        extraRuleKey(face),
        face.artist ?? null,
        face.watermark ?? null,
        face.collectorNumber ?? null,
        face.collectorFormat ?? null,
        face.legalText === undefined ? ['default'] : face.legalText,
        face.setCode ?? null,
        face.setSymbol ?? null,
        face.setSymbolSource ?? null,
        face.rarity ?? 'common',
        face.securityStamp ?? 'default',
        face.textInk ?? null,
        face.power ?? null,
        face.toughness ?? null,
        face.loyalty ?? null,
        face.reverseStats ?? null,
        face.layout ?? null,
        faceRects(face),
        resolveCardProfile(face),
        ...(face.printingOmissions?.length ? [face.printingOmissions] : []),
        ...(face.blackBorderLift ? [['border-ink', face.blackBorderLift]] : []),
      ];
}

export function faceCanvas(tier: TextureTier): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = tier === 'table' ? 244 : 732;
  canvas.height = tier === 'table' ? 340 : 1020;
  return canvas;
}

export async function composeCardTexture(
  input: CardTextureInput,
  tier: TextureTier,
  signal: AbortSignal,
  hooks?: {
    beforePaint?: () => Promise<void>;
    cpuPixels?: boolean;
    loadImages?: typeof loadCanvasImages;
    resolveEtching?: EtchingResolver;
    loadFonts?: () => Promise<void>;
    loadRetroFont?: () => Promise<void>;
    underArt?: HTMLCanvasElement;
  },
): Promise<HTMLCanvasElement> {
  input = { ...input, face: calibrationFace(input.face) };
  validateArtPlacement(input.face);
  validatePrintingElements(input.face);
  validateSymbolAdjustment(input.face);
  if (input.custom) {
    await hooks?.beforePaint?.();
    signal.throwIfAborted();
    return input.custom.compose(tier, signal, input.layer ?? 'face', input.etchThreshold);
  }
  const loadImages = hooks?.loadImages ?? loadCanvasImages;
  const canvas = faceCanvas(tier);
  try {
    const context = canvas.getContext('2d', {
      willReadFrequently: Boolean(hooks?.cpuPixels),
    });
    if (!context) throw new Error('Card composition needs Canvas2D.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.scale(canvas.width / FACE_WIDTH, canvas.height / FACE_HEIGHT);
    if (input.layer === 'etching') {
      await paintEtchingMask(
        context,
        input.face,
        input.printingId,
        signal,
        input.etchThreshold,
        hooks?.beforePaint,
        loadImages,
        hooks?.resolveEtching,
      );
      return canvas;
    }
    context.fillStyle = '#090806';
    context.fillRect(0, 0, FACE_WIDTH, FACE_HEIGHT);
    const plateUrl =
      input.currentStats?.power != null && input.currentStats.toughness != null
        ? profileAssets(resolveCardProfile(input.face)).pt
        : null;
    if (input.printedImage) {
      const imageUrl =
        tier === 'inspect' ? fullResolutionScan(input.printedImage) : input.printedImage;
      if (plateUrl) await (hooks?.loadFonts ?? loadCanvasFonts)();
      const loaded = await loadImages(plateUrl ? [imageUrl, plateUrl] : [imageUrl], signal);
      try {
        const image = loaded.images.get(imageUrl);
        if (image && !signal.aborted) {
          await hooks?.beforePaint?.();
          signal.throwIfAborted();
          context.drawImage(image, 0, 0, FACE_WIDTH, FACE_HEIGHT);
          if (
            input.paintLayer !== 'artwork' &&
            input.face.blackBorderLift &&
            (input.face.borderColor ?? 'black') === 'black'
          ) {
            if (
              !Number.isFinite(input.face.blackBorderLift) ||
              input.face.blackBorderLift < 0 ||
              input.face.blackBorderLift > 0.2
            )
              throw Error('Invalid black border lift');
            const ink = Math.round(input.face.blackBorderLift * 255),
              inset = FACE_WIDTH * 0.035;
            context.save();
            context.globalCompositeOperation = 'lighten';
            context.fillStyle = `rgb(${ink},${ink},${ink})`;
            context.beginPath();
            context.rect(0, 0, FACE_WIDTH, FACE_HEIGHT);
            context.rect(inset, inset, FACE_WIDTH - 2 * inset, FACE_HEIGHT - 2 * inset);
            context.fill('evenodd');
            context.restore();
          }
          paintCardStatus(
            context,
            input.emblems ?? [],
            input.currentStats,
            plateUrl ? loaded.images.get(plateUrl) : undefined,
            input.statusLayout === 'inspect' || tier === 'inspect',
          );
          roundCanvasSilhouette(context, input.face);
          return canvas;
        }
      } finally {
        loaded.dispose();
      }
    }
    await Promise.all([
      (hooks?.loadFonts ?? loadCanvasFonts)(),
      nativeSplitEra(input.face) ? loadSplitFonts(input.face) : loadFramePlateFonts(input.face),
      loadStandardTemplateFonts(input.face),
      faceFrame(input.face) === 'saga' ? loadSagaFont() : Promise.resolve(),
      isAdventure(input.face) || isPrepared(input.face) ? loadAdventureFont() : Promise.resolve(),
      isRetro(input.face) ||
      nativeSplitEra(input.face) === 'old' ||
      historicalManaFamily(input.face, 'W') === 'historic-font'
        ? (hooks?.loadRetroFont ?? loadRetroFont)()
        : Promise.resolve(),
    ]);
    signal.throwIfAborted();
    const loaded = await loadImages(canvasAssetUrls(input.face), signal);
    let calibrated: Awaited<ReturnType<typeof prepareEarlyHsb>> | undefined;
    let dual: Awaited<ReturnType<typeof prepareRetroDualFrame>> | undefined;
    let numerals: Awaited<ReturnType<typeof prepareManaNumerals>> | undefined;
    try {
      if (input.paintLayer !== 'artwork')
        calibrated = await prepareEarlyHsb(input.face, loaded.images, signal);
      if (input.paintLayer !== 'artwork')
        dual = await prepareRetroDualFrame(input.face, calibrated?.images ?? loaded.images, signal);
      numerals = await prepareManaNumerals(
        input.face,
        dual?.images ?? calibrated?.images ?? loaded.images,
        signal,
      );
      await hooks?.beforePaint?.();
      signal.throwIfAborted();
      const paintingImages = numerals.images;
      withRulesInk(context, input.rulesText !== false, () =>
        withPrintingOmissions(context, input.face, () =>
          paintAssembledFace(
            context,
            input.face,
            paintingImages,
            FACE_HEIGHT,
            false,
            hooks?.underArt,
            input.paintLayer,
          ),
        ),
      );
      if (
        input.paintLayer !== 'artwork' &&
        input.face.blackBorderLift &&
        (input.face.borderColor ?? 'black') === 'black'
      ) {
        if (
          !Number.isFinite(input.face.blackBorderLift) ||
          input.face.blackBorderLift < 0 ||
          input.face.blackBorderLift > 0.2
        )
          throw Error('Invalid black border lift');
        const ink = Math.round(input.face.blackBorderLift * 255),
          inset = FACE_WIDTH * 0.035;
        context.save();
        context.globalCompositeOperation = 'lighten';
        context.fillStyle = `rgb(${ink},${ink},${ink})`;
        context.beginPath();
        context.rect(0, 0, FACE_WIDTH, FACE_HEIGHT);
        context.rect(inset, inset, FACE_WIDTH - 2 * inset, FACE_HEIGHT - 2 * inset);
        context.fill('evenodd');
        context.restore();
      }
      paintCardStatus(
        context,
        input.emblems ?? [],
        input.currentStats,
        plateUrl ? loaded.images.get(plateUrl) : undefined,
        input.statusLayout === 'inspect' || tier === 'inspect',
      );
      roundCanvasSilhouette(context, input.face);
      return canvas;
    } finally {
      numerals?.dispose();
      dual?.dispose();
      calibrated?.dispose();
      loaded.dispose();
    }
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}

/** Apply the silhouette after painting so a complex clip cannot alter interior antialiasing. */
function roundCanvasSilhouette(context: CanvasRenderingContext2D, face: RenderedCardInput) {
  context.save();
  context.setTransform(
    context.canvas.width / FACE_WIDTH,
    0,
    0,
    context.canvas.height / FACE_HEIGHT,
    0,
    0,
  );
  context.globalCompositeOperation = 'destination-in';
  context.globalAlpha = 1;
  context.shadowColor = 'transparent';
  context.filter = 'none';
  context.fillStyle = '#000';
  context.beginPath();
  context.roundRect(0, 0, FACE_WIDTH, FACE_HEIGHT, faceCornerRadius(face) * FACE_WIDTH);
  context.fill();
  context.restore();
}

export function paintAssembledFace(
  context: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  height = FACE_HEIGHT,
  panel = false,
  underArt?: HTMLCanvasElement,
  layer?: PaintLayer,
) {
  face = calibrationFace(face);
  if (face.frameTemplate) {
    paintStandardTemplate(context, face, images, layer, underArt);
    return;
  }
  if (isPrepared(face)) {
    paintPrepareFace(context, face, images, underArt, layer);
    return;
  }
  if (isAdventure(face)) {
    paintAdventureFace(context, face, images, underArt, layer);
    return;
  }
  if (isAftermath(face)) {
    paintAftermathFace(context, face, images, underArt, layer);
    return;
  }
  if (nativeSplitEra(face)) {
    paintNativeSplitFace(context, face, images, underArt, layer);
    return;
  }
  if (face.frameAssetFamily) {
    paintFramePlateFace(context, face, images, underArt, layer);
    return;
  }
  if (isRetro(face)) {
    paintRetroFace(context, face, images, underArt, layer);
    return;
  }
  if (faceFrame(face) === 'saga') {
    paintSagaFace(context, face, images, underArt, layer);
    return;
  }
  const panels = splitPanels(face);
  if (panels.length) {
    context.fillStyle =
      calibratedPrintingStock(face) ?? cardStock(face.setCode, face.borderColor).border;
    context.fillRect(0, 0, FACE_WIDTH, FACE_HEIGHT);
    for (const child of panels) {
      context.save();
      panelTransform(context, child);
      paintAssembledFace(
        context,
        child.face,
        images,
        (child.height * FACE_WIDTH) / child.width,
        true,
        underArt,
        layer,
      );
      context.restore();
    }
    if (layer === 'artwork') return;
    paintModernFooter(context, face);
    if (splitHasFuse(face) && rulesInkVisible(context)) {
      context.font = '14px "CardRenderer MTG MPlantin", Georgia';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        'Fuse (You may cast one or both halves of this card from your hand.)',
        FACE_WIDTH / 2,
        FACE_HEIGHT - 12,
        FACE_WIDTH * 0.9,
      );
    }
    return;
  }
  const px = (rect: FaceRect): [number, number, number, number] => [
    rect[0] * FACE_WIDTH,
    rect[1] * height,
    rect[2] * FACE_WIDTH,
    rect[3] * height,
  ];
  context.fillStyle =
    calibratedPrintingStock(face) ?? cardStock(face.setCode, face.borderColor).border;
  context.fillRect(0, 0, FACE_WIDTH, height);
  const rects = faceRects(face),
    kind = faceFrame(face);
  if (layer === 'artwork') {
    paintIllustration(context, face, images, px(rects.art), layer);
    return;
  }
  const profile = resolveCardProfile(face),
    assets = profileAssets(profile, kind);
  const palette: Record<string, string> = {
    W: '#d7cda9',
    U: '#447e9a',
    B: '#5b5260',
    R: '#a84f3e',
    G: '#477553',
    Gold: '#a38335',
  };
  const color = palette[profile.boxes] ?? '#827d72';
  const draw = (url: string, rect: FaceRect, align: 'stretch' | 'top' | 'bottom' = 'top') => {
    const image = images.get(url);
    if (!image) return false;
    const [x, y, width, height] = px(rect);
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    const scaledHeight = align === 'stretch' ? height : (image.height * width) / image.width;
    context.drawImage(
      image,
      x,
      align === 'bottom' ? y + height - scaledHeight : y,
      width,
      scaledHeight,
    );
    context.restore();
    return true;
  };
  const [bx, by, bw, bh] = px(profile.legendary ? rects.legendaryBackground : rects.background);
  context.save();
  context.beginPath();
  context.roundRect(bx, by, bw, bh, [
    { x: bw * 0.01282, y: bh * 0.00962 },
    { x: bw * 0.01282, y: bh * 0.00962 },
    { x: bw * 0.06838, y: bh * 0.05128 },
    { x: bw * 0.06838, y: bh * 0.05128 },
  ]);
  context.clip();
  if (panel) {
    const channels = color
      .slice(1)
      .match(/../g)!
      .map((channel, index) =>
        Math.round(parseInt(channel, 16) * 0.62 + [244, 236, 217][index]! * 0.38),
      );
    context.fillStyle = `rgb(${channels.join(',')})`;
    context.fillRect(bx, by, bw, bh);
  }
  const background = images.get(assets.background);
  const planeswalker = kind.startsWith('planeswalker');
  if (background && planeswalker)
    paintPlaneswalkerFrameImage(context, background, bx, by, bw, kind === 'planeswalker-large');
  else if (background)
    context.drawImage(
      background,
      bx,
      by + (profile.legendary ? FACE_TEXT.legendaryBackgroundLift : 0),
      bw,
      panel ? bh : (background.height * bw) / background.width,
    );
  else {
    context.fillStyle = color;
    context.fillRect(bx, by, bw, bh);
  }
  context.restore();
  // Text fallback is painted even when the network cannot provide frame assets.
  context.fillStyle = '#e3d8bb';
  if (!images.has(assets.frame)) {
    if (kind === 'adventure')
      for (const block of extraRuleBlocks(face).filter((b) => b.kind === 'rules' && !b.color))
        context.fillRect(block.x, block.y, block.width, block.height);
    else context.fillRect(...px(rects.rules));
  }
  if (!images.has(assets.boxes)) {
    context.fillRect(...px(rects.title));
    context.fillRect(...px(rects.type));
  }
  context.fillStyle = '#80745c';
  if (!planeswalker) context.fillRect(...px(rects.art));
  const frame = images.get(assets.frame);
  if (frame && kind === 'normal' && !panel) {
    const inset = normalFrameInset(face);
    paintLandFrame(context, profile, inset, () =>
      paintFrame(context, frame, profile.legendary, rects.frame, true, inset),
    );
    paintLandPaper(context, profile, inset);
    paintLandPaperHighlight(context, profile, inset);
  }
  if (underArt) {
    context.save();
    context.beginPath();
    context.rect(0, 0, FACE_WIDTH, height);
    context.clip();
    context.resetTransform();
    context.drawImage(underArt, 0, 0, context.canvas.width, context.canvas.height);
    context.restore();
  }
  if (kind === 'normal' && !panel) {
    const [ax, ay, aw, ah] = px(rects.art),
      rim = NORMAL_FRAME_GEOMETRY.artRim;
    context.fillStyle = '#090806';
    context.fillRect(ax - rim, ay - rim, aw + 2 * rim, ah + 2 * rim);
  }
  paintIllustration(context, face, images, px(rects.art), layer);
  if (planeswalker) paintPlaneswalkerPaper(context, face);
  if (frame && planeswalker) {
    const [x, y, width] = px(rects.frame);
    paintPlaneswalkerFrameImage(context, frame, x, y, width, kind === 'planeswalker-large');
  } else if (frame && kind !== 'normal') paintFrame(context, frame, profile.legendary, rects.frame);
  if (profile.legendary) draw(assets.crown, rects.crown);
  if (panel) {
    const boxes = images.get(assets.boxes);
    if (boxes) {
      const slice = boxes.height * 0.104;
      context.drawImage(boxes, 0, 0, boxes.width, slice, ...px(rects.title));
      context.drawImage(boxes, 0, boxes.height - slice, boxes.width, slice, ...px(rects.type));
    }
    const paper = images.get(assets.frame);
    context.fillStyle = '#e3d8bb';
    context.fillRect(...px(rects.rules));
    if (paper)
      context.drawImage(
        paper,
        paper.width * 0.035,
        paper.height * 0.675,
        paper.width * 0.93,
        paper.height * 0.325,
        ...px(rects.rules),
      );
  } else {
    const colorlessPlate =
      planeswalker && ['Colourless', 'Artifact', 'Land'].includes(profile.boxes);
    draw(assets.boxes, rects.title);
    if (colorlessPlate) {
      context.save();
      context.globalAlpha *= COLORLESS_PLATE_REPAINT;
      draw(assets.boxes, rects.title);
      context.restore();
    }
    const boxes = images.get(assets.boxes);
    if (planeswalker && boxes) paintPlaneswalkerType(context, boxes, rects.type, colorlessPlate);
    else {
      draw(assets.boxes, rects.type, 'bottom');
      if (kind === 'normal' && boxes) {
        paintNormalTypeCap(context, boxes, px(rects.type));
        paintNormalTypeBevel(context, px(rects.type), profile.boxes);
      }
    }
  }
  if (!panel) paintMountedSecurityStamp(context, face, images);
  context.fillStyle = '#17140f';
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  const [tx, ty, tw, th] = px(rects.title),
    textX = tx + FACE_TEXT.plateLeft + (kind === 'normal' ? 1 : 0);
  const costAdjustment = printingManaAdjustment(face);
  const textScale = splitTextScale(face);
  const mana = face.manaSymbols ?? [],
    manaSize = FACE_TEXT.manaSize * textScale,
    manaGap = FACE_TEXT.manaGap + (costAdjustment?.spacing ?? 0);
  const manaWidth = mana.length * manaSize + Math.max(0, mana.length - 1) * manaGap;
  const plateEnd = tx + tw - FACE_TEXT.plateRight,
    manaX = plateEnd - manaWidth;
  const manaBounds: FaceRect = [
    manaX,
    ty + th / 2 - manaSize / 2 + FACE_TEXT.manaLift / 2,
    manaWidth,
    manaSize,
  ];
  const adjustedMana = mana.length ? adjustedSymbolBounds(manaBounds, costAdjustment) : manaBounds;
  const titleSize =
    (kind === 'normal' && !panel ? FACE_TEXT.normalTitleFont : FACE_TEXT.titleFont) * textScale;
  context.font = `bold ${titleSize}px "CardRenderer MTG Beleren", Georgia`;
  context.letterSpacing = `${FACE_TEXT.titleTracking}px`;
  context.save();
  if (kind === 'normal' && !panel) context.translate(...titleTranslation(face, 'modern'));
  paintFittedText(
    context,
    face.name,
    textX,
    ty + th / 2 + (kind === 'normal' ? 1 : 0),
    adjustedMana[0] - textX - (mana.length ? FACE_TEXT.titleGap : 0),
    titleSize,
    true,
  );
  context.restore();
  context.letterSpacing = '0px';
  paintPrintingElement(context, face, 'manaCost', () =>
    paintAdjustedSymbols(context, manaBounds, costAdjustment, () => {
      mana.forEach((symbol, index) =>
        paintMana(
          context,
          symbol,
          manaX + index * (manaSize + manaGap),
          ty + th / 2 - manaSize / 2 + FACE_TEXT.manaLift / 2,
          manaSize,
          images,
          true,
          costAdjustment,
        ),
      );
    }),
  );
  const setUrl = faceSetSymbol(face),
    setIcon = images.get(setUrl ?? ''),
    styledSymbol = isStyledSetSymbol(setUrl);
  const setCrop = setSymbolCrop(face),
    coreShield = hasCoreSetShield(face),
    shapedCode = shapedSetCode(face),
    corePlacement = coreShield && kind === 'normal',
    symbolGrowth = corePlacement ? NORMAL_CORE_SYMBOL_SCALE : 1,
    setMargin = FACE_TEXT.setMargin + (corePlacement ? 2 : 0);
  const [, typeY, , typeH] = px(rects.type),
    typeCenter =
      typeY + typeH / 2 + FACE_TEXT.typeLift / 2 + (kind === 'normal' || planeswalker ? 2 : 0);
  const setWidth = setIcon
    ? Math.min(
        FACE_TEXT.setMaxWidth,
        (FACE_TEXT.setHeight * setIcon.width * setCrop[2]) / (setIcon.height * setCrop[3]),
      )
    : 0;
  const setScale = setIcon
    ? Math.min(
        setWidth / (setIcon.width * setCrop[2]),
        FACE_TEXT.setHeight / (setIcon.height * setCrop[3]),
      )
    : 0;
  const baseSymbolBounds = [
    plateEnd -
      setMargin -
      setWidth -
      (setWidth * (symbolGrowth - 1)) / 2 +
      (planeswalker ? 1.5 : 0),
    typeCenter -
      ((setIcon?.height ?? 0) * setCrop[3] * setScale * symbolGrowth) / 2 -
      (corePlacement ? 1 : 0),
    (setIcon?.width ?? 0) * setCrop[2] * setScale * symbolGrowth,
    (setIcon?.height ?? 0) * setCrop[3] * setScale * symbolGrowth,
  ] as const;
  const originalSymbolBounds =
    kind === 'normal' && !panel
      ? calibratedStyledSymbolBounds(face, setUrl, baseSymbolBounds, 'component')
      : baseSymbolBounds;
  const symbolBounds = adjustedSymbolBounds(originalSymbolBounds, face.symbolAdjustment?.set);
  // Preserve existing type fitting unless an adjusted symbol needs more room.
  const typeWidth = Math.max(
    1,
    Math.min(
      plateEnd -
        textX -
        (setIcon ? setWidth * (1 + (symbolGrowth - 1) / 2) + setMargin + FACE_TEXT.typeGap : 0),
      setIcon && symbolBounds !== baseSymbolBounds
        ? symbolBounds[0] - textX - FACE_TEXT.typeGap
        : Infinity,
    ),
  );
  context.font = `${FACE_TEXT.typeFont * textScale}px "CardRenderer MTG Beleren", Georgia`;
  paintFittedText(
    context,
    face.typeLine ?? '',
    textX + (planeswalker ? 1.5 : 0),
    typeCenter,
    typeWidth,
    FACE_TEXT.typeFont * textScale,
    false,
    kind === 'normal' && !panel ? NORMAL_FRAME_GEOMETRY.typeWidthScale : 1,
    'CardRenderer MTG Beleren',
    0,
    face.textInk,
  );
  paintPrintingElement(context, face, 'setSymbol', () =>
    paintAdjustedSymbols(context, originalSymbolBounds, face.symbolAdjustment?.set, () => {
      if (setIcon) {
        if (styledSymbol || face.setSymbol) {
          context.save();
          context.shadowColor = 'transparent';
          context.drawImage(setIcon, ...originalSymbolBounds);
          context.restore();
        } else if (coreShield)
          paintCoreSetSymbol(
            context,
            setIcon,
            face.rarity,
            ...originalSymbolBounds,
            setCrop,
            corePlacement ? 1.5 : 1,
          );
        else if (shapedCode)
          paintShapedSetSymbol(
            context,
            setIcon,
            shapedCode,
            face.rarity,
            ...originalSymbolBounds,
            setCrop,
            kind === 'normal',
          );
        else
          paintSetSymbol(
            context,
            setIcon,
            face.setCode,
            face.rarity,
            ...originalSymbolBounds,
            setCrop,
          );
      }
    }),
  );
  if (hasExtraRules(face)) paintExtraRules(context, face, images);
  else if (kind !== 'normal') paintSpecialRules(context, face, images);
  else if (!paintBasicLandSymbol(context, face, images)) {
    paintRulesLayout(context, ordinaryTextLayout(context, face, height, textScale), images);
  }
  const stats = faceStats(face);
  if (stats && kind !== 'leveler') {
    draw(assets.pt, rects.stats, 'stretch');
    if (kind.startsWith('planeswalker'))
      paintPlaneswalkerLoyalty(context, stats.text, px(rects.stats));
    else {
      const [sx, sy, sw] = px(rects.stats);
      context.fillStyle = '#17140f';
      context.font = `bold ${FACE_TEXT.statsFont}px "CardRenderer MTG Beleren", Georgia`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      paintTextInk(
        context,
        stats.text,
        sx + sw / 2,
        sy + FACE_TEXT.statsLine / 2 + (kind === 'normal' ? 2 : 0),
        sw,
        face.textInk,
      );
    }
  }
  if (!panel) paintModernFooter(context, face);
}

function paintFrame(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  legendary: boolean,
  rect: FaceRect = FACE_RECTS.frame,
  expandRulesTop = false,
  horizontalInset = 0,
) {
  const [originalX, y, originalWidth, height] = pixels(rect);
  const inset = horizontalInset,
    x = originalX + inset,
    width = originalWidth - 2 * inset;
  const sourceHeight = Math.min(image.height, (height * image.width) / originalWidth);
  const renderedHeight = (sourceHeight * originalWidth) / image.width,
    scale = context.getTransform().a;
  // Raise only the asset band containing the rules box's upper inset. The
  // bottom edge and all text retain their coordinates. Even-pixel clip seams
  // map to whole raster rows at both supported tiers.
  const paint = () => {
    if (!expandRulesTop) {
      context.drawImage(image, 0, 0, image.width, sourceHeight, x, y, width, renderedHeight);
      return;
    }
    const top = 424,
      bottom = 436;
    context.save();
    context.beginPath();
    context.rect(0, 0, FACE_WIDTH, top);
    context.rect(0, bottom, FACE_WIDTH, FACE_HEIGHT - bottom);
    context.clip();
    context.drawImage(image, 0, 0, image.width, sourceHeight, x, y, width, renderedHeight);
    context.restore();
    context.save();
    context.beginPath();
    context.rect(0, top, FACE_WIDTH, bottom - top);
    context.clip();
    context.drawImage(image, 0, 0, image.width, sourceHeight, x, y - 1, width, renderedHeight);
    context.restore();
  };
  context.save();
  context.shadowColor = 'black';
  context.shadowOffsetX = -0.00394 * FACE_WIDTH * scale;
  context.shadowOffsetY = 0.00394 * FACE_WIDTH * scale;
  context.shadowBlur = 0.00236 * FACE_WIDTH * scale;
  paint();
  if (!legendary) {
    context.shadowColor = '#ffffffa0';
    context.shadowOffsetX = 0.00157 * FACE_WIDTH * scale;
    context.shadowOffsetY = -0.00315 * FACE_WIDTH * scale;
    context.shadowBlur = 0.00157 * FACE_WIDTH * scale;
    paint();
  }
  context.restore();
}

export function pixels(rect: FaceRect): [number, number, number, number] {
  return [rect[0] * FACE_WIDTH, rect[1] * FACE_HEIGHT, rect[2] * FACE_WIDTH, rect[3] * FACE_HEIGHT];
}
