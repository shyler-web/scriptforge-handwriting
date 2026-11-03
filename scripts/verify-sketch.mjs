// scripts/verify-sketch.mjs
import assert from 'node:assert/strict';
import {
  Vec2,
  compileMathExpr,
  computeShapeBoundaryPoint,
  generatePolygonHatchLines,
  Projector3D,
} from '../src/render/sketch/vecmath.js';
import { compileSketchScene, measureSketch, renderSketch } from '../src/render/sketch/engine.js';
import { routeOrthogonal } from '../src/render/sketch/router.js';
import { solveInclinedPlane, solveOpticsRayTrace, solveElectrostaticField } from '../src/render/sketch/physics.js';
import { parseWaveformSpec, solveLinkedList, solveMemoryFrame, solveBTree } from '../src/render/sketch/systems.js';
import { solveSkeletalChain, solveChairConformation, solveNewmanProjection } from '../src/render/sketch/chemistry.js';
import { solveVennDiagram, solveBipartiteMapping, layoutHasseDiagram } from '../src/render/sketch/discrete.js';
import { solveSurface3D, solveRiemannSum, solveMatrixGrid, solveSlopeField } from '../src/render/sketch/calculus3d.js';

console.log('Running Universal Mathematical Sketch Engine QA (Drops #1 + #2 + #3 + #4 + #5 + #6)...');

// ---------------------------------------------------------------------------
// Drop #1: expression evaluator, boundary casting, hatching, 3D projection
// ---------------------------------------------------------------------------
const fn = compileMathExpr('2*sin(pi/2) + sqrt(16) - x^2');
assert.equal(Math.round(fn({ x: 2 })), 2, 'Math expression evaluator should compute 2*1 + 4 - 4 = 2');

const boxNode = { x: 0, y: 0, w: 100, h: 50, shape: 'box' };
const hitRight = computeShapeBoundaryPoint(boxNode, { x: 200, y: 0 });
assert.equal(Math.round(hitRight.x), 50);
assert.equal(Math.round(hitRight.y), 0);

const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];
const hatches = generatePolygonHatchLines(square, 45, 8);
assert.ok(hatches.length >= 4, 'Polygon hatching should generate interior clipped segments');

const cam = new Projector3D({ azimuth: 35, elevation: 25, scale: 1 });
const p3 = cam.project(10, 20, 30);
assert.ok(Number.isFinite(p3.x) && Number.isFinite(p3.y), '3D projector should output finite 2D coordinates');

const sampleDSL = `
  title "Universal Math Sketch Test"
  let R = 60
  point O = (0, 0) label="$O$" pos=sw
  point A = O + polar(R, 40) label="$A$"
  node M1 at (120, 0) shape=box label="$m_1$" fill=hatch
  spring O -> M1 coils=6 amp=7 label="$k$"
  support (-30, 25) -- (180, 25) side=below
  tape at=(0, 90) cells="1,0,1,B,1" head=2 state="$q_0$"
  ring6 at=(240, 0) r=32 aromatic=true
`;

const scene = compileSketchScene(sampleDSL, 'Caveat', 15);
assert.equal(scene.title, 'Universal Math Sketch Test');
assert.ok(scene.items.length >= 5, 'Scene should compile all declarative items');
const dims = measureSketch(sampleDSL, 520, 'Caveat');
assert.ok(dims.width >= 220 && dims.width <= 520, 'Measured width should fit page constraints');
assert.ok(dims.height >= 90, 'Measured height should be positive');

// ---------------------------------------------------------------------------
// Drop #2: tree, DAG, relative constraints, A* router, self-loop
// ---------------------------------------------------------------------------
const drop2DSL = `
  title "Drop 2 Layout & Smart Router Test"
  tree edges="10->5, 10->15, 5->2, 5->7, 15->_, 15->20" costs="0:cn, 1:2c(n/2)"
  node A at (0, 180) "Source"
  node Block right="of A" gap=45 "Obstacle"
  node B right="of Block" gap=45 "Target"
  arrow A -> B route=ortho label="bypass"
  arrow A -> A loop=n label="self"
`;
const scene2 = compileSketchScene(drop2DSL, 'Caveat', 15);
assert.ok(scene2.nodes.size >= 8, 'Tree and relative nodes should be registered');
assert.ok(scene2.items.some((i) => i.type === 'selfLoop'), 'Self-loop connector should compile');
assert.ok(
  scene2.items.some((i) => i.type === 'connector' && i.route === 'ortho'),
  'Orthogonal routed connector should compile'
);

