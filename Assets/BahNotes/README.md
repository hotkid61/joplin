# Booz Allen Notes — Branding Kit (Demo)

Reusable branding deliverables for the BAH Joplin fork (`Booz Allen Notes`). This kit now includes **publicly hosted Booz Allen Hamilton corporate logo assets** pulled for a **client demo**, plus interim product placeholders and packaging exports.

**Demo use only.** Official trademarks remain property of Booz Allen Hamilton Inc. Prefer Brand Portal / Creative Services assets before any external or store release.

## Status

| Asset | Status |
| --- | --- |
| Color tokens (CSS / JSON) | Ready for UI theming |
| "Booz Allen Notes" wordmark (SVG/PNG) | Interim product placeholders in `svg/` / `png/` |
| App icon mark (SVG/PNG sizes) | Interim "N" note-mark **and** demo official wordmark plate |
| Official BAH corporate logo (black / white / blue) | **Included for demo** — see `logos/official/` |
| Official packaging icons (ICNS / ICO / Linux) | **Demo-wired** — see `png/bah-official-app-icon.*` |

## Product identity (from fork)

See also [`readme/rebrand_identity_matrix.md`](../../readme/rebrand_identity_matrix.md).

- Display name: **Booz Allen Notes**
- Desktop app ID: `com.boozallen.bahnotes-desktop`
- Mobile IDs: `com.boozallen.bahnotes`

## Colors (publicly cited — verify with Brand)

Public third-party summaries commonly cite:

| Token | HEX | RGB | Notes |
| --- | --- | --- | --- |
| `bah-blue` | `#004C97` | `0, 76, 151` | Dominant brand blue (unverified vs internal guide) |
| `bah-dark-gray` | `#333333` | `51, 51, 51` | Supporting dark gray; PMS 447 C cited |
| `bah-black` | `#000000` | `0, 0, 0` | Modern public wordmark is often monochrome |
| `bah-white` | `#FFFFFF` | `255, 255, 255` | On-primary / reverse |

**Important:** ColorCodeGuide labels these HEX values as *unverified* (no named official PDF on record). Modern public BAH identity on boozallen.com is frequently **black/white wordmark**. Confirm final palette with BAH Brand / Marketing before external release.

Supporting UI neutrals used in this kit:

| Token | HEX | Use |
| --- | --- | --- |
| `bah-blue-dark` | `#003A73` | Icon shade / pressed |
| `bah-blue-light` | `#3370AC` | Hover / secondary |
| `bah-surface` | `#F5F7FA` | Light UI chrome |
| `bah-muted` | `#6B7280` | Secondary text |

Files: [`css/bah-notes-tokens.css`](css/bah-notes-tokens.css), [`css/bah-notes-colors.json`](css/bah-notes-colors.json).

## Typography (public notes)

- Official corporate wordmark: geometric / gothic sans (third parties compare to **Franklin Gothic**-like faces). Exact licensed font is **internal**.
- Interim product UI recommendation (system-safe):
  - **UI sans:** `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`
  - **Preferred licensed substitutes when Brand approves:** Franklin Gothic / ITC Franklin Gothic, or firm-standard sans from the brand portal
  - **Monospace (editor/code):** `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

Do not embed proprietary BAH font files in this repo without license clearance.

## Official logos (demo)

Masters and source URL table: [`logos/official/SOURCES.md`](logos/official/SOURCES.md). Canonical copies also sit in [`templates/official/`](templates/official/).

| Variant | Master | Notes |
| --- | --- | --- |
| Black wordmark | `logos/official/booz-allen-hamilton-logo-black.svg` | From boozallen.com homepage CDN |
| White / reverse | `logos/official/booz-allen-hamilton-logo-white.svg` | Homepage trademark SVG |
| Large white | `logos/official/booz-allen-hamilton-wordmark-white-large.svg` | Homepage cropped wordmark |
| Color (kit blue) | `logos/official/booz-allen-hamilton-logo-color-bah-blue.svg` | Derived fill `#004C97` |
| Favicons / touch | `logos/official/apple-touch-icon.png`, `favicon-*.png`, `mstile-150x150.png` | `/etc/designs/boozallen/favicons/` |
| Legacy reference | `logos/official/booz-allen-hamilton-logo-wikimedia.svg` | Wikimedia Commons |

Raster wordmarks and app-icon candidates: [`png/official/`](png/official/). Demo packaging masters:

- `png/bah-official-app-icon.ico` / `.icns` / `*-1024.png`
- `png/bah-official-wordmark-{black,white,color}.png`
- `png/linux/{16..1024}x{size}.png`

## Logo usage notes

1. Demo branding may use the public CDN / Commons assets documented in `SOURCES.md`.
2. For production / store / customer-facing releases, still request Brand-approved masters (clear-space, misuse rules, licensed fonts) via Brand Portal / Creative Services or [Media Center](https://mediacenter.boozallen.com/).
3. Interim **Booz Allen Notes** product wordmark/icon in `svg/` remain available when a product mark (not corporate logo) is preferred as the app icon.
4. Keep clear space around marks; do not stretch or place on busy photography without Brand approval.
5. Upstream Joplin logos under `Assets/` remain Laurent Cozic copyright — do not treat them as BAH marks (see `Assets/LICENSE`).

## What's in this folder

```
Assets/BahNotes/
  README.md                 ← this file
  css/                      ← CSS variables + JSON palette
  svg/                      ← interim product wordmark + icon SVGs
  png/                      ← interim rasters + demo official packaging
  png/official/             ← official wordmark + app-icon size ladder
  logos/official/           ← downloaded corporate masters + SOURCES.md
  docs/                     ← asset inventory + packaging map
  templates/official/       ← Brand drop zone (now seeded with demo masters)
```

## Applying to packaging (wired for demo)

Desktop electron-builder paths in `packages/app-desktop/package.json` now point at BahNotes demo icons:

| Platform | Config path | Demo icon |
| --- | --- | --- |
| Windows | `build.win.icon` | `Assets/BahNotes/png/bah-official-app-icon.ico` |
| macOS | `build.mac.icon` | `Assets/BahNotes/png/bah-official-app-icon.icns` |
| Linux | `build.linux.icon` | `Assets/BahNotes/png/linux/` |

In-app About / tray / Linux window icon also use `packages/app-desktop/build/icons/*` (updated to the blue wordmark plate for demo).

Mobile Android mipmaps / adaptive icons, iOS `AppIcon.appiconset` (incl. dark), and web PWA icons are demo-wired from the official packaging plate.

Still outstanding:

1. Visual QA of `.icns` / `.ico` / tray templates at tiny sizes (wordmark plate is dense below 32px).
2. Store screenshots and installer splash.
3. `yarn verifyRebrand` after identity/asset changes.
4. Legal/Brand review before external distribution.
5. Optionally point `packages/tools/generate-images.ts` at BahNotes masters for automated regenerations.

Optional soft wiring of CSS tokens is documented in `docs/packaging_apply.md`.

## License / ownership

- Interim SVGs/PNGs in `Assets/BahNotes/svg` (and non-official `png/` interim names) are original placeholders created for this fork rebrand; treat as internal work product.
- Official BAH trademarks / CDN assets in `logos/official/` remain property of Booz Allen Hamilton Inc.; retained here for demo packaging only.
- Upstream Joplin assets remain under `Assets/LICENSE` (Laurent Cozic).
