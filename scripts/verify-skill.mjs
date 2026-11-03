// scripts/verify-skill.mjs
// Guards the agent skill file and its studio download entry point.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skillPath = resolve(root, 'skills/scriptforge-notes/SKILL.md');
const skill = readFileSync(skillPath, 'utf8');
const docs = readFileSync(resolve(root, 'docs/notes-authoring.md'), 'utf8');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const controls = readFileSync(resolve(root, 'src/ui/controls.js'), 'utf8');

console.log('Running ScriptForge agent skill verification...');

assert.match(skill, /^---\nname: scriptforge-notes/m, 'SKILL.md must start with frontmatter');
assert.match(skill, /^version:\s*\d+\.\d+\.\d+$/m, 'SKILL.md must declare a version');
assert.match(skill, /^updated:\s*\d{4}-\d{2}-\d{2}$/m, 'SKILL.md must declare an updated date');
assert.ok(!/\/home\/[A-Za-z0-9_.-]+\//.test(skill), 'SKILL.md must not contain machine-specific absolute paths');

const sections = [
  '## 1. Non-negotiable workflow',
  '## 2. Notes, scopes and MCP tools',
  '## 5. `[sketch]` language',
  '## 6. Page layout and cheat sheets',
  '## 7. Math allowlist',
  '## 10. Maintenance contract for local agents',
  '## 11. Download and local usage',
];
for (const section of sections) {
  assert.ok(skill.includes(section), `SKILL.md must contain section: ${section}`);
}

const features = [
  '`tree`', '`dag`', '`graph`', '`hasse`',
  '`waveform`', '`linkedlist`', '`memframe`', '`btree`', '`pipeline`', '`gantt`', '`packet`',
  '`chain`', '`chair`', '`newman`', '`venn`', '`mapping`',
  '`incline`', '`atwood`', '`optics`', '`charges`', '`vectorfield`',
  '`surface3d`', '`riemann`', '`matrixgrid`', '`slopefield`',
  '@page', '@layout', 'place=right', 'place=row', 'place=xy',
];
for (const feature of features) {
  assert.ok(skill.includes(feature), `SKILL.md must document ${feature}`);
  assert.ok(docs.includes(feature.replace(/`/g, '')), `docs/notes-authoring.md must document ${feature.replace(/`/g, '')}`);
}

assert.ok(index.includes('data-action="downloadSkill"'), 'Studio must expose the AI Skill download button');
assert.ok(controls.includes('export async function downloadSkill'), 'controls.js must implement downloadSkill');
assert.ok(controls.includes('skills/scriptforge-notes/SKILL.md'), 'downloadSkill must fetch the canonical skill path');

console.log(`PASS: ${skillPath} is complete (${skill.length} bytes), matches docs, and is downloadable.`);
