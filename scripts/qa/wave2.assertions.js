const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

const W = 820, H = 1100, HI = 2;
const RIGHT_MARGIN = 778, LEFT_MARGIN = 92, MAXW = 680, LS = 34;

// ---------- evaluateMathFunction security + correctness ----------
try {
  const { evaluateMathFunction } = await import('/src/render/diagrams/canvas2d.js');
  const fb = (x) => Math.exp(-0.32 * x) * Math.cos(2.85 * x);
  const valid = [
    ['4*x^3', 2, 32], ['exp(-0.3*x)*cos(3*x)', 1, Math.exp(-0.3) * Math.cos(3)],
    ['(8/pi)*sqrt(x*(1-x))', 0.5, 8 / Math.PI * 0.5], ['exp(-(x-3)^2/8)', 3, 1],
    ['sin(x)', 1, Math.sin(1)], ['2x', 3, 6], ['sqrt(4)', 0, 2], ['pow(2,10)', 0, 1024],
    ['min(3,5)', 0, 3], ['(x+1)(x-1)', 2, 3], ['x(x+1)', 2, 6], ['pi', 0, Math.PI],
    ['2sin(x)', 1, 2 * Math.sin(1)], ['x^2^3', 2, 256], ['abs(-3)', 0, 3],
  ];
  const bad = [];
  for (const [e, x, want] of valid) {
    const got = evaluateMathFunction(e, x);
    if (Math.abs(got - want) > 1e-9) bad.push({ e, x, want, got });
  }
  R('w2.evalValidExpressions', bad.length === 0, bad.length ? JSON.stringify(bad) : `${valid.length}/${valid.length} correct`);

  const attacks = ['window.alert(1)', 'document.cookie', 'globalThis', 'this', 'constructor',
    'x.constructor', 'Function("return 1")()', 'eval("1")', 'x[0]', '1;2', 'x=1',
    'require("fs")', 'process.exit()', 'import("x")', '[1,2]', 'x=>x', 'new Function("1")',
    'alert(1)', 'x.__proto__', 'Math["constructor"]', 'fetch("http://x")', 'location', 'navigator'];
  const leaked = [];
  for (const a of attacks) {
    const v = evaluateMathFunction(a, 1);
    if (!(Math.abs(v - fb(1)) < 1e-12) || !Number.isFinite(v)) leaked.push({ a, v });
  }
  R('w2.evalBlocksEscape', leaked.length === 0, leaked.length ? JSON.stringify(leaked) : `all ${attacks.length} escape attempts blocked`);
} catch (e) { R('w2.evalValidExpressions', false, 'EXCEPTION: ' + e.message); }

// ---------- SVG path flattening ----------
try {
  const { flattenSvgPathD } = await import('/src/render/diagrams/svgAdapter.js');
  const cases = [
    ['M 0 0 L 10 0 L 10 10 Z', 1],
    ['M0,0 C10,0 10,10 0,10', 1],
    ['M 0 0 H 20 V 20 h -20 v -20 Z', 1],
    ['M 0 0 Q 5 10 10 0', 1],
  ];
  const bad = [];
  for (const [d, minPolys] of cases) {
    const polys = flattenSvgPathD(d);
    if (!Array.isArray(polys) || polys.length < minPolys || !polys.some(p => p.length >= 2)) {
      bad.push({ d, got: JSON.stringify(polys).slice(0, 120) });
    }
  }
  R('w2.svgPathFlatten', bad.length === 0, bad.length ? JSON.stringify(bad) : `${cases.length} path commands flattened`);
} catch (e) { R('w2.svgPathFlatten', false, 'EXCEPTION: ' + e.message); }

