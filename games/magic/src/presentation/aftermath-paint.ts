import { calibratedPrintingStock } from './printing-calibration-materials.js';
import { SECURITY_STAMP_RECTS } from './security-stamp-geometry.js';
import { hasOvalSecurityStamp } from './security-stamp-policy.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput } from './face-layout.js';
import {
  AFTERMATH_JOIN,
  AFTERMATH_TOP,
  AFTERMATH_BOTTOM,
  AFTERMATH_STAMP,
  aftermathFrameAsset,
} from './aftermath-frame.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import { splitPanels } from './split-layout.js';
import { paintFittedText, paintMana, paintSetSymbol } from './canvas-text.js';
import { faceSetSymbol } from './assets.js';
import { setSymbolCrop } from './set-symbols.js';
import { isStyledSetSymbol } from './styled-set-symbols.js';
import { wordingParagraphs } from './wording.js';
import { layoutRules } from './rules-layout.js';
import { paintRulesLayout } from './rules-paint.js';
import { shortCenteredRules } from './short-centered-rules.js';

export function aftermathRules(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  bottom: boolean,
) {
  const [x, y, width, height] = (bottom ? AFTERMATH_BOTTOM : AFTERMATH_TOP).rules;
  const paragraphs = wordingParagraphs({
    rulesText: face.rulesText ?? '',
    rulesParagraphs: face.rulesParagraphs,
  });
  const bounds = { x, y, width, height },
    typography = {
      leading: 0.98,
      paragraphGap: 0.32,
      flavorGap: 0.65,
      centerOffset: bottom ? 0 : 2.5,
    };
  let maximum = bottom ? 22 : face.setCode?.toLowerCase() === 'hou' ? 24.5 : 22.5;
  let result = layoutRules(c, paragraphs, bounds, maximum, 14, typography);
  // Small top boxes sometimes reduce the type to avoid one tiny final word.
  // This uses measured line widths, never names or per-card scan adjustments.
  if (
    !bottom &&
    paragraphs.length === 1 &&
    result.lines.length > 1 &&
    result.lines.at(-1)!.width < width * 0.18
  ) {
    for (let size = maximum - 0.25; size >= maximum * 0.9; size -= 0.25) {
      const trial = layoutRules(c, paragraphs, bounds, size, size, typography);
      if (!trial.overflow && trial.lines.length < result.lines.length) {
        maximum = size;
        result = trial;
        break;
      }
    }
  }
  if (!bottom && face.rulesAlignment?.mode !== 'left') {
    const reference =
      face.rulesAlignment?.mode === 'auto'
        ? (face.rulesAlignment.reference ?? paragraphs)
        : paragraphs;
    const centered = shortCenteredRules(
      c,
      paragraphs,
      reference,
      bounds,
      maximum,
      14,
      1,
      typography,
    );
    if (centered) return centered;
  }
  return result;
}

/** Full source plates supply the asymmetric join, not two resized ordinary cards. */
export function paintAftermathFace(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  underArt?: HTMLCanvasElement,
  layer?: PaintLayer,
) {
  const panels = splitPanels(face);
  const required = (url: string) => {
    const image = images.get(url);
    if (!image) throw Error(`Aftermath asset unavailable: ${url}`);
    return image;
  };
  c.save();
  c.fillStyle = calibratedPrintingStock(face) ?? '#090806';
  c.fillRect(0, 0, 488, 680);
  if (underArt) c.drawImage(underArt, 0, 0, 488, 680);
  if (layer !== 'artwork') {
    panels.forEach((panel, index) => {
      c.save();
      c.beginPath();
      c.rect(0, index ? AFTERMATH_JOIN : 0, 488, index ? 680 - AFTERMATH_JOIN : AFTERMATH_JOIN);
      c.clip();
      c.drawImage(required(aftermathFrameAsset(panel.face)), 0, 0, 488, 680);
      c.restore();
    });
  }
  panels.forEach((panel, index) => {
    c.save();
    if (index) {
      c.translate(488, AFTERMATH_JOIN);
      c.rotate(Math.PI / 2);
    }
    const half = panel.face,
      rects = index ? AFTERMATH_BOTTOM : AFTERMATH_TOP;
    paintIllustration(c, half, images, rects.art, layer);
    if (layer !== 'artwork') {
      c.fillStyle = '#17140f';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      const cost = half.manaSymbols ?? [],
        size = 23.4,
        gap = 1.6;
      const right = index ? 246 : 451,
        cw = cost.length * size + Math.max(0, cost.length - 1) * gap;
      const [x, y] = rects.title;
      paintFittedText(c, half.name, x, y + 15.5, right - cw - x - 7, 26, true);
      cost.forEach((symbol, i) =>
        paintMana(c, symbol, right - cw + i * (size + gap), y + 3, size, images, true),
      );
      const symbol = !index ? images.get(faceSetSymbol(half) ?? '') : undefined;
      paintFittedText(
        c,
        half.typeLine ?? '',
        rects.type[0],
        rects.type[1] + 16.5,
        rects.type[2] - (symbol ? 45 : 0),
        23,
        true,
        1,
        'CardRenderer MTG Beleren',
        0,
        half.textInk,
      );
      if (symbol) {
        const crop = setSymbolCrop(half),
          scale = Math.min(50 / (symbol.width * crop[2]), 27 / (symbol.height * crop[3]));
        const w = symbol.width * crop[2] * scale,
          h = symbol.height * crop[3] * scale;
        const bounds = [451 - w, 252.3 - h / 2, w, h] as const;
        if (isStyledSetSymbol(faceSetSymbol(half)) || half.setSymbol)
          c.drawImage(symbol, ...bounds);
        else paintSetSymbol(c, symbol, half.setCode, half.rarity, ...bounds, crop);
      }
      paintRulesLayout(c, aftermathRules(c, half, Boolean(index)), images);
    }
    c.restore();
  });
  if (layer !== 'artwork') {
    if (hasOvalSecurityStamp(face))
      c.drawImage(required(AFTERMATH_STAMP), ...SECURITY_STAMP_RECTS.aftermath);
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
    c.fillText(face.artist ?? '', 108, 658, 220);
    if (face.legalText) {
      c.textAlign = 'right';
      c.font = '10px "CardRenderer MTG MPlantin", Georgia';
      c.fillText(face.legalText, 454, 646, 177);
    }
  }
  c.restore();
}
