// Smoke tests for the renderer and the template rules. Run with: npm test
const assert = require('assert');
const kit = require('../src/render');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok - ' + name); };
const doc = (md, opts) => kit.document(md, opts).html;

test('progress item becomes a meter', () => {
  const h = kit.convert('- [45/60] Label {amber}').html;
  assert(h.includes('class="meter"') && h.includes('45 of 60') && h.includes('width:75%') && h.includes('fill-amber'));
});
test('plain numbers in prose are not metrics', () => {
  assert(!kit.convert('We closed 45 of 60 items.').html.includes('meter'));
});
test('bar widths come from the numbers', () => {
  const h = kit.convert(':::bar\n- 1 A\n- 3 B\n:::').html;
  assert(h.includes('width:25%') && h.includes('width:75%'));
});
test('hero ring offset follows the percentage', () => {
  assert(kit.convert(':::hero 50% | Label\nHead\n:::').html.includes('stroke-dashoffset="194.8"'));
});
test('example blocks nest by colon count', () => {
  const h = kit.convert('::::example\n:::stats\n- 1 | A\n:::\n::::').html;
  assert(h.includes('class="example') && h.includes('class="card'));
});
test('pill colors are inferred from common words', () => {
  assert(kit.convert('[[Blocked]] [[Done]] [[Odd|gold]]').html.match(/pill red/) && kit.convert('[[Done]]').html.includes('pill green'));
});
test('html in text is escaped', () => {
  assert(!kit.convert('<script>x</script>').html.includes('<script>'));
});
test('default template renders a logo and palette variables', () => {
  const h = doc('# T');
  assert(h.includes('class="wordmark"') && h.includes('--primary:' + kit.DEFAULT_TEMPLATE.colors.primary));
});
test('template colors override the palette, bad values fall back', () => {
  const h = doc('# T', { template: { colors: { primary: '#112233', accent: 'red; } body{display:none' } } });
  assert(h.includes('--primary:#112233') && !h.includes('body{display:none') && h.includes('--accent:' + kit.DEFAULT_TEMPLATE.colors.accent));
});
test('template logo is sanitized', () => {
  const t = kit.normalizeTemplate({ logo: { svg: '<svg onload="x()"><script>1</script></svg>' } });
  assert(t.logo.svg === '<svg></svg>');
});
test('template without a logo renders no wordmark', () => {
  assert(!doc('# T', { template: { logo: null } }).includes('class="wordmark"'));
});
test('only data-image assets are accepted and asset: images resolve', () => {
  const t = { assets: { ok: 'data:image/png;base64,AAAA', bad: 'https://example.com/x.png' } };
  assert(Object.keys(kit.normalizeTemplate(t).assets).join() === 'ok');
  assert(doc('![Cap](asset:ok)', { template: t }).includes('src="data:image/png;base64,AAAA"'));
  assert(kit.document('![Cap](asset:missing)', { template: t }).warnings.length === 1);
});

test('azure devops ::: mermaid fence draws a diagram', () => {
  const r = kit.convert('::: mermaid\ngantt\n    title T\n:::');
  assert(r.mermaid && r.html.includes('class="mermaid"') && r.html.includes('gantt') && !r.warnings.length);
});
test('[[_TOC_]] lists the sections', () => {
  const h = kit.convert('---\ntitle: T\n---\n[[_TOC_]]\n# One\n## Two').html;
  assert(h.includes('class="toc"') && h.includes('href="#sec-1"') && h.includes('id="sec-2"') && !h.includes('_TOC_'));
});

console.log(n + ' passed');
