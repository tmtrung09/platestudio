# Optional Liquid Glass

Settings → Liquid Glass is off by default. The existing local device preference is retained; changes apply on reload, without interrupting uploads or unfinished work.

## Engine

Replaces NaughtyDuk liquid-gl with **@ybouane/liquidglass 1.0.3**:
https://liquid-glass.ybouane.com/ and https://github.com/ybouane/liquidglass.
`npm run build:glass` copies the published bundle and source map unmodified.
The package declares MIT licensing and bundles html-to-image; attribution is in assets/vendor/NOTICE.txt.

One instance and one decorative lens serve the mobile dock or the open Menu sheet. The root is the app's main container, not the entire body with all dialogs. Native controls are not moved or rasterized. Shader defaults remain upstream; corner radius matches each surface, and the Menu uses the documented frosted-panel blurAmount 0.25 for readable text. No additional pixel tint/contrast filter is applied. Desktop keeps its existing interface.

## Lifecycle and scroll

- Destroy the GPU instance on desktop, hidden document, camera entry, or page exit. Recreate when needed; prevent late async initialization from reviving a disposed instance.
- Retain ordinary CSS glass if the module or WebGL cannot initialize.
- Nested scroll handlers do not measure geometry or rasterize. Wait for 500 ms of quiet and schedule a single idle refresh. Background remains cached during scrolling, rather than claiming live per-frame DOM capture.
- The upstream SVG capture does not preserve nested scroll offsets. An inert offscreen viewport clone translates its children to the current scroll position, then updates the pinned library's public capture cache. It never moves live content and is always removed. Tests check actual red/blue pixels after a long scroll, not just successful canvas creation.
- Restore text selection and temporary positioning on teardown. A theme-color canvas supplies the root background because upstream captures root children only. Camera and native dialog contents are not part of the captured root.

## Verification

`npm run qa:glass`: original vendor equality, settings in both themes and mobile/desktop, zero library download while disabled, GPU initialization, no rasterization during scroll bursts, correct scrolled pixels, menu sharing one renderer, camera/desktop cleanup, reload persistence.

`npm run qa:all` and `git diff --check` are required before publishing. Headless Chromium tests do not establish a frame-rate guarantee on physical iPhone Safari.