const dagCycleScene = compileSketchScene('dag edges="A->B, B->C, C->A"', 'Caveat', 15);
assert.ok(
  dagCycleScene.items.some((i) => i.type === 'connector' && i.bendExplicit),
  'Layered DAG should mark a cycle back-edge with an explicit loop bend'
);
const orthoPath = routeOrthogonal({ x: 0, y: 180 }, { x: 240, y: 180 }, [
  { id: 'Block', x: 120, y: 180, w: 70, h: 40, shape: 'box' },
]);
assert.ok(orthoPath.length >= 4, 'Orthogonal router should route around central obstacle');

// Unicode arrows are accepted as aliases for ->, --, and <->.
const unicodeTree = compileSketchScene(
  'tree edges="10→5, 10→15, 5→2, 5→7, 15→_, 15→20"',
  'Caveat',
  15
);
assert.equal(unicodeTree.nodes.size, 6, 'Unicode tree arrows must create 6 distinct nodes');

const unicodeDag = compileSketchScene('dag dir=LR edges="Lexer→Parser→AST→Codegen"', 'Caveat', 15);
assert.equal(unicodeDag.nodes.size, 4, 'Unicode DAG arrows must create 4 distinct nodes');
assert.equal(
  unicodeDag.items.filter((i) => i.type === 'connector').length,
  3,
  'Unicode DAG arrows should create three edges'
);

const unicodeRelative = compileSketchScene(
  `node A at=(0, 0) "Source"
node Block right="of A" gap=45 "Obstacle"
node B right="of Block" gap=45 "Target"
arrow A → B route=ortho label="bypass"
arrow A → A loop=n label="self"`,
  'Caveat',
  15
);
const unicodeConnector = unicodeRelative.items.find((i) => i.type === 'connector');
assert.ok(
  unicodeConnector && unicodeConnector.fromId === 'A' && unicodeConnector.toId === 'B',
  'Unicode connector arrows should resolve both endpoints'
);
assert.ok(
  unicodeConnector && unicodeConnector.chain && unicodeConnector.chain.length >= 4,
  'Unicode ortho connector should pre-compute a multi-point bypass chain'
);
assert.ok(unicodeRelative.items.some((i) => i.type === 'selfLoop'), 'Unicode self-loop arrows should compile');

const unicodeLabel = compileSketchScene('label at=(0, 0) text="A → B"', 'Caveat', 15);
assert.equal(
  unicodeLabel.items.find((i) => i.type === 'label').text.replace(/\s+/g, ' '),
  'A -> B',
  'Unicode arrows in quoted labels are normalized to ASCII'
);

// ---------------------------------------------------------------------------
// Drop #3: physics, optics, RK4 fields
// ---------------------------------------------------------------------------
const inc = solveInclinedPlane({ angleDeg: 30, baseWidth: 200 });
assert.equal(inc.blockCorners.length, 4, 'Inclined plane should compute 4 rotated block corners');

const opt = solveOpticsRayTrace({ kind: 'convex', f: 60, u: 120, h: 40 });
assert.equal(Math.round(opt.imgBase.x), 120, 'Object at 2F (120) with f=60 must focus at 2F (120)');

const ef = solveElectrostaticField({ raysPerCharge: 8 });
assert.ok(ef.streamlines.length >= 8, 'RK4 electrostatic integrator should trace dipole streamlines');

const efOffset = solveElectrostaticField({
  charges: [
    { x: 0, y: 360, q: 1 },
    { x: 120, y: 360, q: -1 },
  ],
  raysPerCharge: 8,
});
assert.ok(efOffset.streamlines.length >= 8, 'RK4 field should work away from the origin');
const offsetScene = compileSketchScene('charges at=(0, 360) q1=1 q2=-1 rays=8', 'Caveat', 15);
assert.ok(offsetScene.bounds.maxY >= 330, 'Offset charge scene bounds should include the charges');

const drop3DSL = `
  title "Drop 3 Physics, Optics & RK4 Fields"
  incline at=(0,0) angle=30 mass="$m$" friction="$f_k$" components=true
  optics at=(0, 180) kind=convex f=65 u=130 h=40
  charges at=(0, 360) q1=1 q2=-1 rays=8
`;
const dims3 = measureSketch(drop3DSL, 520, 'Caveat');
assert.ok(dims3.width >= 220 && dims3.height >= 150, 'Drop 3 physics scene should measure cleanly');
const scene3 = compileSketchScene(drop3DSL, 'Caveat', 15);
assert.ok(scene3.items.some((i) => i.type === 'polygon'), 'Inclined plane triangle should compile');
assert.ok(scene3.items.some((i) => i.type === 'optics'), 'Ray-optics bench should compile');
assert.ok(scene3.items.some((i) => i.type === 'electrofield'), 'RK4 electrostatic field should compile');

