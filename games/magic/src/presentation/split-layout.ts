import { MODERN_SPLIT_WIDTH } from './split-modern-frame.js';
import { splitPanelWatermark } from './split-materials.js';
import { nativeSplitEra, hasFuse, SPLIT_PANEL_WIDTH } from './split-frame.js';
import { FACE_HEIGHT, FACE_WIDTH, type FaceRect, type RenderedCardInput } from './face-layout.js';
import { isAftermath, AFTERMATH_JOIN, AFTERMATH_BOTTOM_WIDTH } from './aftermath-frame.js';
export interface SplitPanel {
  face: RenderedCardInput;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export function splitPanels(face: RenderedCardInput): SplitPanel[] {
  if (face.frameTemplate) return [];
  if (!['split', 'aftermath'].includes(face.layout ?? '') || face.faces?.length !== 2) return [];
  const aftermath = isAftermath(face);
  const era = nativeSplitEra(face);
  const panelWidth = era === 'm15' ? MODERN_SPLIT_WIDTH : SPLIT_PANEL_WIDTH;
  return face.faces.map((half, index) => {
    const cut = aftermath ? 0.615 : 0.5;
    const inherited = {
      setCode: face.setCode,
      calibration: face.calibration,
      colorCalibration: face.colorCalibration,
      frameStyle: face.frameStyle,
      rarity: face.rarity,
      securityStamp: face.securityStamp,
      artist: face.artist,
      setSymbol: face.setSymbol,
      setSymbolSource: face.setSymbolSource,
      setSymbolMask: face.setSymbolMask,
      ...half,
      watermark: era ? splitPanelWatermark(face, half) : half.watermark,
      layout: aftermath
        ? index === 0
          ? 'aftermath-top'
          : 'aftermath-bottom'
        : era
          ? `split-${era}${hasFuse(face) && era !== 'old' ? '-fuse' : ''}`
          : 'split-half',
      frameAssetFamily: undefined,
      faces: undefined,
      rulesText: half.rulesText
        ?.split('\n')
        .filter((line) => !/^Fuse\b/.test(line))
        .join('\n'),
      rulesParagraphs: half.rulesParagraphs?.filter(
        (paragraph) => !/^Fuse\b/.test(paragraph.runs.map((run) => run.text).join('')),
      ),
      illustration: half.illustration ?? face.illustration,
      etchedIllustration:
        half.etchedIllustration ?? (!half.illustration ? face.etchedIllustration : undefined),
      illustrationCrop:
        half.illustrationCrop ??
        (!half.illustration && face.illustration
          ? ([index ? cut : 0, 0, index ? 1 - cut : cut, 1] as FaceRect)
          : undefined),
    };
    return aftermath
      ? index === 0
        ? { face: inherited, x: 0, y: 0, width: 488, height: AFTERMATH_JOIN, rotation: 0 }
        : {
            face: inherited,
            x: 488,
            y: AFTERMATH_JOIN,
            width: AFTERMATH_BOTTOM_WIDTH,
            height: 488,
            rotation: 90,
          }
      : era
        ? {
            face: inherited,
            x: 0,
            y: 680 - index * panelWidth,
            width: panelWidth,
            height: 488,
            rotation: -90,
          }
        : {
            face: inherited,
            x: 5,
            y: (index ? 333 : 648) - (splitHasFuse(face) ? 12 : 0),
            width: 333,
            height: 488,
            rotation: -90,
          };
  });
}
export function panelStyle(panel: SplitPanel) {
  return {
    left: `${(panel.x / FACE_WIDTH) * 100}%`,
    top: `${(panel.y / FACE_HEIGHT) * 100}%`,
    width: `${(panel.width / FACE_WIDTH) * 100}%`,
    height: `${(panel.height / FACE_HEIGHT) * 100}%`,
    transform: `rotate(${panel.rotation}deg)`,
  };
}
export function panelTransform(context: CanvasRenderingContext2D, panel: SplitPanel) {
  context.translate(panel.x, panel.y);
  context.rotate((panel.rotation * Math.PI) / 180);
  context.scale(panel.width / FACE_WIDTH, panel.width / FACE_WIDTH);
}
/** Rotate a child rectangle back into physical-card UVs. */
export function panelRect(panel: SplitPanel, rect: FaceRect): FaceRect {
  const x = rect[0] * panel.width,
    y = rect[1] * panel.height,
    w = rect[2] * panel.width,
    h = rect[3] * panel.height;
  if (panel.rotation === -90)
    return [
      (panel.x + y) / FACE_WIDTH,
      (panel.y - x - w) / FACE_HEIGHT,
      h / FACE_WIDTH,
      w / FACE_HEIGHT,
    ];
  if (panel.rotation === 90)
    return [
      (panel.x - y - h) / FACE_WIDTH,
      (panel.y + x) / FACE_HEIGHT,
      h / FACE_WIDTH,
      w / FACE_HEIGHT,
    ];
  return [(panel.x + x) / FACE_WIDTH, (panel.y + y) / FACE_HEIGHT, w / FACE_WIDTH, h / FACE_HEIGHT];
}

export function splitTextScale(face: RenderedCardInput) {
  return face.layout === 'split-half' ? 1.5 : face.layout === 'aftermath-bottom' ? 1.5 : 1;
}

export const splitHasFuse = hasFuse;
