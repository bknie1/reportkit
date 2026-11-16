// The component library behind the Studio's right-click menu, Insert toolbar and drag and drop.
// Plain data plus one pure helper, so it runs in node (the tests render every component) and the browser.
//   item: { label, hint, text }            markdown inserted as its own block
//         { label, hint, text, inline }    inserted at the cursor with no blank lines around it
//         { label, hint, front: {k: v} }   keys added to the header block at the top of the report
//         { label, hint, action: 'sheet' } opens Chart mode with the file picker
//   sel: text inside `text` that is selected after inserting, so the user can type over it
//   quick: shown as a button in the Insert toolbar
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportKitComponents = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const GROUPS = [
    { group: 'Document', items: [
      { label: 'Title block', hint: 'Header band at the top', front: { title: 'Report title', kicker: 'Team or program', subtitle: 'Prepared for the steering group, Month Year' } },
      { label: 'Full-page cover', hint: 'Cover page with title and author', front: { cover: 'full', tagline: 'One sentence that says what this report is', author: 'Your name', version: '1.0', date: 'Month Year' } },
      { label: 'Contents page', hint: 'Lists every section', front: { contents: 'yes' } },
      { label: 'Source and footer line', hint: 'Small print at the bottom', front: { source: 'Where the numbers came from', footer: 'Report name' } },
    ] },
    { group: 'Text', items: [
      { label: 'Section heading', hint: 'A new section with an introduction', text: '## Section title\n\nWrite a short introduction for this section.', sel: 'Section title' },
      { label: 'Subheading', hint: 'A smaller heading inside a section', text: '### Subheading', sel: 'Subheading' },
      { label: 'Paragraph', hint: 'Plain text; **bold** and *italic* work', text: 'Write your text here. Use **bold** for emphasis.', sel: 'Write your text here. Use **bold** for emphasis.' },
      { label: 'Bulleted list', hint: 'Points in any order', text: '- First point\n- Second point\n- Third point', sel: 'First point' },
      { label: 'Numbered steps', hint: 'Steps in order', text: '1. First step\n2. Second step\n3. Third step', sel: 'First step' },
      { label: 'Quote', hint: 'Set-off text', text: '> A quote, or a note from someone.', sel: 'A quote, or a note from someone.' },
      { label: 'Divider', hint: 'A thin line', text: '***' },
      { label: 'Page break', hint: 'Start a new printed page', text: '<!-- pagebreak -->', quick: true },
      { label: 'Contents list', hint: 'Links to every section', text: '[[_TOC_]]' },
    ] },
    { group: 'Numbers and progress', items: [
      { label: 'Headline number', hint: 'Big ring with one takeaway', text: ':::hero 76% | Headline metric\nThe one-sentence takeaway\nA short paragraph of context.\n:::', sel: 'Headline metric', quick: true },
      { label: 'Stat cards', hint: 'Big-number cards, up to four across', text: ':::stats\n- 55 | Complete | 55% of total | green\n- 20 | In review | 20% of total | blue\n- 18 | In progress | 18% of total | amber\n:::', quick: true },
      { label: 'Stacked bar', hint: 'One bar split into parts', text: ':::bar Items by state\n- 55 Complete {green}\n- 20 In review {sage}\n- 18 In progress {amber}\n- 7 Not started {grey}\n:::', quick: true },
      { label: 'Progress bars', hint: 'One bar per item', text: '- [80%] First item {blue}\n- [45/60] Second item {amber}\n- [20%] Third item {red}', sel: 'First item', quick: true },
    ] },
    { group: 'Status and notes', items: [
      { label: 'Callout: note', hint: 'Neutral heads-up', text: '> [!note] Good to know.\n> Say what the reader should keep in mind.', sel: 'Good to know.', quick: true },
      { label: 'Callout: good news', hint: 'Green', text: '> [!good] On track.\n> Say what went well.', sel: 'On track.' },
      { label: 'Callout: warning', hint: 'Amber', text: '> [!warn] Watch for.\n> What the reader should not miss.', sel: 'Watch for.' },
      { label: 'Callout: problem', hint: 'Red', text: '> [!bad] Blocked.\n> Say what is wrong and what is needed.', sel: 'Blocked.' },
      { label: 'Status pill', hint: 'Small colored label, in a sentence or table', text: '[[In progress]]', inline: true, sel: 'In progress' },
      { label: 'Checklist', hint: 'Done and open items', text: '- [x] Done item\n- [ ] Open item\n- [ ] Another open item', sel: 'Done item', quick: true },
    ] },
    { group: 'Tables and layout', items: [
      { label: 'Table', hint: 'Rows and columns', text: '| Item | Owner | Date |\n|---|---|---|\n| First | Name | Jan 5 |\n| Second | Name | Feb 2 |', sel: 'Item', quick: true },
      { label: 'Status table', hint: 'Progress bars and status pills in cells', text: '| Item | Progress | State |\n|---|---|---|\n| First | [60%] | [[In progress]] |\n| Second | [100%] | [[Done]] |\n| Third | [0%] | [[Not started]] |' },
      { label: 'Definitions', hint: 'Term and meaning grid', text: ':::defs\n- Term :: What it means.\n- Another term :: What that one means.\n:::', sel: 'Term' },
      { label: 'Boxed panel', hint: 'A shaded box with a title', text: ':::panel Title\nBoxed secondary note.\n:::', sel: 'Title' },
      { label: 'Two columns', hint: 'Side by side', text: ':::columns\nLeft column text.\n|||\nRight column text.\n:::', sel: 'Left column text.' },
    ] },
    { group: 'Charts', items: [
      { label: 'Chart from a spreadsheet...', hint: 'Pick an Excel or CSV file', action: 'sheet' },
      { label: 'Gantt chart', hint: 'Tasks on a timeline', text: ':::chart gantt Project plan\ntask: Task\nstart: Start\nend: End\ngroup: Phase\n\nTask,Phase,Start,End\nDiscover,Plan,2026-01-05,2026-01-30\nDesign,Plan,2026-01-26,2026-02-27\nBuild,Make,2026-02-16,2026-04-10\nLaunch,Make,2026-04-15,2026-04-15\n:::', sel: 'Project plan', quick: true },
      { label: 'Column chart', hint: 'Compare values side by side', text: ':::chart bar Applications by term\nx: Term\ny: Applied, Enrolled\n\nTerm,Applied,Enrolled\nFall 2024,4685,1555\nFall 2025,5120,1610\nFall 2026,5540,1725\n:::', sel: 'Applications by term' },
      { label: 'Line chart', hint: 'Change over time', text: ':::chart line Applications over time\nx: Term\ny: Applied\n\nTerm,Applied\nFall 2023,4210\nFall 2024,4685\nFall 2025,5120\nFall 2026,5540\n:::', sel: 'Applications over time' },
      { label: 'Ranked bars', hint: 'Largest first', text: ':::chart hbar Applications by term\nx: Term\ny: Applied\n\nTerm,Applied\nFall 2023,4210\nFall 2024,4685\nFall 2025,5120\nFall 2026,5540\n:::', sel: 'Applications by term' },
      { label: 'Share of total', hint: 'One whole split into parts', text: ':::chart share Where students come from\nx: Source\ny: Students\n\nSource,Students\nIn state,820\nOut of state,310\nInternational,195\n:::', sel: 'Where students come from' },
    ] },
    { group: 'Diagrams', items: [
      { label: 'Flowchart', hint: 'Steps and decisions', text: '```mermaid\nflowchart LR\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Do this]\n    B -->|No| D[Do that]\n```', sel: 'Decision' },
      { label: 'Sequence diagram', hint: 'Who talks to whom', text: '```mermaid\nsequenceDiagram\n    participant U as User\n    participant S as System\n    U->>S: Request\n    S-->>U: Response\n```', sel: 'Request' },
      { label: 'Class diagram', hint: 'Objects and how they relate', text: '```mermaid\nclassDiagram\n    class Student {\n        +String name\n        +enroll()\n    }\n    class Course\n    Student --> Course : takes\n```', sel: 'Student' },
    ] },
    { group: 'Testing', items: [
      { label: 'Test card', hint: 'Numbered card with steps and pass or fail', text: ':::testcard 1 Card title\nTest as :: Advisor\nBoard :: 1234\n\n**User story**\n\nAs a user, I want something, so that it helps.\n\n**Steps**\n\n1. Open the link.\n2. Press the button.\n\nPass: It does what it should.\nFail: It does not.\n:::', sel: 'Card title', quick: true },
    ] },
  ];

  // Adds keys to the front matter block at the top of a report, creating the block when there is none.
  // A key that already has a value is left alone. Returns { md, changed }.
  function applyFront(md, pairs) {
    const m = md.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/);
    const lines = m ? m[1].split('\n') : [];
    let changed = false;
    Object.keys(pairs).forEach(k => {
      const i = lines.findIndex(l => new RegExp('^' + k + '[ \\t]*:', 'i').test(l));
      if (i < 0) { lines.push(k + ': ' + pairs[k]); changed = true; }
      else if (!lines[i].replace(/^[^:]*:/, '').trim()) { lines[i] = k + ': ' + pairs[k]; changed = true; }
    });
    if (!changed) return { md, changed };
    const head = '---\n' + lines.join('\n') + '\n---\n';
    return { md: head + (m ? md.slice(m[0].length) : '\n' + md), changed };
  }

  return { GROUPS, applyFront };
});
