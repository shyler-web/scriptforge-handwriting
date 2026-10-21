// ScriptForge Wave 3 QA — multi-page flow, HiDPI PDF compiler, mobile UI.
// Run with: node scripts/qa/harness.mjs scripts/qa/wave3.assertions.js
const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

const W = 820, H = 1100, HI = 2;
const LINE_SPACING = 34;
const pageCanvas = () => document.getElementById('notebookCanvas');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- multi-page DOM scaffold ----------
try {
  const container = document.getElementById('pagesContainer');
  const badge = document.getElementById('pageCountBadge');
  const panels = ['panelEditor', 'panelPreview', 'panelControls'].map(id => !!document.getElementById(id));
  R('w3.dom.pagesContainer', !!container, container ? 'present' : 'MISSING');
  R('w3.dom.panels', panels.every(Boolean), JSON.stringify(panels));
  R('w3.dom.pageCountBadge', !!badge, badge ? badge.textContent : 'MISSING');
  R('w3.dom.exportActions',
    !!document.querySelector('[data-action="exportPdf"]') && !!document.querySelector('[data-action="exportPng"]'),
    [...document.querySelectorAll('[data-action]')].map(b => b.getAttribute('data-action')).filter(a => /export/i.test(a)).join(','));
} catch (err) { R('w3.dom', false, err.message); }

// ---------- pagination: a long document must span multiple pages ----------
try {
  const doc = document.getElementById('docInput');
  const original = doc.value;

  const paragraphs = [];
  for (let i = 1; i <= 40; i++) {
    paragraphs.push(`Paragraph ${i}: the deterministic allographic engine keeps every glyph unique while this paragraph tests pagination behaviour.`);
  }
  doc.value = paragraphs.join('\n');
  await import('/src/render/page.js').then(m => m.renderFullPage());
  await sleep(300);

  const pages = [...document.querySelectorAll('canvas.notebook-page-canvas')];
  const visible = pages.filter(c => !c.classList.contains('hidden'));
  R('w3.paginate.multiplePages', visible.length > 1, `visible pages=${visible.length} total=${pages.length}`);
  R('w3.paginate.uniformSize',
    visible.every(c => c.width === W * HI && c.height === H * HI),
    visible.map(c => `${c.width}x${c.height}`).join(' '));
  R('w3.paginate.sequentialIndices',
    visible.every((c, i) => c.dataset.pageIndex === String(i)),
    visible.map(c => c.dataset.pageIndex).join(','));

  // No content may be clipped below the bottom margin of any page.
  // Detection uses ink colour, not alpha: the paper substrate is an opaque
  // fill, so only strongly saturated pen pixels count as content.
  const isInk = (r, g, b) => Math.min(r, g, b) < 150;
  const clipped = [];
  for (const cv of visible) {
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let lastInkRow = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x += 2) {
        const i = (y * cv.width + x) * 4;
        if (isInk(d[i], d[i + 1], d[i + 2])) { lastInkRow = y; break; }
      }
    }
    const lastLogical = lastInkRow / HI;
    if (lastLogical > H - 40) clipped.push({ page: cv.dataset.pageIndex, lastLogicalRow: +lastLogical.toFixed(1) });
  }
  R('w3.paginate.noClippedContent', clipped.length === 0, JSON.stringify(clipped));

  // ---------- per-page determinism seed: paper grain must differ per page ----------
  const grainSignature = visible.map(cv => {
    const ctx = cv.getContext('2d');
    // Header strip above the first ruled line and left of the page number.
    const d = ctx.getImageData(0, 0, 300, 40).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0;
    return h;
  });
  R('w3.pages.varyPerPage', new Set(grainSignature).size === grainSignature.length,
    JSON.stringify(grainSignature));

  // ---------- explicit page break ----------
  doc.value = 'Page one content.\n---PAGE---\nPage two content.';
  await import('/src/render/page.js').then(m => m.renderFullPage());
  await sleep(250);
  const breakPages = [...document.querySelectorAll('canvas.notebook-page-canvas')].filter(c => !c.classList.contains('hidden'));
  R('w3.pagebreak.explicit', breakPages.length === 2, `pages=${breakPages.length}`);

  doc.value = original;
  await import('/src/render/page.js').then(m => m.renderFullPage());
} catch (err) { R('w3.paginate', false, err.message); }

