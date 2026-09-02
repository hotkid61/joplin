# How to apply BahNotes branding into packaging

## Done for demo

1. Official public logo masters live in `Assets/BahNotes/logos/official/` (see `SOURCES.md`).
2. Demo packaging icons generated:
   - `Assets/BahNotes/png/bah-official-app-icon.ico`
   - `Assets/BahNotes/png/bah-official-app-icon.icns`
   - `Assets/BahNotes/png/linux/`
3. `packages/app-desktop/package.json` electron-builder icons point at those files.
4. `packages/app-desktop/build/icons/*` updated for About dialog / tray / Linux window icon.
5. Mobile Android mipmaps + adaptive drawables, iOS `AppIcon.appiconset` (incl. dark), and web PWA icons swapped to the demo official wordmark plate / black dark plate.

## Do now (safe)

1. Import CSS tokens into desktop/theme work:
   - `Assets/BahNotes/css/bah-notes-tokens.css` (CSS variables)
2. Use official wordmarks from `logos/official/` or `png/official/` for About mocks, decks, and docs.
3. Keep Brand Portal requests open for production-cleared masters + usage PDF.

## Desktop (electron-builder) — current demo wiring

In `packages/app-desktop/package.json` (paths relative to that package):

```json
"win": { "icon": "../../Assets/BahNotes/png/bah-official-app-icon.ico" },
"mac": { "icon": "../../Assets/BahNotes/png/bah-official-app-icon.icns" },
"linux": { "icon": "../../Assets/BahNotes/png/linux" }
```

Rebuild installers / run the desktop app to visually QA dock, tray, About, and installer icons. Wordmark-on-blue plates are dense below ~32px — expect manual polish.

## Mobile — current demo wiring

| Surface | Path | Source |
| --- | --- | --- |
| Android launcher / round | `packages/app-mobile/android/.../res/mipmap-*/ic_launcher*.png` | `png/bah-official-app-icon-1024.png` |
| Android adaptive bg | `mipmap-*/ic_launcher_background.png`, `drawable/ic_launcher_background.png` | Solid `#004C97` |
| Android adaptive fg | `mipmap-*/ic_launcher_foreground.png`, `drawable/ic_launcher_foreground.png` | White wordmark on transparent |
| iOS light AppIcon | `.../AppIcon.appiconset/ios*.png` | Blue wordmark plate |
| iOS dark AppIcon | `.../AppIcon.appiconset/ios_dark*.png` | Black wordmark plate |
| Web PWA | `packages/app-mobile/web/public/icons/icon-*.png` | Blue wordmark plate |

Optional later: point `packages/tools/generate-images.ts` source IDs at BahNotes masters so regenerations stay automated.

## Optional interim wiring (CSS only)

Desktop SCSS can `@import` the tokens file for primary accent experiments.

## Checklist

- [x] Official BAH logo SVG (black / white / colorized) obtained for demo
- [x] Demo ICO + ICNS + Linux set generated and desktop paths pointed
- [x] Android adaptive + iOS AppIcon + web icons updated for demo
- [ ] App icon master Brand-approved (may differ from corporate wordmark plate)
- [ ] Store listing screenshots refreshed
- [ ] Tiny-size / tray / dark-mode visual QA
- [ ] `yarn verifyRebrand` passes
- [ ] Legal/Brand review of trademark usage in About + installer
