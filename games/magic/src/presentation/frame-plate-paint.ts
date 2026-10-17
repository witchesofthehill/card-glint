import { paintTextInk } from './text-ink.js';
import { calibratedPrintingStock } from './printing-calibration-materials.js';
import { paintPrintingElement } from './printing-elements.js';
import { paintPlanarFrame, usesPlanarFrameGeometry } from './planar-frame-geometry.js';
import { paintModernFooter } from './modern-footer.js';
import { printingManaAdjustment } from './printing-mana-adjustment.js';
import { paintBasicLandSymbol } from './plate-basic-land.js';
import { paintEighthBasicFrame, usesEighthBasicGeometry } from './eighth-basic-geometry.js';
import { adjustedSymbolBounds, paintAdjustedSymbols } from './symbol-adjustment.js';
import { styledSymbolBounds } from './styled-symbol-placement.js';
import { paintEighthFooter } from './eighth-footer.js';
import { paintPlanarPinlines } from './planar-pinlines.js';
import { loadPlanarStatsFont } from './planar-footer.js';
import { titleTranslation } from './title-placement.js';
import { planarLettering } from './planar-lettering.js';
import { planarSetSymbolBounds } from './planar-symbols.js';
import { framePlate } from './frame-plates.js';
import { faceSetSymbol } from './assets.js';
import { setSymbolCrop } from './set-symbols.js';
import { isStyledSetSymbol } from './styled-set-symbols.js';
import { hasCoreSetShield, paintCoreSetSymbol } from './core-set-symbol.js';
import { shapedSetCode, paintShapedSetSymbol } from './shaped-set-symbol.js';
import type { CanvasImages } from './canvas-assets.js';
import { planarCalibratedStock } from './planar-blackpoint.js';
import { paintPlateStockBorder } from './frame-plate-border.js';
import {
  FACE_WIDTH as W,
  FACE_HEIGHT as H,
  cardStock,
  type FaceRect,
  type RenderedCardInput,
} from './face-layout.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import { paintMana, paintFittedText, paintSetSymbol } from './canvas-text.js';
import { ordinaryTextLayout, paintRulesLayout } from './rules-paint.js';
import { paintMountedSecurityStamp } from './security-stamp-paint.js';

const px = (r: FaceRect): [number, number, number, number] => [
  r[0] * W,
  r[1] * H,
  r[2] * W,
  r[3] * H,
];

/** Paint a complete base plate once per face preparation. Its art aperture,
 * bevels, paper and type plate remain one source; no component overlays. */
