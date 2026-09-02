# Official / public Booz Allen Hamilton logo sources (demo kit)

Downloaded for **Booz Allen Notes** client demo branding. Trademarks remain property of Booz Allen Hamilton Inc. Use is for internal/demo packaging only — not a substitute for Brand Portal clearance on external releases.

## Primary sources (boozallen.com CDN)

| Local file | Source URL | Variant |
| --- | --- | --- |
| `booz-allen-logo.svg` / `booz-allen-hamilton-logo-black.svg` | https://www.boozallen.com/content/dam/boozallen_site/homepage/booz-allen-logo.svg | Black wordmark (default fill) |
| `bah-logo-trademark.svg` / `booz-allen-hamilton-logo-white.svg` | https://www.boozallen.com/assets/home/images/homepage/bah-logo-trademark.svg | White / reverse wordmark |
| `bah-wordmark-white.svg` / `booz-allen-hamilton-wordmark-white-large.svg` | https://www.boozallen.com/assets/home/images/homepage/BAH_Wordmark_SingleLine_White-Medium_Trade-cropped.svg | Large white wordmark |
| `apple-touch-icon.png` | https://www.boozallen.com/etc/designs/boozallen/favicons/apple-touch-icon.png | 180×180 touch icon |
| `favicon-96x96.png` | https://www.boozallen.com/etc/designs/boozallen/favicons/favicon-96x96.png | Favicon |
| `favicon-32x32.png` | https://www.boozallen.com/etc/designs/boozallen/favicons/favicon-32x32.png | Favicon |
| `favicon-16x16.png` | https://www.boozallen.com/etc/designs/boozallen/favicons/favicon-16x16.png | Favicon (served 32×32) |
| `mstile-150x150.png` | https://www.boozallen.com/etc/designs/boozallen/favicons/mstile-150x150.png | Windows tile |
| `safari-pinned-tab.svg` | https://www.boozallen.com/etc/designs/boozallen/favicons/safari-pinned-tab.svg | Mask / pinned tab (embeds large PNG) |

## Wikimedia Commons (legacy / reference)

| Local file | Source URL | Notes |
| --- | --- | --- |
| `booz-allen-hamilton-logo-wikimedia.svg` | https://upload.wikimedia.org/wikipedia/commons/8/83/Booz_Allen_Hamilton_logo.svg | Older wordmark SVG |
| `booz-allen-hamilton-logo-wikimedia.png` | https://upload.wikimedia.org/wikipedia/commons/c/c3/Booz_Allen_Hamilton_logo.png | Small PNG |
| `booz-allen-hamilton-logo-wikimedia-1280.png` | https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Booz_Allen_Hamilton_logo.svg/1280px-Booz_Allen_Hamilton_logo.svg.png | Rendered PNG |

Commons page: https://commons.wikimedia.org/wiki/File:Booz_Allen_Hamilton_logo.svg

## Derived (not downloaded)

| Local file | How |
| --- | --- |
| `booz-allen-hamilton-logo-black-from-white.svg` | White trademark SVG with fill → `#000000` |
| `booz-allen-hamilton-logo-color-bah-blue.svg` | White trademark SVG with fill → `#004C97` (kit brand token) |
| `safari-pinned-embedded.png` (+ cropped) | Base64 PNG extracted from safari-pinned-tab.svg |
| `../png/official/*` wordmark/app-icon rasters | Rendered via `@resvg/resvg-js` + Pillow |
| `../png/bah-official-app-icon.{ico,icns}` + `linux/` | Demo packaging sizes from blue wordmark plate |

Retrieved: 2026-09-02
