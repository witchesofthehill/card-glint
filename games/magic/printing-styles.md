# Reusable printing styles

`card-glint/magic` exports `PrintingStyle`, `PrintingStyleChoice`,
`printingStyles`, `validatePrintingStyle`, `resolvePrintingStyle`,
`printingStyleOptions`, and `composePrintingSelection`. These are pure presentation
APIs. A host owns set membership, persistence, revision IDs, asset uploads and its
editor UI. Existing `PrintingSelection` values and `resolvePrintingPreset` remain
supported.

The Core Set 2021 modern style retains its legendary frame and matching crown
on lands. With `colorCalibration: 'set-hsb-v1'`, its source-bound outer border
uses the measured `#16130e` stock target, including two-color land frames.
This transfers border stock only: procedural land-paper blends still have no
pigment calibration, and artwork, semantic colors and explicit frame palettes
stay unchanged. White/silver borders, special templates and unmatched sources
do not inherit that stock correction.

A style offers named frame options, rather than equating one set with one frame.
The built-in Planar Chaos style offers regular and colorshifted frames. Future
Sight offers regular, Futureshifted, full-art and clear frames. Their automatic rules preserve
explicit source treatment/template markers. Colors alone cannot distinguish
those printings; an importer should still use `resolveScryfallPrinting`.

```js
const style = {
  version: 1,
  id: 'mixed',
  label: 'An original mixed-frame set',
  collectorSetCode: 'MIX',
  symbols: { default: '/symbols/common.svg', rare: '/symbols/rare.svg' },
  defaults: { overrides: { legalText: 'Original custom set', collectorTotal: 180 } },
  defaultFrame: 'regular',
  frames: [
    { id: 'regular', label: 'Regular', selection: { preset: 'plc' } },
    { id: 'shifted', label: 'Colorshifted', selection: { preset: 'plc-colorshifted' } },
    { id: 'future', label: 'Futureshifted', selection: { preset: 'fut' } },
  ],
  rules: [
    { id: 'artifacts', when: { artifact: true }, frame: 'regular' },
    { id: 'red', when: { colors: ['R'], land: false }, frame: 'shifted' },
    { id: 'blue', when: { colors: ['U'] }, frame: 'future' },
  ],
};
const automatic = resolvePrintingStyle(card, style);
const manual = resolvePrintingStyle(card, style, { frame: 'regular' });
const perFace = resolvePrintingStyle(
  card,
  style,
  {},
  {
    frame: 'future',
    overrides: { collectorNumber: '42' },
  },
);
```

## Resolution and inheritance

Frame selection uses face choice, then card choice, then the first matching rule,
then the declared default frame. Rule order is authored and stable; there is no
implicit specificity score. Conditions within a rule are ANDed; listed types,
layouts, templates, treatments and rarities are any-of. `colors` is an exact,
unordered palette, including `[]` for colorless; `colorCount: [2, 5]` matches
multicolor. `colorSource: 'card'` uses semantic colors; the default `'printing'` uses
the source printing palette, including basic-land palettes, before any explicit
`frameColors` recoloring. A palette override never selects a different frame.
Same-side split cards match the union of their panel palettes. Type conditions
also honor the semantic creature/artifact/land/legendary traits retained by the
wording adapter.

Presentation combines the chosen frame selection, shared defaults, printed set
identity, matching rule defaults, card overrides, and face overrides, in that
order. A manual frame choice overrides the frame decision while retaining the
matching rule's other defaults. Rules are evaluated once before palette overrides, preventing recursive frame
selection or a recoloring effect from switching the chosen frame.

Omission inherits. Existing null values retain explicit-hide semantics. Clear a
local override to return to its parent's value; `false` and `[0, 0]` are explicit
visibility/position overrides. Nested element and symbol-transform fields merge;
coordinate arrays replace atomically. The APIs clone supplied data and never
modify the source card or definition. Resolve once from the original card and
combined selection, rather than applying successive painted outputs as presets.

Calibration set codes belong to the chosen preset, or explicit `styleSetCode`.
The style's `collectorSetCode` and symbols supply its printed identity without
replacing those calibration sources. Existing `setCode` overrides remain
supported; using both code overrides is an error. Presentation `frameColors`
never rewrites semantic colors, mana cost or color identity, and never participates
in frame-option rules. For a temporary game effect, recolor the already-resolved
printing: `{ ...result.face, frameColors: ['G'] }`. Its preset, template, treatment,
fonts and mana symbols remain fixed. `magic.describe` never reruns style rules.
If semantic colors also change in game state, retain the resolved printing/frame
choice rather than treating those runtime changes as a newly authored card. Custom symbol assets
may vary by rarity; a missing variant uses `default`, while null hides a variant.
Fine symbol transforms are supported for ordinary frames. Futureshifted retains
native symbol geometry and supports the separate element translations.

