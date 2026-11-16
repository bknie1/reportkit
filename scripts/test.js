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
test('cover: full renders a full-page cover and a contents page', () => {
  const h = kit.document('---\ntitle: T\nkicker: K\ntagline: Tag\ncover: full\ncontents: yes\nauthor: A\nversion: 2\n---\n## One\n## Two').html;
  assert(h.includes('<section class="cover">') && !h.includes('<header class="band">') && h.includes('class="contents"') && h.includes('Version 2') && h.includes('cover-doc'));
});
test('hero ring label wraps to fit inside the ring', () => {
  const h = kit.document(':::hero 97% | Of the queue resolved\nHead\n:::').html;
  assert(h.includes('>OF THE QUEUE</text>') && h.includes('>RESOLVED</text>'));
});
test('without cover: full the header band stays', () => {
  const h = kit.document('---\ntitle: T\n---\n## One').html;
  assert(h.includes('<header class="band">') && !h.includes('<section class="cover">'));
});

// ---- spreadsheets and charts ----
const sheet = require('../src/sheet');
const charts = require('../src/charts');
const { buildXlsx } = require('./xlsx-writer');
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const count = (s, re) => (s.match(re) || []).length;

test('csv handles quotes, embedded commas and a tab delimiter', () => {
  assert.deepStrictEqual(sheet.parseCsv('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepStrictEqual(sheet.parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});
test('table types columns as number, date or text and keeps blanks null', () => {
  const t = sheet.toTable(sheet.parseCsv('Task,Start,Hours\nA,2026-03-02,"1,200"\nB,3/9/2026,\nC,Mar 16 2026,5'));
  assert.deepStrictEqual(t.columns.map(c => c.type), ['text', 'date', 'number']);
  assert(t.columns[1].values[0] === Date.UTC(2026, 2, 2) && t.columns[1].values[1] === Date.UTC(2026, 2, 9));
  assert(t.columns[2].values[0] === 1200 && t.columns[2].values[1] === null);
});
test('title rows above the data are skipped by choosing the header row', () => {
  const t = sheet.toTable([['Plan'], [], ['A', 'B'], [1, 2]].slice(2));
  assert(t.columns[0].name === 'A' && t.length === 1);
});

const plan = [
  ['Task', 'Phase', 'Start', 'End', 'Done'],
  ['Design', 'Plan', D(2026, 11, 2), D(2026, 11, 20), 0.5],
  ['Build', 'Make', D(2026, 11, 16), D(2027, 1, 15), 0],
  ['Launch', 'Make', D(2027, 1, 20), null, null],
];
(async () => {
  const wb = await sheet.readWorkbook(buildXlsx([{ name: 'Plan', rows: plan }, { name: 'Other', rows: [['A'], [1]] }]), 'plan.xlsx');
  test('xlsx read: sheets, shared strings, numbers and date styles', () => {
    assert(wb.sheets.length === 2 && wb.sheets[0].name === 'Plan');
    const t = sheet.toTable(wb.sheets[0].rows);
    assert.deepStrictEqual(t.columns.map(c => c.type), ['text', 'text', 'date', 'date', 'number']);
    assert(t.columns[2].values[0] === Date.UTC(2026, 10, 2) && t.columns[4].values[0] === 0.5 && t.columns[3].values[2] === null);
  });
  const t = sheet.toTable(wb.sheets[0].rows);
  test('auto spec finds the gantt columns', () => {
    const sp = charts.autoSpec(t);
    assert(sp.type === 'gantt' && sp.task === 0 && sp.group === 1 && sp.start === 2 && sp.end === 3 && sp.progress === 4);
  });
  test('gantt draws one bar or milestone per task, a legend and a today line', () => {
    const sp = charts.autoSpec(t); sp.todayMs = Date.UTC(2026, 11, 1);
    const r = charts.render(t, sp, charts.paletteFromTemplate(kit.DEFAULT_TEMPLATE));
    assert(r.svg.startsWith('<svg') && count(r.svg, /<clipPath/g) === 2 && count(r.svg, /<path d="M[\d.]+,[\d.]+L[\d.]+,[\d.]+L[\d.]+,[\d.]+L/g) === 1);
    assert(r.svg.includes('>Today<') && r.svg.includes('>Plan<') && r.svg.includes('>Make<') && !r.warnings.length);
  });
  test('gantt without a usable end column explains what to pick', () => {
    const sp = charts.autoSpec(t); sp.end = null;
    assert.throws(() => charts.render(t, sp, null), /end date column, or a duration/);
  });
  test('gantt group colors follow the template palette and fold past six', () => {
    const rows = [['Task', 'Group', 'Start', 'End']];
    for (let i = 0; i < 8; i++) rows.push(['T' + i, 'G' + i, D(2026, 1, 1 + i), D(2026, 1, 5 + i)]);
    const tb = sheet.toTable(rows), r = charts.render(tb, charts.autoSpec(tb, 'gantt'), charts.paletteFromTemplate({ colors: { primary: '#112233' } }));
    assert(r.svg.includes('#112233') && r.svg.includes('>Other<') && r.warnings.length === 1);
  });
  test('column chart draws a bar per category and series; stacked draws segments', () => {
    const tb = sheet.toTable(sheet.parseCsv('Term,A,B\nF23,10,5\nF24,12,6\nF25,15,8'));
    const pal = charts.paletteFromTemplate(null);
    assert(count(charts.render(tb, charts.autoSpec(tb, 'bar'), pal).svg, /<path d=/g) === 6);
    assert(count(charts.render(tb, charts.autoSpec(tb, 'stacked'), pal).svg, /<path d=/g) === 6);
    assert(count(charts.render(tb, charts.autoSpec(tb, 'line'), pal).svg, /<circle/g) === 6);
  });
  test('ranked bars sort largest first; share folds a long tail into Other', () => {
    const tb = sheet.toTable(sheet.parseCsv('Name,N\nsmall,1\nbig,9\nmid,5'));
    const svg = charts.render(tb, charts.autoSpec(tb, 'hbar'), null).svg;
    assert(svg.indexOf('>big<') < svg.indexOf('>mid<') && svg.indexOf('>mid<') < svg.indexOf('>small<'));
    const many = sheet.toTable(sheet.parseCsv('Name,N\n' + Array.from({ length: 9 }, (_, i) => 'p' + i + ',' + (10 - i)).join('\n')));
    assert(charts.render(many, charts.autoSpec(many, 'share'), null).svg.includes('>Other<'));
  });
  test('a chart block in a report draws an svg and reports a missing column', () => {
    const md = ':::chart gantt Plan\ntask: Task\nstart: Start\nend: End\n\nTask,Start,End\nA,2026-01-05,2026-01-30\nB,2026-02-02,2026-02-27\n:::';
    const r = kit.document(md);
    assert(r.html.includes('<figure class="chart"><svg') && !r.warnings.length);
    assert(kit.document(md.replace('start: Start', 'start: Nope')).warnings.some(w => /Nope/.test(w)));
  });
  test('toBlock writes a block that reads back to the same chart', () => {
    const sp = charts.autoSpec(t); sp.title = 'Round trip'; sp.todayMs = 0;
    const block = charts.toBlock(t, sp);
    assert(block.startsWith(':::chart gantt Round trip') && block.includes('group: Phase') && block.includes('2026-11-02'));
    assert(kit.document(block).html.includes('<figure class="chart"><svg'));
  });
  console.log(n + ' passed');
})().catch(e => { console.error(e); process.exit(1); });
