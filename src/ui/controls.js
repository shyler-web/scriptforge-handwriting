/**
 * UI Helpers & Snippet Inserters.
 * These are the actions the interface can trigger; the wiring lives in
 * src/ui/events.js and the shell markup carries `data-action` attributes.
 */

import { renderFullPage } from '../render/page.js';
import { PRESETS } from '../data/presets.js';
import { setHandSeed, setInkKey, setInspectVariance, state } from '../core/state.js';

let renderTimeout = null;
export function scheduleRender() {
    if (renderTimeout) cancelAnimationFrame(renderTimeout);
    renderTimeout = requestAnimationFrame(renderFullPage);
}

export function updateSlider(id, suffix = '') {
    const val = document.getElementById(id).value;
    document.getElementById('val_' + id).textContent = val + suffix;
    scheduleRender();
}

export function setInk(inkKey) {
    setInkKey(inkKey);
    document.querySelectorAll('.ink-btn').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-indigo-400');
    });
    document.getElementById('ink_' + inkKey).classList.add('ring-2', 'ring-indigo-400');
    scheduleRender();
}

export function regenerateSeed() {
    setHandSeed(Math.floor(Math.random() * 90000) + 1000);
    scheduleRender();
}

export function toggleVarianceInspector() {
    setInspectVariance(!state.inspectVariance);
    const btn = document.getElementById('inspectBtn');
    const legend = document.getElementById('inspectorLegend');
    if (state.inspectVariance) {
        btn.classList.add('bg-emerald-900/60', 'border-emerald-500', 'text-emerald-200');
        legend.classList.remove('hidden');
    } else {
        btn.classList.remove('bg-emerald-900/60', 'border-emerald-500', 'text-emerald-200');
        legend.classList.add('hidden');
    }
    scheduleRender();
}

export function loadPreset(key) {
    if (PRESETS[key]) {
        document.getElementById('docInput').value = PRESETS[key];
        scheduleRender();
    }
}

export function insertSnippet(type) {
    const editor = document.getElementById('docInput');
    const snippets = {
        math_frac: `\n$$ f(x) = \\int_{0}^{\\pi} \\frac{\\sin(x) + \\sqrt{x^2 + 1}}{2\\alpha} dx $$\n`,
        math_matrix: `\n$$ A = \\begin{bmatrix} \\lambda_1 & -\\omega \\\\ \\omega & \\lambda_2 \\end{bmatrix} $$\n`,
        diag_kmap: `\n[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]\n`,
        diag_circuit: `\n[DIAGRAM: circuit | expr=(A' AND B) OR (C AND D)]\n`,
        diag_dfa: `\n[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2]\n`,
        diag_plot: `\n[DIAGRAM: plot | fn=damped_sine | label=Transient Response y(t)]\n`,
        strike: ` ~~wrong term~~ `
    };
    const start = editor.selectionStart || editor.value.length;
    const text = editor.value;
    editor.value = text.slice(0, start) + (snippets[type] || '') + text.slice(start);
    editor.focus();
    scheduleRender();
}

export function toggleModal(id) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden');
}

export function exportCurrentPage() {
    const canvas = document.getElementById('notebookCanvas');
    const link = document.createElement('a');
    link.download = `ScriptForge_Handwritten_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

export function insertCustomImageTag() {
    const editor = document.getElementById('docInput');
    if (!editor.value.includes('[DIAGRAM: custom_image]')) {
        editor.value += '\n\n[DIAGRAM: custom_image]\n';
    }
    scheduleRender();
}
