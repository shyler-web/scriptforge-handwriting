// scripts/verify-spatial.mjs
import assert from 'node:assert/strict';
import {
  PAGE_PRESETS,
  extractDiagramLayoutDirectives,
  parsePageDirective,
  rectsOverlap,
  SpatialExclusionManager,
} from '../src/render/spatialLayout.js';

console.log('Running ScriptForge Drop #7 2D Spatial Canvas & Cheat-Sheet Layout QA...');

// 1. Parse inline layout directives from diagram spec
const parsed = extractDiagramLayoutDirectives(`
  @layout place=right w=45% scale=0.85
  title "Cyclohexane Chair"
  chair axial="1:OH, 4:CH3"
`);
assert.equal(parsed.layout.place, 'right');
assert.equal(parsed.layout.widthSpec.type, 'fraction');
assert.equal(parsed.layout.widthSpec.value, 0.45);
assert.equal(parsed.layout.scale, 0.85);
assert.ok(!parsed.cleanSpec.includes('@layout'), '@layout line must be stripped from cleanSpec');

// 2. Floating Right Diagram + Text-Wrap Interval Carving
const mgr = new SpatialExclusionManager({
  colLeft: 90,
  colRight: 780,
  pageTop: 80,
  pageBottom: 1040,
});

const rightDiag = mgr.placeDiagram({
  naturalW: 260,
  naturalH: 180,
  cursorY: 120,
  layout: { place: 'right', widthSpec: { type: 'fraction', value: 0.42 }, scale: 1 },
});
assert.equal(rightDiag.isFloating, true, 'place=right diagram should float without jumping cursorY');
assert.ok(rightDiag.x > 400, 'place=right diagram must be positioned on the right side of the page');

// Verify text lines at y=150 automatically wrap on the LEFT side of the floating diagram!
const textSlot = mgr.resolveTextLineSlot(150, 28);
assert.equal(textSlot.x1, 90, 'Text alongside right-floating diagram must start at colLeft (90)');
assert.ok(
  textSlot.x2 <= rightDiag.x - 10,
  `Text right bound (${textSlot.x2}) must stop before diagram left edge (${rightDiag.x}) so text and diagram NEVER merge!`
);

// 3. Automatic Side-by-Side Row Packing for Compact Diagrams (like Chair + Newman!)
const rowMgr = new SpatialExclusionManager({
  colLeft: 90,
  colRight: 780,
  pageTop: 80,
  pageBottom: 1040,
});
const d1 = rowMgr.placeDiagram({
  naturalW: 260,
  naturalH: 170,
  cursorY: 200,
  layout: { place: 'auto', scale: 1 },
});
const d2 = rowMgr.placeDiagram({
  naturalW: 260,
  naturalH: 170,
  cursorY: 200,
  layout: { place: 'auto', scale: 1 },
});
assert.equal(d1.y, d2.y, 'Two compact diagrams in auto/row mode must pack side-by-side at the same Y!');
assert.ok(!rectsOverlap(d1, d2, 8), 'Side-by-side packed diagrams must have zero overlap!');

// 4. Pinning Collision Resolution (Two diagrams pinned to the exact same (x,y) coordinate)
const pin1 = rowMgr.placeDiagram({
  naturalW: 220,
  naturalH: 140,
  cursorY: 500,
  layout: { place: 'xy', pinX: 120, pinY: 450, scale: 1 },
});
const pin2 = rowMgr.placeDiagram({
  naturalW: 220,
  naturalH: 140,
  cursorY: 500,
  layout: { place: 'xy', pinX: 120, pinY: 450, scale: 1 },
});
assert.ok(
  !rectsOverlap(pin1, pin2, 8),
  'Collision solver must automatically separate two diagrams pinned to overlapping coordinates!'
);

// 5. Cheat-Sheet @page Directive Parser
const pageCfg = parsePageDirective('@page size=chart-xl cols=4');
assert.equal(pageCfg.preset, 'chart-xl');
assert.equal(pageCfg.cols, 4);
assert.equal(PAGE_PRESETS['chart-xl'].width, 1920);

console.log('PASS: All Drop #7 2D Spatial Canvas, Text-Wrap & Cheat-Sheet assertions succeeded!');
