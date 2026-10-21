// ScriptForge mobile QA — 375 px phone viewport (exit criterion #6).
// Run with:
//   QA_VIEWPORT=375,812 node scripts/qa/harness.mjs scripts/qa/mobile.assertions.js
const results = {};
const R = (name, pass, detail) => { results[name] = { pass: !!pass, detail }; };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

R('m.viewport.width', window.innerWidth === 375, `innerWidth=${window.innerWidth} innerHeight=${window.innerHeight}`);
R('m.viewport.noHorizontalScroll',
  document.documentElement.scrollWidth <= window.innerWidth + 1,
  `scrollWidth=${document.documentElement.scrollWidth} vs ${window.innerWidth}`);

// The mobile tab bar replaces the three-column layout below 1024 px.
const nav = document.querySelector('nav.lg\\:hidden');
R('m.tabBar.rendered', !!nav && getComputedStyle(nav).display !== 'none', nav ? getComputedStyle(nav).display : 'MISSING');

const editor = document.getElementById('panelEditor');
const preview = document.getElementById('panelPreview');
const controls = document.getElementById('panelControls');
R('m.panels.exist', !!editor && !!preview && !!controls,
  `editor=${!!editor} preview=${!!preview} controls=${!!controls}`);

// Exactly one panel is visible: the preview is the default mobile tab.
const visible = [editor, preview, controls].filter(p => p && !p.classList.contains('mobile-hidden'));
R('m.panels.singleDefaultTab', visible.length === 1 && visible[0] === preview,
  `visible=${visible.map(p => p.id).join(',') || 'none'}`);

const { switchMobileTab } = await import('/src/ui/controls.js');

switchMobileTab('editor');
await sleep(150);
R('m.tabs.editor', !editor.classList.contains('mobile-hidden') && preview.classList.contains('mobile-hidden'),
  `editor=${!editor.classList.contains('mobile-hidden')} preview=${!preview.classList.contains('mobile-hidden')}`);

switchMobileTab('controls');
await sleep(150);
R('m.tabs.controls', !controls.classList.contains('mobile-hidden') && editor.classList.contains('mobile-hidden'),
  `controls=${!controls.classList.contains('mobile-hidden')} editor=${!editor.classList.contains('mobile-hidden')}`);

switchMobileTab('preview');
await sleep(150);
R('m.tabs.preview', !preview.classList.contains('mobile-hidden') && editor.classList.contains('mobile-hidden'),
  `preview=${!preview.classList.contains('mobile-hidden')}`);

// The active tab must be highlighted and every inactive tab must keep an
// explicit transparent border (Tailwind's `border` inherits currentColor).
const tabBtn = (tab) => document.querySelector(`[data-action="mobileTab"][data-arg="${tab}"]`);
const tabState = (tab) => {
  const btn = tabBtn(tab);
  if (!btn) return null;
  return {
    highlighted: btn.classList.contains('border-indigo-500') && btn.classList.contains('text-indigo-400'),
    transparentBorder: btn.classList.contains('border-transparent'),
  };
};
switchMobileTab('controls');
await sleep(150);
R('m.tabs.highlight', tabState('controls')?.highlighted === true
  && tabState('editor')?.highlighted === false
  && tabState('preview')?.highlighted === false
  && tabState('editor')?.transparentBorder === true
  && tabState('preview')?.transparentBorder === true,
  JSON.stringify({ controls: tabState('controls'), editor: tabState('editor'), preview: tabState('preview') }));
switchMobileTab('preview');
await sleep(150);

// The page preview must fit the phone width.
const cv = document.getElementById('notebookCanvas');
const rect = cv.getBoundingClientRect();
R('m.preview.canvasFits', rect.width <= window.innerWidth + 1 && rect.width > 0,
  `canvasWidth=${Math.round(rect.width)} viewport=${window.innerWidth}`);

// Controls remain reachable and the page still renders on a phone viewport.
const { renderFullPage } = await import('/src/render/page.js');
const t0 = performance.now();
renderFullPage();
const elapsed = +(performance.now() - t0).toFixed(1);
R('m.render.onPhone', elapsed < 80 && document.querySelectorAll('canvas.notebook-page-canvas').length >= 1,
  `${elapsed}ms, pages=${document.querySelectorAll('canvas.notebook-page-canvas').length}`);

return results;
