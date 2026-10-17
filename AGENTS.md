# card-glint

Read README.md and docs/architecture.md before changing ownership or interfaces.
The Rust core and browser backend must not import a game pack, host application,
UI framework, or engine model. Game packs own asset URLs, frame geometry,
typography, vocabulary, and semantic hit regions. Keep packs independent.

Use the pinned Rust toolchain, edition 2024, workspace lints, safe typed boundaries,
and exhaustive error handling. Unsafe code is forbidden. Run strict Clippy and
rustfmt. Keep modules small; numerical lint exceptions need local reasons.

For source-install changes, keep rustup provisioning in the caller's installation
environment. The private Cargo build cache is not a rustup installation; verify
this boundary in the official Rust-based container as well as on macOS.
Keep Git-install preparation and fork distribution changes separate from the
upstream renderer API contribution.

Run npm run check, npm run build, npm run test:package, npm run test:browser, and
npm run test:showcase for renderer changes. Browser tests need npm run preview.
On macOS arm64, WebKit 2287's stock-border aperture-alpha check differs by one
pixel on unmodified upstream `3652e30` as well as this integration. Report that
baseline separately; keep the assertion rather than loosening it during merges.
No per-frame decoding, font loading, shader compilation, or mask readback.
Document benchmark scope: CPU submission time is not GPU completion time.
Never silently use another game's painter or publish partial face revisions.

The public showcase must load only original repository assets. External art
reference metadata belongs in its game pack with attribution; do not copy those
assets into the showcase or README images. Do not add private host paths or
internal project names. Keep the Magic pack's fan notice and source links in
games/magic/. The root README describes the game-neutral library.
