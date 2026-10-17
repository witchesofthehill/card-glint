# Integrating into an existing scene

Use `createRenderer` for a complete scene. Hosts with an established depth pass,
overlays and texture cache can instead use the independent public entry points:

- `card-glint/magic/presentation`: shared layout, painters, native assets and font metadata.
- `card-glint/finish`: foil and surface GLSL, `FinishResources`, `SurfaceMotion` and `surfaceSeed`.
- `card-glint/kernels`: `createPixelKernels` with explicit disposal.

These entry points do not create a WebGL context or schedule animation. The host
owns image leases, texture uploads, memory limits, clipping, hit testing, overlays,
context loss and the draw order. Never borrow private renderer textures or copy
its shader source into a host. A host-created material draws the card and finish
in the same depth pass, so later overlays and intervening objects remain in front.
A layer intended to participate in etching must be rasterized before mask creation;
a layer above the finish must be drawn later or excluded in the host material.

## Install the public fork

Use `card-glint@git+https://github.com/witchesofthehill/card-glint.git#<full-commit-sha>`
with Yarn Classic 1.22 and pin an actual reviewed commit. Git preparation builds
the package with its own development dependencies, independently of your app.
It requires Node.js 22.12+, Git, rustup, a native compiler/linker, and network access
on a cold install. The build pins Rust 1.98.0 and wasm-bindgen-cli 0.2.127 and
keeps Cargo downloads, build artifacts and the CLI inside the source checkout's
`node_modules/.cache/card-glint`. No host download or patch script is needed.
Rustup provisioning uses the caller's installation environment and disables
self-update. Only Cargo builds use the package-private `CARGO_HOME`; passing that
cache to rustup breaks installations copied from official Rust container images.

Import only the public entry points above, not source paths in the dependency.
Vite and compatible bundlers resolve the package's `?url` imports and emit the
matching WASM binaries. The explicit binary exports are
`card-glint/renderer.wasm` and `card-glint/pixels.wasm`; append `?url` when passing
their URLs to `createRenderer` or `createPixelKernels`. Declarations are included
for every JavaScript entry point. The package contains no private app code and
requires no registry credentials.

The integration branch includes upstream 0.4.9 typography, printing presets,
provider adapters, artwork placement and surface controls. Native text painters
accept `textInk` spans with character offsets and colors. The host owns change
detection, type-word selection and power/toughness ranges. The painter measures
those spans in its actual font and transform without changing text advances.
`omitInk` suppresses only selected spans so a host can animate their ink above
unchanged native paper. `paintFittedText` retains upstream's numeric inset
argument, followed by optional `CardTextInk` and the type/stats role.

Native rules suppression and geometry stay in the game pack. Custom layouts,
interaction panels, fallback policy and animation scheduling belong to the host.

Standalone preset pages and browser release archives use adjacent WASM URLs.
The npm library retains bundler asset imports. Node-safe Magic helpers load the
image-placement utility without importing the browser renderer or its WASM.
Default WASM asset imports are lazy, so importing generic helpers in Node does
not load browser-only asset URLs. Supply WASM bytes explicitly when initializing
pixel kernels in Node.

## Face composition

`composeCardTexture(input, tier, signal, hooks)` accepts an image-lease loader,
font-loading hooks, a quiet-time barrier and an optional `resolveEtching` callback.
The callback supplies a URL for a prepared mask; the pack owns its crop, split
panel transform, clipping and set stamp placement. Omit it for a stamp-only raster
when using the complete renderer's separately cached edge sources. Aborted jobs
release leases and never publish partial output. Hosts may keep their own persistent
image/derivative caches; none are installed globally by this API.

The same entry exposes geometry for DOM accessibility and inline editing. Import
`card-glint/magic/fonts.css` for the matching font names. Optional `setSymbol` URLs
allow custom set marks without changing the visible `setCode`. Asset provenance
and the fan notice remain in [games/magic](../games/magic/README.md).

`createRenderer({canvas, rasterHost})` accepts an optional `RasterHost` for all
card rasters, artwork edge sources, layers, scene rasters and exports. Omit it
to retain the renderer's bounded decoded-asset store. A supplied host owns its
decoded images, cache budget and leases; every `images(requests, signal)` call
must honor `AssetRequest.width` and release only that request's borrowed images.
Capture the correct source scope when each request starts, and cancel obsolete
document work before replacing a document-specific source scope.

## Finish shader contract

