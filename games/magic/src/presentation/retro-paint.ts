import { paintTextInk } from './text-ink.js';
import { rulesInkVisible } from './rules-visibility.js';
import { calibratedPrintingStock } from './printing-calibration-materials.js';
import { paintPrintingElement } from './printing-elements.js';
import { paintRetroStockBorder, paintRetroStockWindow } from './retro-stock-border.js';
import { legendsFrame } from './legends-frame.js';
import { earlyExpansionFrame } from './early-expansion-frame.js';
import {
  adjustedSymbolBounds,
  paintAdjustedSymbols,
  spacedManaBounds,
} from './symbol-adjustment.js';
import { retroManaPlacement } from './retro-mana.js';
import { printingManaAdjustment } from './printing-mana-adjustment.js';
import { titleTranslation } from './title-placement.js';
import { retroTypePlacement } from './retro-type.js';
import { paintPrintingLegendsFooter } from './printing-legends-footer.js';
import { paintUrzaFooter } from './retro-urza-footer.js';
import { isStyledSetSymbol } from './styled-set-symbols.js';
import { calibratedStyledSymbolBounds } from './styled-symbol-placement.js';
import { paintRetroPaper } from './retro-paper.js';
import { paintRetroGoldBevel } from './retro-gold-bevel.js';
import { retroSymbolGeometry } from './retro-symbol-geometry.js';
import { retroSymbolPalette } from './retro-symbol-material.js';
import { historicalBackingKey } from './historical-symbol-backing.js';
import { usesMonochromeSetSymbol, historicalSetOutline } from './historical-set-symbol.js';
import { retroBasicPrinting } from './retro-basic.js';
import { isRevisedLand } from './revised-land-frame.js';
import { usesRevisedFrameGeometry } from './revised-frame-geometry.js';
import { paintRevisedLandText } from './revised-land-text.js';
import { cardStock, type FaceRect, type RenderedCardInput } from './face-layout.js';
import type { CanvasImages } from './canvas-assets.js';
import {
  retroRects,
  retroFrameAsset,
  retroBorder,
  retroBorderMask,
  retroInk,
  retroSetSymbol,
  retroPx,
  retroFrameFilter,
  retroFamily,
  retroBasicSymbol,
  retroStock,
} from './retro-frame.js';
import { paintIllustration, type PaintLayer } from './illustration-paint.js';
import { paintMana, paintSetSymbol } from './canvas-text.js';
import { paintEarlyCost, paintRevisedCost, paintEarlyMana } from './historic-cost.js';
import { usesEarlyCredits, paintEarlyCredits } from './early-credits.js';
import { paintEarlyExpansionArtist } from './early-expansion-artist.js';
import { paintRulesLayout } from './rules-paint.js';
import { retroTextLayout } from './retro-rules.js';
import {
  usesRevisedLettering,
  paintRevisedTitle,
  paintRevisedStats,
  paintRevisedCredits,
} from './revised-lettering.js';
import {
  retroPrintDetails,
  retroStatsPlacement,
  retroStatsText,
  paintHistoricMana,
  paintRevisedMana,
  originalRulesSymbols,
  paintOutlinedRetroSet,
  paintRetroCredits,
} from './retro-details.js';
export function paintRetroFace(
  c: CanvasRenderingContext2D,
  face: RenderedCardInput,
  images: CanvasImages,
  underArt?: HTMLCanvasElement,
  layer?: PaintLayer,
) {
  const rect = retroRects(face),
    details = retroPrintDetails(face),
    revised = usesRevisedLettering(face);
  if (layer === 'artwork') {
    paintIllustration(c, face, images, retroPx(rect.art), layer);
    return;
  }
  const calibratedStock = calibratedPrintingStock(face);
  const stock = calibratedStock ?? retroStock(face);
  c.fillStyle = stock;
  c.fillRect(0, 0, 488, 680);
  c.fillStyle = '#686050';
  c.fillRect(24.4, 27.2, 439.2, 625.6);
  c.fillStyle = '#e5dec5';
  c.fillRect(...retroPx(rect.rules));
  c.fillStyle = '#746b58';
  c.fillRect(...retroPx(rect.art));
  if (underArt) c.drawImage(underArt, 0, 0, 488, 680);
  paintIllustration(c, face, images, retroPx(rect.art), layer);
  const frame = images.get(retroFrameAsset(face));
  if (frame) {
    c.save();
    c.filter = retroFrameFilter(face);
    c.drawImage(frame, ...retroPx(rect.frame));
    paintRetroPaper(c, frame, retroFrameAsset(face));
    if (retroFrameAsset(face).endsWith('/seventh/regular/m.png')) paintRetroGoldBevel(c, frame);
    c.restore();
  }
  const stockWindow = earlyExpansionFrame(face)?.stockWindow ?? legendsFrame(face)?.stockWindow;
  if (stockWindow) {
    paintRetroStockWindow(c, retroPx(stockWindow), stock);
  } else if (isRevisedLand(face) || usesRevisedFrameGeometry(face)) {
    c.save();
    c.fillStyle = stock;
    c.beginPath();
    c.rect(0, 0, 488, 680);
    c.rect(24, 29, 440, 623);
    c.fill('evenodd');
    c.strokeStyle = '#30312e';
    c.lineWidth = 1.5;
    c.strokeRect(24.5, 29.5, 439, 622);
    c.restore();
  } else if (retroBorder(face) !== 'black' || retroFamily(face) === 'fourth') {
    const mask = images.get(retroBorderMask(face));
    if (mask) paintRetroStockBorder(c, mask, retroPx(rect.frame), stock);
  }
  c.fillStyle = retroInk(face);
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.letterSpacing = '0px';
  const [x, y, w, h] = retroPx(rect.title),
    cost = face.manaSymbols ?? [],
    mana = retroManaPlacement(face),
    size = mana?.[3] ?? details?.manaSize ?? 23.4,
    gap = mana ? mana[2] - size : (details?.manaGap ?? 1.7),
    costW = cost.length * (size + gap),
    costX = mana
      ? mana[0] + size / 2 - costW + gap
      : details
        ? details.manaRight - costW + gap
        : x + w - costW;
  const early = ['lea', '2ed'].includes(face.setCode?.toLowerCase() ?? '');
  const manaBounds: FaceRect =
    revised || early
      ? [
          (revised ? 435 : 432) - Math.max(0, cost.length - 1) * 27 - (revised ? 23.4 : 23.9) / 2,
          (revised ? 44.5 : 46) - (revised ? 23.4 : 23.9) / 2,
          Math.max(0, cost.length - 1) * 27 + (revised ? 23.4 : 23.9),
          revised ? 23.4 : 23.9,
        ]
      : [
          costX,
          mana ? mana[1] - size / 2 : (details?.manaTop ?? y + h / 2 - size / 2),
          Math.max(0, costW - gap),
          size,
        ];
  const costAdjustment = printingManaAdjustment(face);
  const spacedBounds = spacedManaBounds(manaBounds, cost.length, costAdjustment);
  const adjustedMana = adjustedSymbolBounds(spacedBounds, costAdjustment);
  c.shadowColor = '#000b';
  c.shadowOffsetX = c.shadowOffsetY = c.getTransform().a;
  c.font = '27.8px "CardRenderer MTG Goudy", Georgia';
  const titleX = details?.titleX ?? x;
  const titleY = y + h / 2 + (details?.titleYOffset ?? 0),
    titleWidth = Math.max(
      1,
      cost.length
        ? costX + adjustedMana[0] - manaBounds[0] - titleX - 5
        : details?.titleX == null
          ? w - 5
          : x + w - titleX - 5,
    );
  c.save();
  c.translate(...titleTranslation(face, 'retro'));
  if (isRevisedLand(face)) paintRevisedLandText(c, face.name, 'title', titleWidth);
  else if (revised) paintRevisedTitle(c, face.name, titleX, titleY, titleWidth);
  else c.fillText(face.name, titleX, titleY, titleWidth);
  c.restore();
  const modernSymbols =
    face.symbolStyle === 'modern' ||
    (face.symbolStyle === undefined && face.wordingMode === 'oracle');
  const originalSymbols =
    face.symbolStyle === 'original' ||
    (face.symbolStyle === undefined && face.wordingMode === 'original');
  const originalSun =
    originalSymbols && ['lea', 'leb', '2ed', '3ed'].includes(face.setCode?.toLowerCase() ?? '');
  paintPrintingElement(c, face, 'manaCost', () =>
    paintAdjustedSymbols(c, spacedBounds, costAdjustment, () => {
      if (revised) paintRevisedCost(c, cost, images, modernSymbols, costAdjustment);
      else if (['lea', '2ed'].includes(face.setCode?.toLowerCase() ?? ''))
        paintEarlyCost(c, cost, images, modernSymbols, costAdjustment);
      else
        cost.forEach((s, i) =>
          (originalSun ? paintEarlyMana : paintMana)(
            c,
            s,
            costX + i * (size + gap) - (cost.length - 1 - i) * (costAdjustment?.spacing ?? 0),
            mana ? mana[1] - size / 2 : (details?.manaTop ?? y + h / 2 - size / 2),
            size,
            images,
            false,
            costAdjustment,
          ),
        );
    }),
  );
  const [tx, ty, tw, th] = retroPx(rect.type),
    symbolUrl = retroSetSymbol(face) ?? '',
    icon = images.get(symbolUrl),
    geometry = retroSymbolGeometry(face),
    palette = retroSymbolPalette(face);
  const setScale = icon ? Math.min(44 / icon.width, (details?.setHeight ?? 23.4) / icon.height) : 0;
  const setWidth = geometry?.width ?? (icon?.width ?? 0) * setScale,
    setHeight = geometry?.height ?? (icon?.height ?? 0) * setScale;
  const baseBounds = [
    (geometry?.right ?? details?.setRight ?? tx + tw) - setWidth,
    (geometry?.centerY ?? details?.setCenterY ?? ty + th / 2) - setHeight / 2,
    setWidth,
    setHeight,
  ] as const;
  const originalBounds = calibratedStyledSymbolBounds(face, symbolUrl, baseBounds, 'retro');
  const symbolBounds = adjustedSymbolBounds(originalBounds, face.symbolAdjustment?.set);
  const typePlacement = retroTypePlacement(face);
  c.font = `${typePlacement.fontSize}px "CardRenderer MTG MPlantin", Georgia`;
  const paintType = isRevisedLand(face)
    ? (text: string, _x: number, _y: number, width: number) =>
        paintRevisedLandText(c, text, 'type', width, face.textInk)
    : (text: string, x: number, y: number, width: number) =>
        paintTextInk(c, text, x, y, width, face.textInk, 'type');
  c.save();
  c.translate(typePlacement.dx, typePlacement.dy);
  paintType(
    retroBasicPrinting(face)?.typeLine ?? face.typeLine ?? '',
    details?.typeX ?? tx,
    ty + th / 2,
    icon
      ? Math.max(
          1,
          Math.min(
            tw - 48,
            geometry ? geometry.right - geometry.width - tx - 6 : tw,
            symbolBounds !== baseBounds ? symbolBounds[0] - (details?.typeX ?? tx) - 6 : tw,
          ),
        )
      : tw,
  );
  c.restore();
  paintPrintingElement(c, face, 'setSymbol', () =>
    paintAdjustedSymbols(c, originalBounds, face.symbolAdjustment?.set, () => {
      if (icon) {
        const scale = Math.min(44 / icon.width, (details?.setHeight ?? 23.4) / icon.height);
        const width = geometry?.width ?? icon.width * scale,
          height = geometry?.height ?? icon.height * scale,
          right = geometry?.right ?? details?.setRight ?? tx + tw,
          centerY = geometry?.centerY ?? details?.setCenterY ?? ty + th / 2,
          crop = geometry?.crop ?? ([0, 0, 1, 1] as const);
        const styled = isStyledSetSymbol(symbolUrl);
        const backing = !styled && !face.setSymbol && images.get(historicalBackingKey(symbolUrl));
        if (backing) {
          c.save();
          c.shadowColor = 'transparent';
          // ARN's printed blade is gray. Keep this tone local to that printing;
          // the shared white stencil also supplies Chronicles.
          if (face.setCode?.toLowerCase() === 'arn') c.filter = 'brightness(0.7)';
          c.drawImage(
            backing,
            crop[0] * backing.width,
            crop[1] * backing.height,
            crop[2] * backing.width,
            crop[3] * backing.height,
            right - width,
            centerY - height / 2,
            width,
            height,
          );
          c.restore();
        }
        if (styled || face.setSymbol) {
          c.save();
          c.shadowColor = 'transparent';
          // Complete styled assets already contain opaque holes, rims and gradients.
          // Keyrune viewport crops and recoloring must never touch these vectors.
          c.drawImage(icon, ...originalBounds);
          c.restore();
        } else if (palette || details || usesMonochromeSetSymbol(face.setCode))
          paintOutlinedRetroSet(
            c,
            icon,
            right - width,
            centerY - height / 2,
            width,
            height,
            geometry?.outline ??
              (palette ? 2 : (details?.setOutline ?? historicalSetOutline(face.setCode))),
            crop,
            palette,
            geometry?.sampling,
          );
        else
          paintSetSymbol(
            c,
            icon,
            face.setCode,
            face.rarity,
            tx + tw - icon.width * scale,
            ty + th / 2 - (icon.height * scale) / 2,
            icon.width * scale,
            icon.height * scale,
          );
      }
    }),
  );
  c.shadowColor = 'transparent';
  const [rx, ry, rw, rh] = retroPx(rect.rules);
  c.fillStyle = '#17140f';
  const basic = images.get(retroBasicSymbol(face) ?? '');
  if (basic && rulesInkVisible(c)) {
    const scale = Math.min((rw * 0.4) / basic.width, (rh * 0.75) / basic.height);
    c.drawImage(
      basic,
      rx + (rw - basic.width * scale) / 2,
      ry + (rh - basic.height * scale) / 2,
      basic.width * scale,
      basic.height * scale,
    );
  } else {
    const layout = retroTextLayout(c, face);
    if (layout)
      paintRulesLayout(
        c,
        layout,
        images,
        modernSymbols
          ? paintMana
          : originalSymbols
            ? originalRulesSymbols(face.setCode)
            : face.setCode?.toLowerCase() === '3ed'
              ? paintRevisedMana
              : details
                ? paintHistoricMana
                : paintMana,
        face.setCode?.toLowerCase() === 'lea' ? 0.012 : 0,
      );
  }
  if (paintPrintingLegendsFooter(c, face)) {
    paintRetroExtras(c, face, true);
    return;
  }
  if (paintUrzaFooter(c, face)) return;
  c.shadowColor = details?.statsOpaqueShadow ? '#000' : '#000b';
  if (details) c.shadowOffsetX = c.shadowOffsetY = details.statsShadow * c.getTransform().a;
  c.fillStyle = retroInk(face);
  c.font = '27.8px "CardRenderer MTG MPlantin", Georgia';
  c.textBaseline = 'middle';
  if (face.power != null && face.toughness != null) {
    const [sx, sy, sw, sh] = retroPx(rect.stats);
    const placement = retroStatsPlacement(face);
    c.textAlign = placement ? 'right' : 'center';
    if (revised) paintRevisedStats(c, retroStatsText(face), sy + sh / 2, face.textInk);
    else
      paintTextInk(
        c,
        retroStatsText(face),
        placement?.right ?? sx + sw / 2,
        sy + sh / 2 + (placement?.yOffset ?? 0),
        placement?.maxWidth ?? sw,
        face.textInk,
      );
  }
  if (details) paintRetroCredits(c, face, details);
  else
    paintPrintingElement(c, face, 'artist', () => {
      if (paintEarlyExpansionArtist(c, face)) return;
      if (isRevisedLand(face) && face.artist)
        paintRevisedLandText(c, `Illus. © ${face.artist}`, 'artist', 390);
      else if (revised && face.artist) paintRevisedCredits(c, face.artist);
      else if (face.artist && usesEarlyCredits(face)) paintEarlyCredits(c, face.artist);
      else if (face.artist) {
        const [fx, fy, fw, fh] = retroPx(rect.footer);
        c.textAlign = 'center';
        c.font = '15.6px "CardRenderer MTG MPlantin", Georgia';
        c.fillText(`Illus. ${face.artist}`, fx + fw / 2, fy + fh / 2, fw);
      }
    });
  paintRetroExtras(c, face, !details);
  c.shadowColor = 'transparent';
}

function paintRetroExtras(c: CanvasRenderingContext2D, face: RenderedCardInput, legal: boolean) {
  if (legal && face.legalText)
    paintPrintingElement(c, face, 'legal', () => {
      c.save();
      c.shadowColor = 'transparent';
      c.fillStyle = cardStock(face.setCode, face.borderColor).ink;
      c.font = '10px "CardRenderer MTG MPlantin", Georgia';
      c.textAlign = 'left';
      c.fillText(face.legalText!, 49, 646, 390);
      c.restore();
    });
  const customNumber = face.collectorNumber?.trim();
  if (customNumber && face.collectorTotal !== undefined)
    paintPrintingElement(c, face, 'collector', () => {
      c.save();
      c.shadowColor = 'transparent';
      c.fillStyle = cardStock(face.setCode, face.borderColor).ink;
      c.font = '10px "CardRenderer MTG MPlantin", Georgia';
      c.textAlign = 'right';
      c.fillText(
        customNumber + (face.collectorTotal ? '/' + face.collectorTotal : ''),
        439,
        660,
        180,
      );
      c.restore();
    });
  c.shadowColor = 'transparent';
}
