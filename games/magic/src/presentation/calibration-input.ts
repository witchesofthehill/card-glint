import type { RenderedCardInput } from './face-layout.js';
import { validatePrintingCalibration } from './printing-calibration-types.js';

/** Normalize an explicit policy at preparation/resolution boundaries.
 * Composite panels share their prepared material map; physical sides are resolved separately.
 * Never rewrite printing identity. */
export function calibrationFace(face: RenderedCardInput): RenderedCardInput {
  if (
    ['split', 'aftermath', 'adventure', 'prepare', 'room', 'flip'].includes(face.layout ?? '') &&
    face.faces?.some(
      (child) =>
        child.calibration !== undefined &&
        JSON.stringify(child.calibration) !== JSON.stringify(face.calibration),
    )
  )
    throw Error('Composite panels share one calibration policy; select it on the physical face.');
  if (face.calibration === undefined) return face;
  validatePrintingCalibration(face.calibration);
  const colorCalibration = face.calibration === 'source' ? undefined : 'set-hsb-v1';
  return {
    ...face,
    colorCalibration,
    ...(face.faces
      ? {
          faces: face.faces.map((child) =>
            calibrationFace({
              ...child,
              calibration: child.calibration ?? face.calibration,
            }),
          ),
        }
      : {}),
  };
}
