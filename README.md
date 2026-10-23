# ReportKit

Write a report as plain markdown with a few extra marks and get a finished, styled report: a header band, progress bars, stat cards, status pills, callouts, tables and UML diagrams. It runs offline as a desktop app, a single HTML file, or a command line tool, and the whole look (palette, font, logo, images) comes from a template file you can swap, import and export.

## Quick start

Open `dist/studio.html` after `npm run build`, or run the desktop app:

```bash
npm install
npm start
```

Press **Demo** in the Studio to load a guided tour: each mark is shown as the text you write beside the result you get.

From the command line:

```bash
node src/cli.js report.md report.pdf
node src/cli.js report.md report.html --template my-brand.rktemplate.json
node src/cli.js --export-template my-brand.rktemplate.json
```

PDF output needs Chrome, Edge or Chromium installed (set `REPORTKIT_BROWSER` to its path if it is not found). The desktop app prints PDFs itself.

## Markdown+

Everything in plain markdown works. A number becomes a metric only when you mark it; nothing is inferred from prose.

| Write | Get |
|---|---|
| `---` block with `title`, `kicker`, `subtitle`, `source`, `footer` | Header band and footer line |
| `- [80%] Label {blue}` or `- [45/60] Label` | Progress bar; a list of these stacks as meters |
| `[70%]` or `[45/60]` in a table cell | Mini bar in the cell |
| `:::stats` with lines `- 55 \| Label \| Sub \| color` | Big-number cards |
| `:::bar Title` with lines `- 55 Label {color}` | One stacked bar sized by the numbers, with legend |
| `:::hero 76% \| Label`, headline line, paragraph line | Donut ring with headline |
| `[[Done]]`, `[[Blocked\|red]]` | Status pill; common words pick a color |
| `> [!good] Title` then `>` body lines | Callout: note, good, warn, bad |
| `- [x]` / `- [ ]` | Checklist |
| `:::defs` with lines `- Term :: meaning` | Definition grid |
| `:::panel Title`, `:::columns` split by a `\|\|\|` line | Boxed group, two columns |
| `:::testcard 1 Title` with `Key :: value` meta lines, markdown, then `Pass: ...` and `Fail: ...` | Numbered test card: a title and description, a meta row, `Link:` and `Record:` lines, a `**Label** · note` heading, and closing green Pass and red Fail boxes |
| `::::example` | Shows the text you wrote beside the result; add `stack` to put the result below |
| `` ```mermaid `` | UML or flow diagram, drawn offline |
| `![Caption](asset:name)` | An image stored in the active template |
| `<!-- pagebreak -->` | New printed page |

A block closes on a line with exactly as many colons as opened it, so nest by giving the outer block more colons.

Mark colors are `blue gold green sage amber red grey`. In a template, blue is the primary color and gold is the accent.

## Templates

A template is one JSON file, `*.rktemplate.json`. It holds a name, a twelve-color palette, a font stack, a logo and named image assets.

```json
{
  "format": "reportkit-template",
  "version": 1,
  "name": "Example",
  "colors": {
    "primary": "#1e3a5f", "primary2": "#2f5d8a", "accent": "#e0a526", "accentDeep": "#8a6410",
    "ink": "#1c2530", "muted": "#5b6774", "success": "#2e9e4f", "sage": "#7cc9a0",
    "warning": "#e08a1a", "danger": "#d93a46", "info": "#1f64c4", "grey": "#c4c9cf"
  },
  "font": "\"Segoe UI\",Arial,sans-serif",
  "logo": { "svg": "<svg ...>", "height": 26, "color": "#ffffff" },
  "assets": { "diagram": "data:image/png;base64,..." }
}
```

- **Logo:** `svg` markup (it takes the `color` value) or `src` as a `data:image/...` URI. Use `"logo": null` for none.
- **Assets:** `data:image/...` URIs only, referenced in a report as `![Caption](asset:diagram)`.
- **Tints and shades** (borders, pill backgrounds, text on colored fills) are derived from the palette, so twelve colors restyle the whole report.
- **Studio:** use **Edit template** to change colors, the logo and images with a live preview, **Export** to save the file, and **Import** to load one. Templates you save are kept in the app.
- **CLI:** `--template file.rktemplate.json`. `--export-template` writes the built-in default as a starting point; the same file is in `templates/default.rktemplate.json`.

Templates from other people are treated as untrusted data: colors must be hex values, SVG logos are stripped of scripts and event handlers, and assets must be data images.

## Build the desktop app

```bash
npm run dist            # portable exe and installer in release/
npm run dist:portable   # portable exe only
```

The build uses electron-builder. Code signing is off, so Windows SmartScreen may warn on first run.

## Project layout

| Path | What it is |
|---|---|
| `src/render.js` | The renderer and template rules. Pure, runs in node and the browser |
| `src/cli.js`, `src/pdf.js` | Command line and PDF through an installed browser |
| `studio/` | Studio source; `npm run build` inlines everything into `dist/studio.html` |
| `electron/` | Desktop shell and native PDF export |
| `templates/` | The default template as a file |
| `examples/` | `demo.md` and `sample.md` |
| `vendor/` | Bundled Mermaid, see `NOTICE.md` |

Run the tests with `npm test`.

## License

MIT. See `LICENSE` and `NOTICE.md`.
