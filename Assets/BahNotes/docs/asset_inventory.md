# Current Joplin fork logo / icon inventory

Snapshot of branding-related assets still using **upstream Joplin** artwork (see `Assets/LICENSE`). None of these have been replaced with BAH marks yet.

## Master / source marks (`Assets/`)

| File | Role |
| --- | --- |
| `JoplinIcon.svg` | Primary app icon (blue gradient + white J) |
| `JoplinIconBlack.svg` | Monochrome icon |
| `JoplinLetter.svg` / `JoplinLetterBlue.svg` / `JoplinLetter.png` / `.eps` | Letter mark |
| `JoplinLogoBlue.svg` / `.png` | Full Joplin wordmark + icon |
| `SquareIcon512.png` / `SquareIcon1024.png` | Square masters |
| `SmallTile.svg` / `Square150x150Logo.svg` | Windows tile SVGs |
| `IconBackgroundSquare.png` | Background plate |
| `macOs.icns` + `macOs.iconset/*` | macOS app icon pack |
| `macOsIcon*.psd` / `macOsTemplateIcon*.psd` | Photoshop sources |
| `LinuxIcons/{16..1024}.png` | Linux icon theme sizes |
| `ImageSources/Joplin.ico` | Windows `.ico` (`build.win.icon`) |
| `ImageSources/Android/*` | Android launcher sources |
| `ImageSources/JoplinCloudIcon.svg` / `JoplinCloudIcon2.svg` / `JoplinServerIcon.svg` | Server / Cloud marks |
| `iOSIcons/*` | Legacy iOS marketing sizes |
| `WebsiteAssets/*` | Website / favicon assets |
| `Forum/*` | Forum logos |

## Packaging consumers (demo-wired)

| Surface | Path |
| --- | --- |
| Desktop Windows | `packages/app-desktop/package.json` → `build.win.icon` = `../../Assets/BahNotes/png/bah-official-app-icon.ico` |
| Desktop macOS | `build.mac.icon` = `../../Assets/BahNotes/png/bah-official-app-icon.icns` |
| Desktop Linux | `build.linux.icon` = `../../Assets/BahNotes/png/linux` |
| About / tray / Linux window | `packages/app-desktop/build/icons/*` (demo blue wordmark plate) |
| Image pipeline | `packages/tools/` generate-images tooling (still Joplin sources by default) |
| Android mipmaps / adaptive | `packages/app-mobile/android/.../res/mipmap-*` + `drawable/ic_launcher_*` (BahNotes demo plate) |
| iOS AppIcon | `packages/app-mobile/ios/.../AppIcon.appiconset/` (BahNotes demo plate; dark = black plate) |
| Web PWA icons | `packages/app-mobile/web/public/icons/icon-*.png` (BahNotes demo plate) |

## BahNotes kit

- Interim product marks: `Assets/BahNotes/svg/`, interim `png/bah-notes-*`
- Official corporate demo logos: `Assets/BahNotes/logos/official/` (+ `SOURCES.md`)
- Demo packaging exports: `Assets/BahNotes/png/bah-official-*`, `png/official/`, `png/linux/`
