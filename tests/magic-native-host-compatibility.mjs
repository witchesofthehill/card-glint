import assert from 'node:assert/strict';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import {
  root,
  outputRoot,
  hash,
  sourceHash,
  writeJson,
} from '../games/magic/tools/accuracy/common.mjs';
import {
  nativeReference,
  nativeReferenceRoot,
  readNativeReference,
} from './magic-native-reference.mjs';
import { nativeHostCases } from './magic-native-host-cases.mjs';
import { assertMagicSourceHash } from './magic-source-guard.mjs';

let verification;
const sourceManifestFile = new URL('./magic-native-host-sources.json', import.meta.url);
export const nativeHostSources = JSON.parse(await readFile(sourceManifestFile));

async function sourceFiles(directory) {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:ts|mjs|json)$/.test(entry.name))
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

async function packMetadata(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:json|css)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    files.map(async (file) => [file, hash(await readFile(path.join(directory, file)))]),
  );
}

async function identity() {
  const executable = await stat(chromium.executablePath());
  return {
    reference: nativeReference,
    sourceManifest: hash(await readFile(sourceManifestFile)),
    runner: await sourceHash(
      new URL('./', import.meta.url),
      /^magic-(?:native-.*|source-guard\.mjs)$/,
    ),
    native: await sourceHash(path.join(root, 'games/magic/src')),
    browser: await sourceHash(path.join(root, 'packages/browser/src')),
    core: await sourceHash(path.join(root, 'crates'), /\.(?:rs|toml|lock)$/),
    coreConfig: hash(
      await Promise.all(
        ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'].map((file) =>
          readFile(path.join(root, file)).then(hash),
        ),
      ).then(JSON.stringify),
    ),
    generated: await sourceHash(path.join(root, 'packages/browser/generated'), /\.(?:js|wasm)$/),
    metadata: hash(JSON.stringify(await packMetadata(path.join(root, 'games/magic')))),
    executable: [chromium.executablePath(), executable.size, executable.mtimeMs],
    platform: [process.platform, process.arch],
    inputs: hash(JSON.stringify(nativeHostCases)),
  };
}

function assertReceipt(receipt, expected) {
  assert.deepEqual(receipt.identity, expected, 'Stale native compatibility evidence');
  assert.equal(receipt.schema, 1);
  assert.equal(receipt.scope, 'synthetic-native-defaults-not-scan-remeasurement');
  assert.equal(receipt.rows.length, nativeHostCases.length * 2 * 3);
  const ids = new Set();
  for (const row of receipt.rows) {
    const specimen = nativeHostCases.find((entry) => entry.id === row.id);
    assert.ok(specimen, row.id);
    assert.equal(row.inputHash, hash(JSON.stringify(specimen.face)));
    assert.ok(['table', 'inspect'].includes(row.tier));
    assert.ok(['face', 'printing', 'artwork'].includes(row.layer));
    const key = `${row.id}/${row.tier}/${row.layer}`;
    assert.ok(!ids.has(key), 'Duplicate parity probe: ' + key);
    ids.add(key);
    for (const field of ['pixels', 'measurements', 'layout']) {
      assert.match(row.before[field], /^[a-f0-9]{64}$/);
      assert.equal(row.before[field], row.after[field], `${key}: ${field}`);
    }
    assert.equal(row.after.pixels, row.emptyInkPixels, key + ': empty ink');
  }
  assert.deepEqual(receipt.hooks, {
    composeDefaults: true,
    explicitRulesVisible: true,
    rulesSuppressed: true,
    genericInkSpans: true,
    canonicalWording: true,
  });
}