## Compatibility and storage

`printingStyleOptions` reports supported options and reasons using the effective
palette and overrides. Explicit incompatible frame choices throw. An automatic
incompatible choice tries the declared default; if that also fails, it keeps the
native layout and reports a notice. Unsupported inherited element movement,
symbol fine adjustment or art modes are omitted with notices. Invalid explicit
card/face controls throw, allowing an editor to ask for a correction. Always show
these notices instead of disguising a layout change.

The Futureshifted full-art option is textless and requires one printed frame
color. Compatibility reports these constraints before loading assets; it never
removes supplied rules text to make a frame fit.

The prototype supports ordinary frames and spell splits for replacement frames;
it does not add painters for every layout. Two-sided cards are resolved once per
physical face with independent choices. Same-side split cards keep one compatible
frame era. Artwork source images and crops normally remain per-card data, even
when a set supplies an art mode or opacity default.

Definitions use schema `version: 1` and contain only bounded serializable data;
unknown fields and invalid dormant rules are rejected. Store the original
source card, the style or its pinned revision, and sparse local overrides. A
share can embed a style snapshot so later set edits do not change the shared
printing. The result includes the resolved selection, chosen frame, decision
source, matched rule and notices for previews, exports and editor explanations.

## Calibration defaults

Frame selection and printing colors are independent. An optional
`overrides.calibration` works in a preset selection, style defaults, rule defaults,
card choice, or face choice. The last explicit choice wins as one value:

```ts
const result = resolvePrintingStyle(card, style, {
  overrides: { calibration: 'auto' },
});
// result.face: render this same value for previews and exports.
// result.calibration: applied component coverage and provenance.
```

| Choice                      | Behavior                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Omitted                     | Retains existing `colorCalibration` behavior.                                                                      |
| `'printing'`                | Enables exact printing/source calibration only.                                                                    |
| `'auto'`                    | Enables exact corrections, then fills compatible missing materials from a registered family default.               |
| `'source'`                  | Disables optional set color/black-point corrections; keeps frame construction, palette, glyph choice and geometry. |
| `{ profile: 'm21-modern' }` | Uses the compatible M21 frame-color/border donor explicitly; mana still follows its own printing.                  |

The same choice is available as `MagicCard.calibration` for direct callers.
The policy never changes the card's set, layout, title/type typography, symbol,
collector data, wording, or illustration. Existing callers do not opt in merely
by upgrading. The existing `set-hsb-v1` flag and calibration coverage helper keep
their exact-source semantics for accuracy tools.

`printingCalibrationApiVersion` is `1`. `printingCalibrationProfiles` provides
immutable profile IDs, labels and revisions. `printingCalibrationOptions(face)`
adds compatibility reasons for a host's picker. `resolvePrintingCalibration(face)`
is a pure, synchronous report; `resolvePrintingStyle()` and supported entries from
`printingStyleOptions()` also include it. All are exported from `card-glint/magic`
and `card-glint/magic/presentation`.

The report separates frame pigment, text-box pigment, outer border, interior ink,
and mana colors. Each component reports `measured`, `fallback`, `mixed`, or
`source`, with the applicable donor/printing ID, revision, assets and border color.
Mana entries also list corrected symbol keys. This describes corrections, not a
whole-card accuracy guarantee. `source` can include an already suitable source
asset for which no correction is applied.

The initial registered family default is M21 modern. Automatic mode leaves early,
Eighth, flip and Futureshifted families on their exact printing corrections until
compatible defaults are reviewed. It supplies the M21 outer-border target
(`#16130e`) to supported modern faces, including modal/transform sides,
planeswalkers, Sagas, Adventures, Prepared, Rooms, splits, Aftermath and Battles.
White and silver borders remain distinct. Modern full plates use an edge-connected
neutral-stock selection in their own source coordinates; interior black ink and
colored textures are excluded. Shared component color adjustments transfer only
by identical pinned asset URL. No ordinary paper rectangle is transferred to a
different special-frame source. Unknown textures and interior ink keep their
source values and are reported as such.

Resolve physical front/back selections separately. Composite panels keep their
native painter and source assets; a policy changes the physical face's appearance,
not its panel geometry. A newer exact printing fit wins over automatic defaults.
Store the choice, not copies of calibration tables. Save the renderer version and
report alongside exported diagnostics when reproducibility matters.

All corrections run during cached material preparation. Cache identity includes
the explicit policy and complete resolved material adjustments. Animation does
not decode assets, read masks, or recolor pixels.

The legacy regression receipt records complete PNG hashes against 0.4.9. Its
companion source-extension receipt binds the new modules and reversibly
reconstructs the old guarded modules. Historical calibration receipts keep their
original source hashes and scores; the compatibility guard does not claim that
fallback modes have been calibrated against those scans. The separate policy
suite exercises the current implementation directly.
