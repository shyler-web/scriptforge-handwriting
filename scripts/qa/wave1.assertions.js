const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

// ---------- shared helpers ----------
const W = 820, H = 1100, HI = 2;
const RIGHT_MARGIN = W - 42;      // 778
const LEFT_MARGIN = 92;
const MAX_DIAGRAM_WIDTH = 680;
const LINE_SPACING = 34;

const canvas = document.getElementById('notebookCanvas');
R('dom.canvasPresent', !!canvas, canvas ? `id=notebookCanvas ${canvas.width}x${canvas.height}` : 'MISSING');
R('dom.roughGlobal', typeof rough !== 'undefined', `rough=${typeof rough}`);
R('dom.pagesContainer', !!document.getElementById('pagesContainer'),
  document.getElementById('pagesContainer') ? 'present' : 'ABSENT');
R('dom.pageCanvasCount', document.querySelectorAll('.notebook-page-canvas').length >= 1,
  'count=' + document.querySelectorAll('.notebook-page-canvas').length);

// ---------- CRITERION 2: measureMathAST completeness ----------
try {
  const { measureMathAST } = await import('/src/render/math/measure.js');
  const { parseLatexToAST } = await import('/src/render/math/parser.js');

  const exprs = [
    'x', '\\frac{a}{b}', '\\dfrac{a}{b}', '\\tfrac{a}{b}', '\\binom{n}{k}',
    '\\sqrt{x}', '\\sqrt[3]{x+1}', '\\int_0^1 f(x)\\,dx', '\\oint_C \\vec{F}\\cdot d\\vec{r}',
    '\\iint_D g', '\\iiint_D h', '\\sum_{i=1}^{n} i', '\\prod_{i=1}^{n} x_i',
    '\\lim_{x\\to 0}\\frac{\\sin x}{x}', '\\bigcup_{i}A_i', '\\bigcap_{i}B_i',
    '\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    '\\begin{vmatrix} 1 & 0 \\\\ 0 & 1 \\end{vmatrix}',
    '\\begin{Bmatrix} a & b \\end{Bmatrix}',
    '\\begin{cases} x & x>0 \\\\ -x & x\\le 0 \\end{cases}',
    '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}',
    '\\begin{array}{cc} 1 & 2 \\end{array}',
    '\\left( \\frac{a}{b} \\right)', '\\left[ \\frac{a}{b} \\right]', '\\left\\{ x \\middle| x>0 \\right\\}',
    '\\overline{AB}', '\\underline{AB}', '\\vec{v}', '\\hat{y}', '\\widehat{abc}',
    '\\tilde{n}', '\\bar{z}', '\\dot{x}', '\\ddot{x}', '\\underbrace{a+b}_{c}', '\\overbrace{a+b}^{c}',
    'x^2', 'x_i', 'x_i^2', 'x^{2}_{i}', 'a \\cdot b \\times c \\div d',
    '\\alpha \\beta \\gamma \\Omega \\infty \\partial \\nabla \\forall \\exists',
    'a \\rightarrow b \\leftarrow c \\Rightarrow d \\iff e \\mapsto f',
    'a \\leq b \\geq c \\neq d \\approx e \\equiv f \\in g \\subset h \\cup i \\cap j',
    '\\sin x + \\cos y + \\log z + \\tan w',
    '\\frac{\\frac{a}{b}}{\\frac{c}{d}}',
    '\\sqrt{\\frac{a}{b}}',
    '\\int_0^\\infty e^{-x^2}\\,dx',
    '', '{}', '\\frac{}{}', '\\begin{bmatrix}\\end{bmatrix}',
  ];

  const bad = [];
  const missingSnap = [];
  const nodeTypes = new Set();
  for (const e of exprs) {
    let ast, m;
    try { ast = parseLatexToAST(e); } catch (err) { bad.push({ e, why: 'PARSE THREW: ' + err.message }); continue; }
    try { m = measureMathAST(ast, 24, LINE_SPACING); } catch (err) { bad.push({ e, why: 'MEASURE THREW: ' + err.message }); continue; }
    const vals = [m.width, m.ascent, m.descent, m.height];
    if (vals.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      bad.push({ e, why: 'BAD DIMS', m });
    }
    if (typeof m.linesAbove !== 'number' || typeof m.linesBelow !== 'number'
        || !Number.isFinite(m.linesAbove) || !Number.isFinite(m.linesBelow)) {
      missingSnap.push(e);
    }
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        if (n.type) nodeTypes.add(n.type);
        for (const k of Object.keys(n)) {
          if (k === 'type') continue;
          const v = n[k];
          if (Array.isArray(v) || (v && typeof v === 'object')) walk(v);
        }
      }
    };
    walk(ast);
  }
  R('c2.measureNoNaN', bad.length === 0, bad.length ? JSON.stringify(bad.slice(0, 8), null, 1) : `all ${exprs.length} expressions finite & non-negative`);
  R('c2.snapInvariantPresent', missingSnap.length === 0,
    missingSnap.length ? 'MISSING on: ' + JSON.stringify(missingSnap) : 'linesAbove/linesBelow present on all');

  // The shipped AST vocabulary: symbols are carried as 'text' nodes, every
  // array/grid environment as a 'matrix' node, and scripts as 'sup'/'sub'
  // arrays inside a 'supsub' node (see src/render/math/parser.js).
  const wantTypes = ['text','space','func','supsub','frac','binom','sqrt','accent','bigop','delim','matrix'];
  const missingTypes = wantTypes.filter(t => !nodeTypes.has(t));
  R('c2.astNodeTypes', missingTypes.length === 0,
    `emitted=[${[...nodeTypes].sort().join(',')}]` + (missingTypes.length ? ` MISSING=[${missingTypes.join(',')}]` : ' (all spec types present)'));

  // SupSub sharing a base
  const ss = parseLatexToAST('x_i^2');
  R('c2.supsubSharedBase', nodeTypes.has('supsub') && JSON.stringify(ss).includes('supsub'),
    'x_i^2 -> ' + JSON.stringify(ss).slice(0, 220));

  // \left...\right produces a delim node
  const dl = parseLatexToAST('\\left( \\frac{a}{b} \\right)');
  R('c2.delimPreserved', nodeTypes.has('delim') && JSON.stringify(dl).includes('delim'),
    '\\left(...\\right) -> ' + JSON.stringify(dl).slice(0, 200));
} catch (err) {
  R('c2.measureNoNaN', false, 'EXCEPTION: ' + err.message);
}