// ---------- SVG adapter renders ink, stays in margins ----------
try {
  const { renderHandSketchedDiagram } = await import('/src/render/diagrams/index.js');
  const { readOptions } = await import('/src/core/options.js');
  const { getInk } = await import('/src/core/state.js');
  const opts = readOptions(), ink = getInk();

  const off = document.createElement('canvas');
  off.width = W * HI; off.height = H * HI;
  const octx = off.getContext('2d');
  const orc = rough.canvas(off);
  const scan = () => {
    const d = octx.getImageData(0, 0, off.width, off.height).data;
    let minX = 1e9, maxX = -1, inkPx = 0;
    for (let y = 0; y < off.height; y++) for (let x = 0; x < off.width; x++) {
      if (d[(y * off.width + x) * 4 + 3] > 12) {
        inkPx++; const lx = x / HI;
        if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
      }
    }
    return { minX, maxX, inkPx, width: maxX - minX };
  };

  const specs = [
    ['canvas2d/fn', 'canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | label=f(x)=4x^3'],
    ['canvas2d/circles', 'canvas2d | circles=0.58:4 pts,1.0:3 pts,1.73:2 pts | label=Target'],
    ['canvas2d/geometry', 'canvas2d | triangle=0,0,1,0,1,0.7 | angle=30'],
    ['canvas2d/vectors', 'canvas2d | vectors=0:F_x,90:N,-90:mg'],
    ['plot/alias', 'plot | label=Response'],
    ['svg/raw', 'svg | <svg viewBox="0 0 200 120"><rect x="10" y="10" width="80" height="50" fill="none" stroke="black"/><circle cx="150" cy="60" r="30" fill="none" stroke="black"/><path d="M10 90 L190 90" stroke="black" fill="none"/><text x="20" y="110" font-size="12">label</text></svg>'],
    ['svg/with-params', 'svg | height=220 | <svg viewBox="0 0 100 100"><rect x="5" y="5" width="90" height="90" fill="none" stroke="black"/></svg>'],
  ];

  const per = [];
  let violations = [], blank = [];
  for (const [name, spec] of specs) {
    octx.setTransform(HI, 0, 0, HI, 0, 0);
    octx.clearRect(0, 0, W, H);
    let usedH = null, err = null;
    try {
      usedH = renderHandSketchedDiagram(octx, orc, spec, LEFT_MARGIN + 12, 100, RIGHT_MARGIN - LEFT_MARGIN, { count: 1 }, opts);
    } catch (e) { err = e.message; }
    const b = scan();
    const okR = b.inkPx ? b.maxX <= RIGHT_MARGIN + 0.5 : true;
    const okL = b.inkPx ? b.minX >= LEFT_MARGIN - 0.5 : true;
    const okW = b.width <= MAXW + 0.5;
    per.push({ name, usedH, lineAdv: usedH == null ? null : Math.ceil(usedH / LS), inkPx: b.inkPx, width: +b.width.toFixed(1), okR, okL, okW, err });
    if (b.inkPx && !(okR && okL && okW)) violations.push(name);
    if (!b.inkPx) blank.push(name);
  }
  results.w2 = { pass: violations.length === 0 && blank.length === 0 && per.every(d => !d.err), detail: { violations, blank, per } };

  // dispatcher must keep svg params that precede the payload
  const { parseDiagramSpec } = await import('/src/render/diagrams/index.js');
  const p = parseDiagramSpec('svg | height=220 | <svg viewBox="0 0 10 10"></svg>');
  results.w2.svgParamPassthrough = { pass: p.params.height === '220' && !!p.params.rawSvg, detail: { height: p.params.height, hasRawSvg: !!p.params.rawSvg } };
} catch (e) { results.w2 = { pass: false, detail: 'EXCEPTION: ' + e.message }; }

// ---------- vectorize: Zhang-Suen + RDP present and callable ----------
try {
  const vec = await import('/src/pipeline/vectorize.js');
  results.w2 = results.w2 || {};
  const hasZS = typeof vec.zhangSuenThinning === 'function';
  const hasRDP = typeof vec.simplifyPolylineRDP === 'function';
  let zsOk = false, rdpOk = false;
  if (hasZS) {
    // a 10x9 solid bar must thin to a 1px centreline (border rows are preserved by design)
    const W = 20, H = 9;
    const bin = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 5; x < 15; x++) bin[y * W + x] = 1;
    const out = vec.zhangSuenThinning(bin, W, H, 24);
    const remaining = out.reduce((a, b) => a + b, 0);
    let middleRowMax = 0;
    for (let x = 0; x < W; x++) middleRowMax = Math.max(middleRowMax, out[4 * W + x]);
    zsOk = out instanceof Uint8Array && remaining < 90 && remaining > 10 && middleRowMax === 1;
  }
  if (hasRDP) {
    const pts = [[0, 0], [1, 0.1], [2, -0.1], [3, 0], [10, 0]];
    const simp = vec.simplifyPolylineRDP(pts, 0.5);
    rdpOk = Array.isArray(simp) && simp.length < pts.length;
  }
  results.w2.vectorize = { pass: hasZS && hasRDP && zsOk && rdpOk, detail: { hasZS, hasRDP, zsOk, rdpOk } };
} catch (e) { results.w2.vectorize = { pass: false, detail: 'EXCEPTION: ' + e.message }; }

// ---------- no dangerous sinks anywhere in src ----------
try {
  const files = ['/src/render/diagrams/canvas2d.js', '/src/render/diagrams/svgAdapter.js',
    '/src/render/diagrams/index.js', '/src/render/diagrams/grid.js', '/src/render/diagrams/schematic.js',
    '/src/render/diagrams/primitives.js', '/src/render/math/parser.js', '/src/render/math/measure.js',
    '/src/render/math/renderer.js', '/src/pipeline/vectorize.js', '/src/render/page.js'];
  const sinks = [];
  for (const f of files) {
    const t = await (await fetch(f)).text();
    const lines = t.split('\n');
    lines.forEach((l, i) => {
      const stripped = l.replace(/^\s*(\/\/|\/\*|\*).*$/, '');
      if (/\bnew Function\b|\beval\s*\(|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/.test(stripped)) {
        sinks.push(`${f}:${i + 1}: ${l.trim().slice(0, 90)}`);
      }
    });
  }
  results.w2.noDangerousSinks = { pass: sinks.length === 0, detail: { sinks } };
} catch (e) { results.w2.noDangerousSinks = { pass: false, detail: 'EXCEPTION: ' + e.message }; }

// ---------- new presets load ----------
try {
  const { PRESETS } = await import('/src/data/presets.js');
  const keys = Object.keys(PRESETS || {});
  const btns = [...document.querySelectorAll('[data-action="load-preset"]')].map(b => b.getAttribute('data-arg'));
  const missing = btns.filter(b => !keys.includes(b));
  results.w2.presets = { pass: keys.length >= 3 && missing.length === 0, detail: { keys, buttonKeys: btns, missing } };
} catch (e) { results.w2.presets = { pass: false, detail: 'EXCEPTION: ' + e.message }; }

return results;