// Render smoke test: exercise the renderer for the new layout and physics items.
const ctx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'measureText') return () => ({ width: 20, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 });
    if (prop === 'canvas') return { width: 820, height: 1100 };
    if (prop in target) return target[prop];
    if (typeof prop === 'symbol') return undefined;
    return () => {};
  },
  set(target, prop, value) { target[prop] = value; return true; }
});
const rc = new Proxy({}, { get: () => () => ({}) });
const renderedH = renderSketch(ctx, rc, `${drop2DSL}\n${drop3DSL}`, 0, 0, 520, 'Caveat', '#1b3b8c', 7);
assert.ok(Number.isFinite(renderedH) && renderedH > 0, 'renderSketch should render Drops #2/#3 without runtime errors');

const extrasDSL = `
  dag dir=LR edges="Lexer->Parser->AST->Codegen"
  graph layout=bipartite edges="A--B, B--C, C--D"
  atwood at=(0, 0) r=28 m1="$m_1$" m2="$m_2$"
  vectorfield at=(0, 220) fx="-y" fy="x"
`;
const sceneX = compileSketchScene(extrasDSL, 'Caveat', 15);
assert.ok(sceneX.items.some((i) => i.type === 'pulley'), 'Atwood pulley should compile');
assert.ok(sceneX.items.some((i) => i.type === 'connector' && i.subtype === 'vector'), 'Vector field arrows should compile');
const renderedX = renderSketch(ctx, rc, extrasDSL, 0, 0, 520, 'Caveat', '#1b3b8c', 11);
assert.ok(Number.isFinite(renderedX) && renderedX > 0, 'renderSketch should render DAG, graph, pulley and vector field');

// ---------------------------------------------------------------------------
// Drop #4: CS systems, memory, waveforms, B-trees, pipelines, packets
// ---------------------------------------------------------------------------
const wf = parseWaveformSpec('CLK:P......., D:0.1..0.., Q:x.01..0., BUS:=A0..=FF..');
assert.equal(wf.signals.length, 4, 'Waveform parser should read 4 signals');
assert.equal(wf.maxCycles, 8, 'Waveform parser should compute 8 clock cycles');

const ll = solveLinkedList({ valuesStr: '10, 20, 35, 50', pointersStr: '1:slow, 3:fast' });
assert.equal(ll.nodes.length, 4, 'Linked list should create 4 cells');
assert.equal(ll.externalPointers.length, 3, 'Linked list should include head + slow + fast pointers');

const mf = solveMemoryFrame({ id: 'S', fieldsStr: 'argc: 2, ptr: ->H.0' });
assert.equal(mf.rows.length, 2, 'Memory frame should create 2 rows');
assert.equal(mf.pointerLinks.length, 1, 'Memory frame should record one pointer link');
assert.equal(mf.pointerLinks[0].targetRef, 'H.0', 'Memory frame should preserve the target address');

const bt = solveBTree({ edgesSpec: '20|40 -> 5|10|15, 20|40 -> 25|30, 20|40 -> 45|55' });
assert.equal(bt.nodes.length, 4, 'B-tree should create root + 3 multi-key children');
assert.equal(bt.links.length, 3, 'B-tree should create 3 slot-separated child links');

const btUnicode = solveBTree({ edgesSpec: '20|40 → 5|10, 20|40 → 25|30' });
assert.equal(btUnicode.nodes.length, 3, 'B-tree should accept Unicode arrows');
assert.equal(btUnicode.links.length, 2, 'B-tree Unicode arrows should create links');

const mfUnicode = solveMemoryFrame({ fieldsStr: 'ptr: →H.0' });
assert.equal(mfUnicode.pointerLinks[0].targetRef, 'H.0', 'Memory frame should accept Unicode pointer arrows');

