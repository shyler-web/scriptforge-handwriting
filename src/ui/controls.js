/**
 * ScriptForge UI Controls & Action Handlers (`src/ui/controls.js` - Wave 3)
 * Handles presets, snippets, sliders, ink switching, zoom, mobile tabs, and PDF/PNG exports.
 */

import { state, setHandSeed, setInkKey, toggleInspectVariance } from '../core/state.js';
import { PRESETS } from '../data/presets.js';
import { renderFullPage } from '../render/page.js';
import { exportMultiPagePdf, exportCurrentPagePng } from '../render/pdfExport.js';

let renderFrameId = null;

export function scheduleRender() {
    if (renderFrameId) cancelAnimationFrame(renderFrameId);
    renderFrameId = requestAnimationFrame(() => {
        renderFullPage();
    });
}

export function updateSlider(id, suffix = '') {
    const el = document.getElementById(id);
    const valEl = document.getElementById('val_' + id);
    if (el && valEl) {
        valEl.textContent = el.value + suffix;
    }
    scheduleRender();
}

export function setInk(inkKey) {
    setInkKey(inkKey);
    document.querySelectorAll('.ink-btn').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-indigo-400');
    });
    const activeBtn = document.getElementById('ink_' + inkKey);
    if (activeBtn) {
        activeBtn.classList.add('ring-2', 'ring-indigo-400');
    }
    scheduleRender();
}

export function regenerateSeed() {
    setHandSeed();
    scheduleRender();
}

export function toggleVarianceInspector() {
    const active = toggleInspectVariance();
    const btn = document.getElementById('inspectBtn');
    const legend = document.getElementById('inspectorLegend');
    if (btn) {
        btn.classList.toggle('bg-emerald-900/60', active);
        btn.classList.toggle('border-emerald-500', active);
        btn.classList.toggle('text-emerald-200', active);
    }
    if (legend) {
        legend.classList.toggle('hidden', !active);
    }
    scheduleRender();
}

export function loadPreset(key) {
    const editor = document.getElementById('docInput');
    if (editor && PRESETS[key]) {
        editor.value = PRESETS[key];
        scheduleRender();
    }
}

export function insertSnippet(type) {
    const editor = document.getElementById('docInput');
    if (!editor) return;

    const snippets = {
        math_frac: `\n$$ f(x) = \\int_{0}^{\\pi} \\frac{\\sin(x) + \\sqrt{x^2 + 1}}{2\\alpha} dx $$\n`,
        math_matrix: `\n$$ A = \\begin{bmatrix} \\lambda_1 & -\\omega \\\\ \\omega & \\lambda_2 \\end{bmatrix}, \\quad g(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases} $$\n`,
        diag_bitfield: `\n[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]\n`,
        diag_grid: `\n[DIAGRAM: grid | cols=Cycle,1,2,3,4,5,6 | rows=I1~IF~ID~EX~MEM~WB~;I2~~IF~ID~EX~MEM~WB]\n`,
        diag_kmap: `\n[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]\n`,
        diag_circuit: `\n[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]\n`,
        diag_dfa: `\n[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0]\n`,
        diag_tree: `\n[DIAGRAM: tree | edges=50->30,50->70,30->20,30->40,70->60,70->80]\n`,
        diag_plot: `\n[DIAGRAM: canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | xlabel=x | ylabel=f(x) | label=f(x)=4x^3]\n`,
        diag_svg: `\n[DIAGRAM: svg | <svg viewBox="0 0 320 95"><rect x="15" y="20" width="80" height="48" stroke="#1b3b8c" fill="none"/><text x="32" y="50">Source</text><line x1="95" y1="44" x2="175" y2="44" stroke="#1b3b8c"/><circle cx="215" cy="44" r="32" stroke="#b91c1c" fill="none"/><text x="196" y="49">Sink</text></svg>]\n`,
        strike: ` ~~mistake~~ `,
        pagebreak: `\n---PAGE---\n`
    };

    const start = editor.selectionStart ?? editor.value.length;
    const text = editor.value;
    const insertStr = snippets[type] || '';
    editor.value = text.slice(0, start) + insertStr + text.slice(start);
    editor.focus();
    scheduleRender();
}

export function insertCustomImageTag() {
    const editor = document.getElementById('docInput');
    if (editor && !editor.value.includes('[DIAGRAM: custom_image]')) {
        editor.value += '\n\n[DIAGRAM: custom_image]\n';
    }
    scheduleRender();
}

export function toggleModal(id) {
    const el = document.getElementById(id || 'vlmModal');
    if (el) el.classList.toggle('hidden');
}

export function setZoom(delta) {
    if (delta === 'reset') {
        state.zoomLevel = 1.0;
    } else {
        state.zoomLevel = Math.max(0.65, Math.min(1.45, Number((state.zoomLevel + Number(delta)).toFixed(2))));
    }
    const zoomLbl = document.getElementById('zoomLabel');
    if (zoomLbl) zoomLbl.textContent = `${Math.round(state.zoomLevel * 100)}%`;
    scheduleRender();
}

export function switchMobileTab(tabName) {
    state.mobileTab = tabName;
    const panels = {
        editor: document.getElementById('panelEditor'),
        preview: document.getElementById('panelPreview'),
        controls: document.getElementById('panelControls')
    };
    Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        if (k === tabName) {
            el.classList.remove('mobile-hidden');
        } else {
            el.classList.add('mobile-hidden');
        }
    });
    document.querySelectorAll('[data-action="mobileTab"]').forEach(btn => {
        const active = btn.getAttribute('data-arg') === tabName;
        btn.classList.toggle('text-indigo-400', active);
        btn.classList.toggle('border-indigo-500', active);
    });
}

export function exportCurrentPage() {
    exportCurrentPagePng();
}

export function exportPdfDocument() {
    exportMultiPagePdf();
}
