# card-glint

[![CI](https://github.com/witchesofthehill/card-glint/actions/workflows/check.yml/badge.svg)](https://github.com/witchesofthehill/card-glint/actions/workflows/check.yml)
[![Rust 1.98](https://img.shields.io/badge/Rust-1.98-934b32)](rust-toolchain.toml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue)](NOTICE.md)

A small, game-neutral card renderer. Rust/WASM manages caches, scene planning,
picking and pixel kernels. WebGL2 adds reusable etching, embossing and foil.
Your game supplies the artwork, frame geometry, typography and hit regions.

[![Four original fantasy cards with prismatic, cold, Opal and etched foil](docs/images/showcase-foils.gif)](https://vishvananda.github.io/card-glint/)

**Four foils:** prismatic · cold foil · Opal embossing · etched gold.
[Watch / download MP4](https://vishvananda.github.io/card-glint/media/showcase-foils.mp4) ·
[Static preview](docs/images/showcase.png)

[![The same four cards with rain, pool water, heat shimmer and gloss](docs/images/showcase-living.gif)](https://vishvananda.github.io/card-glint/?finish=surfaces)

**Living surfaces + gloss:** rain · pool water · heat shimmer · gloss.
[Watch / download MP4](https://vishvananda.github.io/card-glint/media/showcase-living.mp4) ·
[Static preview](docs/images/showcase-living.png)

[Try the interactive showcase](https://vishvananda.github.io/card-glint/) ·
[Architecture and layering](docs/architecture.md) ·
[Hardware and cache measurements](docs/performance.md)

**No internal art assets are used or distributed in this repository.** The
showcase uses original AI-generated fantasy illustrations and code-drawn frames
and symbols. The [artwork, prompts and provenance](games/showcase/art/README.md)
are included under the repository's license, alongside small procedural SVG
alternatives and their [generator](scripts/generate-showcase-art.mjs).
No external fonts or artwork are loaded by the showcase. The optional
[Magic drawing pack](games/magic/README.md) contains frame definitions, external
asset references, its fan-content notice, and a guide for contributing fixes.

## What it does

- Nine finishes: regular, gloss, etched, prismatic, cold foil, Opal embossing,
  raindrops on glass, heat shimmer and pool water with caustics.
- Independent face, artwork-edge, mask, decoded-image and overlay caches.
- Explicit layers above/below foil, foil exclusion masks and etch contributions.
- One depth surface for each card and its foil, including overlapping cards.
- Instanced scenes, perspective-aware picking, context recovery and PNG export.
- Game packs that remain separate from both the renderer and application UI.

The browser still rasterizes fonts and static faces with Canvas2D. This is not a
complete Rust text-layout engine. The large-scene test uses 2,000 instances of
three faces; it does not claim that 2,000 unique high-resolution cards fit in
memory. See [limits and cache ownership](docs/architecture.md).

## Build and run

Source builds require Node.js 22.12+, rustup on `PATH`, and native compiler/linker
tools. On macOS, install the Xcode command line tools; on Linux, install your
distribution's C/C++ build tools; on Windows, install the MSVC build tools.
Git installs also require Git. The build installs
Rust 1.98.0 with the `wasm32-unknown-unknown` target through rustup and compiles
wasm-bindgen-cli 0.2.127. Network access to npm, Rust distribution servers and
crates.io is required on a cold install.

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

`npm run prepare` builds only the library, WASM and declarations. The full
`build` also builds the local showcase. Build tools, Cargo downloads and compiled
targets are cached under `node_modules/.cache/card-glint` in this checkout.
Rustup manages the pinned Rust toolchain in its normal toolchain directory.
No global wasm-bindgen installation is used, and no other source repository is
downloaded or patched. The macOS WASM linker wrapper sets the matching Rust
library path; Linux and Windows use the toolchain's normal WASM linker.

Open <http://localhost:4283/card-glint/>. Everything the showcase loads is local.
The collection opens with four foil finishes. Choose **Living surfaces + gloss**
in the **Finish** selector to compare the other four treatments on the same cards.
Hover or drag on a card to tilt it and disturb its water; neighboring cards keep
their independent idle motion and reflections. On touchscreens,
swipe beside or between cards to scroll the page. They drift gently when
unattended; **Pause motion** freezes animation. Reduced-motion preferences are
respected. **Effect: Full card / Artwork only** switches coverage for every
treatment; saved PNGs use the same setting. Use **Inside the renderer** for metrics
and cache tests. `npm run art` regenerates the optional SVG alternatives; it does
not overwrite the generated fantasy illustrations.

The **Wear** selector adds Fresh, Lightly played, Well played or Heavily played
abrasion over any finish. Open `?finish=gloss&wear=heavy` for worn gloss, or
`?wear=heavy` for worn foils. Chipped paper edges, corner abrasion and fine
shuffle scratches remain fixed as the card tilts. Intact areas retain the
selected finish; shallow ink loss on foils exposes reflective film, while deep
chips expose matte cardstock. Full card includes edge wear; Artwork only keeps
the frame protected.

Set `Instance.wear` to `{ amount: 0.6, seed: 42 }`: amount ranges from 0 (fresh)
to 1 (heavily played), and the optional uint32 seed defaults to the instance ID.
Persist that seed with the card to keep its wear when scene identity changes.
Pass the same `wear` and `instanceId` to `exportCard` for matching PNGs.

```sh
npm run check                  # rustfmt, strict Clippy, Rust tests, TS, formatting, boundaries
npx playwright install chromium
npm run test:browser           # preview server must be running
npm run test:showcase          # local-only asset check and README screenshot
npm run test:surfaces          # animation, local ripples/slosh, masks and cache reuse
npm run test:touch             # native touch gestures, tilt and page scrolling
npm run test:hover-isolation   # pointer affects one card; neighbors retain idle reflections
npm run test:coverage          # artwork-only/full-card masks, exports and cache reuse
npm run test:worn              # wear levels, foil layering, seeds, exports and cache reuse
npm run test:optics            # caustic motion measured across successive frames
npm run test:deformation       # animated silhouette, Rust picking, overlap and export
npm run test:parallax          # recessed ink, floor illumination and shared light-map reuse
npm run test:package           # independent packed-library consumer
```

CI runs these checks and uploads browser evidence. `npm run format` applies
rustfmt and Prettier. Native and WASM Clippy run with warnings denied; unsafe
Rust is forbidden.

The showcase is hosted on GitHub Pages. After checks pass on `main`, the same
workflow publishes `dist/lab`; pull requests only run checks. The README preview
links to the interactive page. All artwork and WASM are served from that site,
with no application server or external asset host required.
The README's paired eight-second GIFs and MP4s are captured from the same renderer;
[media reproduction instructions](docs/images/README.md) include the capture script.

## Use it in an application

This public fork is an installable Git dependency. Pin the full reviewed commit
SHA in your dependency and commit the resulting application lockfile:

```sh
yarn add 'card-glint@git+https://github.com/witchesofthehill/card-glint.git#<full-commit-sha>'
```

Replace `<full-commit-sha>` with the desired fork commit. Yarn Classic 1.22 installs
the fork's development dependencies in its Git preparation checkout, then runs
`prepare` to compile the package before packing it. The source-build prerequisites
above therefore apply to the machine running the first uncached install,
including a CI runner. Keep lifecycle scripts enabled. No private registry,
GitHub token or application-specific build script is required.

The fork tracks `package-lock.json` for npm source builds and `yarn.lock` for
Yarn Classic's Git preparation. Update both when build dependencies change.

`prepare` builds only JavaScript, the two matching WASM modules and TypeScript
declarations, not the showcase. It does not run an install/postinstall build in
the consuming application. The packed package contains those build outputs,
the optional original showcase artwork, asset-reference metadata, and the code
and game-pack license notices. It contains no external frame, font or symbol
binaries. See [host integration](docs/host-integration.md) and the
[Magic asset notices](games/magic/NOTICE.md) before using external assets.

Use a bundler that understands `?url` asset imports, such as Vite. Default WASM
imports let the bundler emit each binary as a separate asset. A host may instead
provide an explicit WASM URL or bytes through the public initialization options.
The root export is game-neutral; game packs are optional.

For a prebuilt tarball from your own checkout:

```sh
npm ci --ignore-scripts
npm run prepare
npm pack --ignore-scripts
```

Installing that tarball needs no Rust compiler or source-build dependencies.
For a plain HTML page without a bundler, run `npm run package:release` after a
build and use the browser ZIP in `dist/releases`. That command also creates an
npm tarball and checksums; it does not publish anything. The browser ZIP converts
bundler asset imports to adjacent module URLs. Serve it over HTTP and keep its
JavaScript chunks and both WASM binaries together.

The [upstream project](https://github.com/vishvananda/card-glint) has separate
release archives, a showcase and versioned CDN builds. Those artifacts are
upstream builds, not builds of this fork or its additional APIs.

```ts
import { createRenderer, IDENTITY } from 'card-glint';
import { showcase } from 'card-glint/showcase';
import wasmUrl from 'card-glint/renderer.wasm?url';

const renderer = await createRenderer({ canvas, wasmUrl });
renderer.upsertCards([
  {
    id: 1,
    revision: 1,
    recipe: showcase.describe(
      {
        name: 'Starfall Seer',
        subtitle: 'Wayfinder',
        theme: 'orbit',
        charge: 3,
        serial: '001',
        illustration: '/art/orbit.webp',
        rules: 'She charts the roads between stars.',
      },
      'inspect',
    ),
  },
]);
await renderer.ready(1, 1);
// Local unit quad → clip space; this example assumes a 720 × 1000 canvas.
renderer.updateScene([
  {
    id: 1,
    card: 1,
    finish: 'etched',
    transform: [2, 0, 0, 0, 0, -2, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1],
  },
]);
renderer.render({ viewProjection: IDENTITY, pointer: [0.5, 0.5] });
// On unmount:
renderer.dispose();
```

Copy the chosen illustration into your application's public asset directory. Serve WASM
as `application/wasm`. The host owns canvas sizing, transforms, animation,
accessibility and editor controls. Use native aspect ratios when mapping card
quads to screen pixels; [the lab layout](examples/lab/layout.ts) shows how.

Implement `GamePack<T>` to adapt another game's presentation data. A pack returns
immutable `FaceRecipe` rasters, artwork placement, masks and semantic hit regions.
See [the original example pack](games/showcase/src/index.ts). Applications can
consume the renderer without a frontend framework or a game-engine checkout.

## Animated surfaces and interaction

Set an instance's `finish` to `rain`, `heat` or `pool`, and pass elapsed **seconds**
as `Frame.time`. An omitted or fixed time gives a still image. Feed the actual
result of `renderer.hitTest(x, y)` into `Frame.hover` for card-local ripples:

```ts
renderer.render({
  viewProjection: IDENTITY,
  time: elapsedSeconds,
  hover: hit ? { instance: hit.instance, uv: hit.uv } : undefined,
});
```

Update each instance's transform and surface normal together when it tilts.
The renderer derives damped slosh from changes in the transform and normal.
The [showcase motion controller](examples/lab/motion.ts) demonstrates perspective
tilt, a smooth pointer handoff and the idle orbit. Pointer coordinates for
`Frame.hover` use the top-left card origin; `Frame.pointer` remains the normalized
canvas-space foil-light control.

`Instance.rainFog` optionally changes rain condensation density from 0 (clear)
to 2. Omit it or use 1 for the unchanged default. Droplets, their refraction,
reflections, blur and motion retain their native settings. Pass the same value
to `exportCard` for a matching image. The root export `rainFogVersion === 1`
lets a host detect this option without assuming a release number. Changes reuse
prepared textures and add one float per instance, with no extra rendering pass.

These are procedural optical treatments, not a fluid solver. Heat refracts the
printed face in horizontal bands with slight blur. Rain adds small lenses and
draining drops over lightly fogged glass. Rain counter-projects the image around the card center, so the scene stays
approximately in place behind the turning window. Pool keeps the artwork painted
on the card’s floor while damped water modes lag, rebound and settle. It projects refracted light
onto a separate floor map: concentrated rays brighten it and diverging rays dim
it. Surface waves, reflections and pointer ripples sit above that lit floor.
Under-finish content participates; over-finish content stays clear of these
optical distortions. Existing finish exclusion masks apply.

For a heat-warped **outline**, set `deformation: { kind: 'heat', amount: 0.012 }`
on the instance (maximum `0.02` of card width). Rounded clipping, card layers,
masks and Rust picking follow the same inverse warp. World/scene/HUD layers
keep their own transforms. The showcase enables this only for Full card heat;
Artwork only keeps the frame fixed. Leave `deformation` unset for the original
fixed silhouette with any finish.

Animation reuses card textures and masks. Pool adds one shared light-map pass
when time changes, regardless of card count; fixed-time renders reuse it.
See [surface costs and limits](docs/architecture.md#animated-optical-surfaces)
and [optical treatment notes](docs/optical-surfaces.md).
`exportCard(..., { time, deformation, instanceId })` captures a still using the
chosen outline and surface seed. Warped exports fit the whole envelope into the
requested dimensions, preserving aspect ratio with transparent margins. Export
does not replay live ripple/slosh history or disturb the live motion state.

## Contributing game packs

Frame fixes and new card layouts are welcome. The [Magic pack guide](games/magic/README.md)
maps asset selection, geometry, text layout, and composition to their source files.
Use `card-glint/magic` and `card-glint/magic/fonts.css` to consume that pack;
the core import remains independent of it. [Sources and notices](NOTICE.md)
describe the separation between repository code and external game assets.

### Optional cardstock coating

Set `Instance.cardstock` to `{ amount: 0.2 }` for subtle, irregular relief in the
clear coating over any optical finish. The amount ranges from 0 to 1. It modulates reflected light;
printing remains sharp. Relief varies the finish response locally without lowering its overall gain.
Gloss separately uses a 10% softer clear-coat contribution, with or without relief.
Omitted or zero keeps the smooth coating,
and regular printing ignores it. Pass the same `cardstock` option to `exportCard`
for matching PNGs. Wear is applied above the coating, so exposed paper stays matte.

A fixed relief map is generated once per renderer context on first use, shared
by all textured instances, and mip filtered when cards shrink. Tilt only samples
the map; it does not generate noise, upload pixels, or render a reference face.
The map adds approximately 4 MB per active context, reported in `surfaceBytes`,
and its one-time generation increments `surfacePasses`. Context restoration
rebuilds the map on first use. `npm run test:cardstock` checks rendering, validation,
export parity, cache reuse, filtering and context restoration.

### Experimental printed dots

`Instance.printDots = { amount: 0.35, period: 5, variation: 0.5 }` adds rotated CMYK screens to
printing before finish and wear. Amount is 0..1; period is 2..16 source texture
pixels (default 5). Variation ranges from 0 (ideal screen) to 1 (more uneven),
defaulting to 0.5. Small stable position/size/shape differences and ink spread
break up the ideal grid. Omitted/zero amount retains previous pixels. Pass the same option
to `exportCard`. The effect is optional on every finish. It uses screen derivatives to fade fine dots when a card
shrinks, reducing aliasing. Larger periods make the pattern easier to inspect.

This is an RGB-to-CMYK visual approximation, not a calibrated press profile.
An optional `inset` (0..0.2, in card-width units) excludes an outer rim from
the print effect; the default is 0. Game packs/hosts supply any desired rim.
Imported scans can already contain a dot pattern; adding another may create
moire. Keep the option off for such images unless comparing an intentional
second pattern. The conventional screen angles follow
[Adobe's prepress reference](https://helpx.adobe.com/indesign/desktop/print/ink-and-color-management/specify-halftone-frequency-and-resolution.html).

Printing with matching instance settings is prepared once into a context-owned,
mip-filtered sRGB texture cache (up to 16 MiB, shared across face revisions and
over-finish printing). Tilt and export reuse it without re-evaluating the screens.
Changing a setting/face may add a preparation pass; `surfacePasses` and
`surfaceBytes` include it. Mixed settings on a material group or oversized faces
keep the per-instance procedural path. The cache is released on disposal and
rebuilt after context loss. There are no per-frame CPU readbacks or texture uploads.