`foilShader({artWindows: 'pair', liquid: false})` returns GLSL functions, not a
complete material. Default `artWindows: 'array'` uses `vec4 artBounds[8]`; `pair`
uses `vec4 artBounds` plus `vec4 artBounds2`. Bounds are bottom-left UV endpoints
(x0,y0,x1,y1); zero bounds disable a window. The host declares these uniforms,
`sampler2D face`, `sampler2D mask`, `float hasMask`, `vec2 pointer`, and `float aspect`.
It provides linear RGB face samples and unmodified mask alpha in a linear R8
texture. `previewFoil(uv, normal, view)` returns sRGB; `previewLinear` converts it
for a host that performs output color conversion.

The shader declares `previewKind` (0 ordinary, 1 etched, 2 prismatic, 3 cold,
4 opal), `satinCompact`, `satinHoverGain`, `wave` and `hasWave`. Pointer defaults to
(0.5,0.5), with normals/view normalized in the same coordinate system. Aspect is
card height/width. The optional `liquid: true` branch retains host-simulated height
fields (kinds 5 water and 6 hologram); the host owns their texture and scheduling.
It is separate from the complete renderer's newer rain/heat/pool treatments.

Shader programs compile once per context/material variant. Updating pose, finish
or reflection uniforms must not compose faces, derive masks or upload static
textures. Keep residency and disposal at the same scope as the scene context.
`SURFACE_GLSL` and `WORN_GLSL` expose the renderer's existing shader functions.
The host assembles its material around those sources and `foilShader()`, supplying
its own texture samplers and artwork/printing composition. No host-specific
material assembly is included in the package.

`FinishResources.documentMask(document, rasterHost, signal)` prepares the same
artwork edges, imported alpha masks, native stamp and contributing layers as the
complete renderer. For Magic, supply
`{id, revision, recipe: magic.describe(resolvedFace, 'inspect')}` with the same
resolved printing, per-face artwork placement and symbol settings used for color.
The pack's stamp painter owns styled/native symbols, alpha versus dark-ink
extraction, hidden/offset elements and its generic missing-symbol mark.

The returned canvas stores linear mask coverage in RGB with opaque alpha,
including `max(base, etchAdd) * (1 - etchExclude)`. Upload it without premultiplying
or sRGB conversion; finish shaders sample its red channel. Finish coverage
and protected-ink exclusions remain the host material's separate responsibility.
The caller owns the returned canvas and its uploaded texture. Cache them by
immutable recipe/source revision, dimensions and algorithm, releasing canvases
and textures on eviction. Never call this preparation API from a frame loop.

Standalone preparation is serialized through a bounded 16 MiB texture cache and
8 MiB edge scratch budget, sharing the full renderer's mask composer rather than
reimplementing its GPU pipeline. Source/image leases and temporary GPU leases
release after preparation. It snapshots the resulting mask to a host-owned canvas
once; it does not perform per-frame mask readback. WASM initialization is lazy and
shared with `createRenderer`; importing the finish entry point or calling the
generic `mask(source, width, height)` path does not initialize renderer WASM.
Aborts, context loss and `dispose()` cancel standalone work. Dispose the
`FinishResources` owner when the host's resource scope ends.

## Pixel kernels

```js
import { createPixelKernels } from 'card-glint/kernels';
const kernels = await createPixelKernels({ wasmUrl: '/pixels_bg.wasm' });
try {
  const alpha = kernels.etch(width, height, rgbaBytes, 20);
  // alpha is an owned, top-down R8 array, independent of later calls.
} finally {
  kernels.dispose();
}
```

The pixel-only artifact omits scene/cache/JSON machinery. Initialization is shared per JavaScript realm; a worker initializes its own realm.
A host may supply binary bytes instead of a URL, useful for verified single-file
bundles. The Rust workspace is reused until disposal, and output arrays belong
to the caller. Cache masks by source revision, dimensions and threshold. Hot cache
hits should skip both kernels and GPU uploads. WASM instance memory and retained
scratch are additional to the host's resident image/texture budget.

## Asset discovery and offline hosts

`card-glint/magic/presentation` exports `canvasAssetUrls`, `canvasFontAssets`,
`faceManaAssets`, `PLAIN_SECURITY_STAMP`, `decodeCanvasImage` and `setAssetFetcher`.
The font catalog derives from the pack's native stylesheet and retro-font
definitions. These exports discover native resources without downloading them.
The host owns offline manifests, extra prefetch variants, font registration and
cache completeness.

Install a fetch adapter with `setAssetFetcher` before preparing faces when your
host serves permitted assets from a local cache or another URL. All package
entry points in one installed package share that adapter. The host still owns
font registration, caching, offline availability and asset rights. Do not infer
redistribution permission from a public URL. Keep `LICENSE-MIT`, `LICENSE-APACHE`,
`NOTICE.md` and `games/magic/NOTICE.md` with redistributed package code, and read
the [game-pack asset notices](../games/magic/NOTICE.md) separately from the
repository's code license.
