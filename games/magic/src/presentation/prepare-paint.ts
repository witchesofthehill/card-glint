import { calibratedPrintingStock } from './printing-calibration-materials.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput } from './face-layout.js';
import { PREPARE_RECTS, preparedSpell } from './prepare-frame.js';
import { prepareFrameImage } from './prepare-material.js';
import { prepareRuleLayouts } from './prepare-rules.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import { paintFittedText, paintMana, paintSetSymbol } from './canvas-text.js';
import { paintRulesLayout } from './rules-paint.js';
import { faceSetSymbol } from './assets.js';
import { setSymbolCrop } from './set-symbols.js';
import { isStyledSetSymbol } from './styled-set-symbols.js';
import { paintAdventureFooter } from './adventure-footer.js';

export function paintPrepareFrame(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
) {
  c.drawImage(prepareFrameImage(face, images), 0, 0, 488, 680);
}
function headers(c: CanvasRenderingContext2D, face: RenderedCardInput, images: CanvasImages) {
  const title = (input: RenderedCardInput, inset: boolean) => {
    const cost = input.manaSymbols ?? [],
      size = inset ? 19.8 : 23.4,
      gap = inset ? 1.2 : 1.8,
      left = inset ? (1042 / 2010) * 488 : 41.7,
      right = 452,
      width = cost.length * size + Math.max(0, cost.length - 1) * gap;
    c.fillStyle = inset ? '#fff' : '#17140f';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    paintFittedText(
      c,
      input.name,
      left,
      inset ? 444 : 52,
      (cost.length ? right - width - (inset ? 4 : 8) : right) - left,
      inset ? 20 : 26,
      true,
    );
    cost.forEach((symbol, i) =>
      paintMana(
        c,
        symbol,
        right - width + i * (size + gap),
        inset ? 434.5 : 38.7,
        size,
        images,
        true,
      ),
    );
  };
  title(face, false);
  const url = faceSetSymbol(face),
    icon = images.get(url ?? ''),
    crop = setSymbolCrop(face);
  const scale = icon ? Math.min(58.56 / (icon.width * crop[2]), 27.9 / (icon.height * crop[3])) : 0;
  const w = icon ? icon.width * crop[2] * scale : 0,
    h = icon ? icon.height * crop[3] * scale : 0;
  const bounds = [450.3 - w, 402 - h / 2, w, h] as const;
  paintFittedText(
    c,
    face.typeLine ?? '',
    41.7,
    401.5,
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
  const spell = preparedSpell(face);
  title(spell, true);
  paintFittedText(
    c,
    spell.typeLine ?? '',
    (1042 / 2010) * 488,
    477,
    195.2,
    20,
    true,
    1,
    'CardRenderer MTG Beleren',
    0,
    spell.textInk,
  );
}
export function paintPrepareFace(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  underArt?: HTMLCanvasElement,
  layer?: PaintLayer,
) {
  preparedSpell(face);
  c.save();
  c.fillStyle = calibratedPrintingStock(face) ?? '#000';
  c.fillRect(0, 0, 488, 680);
  if (underArt) c.drawImage(underArt, 0, 0, 488, 680);
  if (layer !== 'artwork') paintPrepareFrame(c, face, images);
  const [x, y, w, h] = PREPARE_RECTS.art;
  paintIllustration(c, face, images, [x * 488, y * 680, w * 488, h * 680], layer);
  if (layer !== 'artwork') {
    headers(c, face, images);
    const rules = prepareRuleLayouts(c, face);
    paintRulesLayout(c, rules.permanent, images);
    paintRulesLayout(c, rules.spell, images);
    // Prepared uses the same M15 statistics/legal geometry and small-caps
    // lettering as Adventure, with the newer collector format by default.
    paintAdventureFooter(
      c,
      { ...face, collectorFormat: face.collectorFormat ?? 'rarity-first' },
      images,
    );
  }
  c.restore();
}
