import { calibratedPrintingStock } from './printing-calibration-materials.js';
import type { CanvasImages } from './canvas-assets.js';
import type { RenderedCardInput } from './face-layout.js';
import { resolveCardProfile } from './profile.js';
import {
  PREPARE_ROOT,
  prepareAssets,
  prepareColors,
  prepareCrown,
  prepareMask,
  preparePlate,
  prepareMaterial,
  preparedSpell,
} from './prepare-frame.js';
import { adventureHybrid } from './adventure-frame.js';

const cache = new Map<string, HTMLCanvasElement>();
const ids = new WeakMap<ImageBitmap, number>();
let nextId = 0,
  bytes = 0;
const id = (image: ImageBitmap) => {
  if (!ids.has(image)) ids.set(image, ++nextId);
  return ids.get(image)!;
};
/** Bounded prepared composites. Sources remain owned by their decoded leases;
 * no image decoding or mask readback occurs during frame submission. */
export function prepareFrameImage(face: RenderedCardInput, images: CanvasImages) {
  const spell = preparedSpell(face);
  const required = (url: string) => {
    const source = images.get(url);
    if (!source) throw Error(`Prepared asset unavailable: ${url}`);
    return source;
  };
  const sources = prepareAssets(face).map(required);
  const colors = prepareColors(face),
    spellColors = prepareColors(spell),
    legendary = resolveCardProfile(face).legendary;
  const key = JSON.stringify([
    colors,
    spellColors,
    legendary,
    adventureHybrid(spell),
    sources.map(id),
  ]);
  const old = cache.get(key);
  if (old) {
    cache.delete(key);
    cache.set(key, old);
    return old;
  }
  const base = required(preparePlate(face)),
    w = base.width,
    h = base.height;
  const scratch = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const output = scratch(),
    c = output.getContext('2d')!;
  c.drawImage(base, 0, 0);
  const masked = (source: CanvasImageSource, mask: string, grayscale = false) => {
    const part = scratch(),
      p = part.getContext('2d')!;
    if (grayscale) p.filter = 'grayscale(1)';
    p.drawImage(source, 0, 0, w, h);
    p.filter = 'none';
    p.globalCompositeOperation = 'destination-in';
    p.drawImage(required(prepareMask(mask)), 0, 0, w, h);
    c.drawImage(part, 0, 0);
    part.width = part.height = 0;
  };
  const plate = (color: string) => required(`${PREPARE_ROOT}/${color.toLowerCase()}.png`);
  // Gold outer material, two-color pinlines, and a separate gradient across the
  // narrower left panel. The source supplies the panel's own blend mask.
  if (colors.length === 2) {
    const pin = scratch(),
      p = pin.getContext('2d')!;
    p.drawImage(plate(colors[0]!), 0, 0, w, h);
    const right = scratch(),
      r = right.getContext('2d')!;
    r.drawImage(plate(colors[1]!), 0, 0, w, h);
    r.globalCompositeOperation = 'destination-in';
    const blend = r.createLinearGradient(w * 0.43, 0, w * 0.57, 0);
    blend.addColorStop(0, '#0000');
    blend.addColorStop(1, '#000');
    r.fillStyle = blend;
    r.fillRect(0, 0, w, h);
    p.drawImage(right, 0, 0);
    masked(pin, 'pinline');
    masked(plate(colors[0]!), 'rules');
    masked(plate(colors[1]!), 'rulesRight');
    pin.width = pin.height = right.width = right.height = 0;
  }
  if (spellColors.length === 2) {
    masked(plate(spellColors[0]!), 'prepare');
    masked(plate(spellColors[1]!), 'prepareRight');
    // Hybrid spells retain colored paper and pinlines but neutral headers.
    masked(required(preparePlate(spell)), 'prepareTypeTitle', adventureHybrid(spell));
  } else masked(required(preparePlate(spell)), 'prepare');
  if (legendary) {
    c.save();
    c.scale(w / 488, h / 680);
    c.fillStyle = calibratedPrintingStock(face) ?? '#000';
    c.fillRect(19.2, 18.8, 449.6, 12.1);
    const crowns = colors.length === 2 ? colors : [prepareMaterial(face)];
    c.drawImage(required(prepareCrown(crowns[0]!)), 13.4, 13, 461.4, 113.4);
    if (crowns.length === 2) {
      const second = scratch(),
        sc = second.getContext('2d')!;
      sc.scale(w / 488, h / 680);
      sc.drawImage(required(prepareCrown(crowns[1]!)), 13.4, 13, 461.4, 113.4);
      sc.globalCompositeOperation = 'destination-in';
      const blend = sc.createLinearGradient(210, 0, 278, 0);
      blend.addColorStop(0, '#0000');
      blend.addColorStop(1, '#000');
      sc.fillStyle = blend;
      sc.fillRect(0, 0, 488, 680);
      c.drawImage(second, 0, 0, 488, 680);
      second.width = second.height = 0;
    }
    c.restore();
  }
  const cost = w * h * 4;
  for (const [oldKey, old] of cache) {
    if (bytes + cost <= 16 * 1024 * 1024) break;
    bytes -= old.width * old.height * 4;
    cache.delete(oldKey);
    old.width = old.height = 0;
  }
  if (cost <= 16 * 1024 * 1024) {
    cache.set(key, output);
    bytes += cost;
  }
  return output;
}
