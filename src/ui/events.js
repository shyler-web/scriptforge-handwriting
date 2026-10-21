/**
 * Event wiring.
 *
 * The shell markup declares intent with `data-action` / `data-arg` attributes
 * instead of inline `onclick` strings, so every interactive element is bound
 * here in one place. Adding a control means adding an entry to the map below
 * and a `data-action` attribute in index.html — no script tags to touch.
 */

import {
    scheduleRender,
    updateSlider,
    setInk,
    regenerateSeed,
    toggleVarianceInspector,
    loadPreset,
    insertSnippet,
    toggleModal,
    exportCurrentPage,
    insertCustomImageTag
} from './controls.js';
import { handleImageDiagramUpload } from '../pipeline/vectorize.js';
import { processVlmDocument } from './vlm.js';

const CLICK_ACTIONS = {
    'load-preset': (arg) => loadPreset(arg),
    'toggle-modal': (arg) => toggleModal(arg),
    'toggle-inspector': () => toggleVarianceInspector(),
    'export-page': () => exportCurrentPage(),
    'regenerate-seed': () => regenerateSeed(),
    'insert-snippet': (arg) => insertSnippet(arg),
    'set-ink': (arg) => setInk(arg),
    'insert-image-tag': () => insertCustomImageTag()
};

const CHANGE_ACTIONS = {
    'render': () => scheduleRender(),
    'upload-diagram': (arg, el, ev) => handleImageDiagramUpload(ev),
    'vlm-upload': (arg, el, ev) => processVlmDocument(ev)
};

const INPUT_ACTIONS = {
    'slider': (arg, el) => updateSlider(arg, el.dataset.suffix || '')
};

function resolveAction(event, table) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return null;
    const el = target.closest('[data-action]');
    if (!el) return null;
    const fn = table[el.dataset.action];
    if (!fn) return null;
    return { fn, el };
}

export function initEvents() {
    document.addEventListener('click', (event) => {
        const hit = resolveAction(event, CLICK_ACTIONS);
        if (!hit) return;
        event.preventDefault();
        hit.fn(hit.el.dataset.arg, hit.el, event);
    });

    document.addEventListener('change', (event) => {
        const hit = resolveAction(event, CHANGE_ACTIONS);
        if (!hit) return;
        hit.fn(hit.el.dataset.arg, hit.el, event);
    });

    document.addEventListener('input', (event) => {
        const hit = resolveAction(event, INPUT_ACTIONS);
        if (!hit) return;
        hit.fn(hit.el.dataset.arg, hit.el, event);
    });
}