async function verify() {
  assert.equal(nativeHostSources.schema, 1);
  assert.equal(nativeHostSources.reference, nativeReference);
  const rulesFile = 'games/magic/src/presentation/rules-paint.ts';
  await assert.rejects(
    () => assertMagicSourceHash(rulesFile, nativeHostSources.files[rulesFile].before),
    /Unproven source change|No verified cache-only ancestry|Painter changed/,
    'A visibility hook is not a cache-only source replacement',
  );
  const expected = await identity();
  const receiptFile = path.join(
    outputRoot,
    'native-host-compatibility',
    hash(JSON.stringify(expected)) + '.json',
  );
  const evidenceFile = path.join(root, 'evidence/native-host-compatibility.json');
  try {
    const receipt = JSON.parse(await readFile(receiptFile));
    assertReceipt(receipt, expected);
    await writeJson(evidenceFile, receipt);
    return receipt;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const referenceRoot = await realpath(await nativeReferenceRoot());
  const currentRoot = await realpath(root);
  const nativeDirectory = 'games/magic/src';
  const currentFiles = await sourceFiles(path.join(currentRoot, nativeDirectory));
  const referenceFiles = await sourceFiles(path.join(referenceRoot, nativeDirectory));
  for (const relative of new Set([...currentFiles, ...referenceFiles])) {
    const file = `${nativeDirectory}/${relative}`;
    const change = nativeHostSources.files[file];
    const after = currentFiles.includes(relative)
      ? hash(await readFile(path.join(currentRoot, file)))
      : null;
    const before = referenceFiles.includes(relative) ? hash(await readNativeReference(file)) : null;
    if (change) {
      assert.equal(before, change.before, 'Wrong upstream source: ' + file);
      assert.equal(after, change.after, 'Unreviewed host source change: ' + file);
    } else assert.equal(after, before, 'Unrecorded native source change: ' + file);
  }
  assert.deepEqual(
    await packMetadata(path.join(currentRoot, 'games/magic')),
    await packMetadata(path.join(referenceRoot, 'games/magic')),
    'Native runtime metadata differs from the pinned reference',
  );
  const faults = [];
  const server = await createServer({
    configFile: false,
    root: currentRoot,
    optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [currentRoot, referenceRoot] } },
    plugins: [
      {
        name: 'native-host-compatibility',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/__native_host') {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><meta charset="utf-8"><title>Native default compatibility</title>',
              );
            } else next();
          });
        },
      },
    ],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1, locale: 'en-US' });
    page.on('pageerror', (error) => faults.push(String(error)));
    await page.route('https://**/*', async (route) => {
      faults.push('Unexpected external dependency: ' + route.request().url());
      await route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__native_host`);
    const result = await page.evaluate(
      async ({ referenceRoot, specimens }) => {
        const prefix = '/games/magic/src/presentation/';
        const beforePrefix = '/@fs' + referenceRoot + prefix;
        const load = async (base) => ({
          api: await import(/* @vite-ignore */ base + 'canvas-face.ts'),
          assets: await import(/* @vite-ignore */ base + 'canvas-assets.ts'),
          frames: await import(/* @vite-ignore */ base + 'special-frames.ts'),
          profiles: await import(/* @vite-ignore */ base + 'profile.ts'),
          wording: await import(/* @vite-ignore */ base + 'wording.ts'),
          mana: await import(/* @vite-ignore */ base + 'mana-assets.ts'),
        });
        const before = await load(beforePrefix);
        const after = await load(prefix);
        const visibility = await import('/games/magic/src/presentation/rules-visibility.ts');
        const { paintTextInk } = await import('/games/magic/src/presentation/text-ink.ts');
        const check = (yes, message) => {
          if (!yes) throw Error(message);
        };
        const digest = async (value) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                'SHA-256',
                typeof value === 'string' ? new TextEncoder().encode(value) : value,
              ),
            ),
            (byte) => byte.toString(16).padStart(2, '0'),
          ).join('');
        const patterned = await Promise.all(
          Array.from({ length: 8 }, async (_, index) => {
            const canvas = document.createElement('canvas');
            canvas.width = 488;
            canvas.height = 680;
            const c = canvas.getContext('2d');
            const gradient = c.createLinearGradient(0, 0, 488, 680);
            gradient.addColorStop(0, `rgba(${30 + index * 20},80,120,0.75)`);
            gradient.addColorStop(1, `rgba(180,${40 + index * 20},60,0.95)`);
            c.fillStyle = gradient;
            c.fillRect(0, 0, 488, 680);
            c.fillStyle = 'rgba(250,240,210,0.6)';
            for (let x = index; x < 488; x += 31) c.fillRect(x, 0, 3, 680);
            c.clearRect(100, 160, 150, 100);
            const image = await createImageBitmap(canvas);
            canvas.width = canvas.height = 0;
            return image;
          }),
        );
        const manaCanvas = document.createElement('canvas');
        manaCanvas.width = manaCanvas.height = 96;
        const manaContext = manaCanvas.getContext('2d');
        manaContext.fillStyle = '#cac5c0';
        manaContext.beginPath();
        manaContext.arc(48, 48, 48, 0, Math.PI * 2);
        manaContext.fill();
        manaContext.fillStyle = '#0d0f0f';
        manaContext.fillRect(40, 20, 16, 55);
        const manaBitmap = await createImageBitmap(manaCanvas);
        manaCanvas.width = manaCanvas.height = 0;
        const manaAssets = (face) => [
          ...after.mana.faceManaAssets(face),
          ...(face.faces ?? []).flatMap(manaAssets),
        ];
        const manaUrls = new Set(specimens.flatMap(({ face }) => manaAssets(face)));
        const images = (urls) =>
          new Map(
            urls.filter(Boolean).map((url) => {
              if (manaUrls.has(url)) return [url, manaBitmap];
              let value = 0;
              for (const character of url)
                value = (value + character.charCodeAt(0)) % patterned.length;
              return [url, patterned[value]];
            }),
          );
        let trace = null;
        const prototype = CanvasRenderingContext2D.prototype;
        const originalMeasure = prototype.measureText;
        const originalFill = prototype.fillText;
        const originalStroke = prototype.strokeText;
        const state = (c) => [
          c.font,
          c.fillStyle,
          c.strokeStyle,
          c.textAlign,
          c.textBaseline,
          c.direction,
          c.globalAlpha,
          c.globalCompositeOperation,
          ...c.getTransform().toFloat64Array(),
        ];
        prototype.measureText = function (text) {
          const result = originalMeasure.call(this, text);
          if (trace)
            trace.push([
              'measure',
              text,
              ...state(this),
              ...[
                'width',
                'actualBoundingBoxLeft',
                'actualBoundingBoxRight',
                'actualBoundingBoxAscent',
                'actualBoundingBoxDescent',
                'fontBoundingBoxAscent',
                'fontBoundingBoxDescent',
              ].map((key) => result[key]),
            ]);
          return result;
        };
        prototype.fillText = function (...args) {
          if (trace) trace.push(['fill', ...args, ...state(this)]);
          return originalFill.apply(this, args);
        };
        prototype.strokeText = function (...args) {
          if (trace) trace.push(['stroke', ...args, ...state(this)]);
          return originalStroke.apply(this, args);
        };
        const emptyInk = (face) => ({ ...face, textInk: {}, faces: face.faces?.map(emptyInk) });
        const draw = async (renderer, face, tier, layer, explicit = false) => {
          const canvas = renderer.api.faceCanvas(tier);
          const c = canvas.getContext('2d');
          c.scale(canvas.width / 488, canvas.height / 680);
          const map = images(renderer.assets.canvasAssetUrls(face));
          trace = [];
          try {
            const paint = () =>
              renderer.api.paintAssembledFace(
                c,
                face,
                map,
                680,
                false,
                undefined,
                layer === 'face' ? undefined : layer,
              );
            if (explicit) visibility.withRulesInk(c, true, paint);
            else paint();
            const measurements = await digest(JSON.stringify(trace));
            trace = null;
            const kind = renderer.frames.faceFrame(face);
            const layout = {
              frame: kind,
              rects: renderer.frames.faceRects(face),
              profile: renderer.profiles.resolveCardProfile(face),
            };
            if (
              !face.frameTemplate &&
              !face.layout &&
              !face.frameAssetFamily &&
              kind === 'normal'
            ) {
              const fit =
                face.frameStyle === 'retro'
                  ? renderer.api.retroTextLayout
                  : renderer.api.ordinaryTextLayout;
              if (fit) layout.text = fit(c, face);
            }
            const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data;
            return {
              pixels,
              hashes: {
                pixels: await digest(pixels),
                measurements,
                layout: await digest(JSON.stringify(layout)),
              },
            };
          } finally {
            trace = null;
            canvas.width = canvas.height = 0;
          }
        };
        const rows = [];
        try {
          for (const specimen of specimens)
            for (const tier of ['table', 'inspect'])
              for (const layer of ['face', 'printing', 'artwork']) {
                const label = `${specimen.id}/${tier}/${layer}`;
                const a = await draw(before, specimen.face, tier, layer);
                const b = await draw(after, specimen.face, tier, layer);
                check(a.pixels.length === b.pixels.length, label + ': pixel dimensions changed');
                const changed = a.pixels.findIndex((byte, index) => byte !== b.pixels[index]);
                check(changed < 0, label + ': default native pixel changed at byte ' + changed);
                check(
                  a.hashes.measurements === b.hashes.measurements,
                  label + ': measurement/text call scope changed',
                );
                check(a.hashes.layout === b.hashes.layout, label + ': layout/geometry changed');
                const empty = await draw(after, emptyInk(specimen.face), tier, layer, true);
                check(
                  a.hashes.pixels === empty.hashes.pixels,
                  label + ': explicit default hooks changed pixels',
                );
                rows.push({
                  id: specimen.id,
                  tier,
                  layer,
                  inputHash: await digest(JSON.stringify(specimen.face)),
                  before: a.hashes,
                  after: b.hashes,
                  emptyInkPixels: empty.hashes.pixels,
                });
              }
          const face = {
            ...specimens.find((specimen) => specimen.id === 'm21/U').face,
            colorCalibration: undefined,
            setSymbol: undefined,
          };
          const hooks = {
            loadFonts: async () => {
              await document.fonts.ready;
            },
            loadImages: async (urls) => ({ images: images(urls), dispose() {} }),
          };
          const compose = async (renderer, rulesText) => {
            trace = [];
            let canvas;
            try {
              canvas = await renderer.api.composeCardTexture(
                {
                  face,
                  printingId: null,
                  printedImage: null,
                  ...(rulesText === undefined ? {} : { rulesText }),
                },
                'inspect',
                new AbortController().signal,
                hooks,
              );
              const pixels = canvas
                .getContext('2d')
                .getImageData(0, 0, canvas.width, canvas.height).data;
              return {
                pixels,
                hash: await digest(pixels),
                width: canvas.width,
                height: canvas.height,
                text: trace.filter((entry) => entry[0] === 'fill').map((entry) => entry[1]),
              };
            } finally {
              trace = null;
              if (canvas) canvas.width = canvas.height = 0;
            }
          };
          const native = await compose(before);
          check(
            native.hash === (await compose(after)).hash,
            'Default composition differs from pinned upstream',
          );
          check(
            native.hash === (await compose(after, true)).hash,
            'rulesText=true changes default composition',
          );
          const suppressed = await compose(after, false);
          check(
            native.hash !== suppressed.hash,
            'rulesText=false does not suppress native rules ink',
          );
          for (const text of [face.name, face.typeLine, `${face.power}/${face.toughness}`])
            check(
              suppressed.text.includes(text),
              'Rules suppression removed non-rules ink: ' + text,
            );
          check(!suppressed.text.includes('Flying'), 'Rules suppression retained rules text');
          const rules = after.frames.faceRects(face).rules;
          for (let i = 0; i < native.pixels.length; i++) {
            if (native.pixels[i] === suppressed.pixels[i]) continue;
            const pixel = Math.floor(i / 4);
            const x = (pixel % native.width) / native.width;
            const y = Math.floor(pixel / native.width) / native.height;
            check(
              x >= rules[0] && x < rules[0] + rules[2] && y >= rules[1] && y < rules[1] + rules[3],
              'Rules suppression changed a pixel outside rules bounds',
            );
          }
          const ink = document.createElement('canvas');
          ink.width = 220;
          ink.height = 70;
          const c = ink.getContext('2d');
          c.font = '32px serif';
          c.fillStyle = '#000';
          paintTextInk(c, '2/3', 10, 45, 180);
          const plain = c.getImageData(0, 0, 220, 70).data;
          c.clearRect(0, 0, 220, 70);
          paintTextInk(c, '2/3', 10, 45, 180, { stats: [{ start: 0, end: 1, color: '#f00' }] });
          const colored = c.getImageData(0, 0, 220, 70).data;
          const spanEnd = 10 + c.measureText('2').width;
          let highlighted = false;
          for (let i = 0; i < plain.length; i += 4) {
            check(colored[i + 3] === plain[i + 3], 'Ink spans changed glyph coverage');
            if ((i / 4) % ink.width < spanEnd && plain[i + 3] > 0) {
              check(
                colored[i] > 0 && colored[i + 1] === 0 && colored[i + 2] === 0,
                'Selected glyph did not receive the requested red ink',
              );
              highlighted = true;
            } else {
              check(
                [0, 1, 2].every((channel) => plain[i + channel] === colored[i + channel]),
                'Ink spans changed neighboring glyphs or paper',
              );
            }
          }
          check(highlighted, 'Requested ink span has no colored glyph');
          for (const mode of ['original', 'oracle']) {
            const wordings = {
              original: { typeLine: 'Summon Wizard', rulesText: 'Original printed rules.' },
              oracle: { typeLine: 'Creature — Human Wizard', rulesText: 'Current Oracle rules.' },
            };
            const old = before.wording.withCardWording(face, wordings, mode);
            const next = after.wording.withCardWording(face, wordings, mode);
            check(
              next.canonicalTypeLine === wordings.oracle.typeLine,
              'Canonical type provenance lost',
            );
            const { canonicalTypeLine, ...visible } = next;
            check(
              JSON.stringify(visible) === JSON.stringify(old),
              'Default wording fields changed',
            );
            check(
              JSON.stringify(before.frames.faceRects(old)) ===
                JSON.stringify(after.frames.faceRects(next)),
              'Default wording geometry changed',
            );
          }
          const semantic = after.wording.withCardWording(
            { ...face, canonicalTypeLine: 'Legendary Planeswalker — Specimen' },
            { oracle: { typeLine: 'Creature', rulesText: '+1: Draw a card.' } },
          );
          check(
            semantic.canonicalTypeLine === 'Legendary Planeswalker — Specimen',
            'Host canonical type overwritten',
          );
          check(
            after.frames.faceFrame(semantic) === 'planeswalker',
            'Host canonical type not used for frame semantics',
          );
          return {
            rows,
            hooks: {
              composeDefaults: true,
              explicitRulesVisible: true,
              rulesSuppressed: true,
              genericInkSpans: true,
              canonicalWording: true,
            },
          };
        } finally {
          prototype.measureText = originalMeasure;
          prototype.fillText = originalFill;
          prototype.strokeText = originalStroke;
          for (const image of patterned) image.close();
          manaBitmap.close();
        }
      },
      { referenceRoot, specimens: nativeHostCases },
    );
    assert.deepEqual(faults, []);
    assert.deepEqual(
      await identity(),
      expected,
      'Native sources changed during compatibility capture',
    );
    const receipt = {
      schema: 1,
      scope: 'synthetic-native-defaults-not-scan-remeasurement',
      identity: expected,
      browser: await browser.version(),
      rows: result.rows,
      hooks: result.hooks,
    };
    assertReceipt(receipt, expected);
    await writeJson(receiptFile, receipt);
    await writeJson(evidenceFile, receipt);
    return receipt;
  } finally {
    await browser?.close();
    await server.close();
  }
}

export function assertNativeDefaultCompatibility() {
  verification ??= verify();
  return verification;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = await assertNativeDefaultCompatibility();
  console.log(
    `Native defaults: ${receipt.rows.length} exact pixel/measurement/layout probes against ${nativeReference}; synthetic plates and browser fonts, not renewed scan calibration.`,
  );
}