export function paintFramePlateFace(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  underArt?: HTMLCanvasElement,
  layer?: PaintLayer,
) {
  const plate = framePlate(face);
  if (!plate) throw Error('Missing replacement frame family.');
  const required = (url: string) => {
    const image = images.get(url);
    if (!image) throw Error(`Replacement frame asset unavailable: ${url}`);
    return image;
  };
  const { rects } = plate,
    eighth = face.frameAssetFamily === 'eighth',
    stock =
      planarCalibratedStock(face, plate.frame) ??
      calibratedPrintingStock(face) ??
      cardStock(face.setCode, face.borderColor).border;
  c.save();
  c.fillStyle = stock;
  c.fillRect(0, 0, W, H);
  if (underArt) c.drawImage(underArt, 0, 0, W, H);
  paintIllustration(c, face, images, px(rects.art), layer);
  if (layer === 'artwork') {
    c.restore();
    return;
  }
  if (usesEighthBasicGeometry(face, plate.frame)) paintEighthBasicFrame(c, required(plate.frame));
  else if (usesPlanarFrameGeometry(face, plate.frame))
    paintPlanarFrame(c, required(plate.frame), face.frameTreatment === 'colorshifted');
  else c.drawImage(required(plate.frame), 0, 0, W, H);
  paintPlanarPinlines(c, plate, images);
  if (plate.rightFrame) {
    // A narrow blend joins the two *land* textures, preserving colored outer
    // frames and paper rather than replacing them with a generic gold land.
    const mix = document.createElement('canvas');
    mix.width = 732;
    mix.height = 1020;
    const m = mix.getContext('2d')!;
    m.drawImage(required(plate.rightFrame), 0, 0, mix.width, mix.height);
    const mask = document.createElement('canvas');
    mask.width = mix.width;
    mask.height = mix.height;
    const a = mask.getContext('2d')!;
    const blend = (left: number, right: number) => {
      const gradient = a.createLinearGradient(mask.width * left, 0, mask.width * right, 0);
      gradient.addColorStop(0, '#0000');
      gradient.addColorStop(1, '#000');
      return gradient;
    };
    a.fillStyle = blend(0.47, 0.53);
    a.fillRect(0, 0, mask.width, mask.height);
    // Paper uses a broad transition; the outer colored rails keep their narrow
    // join. Blend the original textures (including grain and inset shadows),
    // without painting a flat gradient over them or moving any frame geometry.
    const paper: FaceRect = eighth ? [0.08, 0.627, 0.84, 0.29] : [0.071, 0.629, 0.858, 0.294];
    const [px, py, pw, ph] = paper;
    const x = px * mask.width,
      y = py * mask.height,
      w = pw * mask.width,
      h = ph * mask.height;
    a.clearRect(x, y, w, h);
    a.fillStyle = blend(0.27, 0.73);
    a.fillRect(x, y, w, h);
    m.globalCompositeOperation = 'destination-in';
    m.drawImage(mask, 0, 0);
    c.drawImage(mix, 0, 0, W, H);
    mix.width = mix.height = 0;
    mask.width = mask.height = 0;
  }
  if (stock !== '#090806')
    paintPlateStockBorder(
      c,
      required(plate.border),
      stock,
      usesPlanarFrameGeometry(face, plate.frame)
        ? face.frameTreatment === 'colorshifted'
          ? 'colorshifted'
          : 'planar'
        : undefined,
    );
  paintMountedSecurityStamp(c, face, images);
  c.fillStyle = '#17140f';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const costAdjustment = printingManaAdjustment(face);
  const family = eighth ? 'CardRenderer MTG Matrix' : 'CardRenderer MTG Beleren';
  const [tx, ty, tw, th] = px(rects.title),
    cost = face.manaSymbols ?? [],
    { size } = plate.mana,
    gap = plate.mana.gap + (costAdjustment?.spacing ?? 0);
  const costRight = plate.mana.right * W;
  const costWidth = cost.length * size + Math.max(0, cost.length - 1) * gap;
  const manaBounds: FaceRect = [
    costRight - costWidth,
    plate.mana.center * H - size / 2,
    costWidth,
    size,
  ];
  const adjustedMana = adjustedSymbolBounds(manaBounds, costAdjustment);
  c.font = `bold ${plate.titleSize}px "${family}", Georgia`;
  c.save();
  if (eighth) c.translate(...titleTranslation(face, 'eighth'));
  const titleFit = planarLettering(face, plate.frame, 'title');
  c.translate(titleFit.dx, titleFit.dy);
  paintColorshiftedHeading(c, face, plate.frame);
  paintFittedText(
    c,
    face.name,
    tx,
    ty + th / 2,
    cost.length ? adjustedMana[0] - tx - 8 : tw,
    plate.titleSize * titleFit.size,
    true,
    1,
    family,
    face.frameTreatment === 'colorshifted' ? 0.5 : 0,
  );
  c.restore();
  paintPrintingElement(c, face, 'manaCost', () =>
    paintAdjustedSymbols(c, manaBounds, costAdjustment, () => {
      cost.forEach((symbol, i) =>
        paintMana(
          c,
          symbol,
          costRight - costWidth + i * (size + gap),
          plate.mana.center * H - size / 2,
          size,
          images,
          true,
          costAdjustment,
        ),
      );
    }),
  );
  const url = faceSetSymbol(face),
    icon = images.get(url ?? ''),
    crop = setSymbolCrop(face);
  const iconScale = icon
    ? Math.min(
        (plate.symbol.width * W) / (icon.width * crop[2]),
        (plate.symbol.height * H) / (icon.height * crop[3]),
      )
    : 0;
  const iw = icon ? icon.width * crop[2] * iconScale : 0,
    ih = icon ? icon.height * crop[3] * iconScale : 0;
  const originalBounds =
    planarSetSymbolBounds(face, plate.frame, url) ??
    styledSymbolBounds(face, url, [
      plate.symbol.right * W - iw,
      plate.symbol.center * H - ih / 2,
      iw,
      ih,
    ]);
  const bounds = adjustedSymbolBounds(originalBounds, face.symbolAdjustment?.set);
  const [x, y, w, h] = px(rects.type);
  c.save();
  const typeFit = planarLettering(face, plate.frame, 'type');
  c.translate(typeFit.dx, typeFit.dy);
  paintColorshiftedHeading(c, face, plate.frame);
  c.font = `bold ${plate.typeSize}px "${family}", Georgia`;
  paintFittedText(
    c,
    face.typeLine ?? '',
    x,
    y + h / 2,
    icon ? bounds[0] - x - 7 : w,
    plate.typeSize * typeFit.size,
    true,
    1,
    family,
    face.frameTreatment === 'colorshifted' ? 0.5 : 0,
    face.textInk,
    'type',
  );
  c.restore();
  paintPrintingElement(c, face, 'setSymbol', () =>
    paintAdjustedSymbols(c, originalBounds, face.symbolAdjustment?.set, () => {
      if (icon) {
        const shaped = shapedSetCode(face);
        if (isStyledSetSymbol(url) || face.setSymbol) c.drawImage(icon, ...originalBounds);
        else if (hasCoreSetShield(face))
          paintCoreSetSymbol(c, icon, face.rarity, ...originalBounds, crop, 1.5);
        else if (shaped)
          paintShapedSetSymbol(c, icon, shaped, face.rarity, ...originalBounds, crop, false);
        else paintSetSymbol(c, icon, face.setCode, face.rarity, ...originalBounds, crop);
      }
    }),
  );
  if (!paintBasicLandSymbol(c, face, images))
    paintRulesLayout(c, ordinaryTextLayout(c, face), images);
  if (face.power != null && face.toughness != null) {
    c.drawImage(required(plate.pt), ...px(rects.stats));
  }
  if (eighth) {
    paintEighthFooter(c, face, images, plate.frame);
    c.restore();
    return;
  }
  if (face.power != null && face.toughness != null) {
    const [sx, sy, sw, sh] = px(rects.stats);
    c.font = `bold 25px "${family}", Georgia`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    paintTextInk(
      c,
      `${face.power}/${face.toughness}`,
      sx + sw * 0.52,
      sy + sh * 0.52,
      sw * 0.85,
      face.textInk,
    );
  }
  paintModernFooter(c, face);
  c.restore();
}

