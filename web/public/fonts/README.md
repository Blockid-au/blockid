# PDF fonts

`NotoSans-Regular.ttf` / `NotoSans-Bold.ttf` — Noto Sans v2.015 (SIL Open Font
License 1.1, https://github.com/notofonts/latin-greek-cyrillic), subset with
`pyftsubset` to Latin, Latin Extended-A/B, Latin Extended Additional
(Vietnamese), combining marks, general punctuation, currency, arrows and a
few geometric shapes; `--layout-features=kern` only, so precomposed
Vietnamese glyphs are used and copied text stays clean (about 78 KB each,
156 KB together). Registered by
`web/src/lib/pdf/fonts.ts` for `locale: "vi"` Trusted Business Report PDFs;
react-pdf's built-in Helvetica is WinAnsi and cannot draw Vietnamese tone
marks (G13 S-R5, W4-review follow-up c). English reports keep Helvetica
(nothing to load). `public/` is copied into every release by
`scripts/deploy-live.sh`, so the files are at `<cwd>/public/fonts/` at runtime.
