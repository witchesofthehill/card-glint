import { rulesInkVisible } from './rules-visibility.js';
import { SECURITY_STAMP_RECTS } from './security-stamp-geometry.js';
import { hasOvalSecurityStamp } from './security-stamp-policy.js';
import { paintSagaColors } from './saga-colors.js';
import type { CanvasImages } from './canvas-assets.js';
import { FACE_WIDTH as W, FACE_HEIGHT as H, type RenderedCardInput } from './face-layout.js';
import {
  sagaFrameAsset,
  sagaTransformIcon,
  SAGA_RECTS,
  SAGA_CHAPTER,
  SAGA_MARKER_GEOMETRY,
  SAGA_DIVIDER,
  SAGA_STAMP,
} from './saga-frame.js';
import { sagaRuleLayout } from './saga-rules.js';
import { paintRulesLayout } from './rules-paint.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import { paintFittedText, paintMana, paintSetSymbol } from './canvas-text.js';
import { faceSetSymbol } from './assets.js';
import { isStyledSetSymbol } from './styled-set-symbols.js';
import { setSymbolCrop } from './set-symbols.js';

/** Saga-specific preparation; no ordinary-frame symbol calibration is reused. */
export function paintSagaFace(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  underArt?: HTMLCanvasElement,
  layer?: PaintLayer,
) {
  const required = (url: string) => {
    const image = images.get(url);
    if (!image) throw Error(`Saga asset unavailable: ${url}`);
    return image;
  };
  c.save();
  c.fillStyle = '#090806';
  c.fillRect(0, 0, W, H);
  if (underArt) c.drawImage(underArt, 0, 0, W, H);
  if (layer !== 'artwork') {
    c.drawImage(required(sagaFrameAsset(face)), 0, 0, W, H);
    paintSagaColors(c, face, images);
  }
  const art = SAGA_RECTS.art;
  paintIllustration(c, face, images, [art[0] * W, art[1] * H, art[2] * W, art[3] * H], layer);
  if (layer === 'artwork') {
    c.restore();
    return;
  }
  const transformIcon = sagaTransformIcon(face);
  if (transformIcon) c.drawImage(required(transformIcon), 33.5, 35.6, 29, 32);
  c.fillStyle = '#17140f';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const cost = face.manaSymbols ?? [],
    size = 23.4,
    gap = 1.8;
  const right = 452,
    costWidth = cost.length * size + Math.max(0, cost.length - 1) * gap;
  const titleX = face.layout === 'transform' ? 78 : 41.7;
  paintFittedText(
    c,
    face.name,
    titleX,
    51,
    (cost.length ? right - costWidth - 8 : 449) - titleX,
    26,
    true,
  );
  cost.forEach((symbol, i) =>
    paintMana(c, symbol, right - costWidth + i * (size + gap), 38.7, size, images, true),
  );
  const url = faceSetSymbol(face),
    icon = images.get(url ?? ''),
    crop = setSymbolCrop(face);
  const scale = icon ? Math.min(58.56 / (icon.width * crop[2]), 25.9 / (icon.height * crop[3])) : 0;
  const iw = icon ? icon.width * crop[2] * scale : 0,
    ih = icon ? icon.height * crop[3] * scale : 0;
  const bounds: [number, number, number, number] = [450.3 - iw, 594.25 - ih / 2, iw, ih];
  paintFittedText(
    c,
    face.typeLine ?? '',
    41.7,
    594.5,
    (icon ? bounds[0] - 7 : 449) - 41.7,
    22,
    true,
    1,
    'CardRenderer MTG Beleren',
    0,
    face.textInk,
  );
  if (icon) {
    if (isStyledSetSymbol(url) || face.setSymbol) c.drawImage(icon, ...bounds);
    else paintSetSymbol(c, icon, face.setCode, face.rarity, ...bounds, crop);
  }
  if (face.reverseStats && face.layout === 'transform') {
    c.fillStyle = '#65605a';
    c.font = 'italic 20px "CardRenderer MTG MPlantin", Georgia';
    c.textAlign = 'left';
    c.fillText(`${face.reverseStats.power}/${face.reverseStats.toughness}`, 41, 553);
  }
  if (rulesInkVisible(c)) {
    const rules = sagaRuleLayout(c, face);
    paintRulesLayout(c, rules.reminder, images);
    for (const row of rules.rows) {
      c.drawImage(required(SAGA_DIVIDER), 48.8, row.top - 1, 192.6, 2);
      paintRulesLayout(c, row.layout, images);
      row.badges.forEach((badge, index) => {
        const center =
          row.top +
          row.height / 2 +
          (index - (row.badges.length - 1) / 2) * SAGA_MARKER_GEOMETRY.gap;
        c.drawImage(
          required(SAGA_CHAPTER),
          SAGA_MARKER_GEOMETRY.x,
          center - SAGA_MARKER_GEOMETRY.height / 2,
          SAGA_MARKER_GEOMETRY.width,
          SAGA_MARKER_GEOMETRY.height,
        );
        c.fillStyle = '#17140f';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `550 ${SAGA_MARKER_GEOMETRY.fontSize}px "${SAGA_MARKER_GEOMETRY.fontFamily}", Georgia`;
        c.fillText(
          badge,
          SAGA_MARKER_GEOMETRY.centerX,
          center + SAGA_MARKER_GEOMETRY.numeralOffsetY,
        );
      });
    }
  }
  if (hasOvalSecurityStamp(face)) c.drawImage(required(SAGA_STAMP), ...SECURITY_STAMP_RECTS.saga);
  c.fillStyle = '#fff';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.font = '11px "CardRenderer MTG Relay", sans-serif';
  c.fillText(
    `${face.collectorNumber ?? ''}  ${(face.rarity ?? 'common')[0]!.toUpperCase()}`,
    32,
    645,
  );
  c.fillText(`${face.setCode?.toUpperCase() ?? ''} • EN`, 32, 658);
  c.font = '11px "CardRenderer MTG Artist Credit", serif';
  if (face.artist) c.fillText('a', 93, 658);
  c.font = '11px "CardRenderer MTG Beleren", serif';
  c.fillText(face.artist ?? '', 108, 658, 210);
  if (face.legalText) {
    c.textAlign = 'right';
    c.font = '10px "CardRenderer MTG MPlantin", Georgia';
    c.fillText(face.legalText, 454, 646, 182);
  }
  c.restore();
}

let chapterFont: Promise<void> | null = null;
export function loadSagaFont(): Promise<void> {
  return (chapterFont ??= document.fonts
    .load('550 22px "CardRenderer MTG Chapter"')
    .then((fonts) => {
      if (!fonts.length || fonts.some((f) => f.status !== 'loaded'))
        throw Error('Saga chapter numerals need card-glint/magic/fonts.css.');
    })
    .catch((error: unknown) => {
      chapterFont = null;
      throw error;
    }));
}