// ---------- CRITERION 3: diagram compactness ----------
try {
  const { renderHandSketchedDiagram } = await import('/src/render/diagrams/index.js');
  const { getInk, state } = await import('/src/core/state.js');
  const { readOptions } = await import('/src/core/options.js');
  const opts = readOptions();
  const ink = getInk();

  const specs = [
    ['grid/table', 'grid | cols=Component,Spec,Role | rows=CPU~8 Cores~Executes code;RAM~16GB DDR5~Working memory'],
    ['grid/bitfield', 'bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14'],
    ['grid/kmap', 'kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15'],
    ['grid/array', 'grid | cells=12,25,38,44,71,90 | pointers=0:low,2:mid,5:high'],
    ['schematic/circuit', 'circuit | nodes=IN1~1,AND1~2,OUT1~3 | edges=IN1>AND1,IN2>AND1,AND1>OUT1'],
    ['schematic/dfa', 'dfa | states=q0,q1,q2 | start=q0 | accept=q2 | transitions=q0>q1:0,q1>q2:1,q2>q0:0'],
    ['schematic/tree', 'tree | nodes=root,L,R,LL,LR | edges=root>L,root>R,L>LL,L>LR'],
    ['plot/legacy', 'plot | label=Underdamped y(t)'],
    ['custom_image/no-contours', 'custom_image'],
  ];

  const off = document.createElement('canvas');
  off.width = W * HI; off.height = H * HI;
  const octx = off.getContext('2d');
  const orc = rough.canvas(off);

  const scan = () => {
    const d = octx.getImageData(0, 0, off.width, off.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, inkPx = 0;
    for (let y = 0; y < off.height; y++) {
      for (let x = 0; x < off.width; x++) {
        const a = d[(y * off.width + x) * 4 + 3];
        if (a > 12) {
          inkPx++;
          const lx = x / HI, ly = y / HI;
          if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
          if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
        }
      }
    }
    return { minX, minY, maxX, maxY, inkPx, width: maxX - minX };
  };

  const perDiagram = [];
  let compactViolations = [];
  for (const [name, spec] of specs) {
    octx.setTransform(HI, 0, 0, HI, 0, 0);
    octx.clearRect(0, 0, W, H);
    const counter = { count: 1 };
    let usedH = null, err = null;
    try {
      usedH = renderHandSketchedDiagram(octx, orc, spec, LEFT_MARGIN + 12, 100, RIGHT_MARGIN - LEFT_MARGIN, counter, opts);
    } catch (e) { err = e.message; }
    const b = scan();
    const width = b.inkPx ? b.width : 0;
    const withinRight = b.inkPx ? (b.maxX <= RIGHT_MARGIN + 0.5) : true;
    const withinLeft = b.inkPx ? (b.minX >= LEFT_MARGIN - 0.5) : true;
    const underMax = width <= MAX_DIAGRAM_WIDTH + 0.5;
    const lineAdv = usedH == null ? null : Math.ceil(usedH / LINE_SPACING);
    perDiagram.push({ name, usedH, lineAdv, inkPx: b.inkPx, width: +width.toFixed(1),
                       minX: +b.minX.toFixed(1), maxX: +b.maxX.toFixed(1), maxY: +b.maxY.toFixed(1),
                       withinRight, withinLeft, underMax, err });
    if (b.inkPx && !(withinRight && withinLeft && underMax)) compactViolations.push(name);
  }
  results.c3 = { pass: compactViolations.length === 0 && perDiagram.every(d => !d.err),
    detail: { violations: compactViolations, perDiagram } };

  const drewNothing = perDiagram.filter(d => d.inkPx === 0).map(d => d.name);
  results.c3noBlankEngines = { pass: drewNothing.length === 0, detail: { drewNothing } };
} catch (err) {
  results.c3 = { pass: false, detail: 'EXCEPTION: ' + err.message };
}

// ---------- CRITERION 4: multi-page + pdf ----------
try {
  const pages = document.querySelectorAll('.notebook-page-canvas').length;
  const pdfMod = await import('/src/render/pdfExport.js');
  const btn = [...document.querySelectorAll('[data-action]')].map(b => b.getAttribute('data-action'));
  results.c4 = { pass: pages > 0 && typeof pdfMod.exportMultiPagePdf === 'function', detail: {
    pageCanvasCount: pages,
    pdfExportModule: typeof pdfMod.exportMultiPagePdf === 'function',
    exportActions: [...new Set(btn.filter(a => /export|pdf|page/i.test(a)))],
  }};
} catch (err) { results.c4 = { pass: false, detail: err.message }; }

// ---------- CRITERION 5: proof of zero-clone ----------
try {
  const toggle = document.querySelector('[data-action="inspect"]') || document.querySelector('[data-action="toggle-variance"]');
  const before = document.getElementById('notebookCanvas').toDataURL();
  if (toggle) toggle.click();
  await new Promise(r => setTimeout(r, 400));
  const after = document.getElementById('notebookCanvas').toDataURL();
  results.c5 = { pass: before !== after, detail: {
    toggleFound: !!toggle,
    inspectorChangesCanvas: before !== after,
  }};
} catch (err) { results.c5 = { pass: false, detail: err.message }; }

// ---------- CRITERION 6: HiDPI render performance ----------
try {
  const doc = document.getElementById('docInput');
  const original = doc.value;
  const sample = Array.from({ length: 28 }, (_, i) => `Line ${i + 1} of the performance sample document.`).join('\n');
  doc.value = sample;
  // Resolve the module ONCE: a dynamic import inside the timing loop measures
  // module-linker overhead, not render cost.
  const { renderFullPage } = await import('/src/render/page.js');
  renderFullPage();
  const times = [];
  for (let i = 0; i < 6; i++) {
    const t = performance.now();
    renderFullPage();
    times.push(+(performance.now() - t).toFixed(1));
  }
  const steady = times.slice(2);
  const avg = +(steady.reduce((a, b) => a + b, 0) / steady.length).toFixed(1);
  results.c6 = { pass: avg < 80, detail: {
    allTimes: times, steadyStateAvgMs: avg, budgetMs: 80,
    canvasBacking: `${canvas.width}x${canvas.height}`,
  }};
  doc.value = original;
  renderFullPage();
} catch (err) { results.c6 = { pass: false, detail: 'EXCEPTION: ' + err.message }; }

// ---------- CRITERION 1: module import integrity ----------
try {
  const mods = [...document.querySelectorAll('script[type="module"]')].map(s => s.src);
  const bad = [];
  for (const m of mods) {
    try { await import(new URL(m).pathname); } catch (e) { bad.push({ m, e: e.message }); }
  }
  const allSrc = [...document.querySelectorAll('script[src]')].map(s => s.src);
  results.c1 = { pass: bad.length === 0, detail: { moduleEntryScripts: mods, allScripts: allSrc, importFailures: bad } };
} catch (err) { results.c1 = { pass: false, detail: err.message }; }

// ---------- mobile viewport ----------
try {
  results.mobile = { pass: document.documentElement.scrollWidth <= window.innerWidth + 1, detail: {
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
  }};
} catch (err) { results.mobile = { pass: false, detail: err.message }; }

return results;