const drop4DSL = `
  title "Drop 4 Systems, Memory, Waveforms & B-Trees"
  waveform at=(0,0) signals="CLK:P....., D:0.1..0, Q:x.01.."
  linkedlist at=(0, 140) values="12, 24, 48, 96" head="head" pointers="1:curr, 3:tail"
  memframe id=Stack at=(-110, 270) title="Stack (main)" fields="n: 4, head: ->Heap.0"
  memframe id=Heap at=(110, 270) title="Heap (0x7f00)" fields="val: 12, next: NULL"
  btree at=(0, 420) edges="20|40 -> 5|10, 20|40 -> 25|35, 20|40 -> 50|60"
  pipeline at=(0, 560) rows="ADD R1,R2: IF ID EX MEM WB | SUB R3,R1: _ IF ID STALL EX MEM"
  gantt at=(0, 680) tasks="P1:0..4, P2:4..7, P3:7..11"
  packet at=(0, 790) bits=32 fields="Src Port:16, Dst Port:16, Seq Num:32"
`;
const scene4 = compileSketchScene(drop4DSL, 'Caveat', 15);
assert.ok(scene4.items.some((i) => i.type === 'waveform'), 'Waveform item should compile');
assert.ok(scene4.items.some((i) => i.type === 'linkedlist'), 'Linked list item should compile');
assert.equal(scene4.items.filter((i) => i.type === 'memframe').length, 2, 'Two memory frames should compile');
assert.ok(scene4.items.some((i) => i.type === 'btree'), 'B-tree item should compile');
assert.ok(scene4.items.some((i) => i.type === 'pipeline'), 'Pipeline item should compile');
assert.ok(scene4.items.some((i) => i.type === 'gantt'), 'Gantt item should compile');
assert.ok(scene4.items.some((i) => i.type === 'packet'), 'Packet header item should compile');
assert.ok(
  scene4.items.some((i) => i.type === 'connector' && i.subtype === 'arrow'),
  'Stack-to-Heap pointer arrow should resolve'
);
const dims4 = measureSketch(drop4DSL, 520, 'Caveat');
assert.ok(dims4.width >= 220 && dims4.height >= 200, 'Drop 4 scene should measure cleanly');
const rendered4 = renderSketch(ctx, rc, drop4DSL, 0, 0, 520, 'Caveat', '#1b3b8c', 17);
assert.ok(Number.isFinite(rendered4) && rendered4 > 0, 'renderSketch should render Drop #4 without runtime errors');

// ---------------------------------------------------------------------------
// Drop #5: organic chemistry, Venn diagrams, mappings and Hasse lattices
// ---------------------------------------------------------------------------
const chemChain = solveSkeletalChain({
  carbons: 6,
  bondsStr: '2:=, 4:#',
  branchesStr: '3:OH, 5:^CH3, 2:_Br',
});
assert.equal(chemChain.vertices.length, 6, 'Skeletal chain should compute 6 carbon vertices');
assert.equal(chemChain.branches.length, 3, 'Skeletal chain should parse 3 substituent branches');

const chair = solveChairConformation({ axialStr: '1:OH, 4:Me', equatorialStr: '2:Br' });
assert.equal(chair.carbons.length, 6, 'Chair conformation should have 6 ring carbons');
assert.equal(chair.substituents.length, 3, 'Chair conformation should resolve axial and equatorial bonds');

const newman = solveNewmanProjection({ dihedralDeg: 60, frontStr: 'CH3,H,H', backStr: 'Br,H,CH3' });
assert.equal(newman.frontSpokes.length, 3, 'Newman projection should have 3 front spokes');
assert.equal(newman.backSpokes.length, 3, 'Newman projection should have 3 back spokes');

const venn = solveVennDiagram({ setsStr: 'A,B,C', shadeStr: '(A&B)-C' });
assert.equal(venn.circles.length, 3, '3-set Venn diagram should create 3 circles');
assert.ok(venn.hatchSegments.length > 5, 'Boolean set region (A&B)-C must generate hatch segments');

const mapping = solveBipartiteMapping({
  domainStr: '1,2,3',
  codomainStr: 'a,b',
  pairsStr: '1→a, 2→b, 3→b',
});
assert.equal(mapping.arrows.length, 3, 'Bipartite mapping should resolve 3 arrows with Unicode →');

const hasse = layoutHasseDiagram({ edgesSpec: '1→2, 1→3, 2→6, 3→6' });
const hasseMin = hasse.nodes.find((n) => n.id === '1');
const hasseMax = hasse.nodes.find((n) => n.id === '6');
assert.ok(hasseMin.y > hasseMax.y, 'Hasse diagram must place minimal element 1 below maximal element 6');