let matrixFont: Promise<void> | null = null;
export function loadFramePlateFonts(face: RenderedCardInput): Promise<void> {
  if (face.frameAssetFamily !== 'eighth') return Promise.resolve();
  const common = (matrixFont ??= Promise.all([
    document.fonts.load('700 24px "CardRenderer MTG Matrix"'),
    document.fonts.load('700 29px "CardRenderer MTG Matrix Small Caps"'),
  ])
    .then((matches) => {
      if (matches.some((fonts) => !fonts.length || fonts.some((font) => font.status !== 'loaded')))
        throw Error('Replacement Eighth Edition frames need card-glint/magic/fonts.css.');
    })
    .catch((error: unknown) => {
      matrixFont = null;
      throw error;
    }));
  return Promise.all([common, loadPlanarStatsFont(face, framePlate(face)?.frame ?? '')]).then(
    () => {},
  );
}

/** Source pack8thColorshifted.js: white ink with a down-left black shadow.
 * Called inside text-only saved state so symbols and rules retain their ink. */
function paintColorshiftedHeading(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  source: string,
): void {
  if (face.frameTreatment !== 'colorshifted') return;
  c.fillStyle = '#fff';
  c.shadowColor = planarCalibratedStock(face, source) ?? '#000';
  c.shadowOffsetX = -0.0021 * W;
  c.shadowOffsetY = 0.0015 * H;
  c.shadowBlur = 0;
}
