// Writes examples/project-plan.xlsx (a Gantt-ready plan) and examples/enrollment.xlsx (chart-ready counts).
//   node scripts/make-sample-xlsx.js
const fs = require('fs');
const path = require('path');
const { buildXlsx } = require('./xlsx-writer');

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));
const plan = [
  ['Task', 'Phase', 'Owner', 'Start', 'End', 'Percent complete'],
  ['Gather requirements', 'Discovery', 'Dana', d(2026, 11, 2), d(2026, 11, 20), 1],
  ['Review current process', 'Discovery', 'Dana', d(2026, 11, 9), d(2026, 11, 27), 1],
  ['Design data model', 'Design', 'Priya', d(2026, 11, 23), d(2026, 12, 18), 0.8],
  ['Design screens', 'Design', 'Priya', d(2026, 12, 7), d(2027, 1, 15), 0.45],
  ['Design sign-off', 'Design', 'Priya', d(2027, 1, 15), null, null],
  ['Build import', 'Build', 'Sam', d(2027, 1, 11), d(2027, 2, 26), 0.2],
  ['Build reports', 'Build', 'Sam', d(2027, 2, 8), d(2027, 3, 26), 0],
  ['User testing', 'Test', 'Lee', d(2027, 3, 15), d(2027, 4, 16), 0],
  ['Fix findings', 'Test', 'Sam', d(2027, 4, 5), d(2027, 4, 30), 0],
  ['Go live', 'Launch', 'Dana', d(2027, 5, 10), null, null],
];
const counts = [
  ['Term', 'Applied', 'Admitted', 'Enrolled'],
  ['Fall 2023', 4210, 2630, 1480],
  ['Fall 2024', 4685, 2790, 1555],
  ['Fall 2025', 5120, 2955, 1610],
  ['Fall 2026', 5540, 3105, 1725],
];
const out = path.join(__dirname, '..', 'examples');
fs.writeFileSync(path.join(out, 'project-plan.xlsx'), buildXlsx([{ name: 'Plan', rows: plan }]));
fs.writeFileSync(path.join(out, 'enrollment.xlsx'), buildXlsx([{ name: 'Counts', rows: counts }]));
console.log('Wrote examples/project-plan.xlsx and examples/enrollment.xlsx');
