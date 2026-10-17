import { calibratedPrintingStock } from './printing-calibration-materials.js';
import { SECURITY_STAMP_RECTS } from './security-stamp-geometry.js';
import { hasOvalSecurityStamp } from './security-stamp-policy.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput } from './face-layout.js';
import { modernSplitImage } from './split-modern-frame.js';
import { splitPanels } from './split-layout.js';
import { paintFittedText, paintMana, paintSetSymbol } from './canvas-text.js';
import { faceSetSymbol } from './assets.js';
import { setSymbolCrop } from './set-symbols.js';
import { isStyledSetSymbol } from './styled-set-symbols.js';
import { PLAIN_SECURITY_STAMP } from './security-stamp-assets.js';

export function paintModernSplitFrames(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
) {
  c.fillStyle = calibratedPrintingStock(face) ?? '#000';
  c.fillRect(0, 0, 488, 680);
  const panels = splitPanels(face);
  const plates = panels.map((panel) => modernSplitImage(panel.face, images));
  panels.forEach((panel, index) => {
    c.save();
    c.beginPath();
    // The complete source plate contains both panels and their rounded tails.
    // Cut in the black center gutter, retaining the shared footer below them.
    c.rect(0, index ? 0 : 324, 488, index ? 324 : 356);
    c.clip();
    c.drawImage(plates[index]!, 0, 0, 488, 680);
    c.restore();
  });
  if (panels[0]?.face.layout?.endsWith('-fuse')) {
    // Both full source plates include the shared reminder panel. Blend those
    // original textures across its join, preserving the printed outlines and
    // leaving the separate rules panels unchanged. This runs at preparation.
    const overlay = document.createElement('canvas');
    overlay.width = 488;
    overlay.height = 680;
    const o = overlay.getContext('2d')!;
    o.drawImage(plates[1]!, 0, 0, 488, 680);
    o.globalCompositeOperation = 'destination-in';
    const gradient = o.createLinearGradient(0, 344, 0, 304);
    gradient.addColorStop(0, '#0000');
    gradient.addColorStop(1, '#000');
    o.fillStyle = gradient;
    o.fillRect(0, 0, 488, 680);
    c.save();
    c.beginPath();
    c.rect(434, 0, 54, 680);
    c.clip();
    c.drawImage(plates[0]!, 0, 0, 488, 680);
    c.drawImage(overlay, 0, 0);
    c.restore();
    overlay.width = overlay.height = 0;
  }
}
export function paintModernSplitHeader(
  c: CanvasRenderingContext2D,
  half: RenderedCardInput,
  images: CanvasImages,
) {
  const size = 23.4,
    gap = 1.7,
    right = 331,
    cost = half.manaSymbols ?? [],
    cw = cost.length * size + Math.max(0, cost.length - 1) * gap;
  c.fillStyle = '#17140f';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  paintFittedText(
    c,
    half.name,
    70,
    53,
    Math.max(1, (cost.length ? right - cw - 7 : right) - 70),
    26,
    true,
  );
  cost.forEach((s, i) => paintMana(c, s, right - cw + i * (size + gap), 39.5, size, images, true));
  const url = faceSetSymbol(half),
    symbol = images.get(url ?? ''),
    crop = setSymbolCrop(half);
  const scale = symbol
    ? Math.min(26 / (symbol.width * crop[2]), 15.5 / (symbol.height * crop[3]))
    : 0;
  const w = symbol ? symbol.width * crop[2] * scale : 0,
    h = symbol ? symbol.height * crop[3] * scale : 0;
  paintFittedText(
    c,
    half.typeLine ?? '',
    70,
    277,
    (symbol ? 331 - w - 6 : 331) - 70,
    18.5,
    true,
    1,
    'CardRenderer MTG Beleren',
    0,
    half.textInk,
  );
  if (symbol) {
    const bounds = [331 - w, 277 - h / 2, w, h] as const;
    if (isStyledSetSymbol(url) || half.setSymbol) c.drawImage(symbol, ...bounds);
    else paintSetSymbol(c, symbol, half.setCode, half.rarity, ...bounds, crop);
  }
}
export function paintModernSplitFooter(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
) {
  c.fillStyle = '#fff';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const artists = [
    ...new Set((face.faces ?? []).map((f) => f.artist ?? face.artist ?? '').filter(Boolean)),
  ].join(' & ');
  c.font = '11px "CardRenderer MTG Relay", sans-serif';
  c.fillText(
    `${face.collectorNumber ?? ''} ${(face.rarity ?? 'common')[0]!.toUpperCase()}`,
    32,
    646,
  );
  c.fillText(`${face.setCode?.toUpperCase() ?? ''} • EN`, 32, 660);
  if (artists) {
    c.font = '11px "CardRenderer MTG Artist Credit", serif';
    c.fillText('a', 95, 660);
    c.font = '700 11px "CardRenderer MTG Beleren Small Caps", serif';
    c.fillText(artists, 110, 660, 193);
  }
  if (face.legalText) {
    c.textAlign = 'right';
    c.font = '10px "CardRenderer MTG MPlantin", Georgia';
    c.fillText(face.legalText, 455, 646, 170);
  }
  if (hasOvalSecurityStamp(face)) {
    const stamp = images.get(PLAIN_SECURITY_STAMP);
    if (!stamp) throw Error('Modern split authenticity stamp unavailable.');
    // Median visible oval from seven frame-normalized GRN/RNA rare scans:
    // 42–43 × 20–21 px. The old Saga asset included a black margin and left
    // only 31 × 15 px visible, four pixels below the scan center.
    c.drawImage(stamp, ...SECURITY_STAMP_RECTS.split);
  }
}
