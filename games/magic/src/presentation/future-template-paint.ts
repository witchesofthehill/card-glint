import { paintTextInk } from './text-ink.js';
import { calibratedPrintingStock } from './printing-calibration-materials.js';
import { paintPrintingElement } from './printing-elements.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput, FaceRect } from './face-layout.js';
import { faceSetSymbol } from './assets.js';
import { paintFittedText } from './canvas-text.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import {
  futureGeometry,
  futurePalette,
  futureParts,
  futureTreatment,
  validateFutureTreatment,
} from './future-frame.js';
import { futureArtMask, prepareFutureFrame } from './future-frame-paint.js';
import { paintFutureMana } from './future-mana.js';
import { resolveCardProfile } from './profile.js';
import { futureRulesLayout } from './future-rules.js';
import { paintRulesLayout } from './rules-paint.js';
import { printingCollectorText, printingLegalText } from './printing-footer.js';
import { futureSetSymbolRect } from './future-set-symbol.js';

export function paintFutureTemplate(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  layer?: PaintLayer,
  underArt?: HTMLCanvasElement,
) {
  validateFutureTreatment(face);
  const frame = prepareFutureFrame(face, images),
    mask = futureArtMask(frame, face);
  const g = futureGeometry(face),
    parts = futureParts(face),
    p = resolveCardProfile(face),
    palette = futurePalette(face);
  c.save();
  try {
    if (!layer) {
      const stock = calibratedPrintingStock(face);
      c.fillStyle = stock ?? '#080808';
      c.fillRect(0, 0, 488, 680);
      if (stock) {
        // Baked plates retain their original undercoat behind translucent
        // pigment. Only exposed outer bleed uses the calibrated stock; the
        // plate's own stock is recolored during cached material preparation.
        c.fillStyle = '#080808';
        c.fillRect(17, 17, 454, 646);
      }
    }
    if (underArt) c.drawImage(underArt, 0, 0, 488, 680);
    if (layer !== 'printing') {
      const art = document.createElement('canvas');
      art.width = 976;
      art.height = 1360;
      try {
        const a = art.getContext('2d')!;
        a.scale(2, 2);
        const bounds: FaceRect = futureTreatment(face) === 'clear' ? [23, 22, 442, 637] : g.art;
        paintIllustration(a, face, images, bounds, 'artwork');
        a.globalCompositeOperation = 'destination-in';
        a.drawImage(mask, 0, 0, 488, 680);
        c.drawImage(art, 0, 0, 488, 680);
      } finally {
        art.width = art.height = 0;
      }
    }
    if (layer === 'artwork') return;
    c.drawImage(frame, 0, 0, 488, 680);
    if (parts.typeSymbol) c.drawImage(images.get(parts.typeSymbol)!, 31.2, 31.2, 27.3, 26);
    c.shadowColor = 'transparent';
    paintPrintingElement(c, face, 'manaCost', () => paintFutureMana(c, face, images));
    const light = palette.length === 1 && palette[0] !== 'W';
    const label = (text: string, rect: FaceRect, size: number, offsetY: number, live = false) => {
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      paintFittedText(
        c,
        text,
        rect[0] + 1.25,
        rect[1] + rect[3] / 2 + offsetY,
        rect[2],
        size,
        true,
        1,
        'CardRenderer MTG Matrix',
        0,
        live ? face.textInk : undefined,
      );
    };
    c.fillStyle = light ? '#fff' : '#111';
    // Shared lettering fit uses frozen frame-only scan poses and reserved cards;
    // keep Matrix Bold, whose glyphs fit better than the alternate MSE Medium.
    label(face.name, g.title, 30.248, 1.25);
    label(face.typeLine ?? '', g.type, 24.969, -1.5, true);
    const rulesInk = p.land && palette.length === 2 && !palette.includes('W') ? '#fff' : '#111';
    // The textless treatment is physical. Additional Oracle text does not
    // switch it to the regular frame or silently change the artwork aperture.
    if (futureTreatment(face) !== 'full-art')
      paintRulesLayout(c, futureRulesLayout(c, face, g.rules), images, undefined, 0, rulesInk);
    if (face.power != null && face.toughness != null) {
      c.fillStyle = light ? '#fff' : '#111';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '700 29.97px "CardRenderer MTG Matrix Small Caps"';
      c.save();
      c.translate(g.stats[0] + g.stats[2] / 2 - 1.5, g.stats[1] + g.stats[3] / 2 - 0.25);
      c.scale(0.99, 1);
      paintTextInk(c, `${face.power}/${face.toughness}`, 0, 0, g.stats[2] / 0.99, face.textInk);
      c.restore();
    }
    const symbol = images.get(faceSetSymbol(face) ?? '');
    paintPrintingElement(c, face, 'setSymbol', () => {
      if (symbol) {
        const [x, y, w, h] = g.symbol,
          scale = Math.min(w / symbol.width, h / symbol.height),
          rect = futureSetSymbolRect(face) ?? [
            x + (w - symbol.width * scale) / 2,
            y + (h - symbol.height * scale) / 2,
            symbol.width * scale,
            symbol.height * scale,
          ];
        c.drawImage(symbol, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      }
    });
    c.fillStyle = p.land || light ? '#fff' : '#111';
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    // The regular-frame artist fit does not transfer to the textless source:
    // retain its original proportions instead of changing individual cards.
    const right = face.power != null && face.toughness != null ? 361 : 442,
      full = futureTreatment(face) === 'full-art',
      artistSize = full ? 16.6 : 17.845,
      artistY = full ? 627 : 626.5;
    c.font = `400 ${artistSize}px "CardRenderer MTG Matrix"`;
    const artist = face.artist ?? '';
    paintPrintingElement(c, face, 'artist', () => {
      c.fillText(artist, right, artistY, right - 70);
      const brush = parts.brush ? images.get(parts.brush) : undefined;
      if (brush) c.drawImage(brush, right - c.measureText(artist).width - 40, artistY - 10, 36, 8);
    });
    const legal = printingLegalText(face),
      number = printingCollectorText(face, false);
    if (legal || number) {
      c.font = '11.804px "CardRenderer MTG MPlantin"';
      const line = [legal, number].filter(Boolean).join(' ');
      if (!face.printingElements?.legal?.offset && !face.printingElements?.collector?.offset)
        c.fillText(line, right - 0.25, 641.25, right - 40);
      else {
        const width = c.measureText(line).width,
          fit = Math.min(1, (right - 40) / Math.max(1, width));
        c.save();
        c.translate(right - 0.25, 641.25);
        c.textAlign = 'left';
        const run = (text: string, x: number) => {
          c.save();
          c.scale(fit, 1);
          c.fillText(text, x, 0);
          c.restore();
        };
        if (legal) paintPrintingElement(c, face, 'legal', () => run(legal, -width));
        if (number)
          paintPrintingElement(c, face, 'collector', () =>
            run(number, -c.measureText(number).width),
          );
        c.restore();
      }
    }
  } finally {
    frame.width = frame.height = mask.width = mask.height = 0;
    c.restore();
  }
}
