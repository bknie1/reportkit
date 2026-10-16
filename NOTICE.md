# Third-party notices

ReportKit bundles one third-party library.

## Mermaid

- File: `vendor/mermaid.min.js`, version 10.9.1
- Source: https://github.com/mermaid-js/mermaid (distributed through the `mermaid` npm package)
- License: MIT, Copyright (c) Knut Sveidqvist and contributors

Mermaid is inlined into a generated report only when that report contains a `mermaid` diagram block, so the report opens offline.

The desktop app is built on Electron (MIT) and packaged with electron-builder (MIT). Neither is stored in this repository; they are installed from npm when you build the app. A built installer or portable exe includes Electron, and Electron's own license files ship inside it.
