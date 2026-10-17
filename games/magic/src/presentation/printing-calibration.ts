import { colorCalibrationCoverage } from './color-calibration-coverage.js';
import { eighthBasicProfile } from './eighth-basic-profile.js';
import { isRevisedLand, REVISED_LAND_ASSET } from './revised-land-frame.js';
import type { RenderedCardInput } from './face-layout.js';
import type { FrameHsb } from './frame-hsb.js';
import type {
  PrintingCalibrationComponent,
  PrintingCalibrationReport,
} from './printing-calibration-types.js';
import { printingCalibrationProfiles } from './printing-calibration-types.js';
import {
  printingCalibrationMaterials,
  calibratedManaTarget,
  supportsModernCalibration,
} from './printing-calibration-materials.js';
export * from './printing-calibration-types.js';

const pigment = (m: FrameHsb) =>
  'mask' in m ||
  m.hueDegrees !== 0 ||
  m.saturationScale !== 1 ||
  m.brightnessScale !== 1 ||
  m.rgbScale !== undefined ||
  m.valueGamma !== undefined;
/** Coverage is descriptive, not a full-card accuracy guarantee. No IO or mutable tables escape. */
export function resolvePrintingCalibration(input: RenderedCardInput): PrintingCalibrationReport {
  const result = printingCalibrationMaterials(input),
    { face, materials, assets } = result;
  const entries = Object.entries(materials);
  const component = (urls: string[]): PrintingCalibrationComponent => {
    if (!urls.length) return { status: 'source', assets: [] };
    const fallback = urls.filter((url) => result.fallbackAssets.includes(url));
    return {
      status: fallback.length === urls.length ? 'fallback' : fallback.length ? 'mixed' : 'measured',
      ...(fallback.length === urls.length
        ? { profile: 'm21-modern', revision: 1 }
        : !fallback.length
          ? { profile: `printing:${face.setCode?.toLowerCase() ?? ''}`, revision: 1 }
          : {}),
      assets: urls,
    };
  };
  const textBox = component(
    entries
      .filter(
        ([url, m]) =>
          pigment(m) && ('mask' in m || url === assets.boxes || url.includes('/pt_boxes/')),
      )
      .map(([url]) => url),
  );
  const frame = component(
    entries
      .filter(
        ([url, m]) =>
          pigment(m) && ((url !== assets.boxes && !url.includes('/pt_boxes/')) || 'mask' in m),
      )
      .map(([url]) => url),
  );
  const coverage = colorCalibrationCoverage(face);
  const basic = eighthBasicProfile(face);
  const procedural = basic?.frame ?? (isRevisedLand(face) ? REVISED_LAND_ASSET : undefined);
  if (procedural && coverage.frame) {
    for (const c of [frame, textBox])
      Object.assign(c, {
        status: 'measured',
        profile: `printing:${face.setCode?.toLowerCase()}`,
        revision: 1,
        assets: [procedural],
      });
  }
  const interiorInk = component(entries.filter(([, m]) => m.blackPoint).map(([url]) => url));
  const symbols = new Set([
    ...(face.manaSymbols ?? []),
    ...[...(face.rulesText ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!),
    ...(face.rulesParagraphs ?? []).flatMap((p) =>
      p.runs.flatMap((r) => [...r.text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)),
    ),
  ]);
  const correctedSymbols = [...symbols].filter((s) =>
    calibratedManaTarget(face, /^\d+$/.test(s) ? 'N' : s),
  );
  const manaSymbols: PrintingCalibrationComponent = correctedSymbols.length
    ? {
        status: 'measured',
        profile: `printing:${face.setCode?.toLowerCase() ?? ''}`,
        revision: 1,
        assets: [],
        symbols: correctedSymbols,
      }
    : basic?.glyph
      ? { status: 'measured', profile: 'printing:8ed', revision: 1, assets: [basic.glyph] }
      : { status: 'source', assets: [] };
  const border: PrintingCalibrationComponent = result.border
    ? {
        status: result.fallbackStock ? 'fallback' : 'measured',
        profile: result.fallbackStock
          ? 'm21-modern'
          : `printing:${face.setCode?.toLowerCase() ?? ''}`,
        revision: 1,
        color: result.border,
        assets: entries.filter(([, m]) => m.outerStock).map(([url]) => url),
      }
    : { status: 'source', assets: [] };
  const notices: string[] = [];
  if (result.fallbackStock || result.fallbackAssets.length)
    notices.push(
      'Using provisional M21 defaults for compatible materials; this is not a measured calibration of this printing.',
    );
  if (
    (face.calibration === 'auto' || typeof face.calibration === 'object') &&
    [frame, textBox, interiorInk].some((c) => c.status === 'source')
  )
    notices.push('Some frame materials retain source colors or ink levels.');
  return {
    mode: face.calibration ?? 'legacy',
    components: { frame, textBox, border, interiorInk, manaSymbols },
    notices,
  };
}
/** The host can show compatible named defaults beside the three policy choices. */
export function printingCalibrationOptions(face: RenderedCardInput) {
  return printingCalibrationProfiles.map((profile) => ({
    ...profile,
    supported: supportsModernCalibration(face),
    ...(!supportsModernCalibration(face) ? { reason: 'Requires a modern frame.' } : {}),
  }));
}
