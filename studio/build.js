// Inlines the renderer, the bundled diagram library, the template editor and the starter
// documents into studio.src.html to produce one self-contained file: dist/studio.html.
//   node studio/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// "<!--" and "<script" inside an inline script switch the HTML parser into states where
// "</script>" no longer ends the block, so both are written as JS escapes.
const safeJs = js => js.replace(/<!--/g, '<\\x21--').replace(/<(\/?)script/gi, '<$1scr\\x69pt');
const safeJson = v => JSON.stringify(v).replace(/<(?=!--|\/?script)/gi, '\\u003c');

const lib = path.join(root, 'vendor/mermaid.min.js');
const fill = {
  '/*@@RENDER@@*/': safeJs(read('src/render.js')),
  '/*@@TPL_CSS@@*/': read('studio/template-ui.css'),
  '<!--@@TPL_HTML@@-->': read('studio/template-ui.html'),
  '/*@@TPL_JS@@*/': safeJs(read('studio/template-ui.js')),
  '/*@@MERMAID@@*/': safeJson(fs.existsSync(lib) ? read('vendor/mermaid.min.js') : ''),
  '/*@@SAMPLE@@*/': safeJson(read('examples/sample.md')),
  '/*@@DEMO@@*/': safeJson(read('examples/demo.md')),
};
let html = read('studio/studio.src.html');
for (const [k, v] of Object.entries(fill)) html = html.split(k).join(v);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'studio.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
