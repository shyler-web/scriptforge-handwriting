/**
 * ScriptForge Delegated Event Router (`src/ui/events.js` - Wave 3)
 * Wires both `data-action`/`data-arg` attributes and legacy global window callbacks.
 */

import {
    scheduleRender,
    updateSlider,
    setInk,
    regenerateSeed,
    toggleVarianceInspector,
    loadPreset,
    insertSnippet,
    insertCustomImageTag,
    toggleModal,
    setZoom,
    switchMobileTab,
    exportCurrentPage,
    exportPdfDocument
} from './controls.js';
import { handleImageDiagramUpload } from '../pipeline/vectorize.js';
import { processVlmDocument } from './vlm.js';

export function initEvents() {
    // Expose global helpers so inline onclick="..." attributes and data-action attributes both work
    if (typeof window !== 'undefined') {
        Object.assign(window, {
            scheduleRender,
            updateSlider,
            setInk,
            regenerateSeed,
            toggleVarianceInspector,
            loadPreset,
            insertSnippet,
            insertCustomImageTag,
            toggleModal,
            setZoom,
            switchMobileTab,
            exportCurrentPage,
            exportPdfDocument,
            handleImageDiagramUpload: (e) => handleImageDiagramUpload(e, scheduleRender),
            processVlmDocument: (e) => processVlmDocument(e, scheduleRender)
        });
    }

    const docInput = document.getElementById('docInput');
    if (docInput) {
        docInput.addEventListener('input', scheduleRender);
    }

    // Delegated click handler for `[data-action]` elements
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const arg = btn.getAttribute('data-arg') || '';

        switch (action) {
            case 'preset':
            case 'loadPreset':
            case 'load-preset':
                loadPreset(arg);
                break;
            case 'snippet':
            case 'insertSnippet':
            case 'insert-snippet':
                insertSnippet(arg);
                break;
            case 'ink':
            case 'setInk':
                setInk(arg);
                break;
            case 'reseed':
            case 'regenerateSeed':
                regenerateSeed();
                break;
            case 'inspect':
            case 'toggleVarianceInspector':
            case 'toggle-inspector':
                toggleVarianceInspector();
                break;
            case 'modal':
            case 'toggleModal':
            case 'toggle-modal':
                toggleModal(arg || 'vlmModal');
                break;
            case 'exportPdf':
                exportPdfDocument();
                break;
            case 'exportPng':
            case 'exportCurrentPage':
            case 'export-page':
                exportCurrentPage();
                break;
            case 'insertCustomImage':
                insertCustomImageTag();
                break;
            case 'zoom':
                setZoom(arg === 'reset' ? 'reset' : parseFloat(arg));
                break;
            case 'mobileTab':
                switchMobileTab(arg);
                break;
            default:
                break;
        }
    });

    // Delegated range / select / checkbox input listener
    document.addEventListener('input', (e) => {
        const t = e.target;
        if (!t || t.id === 'docInput' || t.id === 'geminiApiKey') return;
        if (t.type === 'range') {
            const suffix = t.id === 'slantAngle' ? '°' : '';
            updateSlider(t.id, suffix);
        } else if (t.tagName === 'SELECT' || t.type === 'checkbox') {
            scheduleRender();
        }
    });

    // File upload listeners
    const diagInput = document.getElementById('diagramUpload');
    if (diagInput) {
        diagInput.addEventListener('change', (e) => handleImageDiagramUpload(e, scheduleRender));
    }
    const vlmInput = document.getElementById('vlmImageInput');
    if (vlmInput) {
        vlmInput.addEventListener('change', (e) => processVlmDocument(e, scheduleRender));
    }
}

export default initEvents;
