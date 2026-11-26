# Third-Party Notices

## MingCute Icons

- Package: `@mingcute/svg` 3.0.2, `core-regular` style.
- Website: https://www.mingcute.com/
- Project: https://github.com/mingcute-design/mingcute-icons
- License: Apache-2.0; full text in `miniprogram/assets/icons/mingcute/LICENSE`.
- Usage: shared `lp-icon` glyphs and diary UI icons. SVG `currentColor` is replaced with the project foreground color for local image rendering. Per-file sources are recorded in `miniprogram/assets/icons/mingcute/sources.json`. The diary landscape is an illustration rather than a UI icon.

## Lucide Icons

- Source: the Web prototype’s `lucide-react` dependency.
- License: ISC; some glyphs remain under the Feather MIT license. Full notice in `miniprogram/assets/icons/line/LICENSE`.
- Usage: line icons on the Home, Todo and Diary trial pages, with local PNG fallbacks. The glyphs retain Lucide’s geometry and use the project’s stroke weight and colors.

## TDesign MiniProgram

- Package: `tdesign-miniprogram`
- Project: https://github.com/Tencent/tdesign-miniprogram
- License: MIT
- Usage: the `lp-button` base component wraps TDesign Button, and navigation/business surfaces use TDesign Icon glyphs. Product colors, spacing, typography, radii, cards, navigation layout and business components remain project-specific implementations derived from the Love App design.

No source code from the other reference repositories listed in `docs/DEVELOPMENT_PLAN.md` has been copied into the current implementation.

## WeChat Server SDK

- Package: `wx-server-sdk`
- Publisher: Tencent CloudBase
- Usage: OpenID context, CloudBase database, server dates and transactions inside the `api` cloud function.