// ---------- a diagram is never split across a page boundary ----------
try {
  const doc = document.getElementById('docInput');
  const original = doc.value;
  const filler = [];
  for (let i = 0; i < 26; i++) filler.push('filler line ' + i);
  doc.value = filler.join('\n') + '\n[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]\n';
  await import('/src/render/page.js').then(m => m.renderFullPage());
  await sleep(250);

  const pages = [...document.querySelectorAll('canvas.notebook-page-canvas')].filter(c => !c.classList.contains('hidden'));
  // The K-map is the last block: it must be fully contained on the final page.
  const last = pages[pages.length - 1];
  const ctx = last.getContext('2d');
  const d = ctx.getImageData(0, 0, last.width, last.height).data;
  let inkRows = 0, maxRow = -1;
  for (let y = 0; y < last.height; y++) {
    let ink = 0;
    for (let x = 0; x < last.width; x += 2) {
      const i = (y * last.width + x) * 4;
      if (Math.min(d[i], d[i + 1], d[i + 2]) < 150) ink++;
    }
    if (ink > 3) { inkRows++; if (y > maxRow) maxRow = y; }
  }
  R('w3.diagram.notSplit', maxRow > 0 && maxRow / HI < H - 30,
    `pages=${pages.length} lastInkRow=${(maxRow / HI).toFixed(1)} inkRows=${inkRows}`);

  doc.value = original;
  await import('/src/render/page.js').then(m => m.renderFullPage());
} catch (err) { R('w3.diagram', false, err.message); }

// ---------- PDF compiler produces a genuine multi-page PDF ----------
try {
  const { buildMultiPagePdfBlob } = await import('/src/render/pdfExport.js');
  const pages = [...document.querySelectorAll('canvas.notebook-page-canvas')].filter(c => !c.classList.contains('hidden'));
  const blob = buildMultiPagePdfBlob(pages);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const head = String.fromCharCode(...buf.slice(0, 8));
  const text = new TextDecoder('latin1').decode(buf);
  const pageCount = (text.match(/\/Type \/Page[^s]/g) || []).length;
  R('w3.pdf.header', head === '%PDF-1.4', head);
  R('w3.pdf.trailer', text.trimEnd().endsWith('%%EOF'), text.slice(-24));
  R('w3.pdf.pageCount', pageCount === pages.length, `pdf pages=${pageCount} canvases=${pages.length}`);
  R('w3.pdf.xref', /xref\n0 \d+\n0000000000 65535 f/.test(text), 'xref table present');
  R('w3.pdf.mime', blob.type === 'application/pdf', blob.type);
  R('w3.pdf.size', blob.size > 10000, `${blob.size} bytes`);
} catch (err) { R('w3.pdf', false, err.message); }

// ---------- mobile tab switching ----------
try {
  const { switchMobileTab } = await import('/src/ui/controls.js');
  const editor = document.getElementById('panelEditor');
  const preview = document.getElementById('panelPreview');
  const controls = document.getElementById('panelControls');
  switchMobileTab('editor');
  await sleep(80);
  const onEditor = !editor.classList.contains('mobile-hidden') && preview.classList.contains('mobile-hidden');
  switchMobileTab('controls');
  await sleep(80);
  const onControls = !controls.classList.contains('mobile-hidden') && editor.classList.contains('mobile-hidden');
  switchMobileTab('preview');
  await sleep(80);
  const onPreview = !preview.classList.contains('mobile-hidden') && editor.classList.contains('mobile-hidden');
  R('w3.mobile.tabs', onEditor && onControls && onPreview, JSON.stringify({ onEditor, onControls, onPreview }));
} catch (err) { R('w3.mobile', false, err.message); }

// ---------- responsive layout ----------
try {
  R('w3.responsive.noHorizontalOverflow',
    document.documentElement.scrollWidth <= window.innerWidth + 1,
    `scrollWidth=${document.documentElement.scrollWidth} innerWidth=${window.innerWidth}`);
} catch (err) { R('w3.responsive', false, err.message); }

// ---------- zoom control ----------
try {
  const { setZoom } = await import('/src/ui/controls.js');
  const before = document.getElementById('zoomLabel')?.textContent;
  setZoom(0.25);
  await sleep(120);
  const after = document.getElementById('zoomLabel')?.textContent;
  setZoom('reset');
  await sleep(120);
  const reset = document.getElementById('zoomLabel')?.textContent;
  R('w3.zoom.label', before !== after && reset === '100%', JSON.stringify({ before, after, reset }));
} catch (err) { R('w3.zoom', false, err.message); }

return results;
