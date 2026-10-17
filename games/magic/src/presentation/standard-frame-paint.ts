import { calibratedPrintingStock } from './printing-calibration-materials.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput, FaceRect } from './face-layout.js';
import { faceSetSymbol } from './assets.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import { STANDARD_TEMPLATE_DEFAULTS, standardTemplateParts } from './standard-frame-templates.js';
import { paintFutureTemplate } from './future-template-paint.js';
import {
  templateLabel,
  templateCost,
  templateRules,
  templateStats,
  templateFooter,
} from './template-typography.js';
import { paintFlipTemplate } from './flip-template-paint.js';

/** First rendering coverage from source defaults. No scan-fitted placements,
 * text exceptions or color profiles are borrowed from other frame families. */
export function paintStandardTemplate(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  layer?: PaintLayer,
  underArt?: HTMLCanvasElement,
) {
  const kind = face.frameTemplate;
  if (!kind) throw Error('Missing standard template');
  if (kind === 'future') return paintFutureTemplate(c, face, images, layer, underArt);
  const spec = STANDARD_TEMPLATE_DEFAULTS[kind];
  const required = (url: string) => {
    const image = images.get(url);
    if (!image) throw Error(`Standard template asset unavailable: ${url}`);
    return image;
  };
  const parts = standardTemplateParts(face);
  if (!parts) throw Error('Missing template assets');
  const base = required(parts.base);
  c.save();
  try {
    if (layer !== 'artwork') {
      c.fillStyle = calibratedPrintingStock(face) ?? '#090806';
      c.fillRect(0, 0, 488, 680);
    }
    if (underArt) c.drawImage(underArt, 0, 0, 488, 680);
    if (kind === 'battle') {
      c.translate(0, 680);
      c.rotate(-Math.PI / 2);
      c.scale(680 / 523, 488 / 375);
    } else c.scale(488 / 375, 680 / 523);
    if (parts.kind === 'flip') {
      paintFlipTemplate(c, face, images, parts, layer);
      return;
    }
    if (parts.kind !== 'battle') throw Error('Unexpected standard template branch');
    if (layer !== 'artwork') c.drawImage(required(parts.texture), 0, 0, 523, 375);
    paintIllustration(c, face, images, spec.art, layer);
    if (layer === 'artwork') return;
    c.drawImage(base, 0, 0, spec.size[0], spec.size[1]);
    c.drawImage(required(parts.border), 0, 0, 523, 375);
    if (face.defense != null) c.drawImage(required(parts.defense), 459, 322, 64, 52);
    c.shadowColor = 'transparent';
    c.fillStyle = '#17140f';
    const family = 'CardRenderer MTG Beleren';
    let title: FaceRect = spec.title;
    const cost = templateCost(c, face, images, 484, 20, 15);
    title = [title[0], title[1], Math.max(1, title[2] - cost - 5), title[3]];
    templateLabel(c, face.name, title, spec.titleSize, family);
    templateLabel(c, face.typeLine ?? '', spec.type, spec.typeSize, family, face.textInk);
    c.fillStyle = '#17140f';
    templateRules(c, face, images, spec.rules, spec.rulesSize, spec.minimumSize);
    if (kind === 'battle' && face.defense != null) {
      c.fillStyle = 'white';
      templateLabel(c, String(face.defense), spec.stats, 17, family);
    } else templateStats(c, face, spec.stats, 18, family);
    const icon = images.get(faceSetSymbol(face) ?? '');
    if (icon) {
      const [x, y, w, h] = spec.symbol,
        scale = Math.min(w / icon.width, h / icon.height);
      c.drawImage(
        icon,
        x + w - icon.width * scale,
        y + (h - icon.height * scale) / 2,
        icon.width * scale,
        icon.height * scale,
      );
    }
    templateFooter(c, face, spec.footer, 'white');
  } finally {
    c.restore();
  }
}

let templateFonts: Promise<void> | undefined;
export function loadStandardTemplateFonts(face: RenderedCardInput): Promise<void> {
  if (!face.frameTemplate || face.frameTemplate === 'battle') return Promise.resolve();
  return (templateFonts ??= Promise.all([
    document.fonts.load('400 24px "CardRenderer MTG Matrix"'),
    document.fonts.load('700 24px "CardRenderer MTG Matrix"'),
    document.fonts.load('700 24px "CardRenderer MTG Matrix Small Caps"'),
  ])
    .then(() => undefined)
    .catch((error) => {
      templateFonts = undefined;
      throw error;
    }));
}
