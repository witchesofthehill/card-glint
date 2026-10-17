import { calibratedPrintingStock } from './printing-calibration-materials.js';
import type { CanvasImages } from './canvas-assets.js';
import { cardStock, type RenderedCardInput } from './face-layout.js';
import { mountedSecurityStamp } from './security-stamp-paint.js';
import { blendStampRim } from './security-stamp-rim.js';

/** The source mounts include an opaque black footer rectangle. Bind its black
 * anchor to this pack's black stock so it cannot appear as a separate square.
 * Preserve alpha and brighter ring/hologram pixels; prepare once, never per frame. */
export function securityStampMaterialJobs(face: RenderedCardInput, images: CanvasImages) {
  const stamp = mountedSecurityStamp(face);
  if (!stamp) return [];
  const blackStock = cardStock(face.setCode, face.borderColor).border === '#090806';
  if (!blackStock && !stamp.rightImage) return [];
  const target =
    face.calibration === undefined ? '#090806' : (calibratedPrintingStock(face) ?? '#090806');
  const rgb = [1, 3, 5].map((i) => parseInt(target.slice(i, i + 2), 16));
  const source = images.get(stamp.image);
  if (!source) throw Error('Authenticity stamp asset is unavailable.');
  const right = stamp.rightImage ? images.get(stamp.rightImage) : undefined;
  if (stamp.rightImage && !right) throw Error('Authenticity stamp asset is unavailable.');
  if (right && (right.width !== source.width || right.height !== source.height))
    throw Error('Authenticity stamp palette sources have different dimensions.');
  return [
    {
      url: stamp.image,
      key: JSON.stringify([
        'security-stamp-frame-palette-v5',
        stamp.image,
        stamp.rightImage ?? null,
        blackStock,
        target,
        source.width,
        source.height,
      ]),
      bytes: source.width * source.height * 4,
      build: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        try {
          const c = canvas.getContext('2d', { willReadFrequently: true });
          if (!c) throw Error('Stamp preparation needs Canvas2D.');
          let rightPixels: ImageData | undefined;
          if (right) {
            c.drawImage(right, 0, 0);
            rightPixels = c.getImageData(0, 0, canvas.width, canvas.height);
            c.clearRect(0, 0, canvas.width, canvas.height);
          }
          c.drawImage(source, 0, 0);
          const pixels = c.getImageData(0, 0, canvas.width, canvas.height);
          if (rightPixels) blendStampRim(pixels, rightPixels);
          for (let i = 0; blackStock && i < pixels.data.length; i += 4) {
            if (!pixels.data[i + 3]) continue;
            const maximum = Math.max(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!);
            if (maximum >= 24) continue;
            const weight = (1 - maximum / 24) ** 2;
            pixels.data[i] = pixels.data[i]! + rgb[0]! * weight;
            pixels.data[i + 1] = pixels.data[i + 1]! + rgb[1]! * weight;
            pixels.data[i + 2] = pixels.data[i + 2]! + rgb[2]! * weight;
          }
          c.putImageData(pixels, 0, 0);
          return await createImageBitmap(canvas);
        } finally {
          canvas.width = canvas.height = 0;
        }
      },
    },
  ];
}