const drop5DSL = `
  title "Drop 5 Chemistry & Discrete Math"
  chain at=(0,0) carbons=6 bonds="2:=" branches="4:=O, 3:^OH"
  chair at=(0, 120) axial="1:OH, 4:CH3" equatorial="2:Br"
  newman at=(220, 120) angle=60 front="CH3,H,H" back="Br,H,CH3"
  venn at=(0, 280) sets="A,B,C" shade="(A|B)-C"
  mapping at=(240, 280) domain="1,2,3" codomain="x,y" pairs="1→x, 2→y, 3→y"
  hasse at=(0, 460) edges="1→2, 1→3, 2→6, 3→6"
`;
const scene5 = compileSketchScene(drop5DSL, 'Caveat', 15);
assert.ok(scene5.items.some((i) => i.type === 'skeletalChain'), 'Skeletal chain item should compile');
assert.ok(scene5.items.some((i) => i.type === 'chair'), 'Chair item should compile');
assert.ok(scene5.items.some((i) => i.type === 'newman'), 'Newman item should compile');
assert.ok(scene5.items.some((i) => i.type === 'venn'), 'Venn item should compile');
assert.ok(scene5.items.some((i) => i.type === 'mapping'), 'Mapping item should compile');
assert.ok(scene5.nodes.has('1') && scene5.nodes.has('6'), 'Hasse nodes should compile');
const dims5 = measureSketch(drop5DSL, 520, 'Caveat');
assert.ok(dims5.width >= 220 && dims5.height >= 180, 'Drop 5 scene should measure cleanly');
const rendered5 = renderSketch(ctx, rc, drop5DSL, 0, 0, 520, 'Caveat', '#1b3b8c', 23);
assert.ok(Number.isFinite(rendered5) && rendered5 > 0, 'renderSketch should render Drop #5 without runtime errors');

// ---------------------------------------------------------------------------
// Drop #6: 3D surfaces, Riemann sums, matrix grids and ODE slope fields
// ---------------------------------------------------------------------------
const surf = solveSurface3D({ fnStr: '0.35*(x^2 - y^2)', steps: 10 });
assert.equal(surf.quads.length, 100, '10x10 surface grid should produce 100 quads');
assert.ok(
  surf.quads[0].avgDepth <= surf.quads[surf.quads.length - 1].avgDepth,
  'Surface quads should be sorted back-to-front'
);

const rm = solveRiemannSum({ fnStr: '0.2*x^2 + 0.5', a: 0, b: 4, n: 6, method: 'mid' });
assert.equal(rm.partitions.length, 6, 'Riemann sum with n=6 should create 6 partitions');

const mg = solveMatrixGrid({ matrixStr: '1.4, 0.5, 0.3, 1.1', range: 2 });
assert.equal(mg.unitParallelogram.length, 4, 'Matrix grid should create a 4-vertex parallelogram');

const sf = solveSlopeField({ dyStr: 'x - y', solutionsStr: '(-2, 1.5), (-2, -0.5)' });
assert.ok(sf.segments.length >= 40, 'Slope field should generate tangent segments');
assert.equal(sf.trajectories.length, 2, 'Slope field should integrate 2 RK4 trajectories');

const drop6DSL = `
  title "Drop 6 3D Surfaces, Calculus & Linear Algebra"
  surface3d at=(0, 0) fn="0.35*(x^2 - y^2)" steps=10
  riemann at=(0, 220) fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid
  matrixgrid at=(0, 420) matrix="1.4, 0.5, 0.3, 1.1" det=true
  slopefield at=(0, 620) dy="x - y" solutions="(-2, 1.5), (-2, -0.5)"
`;
const scene6 = compileSketchScene(drop6DSL, 'Caveat', 15);
assert.ok(scene6.items.some((i) => i.type === 'surface3d'), 'Surface item should compile');
assert.ok(scene6.items.some((i) => i.type === 'riemann'), 'Riemann item should compile');
assert.ok(scene6.items.some((i) => i.type === 'matrixgrid'), 'Matrix grid item should compile');
assert.ok(scene6.items.some((i) => i.type === 'slopefield'), 'Slope field item should compile');
const dims6 = measureSketch(drop6DSL, 520, 'Caveat');
assert.ok(dims6.width >= 220 && dims6.height >= 200, 'Drop 6 scene should measure cleanly');
const rendered6 = renderSketch(ctx, rc, drop6DSL, 0, 0, 520, 'Caveat', '#1b3b8c', 29);
assert.ok(Number.isFinite(rendered6) && rendered6 > 0, 'renderSketch should render Drop #6 without runtime errors');

console.log('PASS: Drops #1, #2, #3, #4, #5, and #6 passed all mathematical, topological and 3D assertions!');
