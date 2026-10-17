import type { RenderedCardInput } from './face-layout.js';
import type { CanvasImages } from './canvas-assets.js';
import { retroDualBitmapCache } from './material-bitmap-cache.js';
import { calibratedFrameMaterials } from './printing-calibration-materials.js';
import { retroDualFrame, retroLandColors } from './retro-dual-frame.js';
import { colorAbuDualPinline } from './abu-dual-pinline.js';
import { isRevisedLand } from './revised-land-frame.js';
import { prepareRevisedLand } from './revised-land-material.js';

/** One cached static composite per source/palette. Mask RGB is visualization
 * only: destination-in uses alpha and preserves the original art aperture. */
export async function prepareRetroDualFrame(
  face: RenderedCardInput,
  images: CanvasImages,
  signal: AbortSignal,
): Promise<{ images: CanvasImages; dispose: () => void }> {
  if (isRevisedLand(face)) return prepareRevisedLand(face, images, signal);
  const plan = retroDualFrame(face);
  if (!plan) return { images, dispose() {} };
  const required = (url: string) => {
    const image = images.get(url);
    if (!image) throw Error(`Historical dual-land asset unavailable: ${url}`);
    return image;
  };
  const base = required(plan.base),
    overlay = required(plan.overlay),
    mask = required(plan.mask);
  const [lease] = await retroDualBitmapCache.acquireMany(
    [
      {
        key: JSON.stringify([
          'abu-dual-frame-v2',
          plan,
          base.width,
          base.height,
          calibratedFrameMaterials(face),
        ]),
        bytes: base.width * base.height * 4,
        build: async () => {
          const canvas = document.createElement('canvas'),
            layer = document.createElement('canvas');
          canvas.width = layer.width = base.width;
          canvas.height = layer.height = base.height;
          try {
            const c = canvas.getContext('2d'),
              l = layer.getContext('2d');
            if (!c || !l) throw Error('Historical dual-land preparation needs Canvas2D.');
            l.drawImage(overlay, 0, 0, base.width, base.height);
            l.globalCompositeOperation = 'destination-in';
            l.drawImage(mask, 0, 0, base.width, base.height);
            c.drawImage(base, 0, 0);
            c.drawImage(layer, 0, 0);
            const pixels = c.getImageData(0, 0, base.width, base.height);
            colorAbuDualPinline(pixels, retroLandColors(face));
            c.putImageData(pixels, 0, 0);
            return await createImageBitmap(canvas);
          } finally {
            canvas.width = canvas.height = layer.width = layer.height = 0;
          }
        },
      },
    ],
    signal,
  );
  const derived = Object.assign(new Map(images), images);
  derived.set(plan.base, lease!.value);
  return { images: derived, dispose: () => lease!.release() };
}
