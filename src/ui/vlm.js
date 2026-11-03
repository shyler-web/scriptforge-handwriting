/**
 * ScriptForge 100% Offline Diagram & Worksheet Skeletonizer (`src/ui/vlm.js`)
 * Zero external API calls, zero API keys, 100% client-side privacy.
 * Converts uploaded diagram/worksheet images into 1px Zhang-Suen centerline strokes.
 */

import { handleImageDiagramUpload } from '../pipeline/vectorize.js';

export async function processVlmDocument(event, scheduleRenderCallback) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const prog = document.getElementById('vlmProgress');
    const progText = document.getElementById('vlmProgressText');
    if (prog) prog.classList.remove('hidden');
    if (progText) {
        progText.textContent = 'Running offline 1px Zhang-Suen morphological skeletonizer...';
    }

    handleImageDiagramUpload(event, (contours) => {
        const editor = document.getElementById('docInput');
        if (editor) {
            const strokeCount = Array.isArray(contours) ? contours.length : 0;
            const tag = `[DIAGRAM: custom_image | label=Fig: Hand-Traced from ${file.name}]`;
            if (!editor.value.includes('[DIAGRAM: custom_image')) {
                editor.value += `\n\n# Offline 1px Centerline Traced Figure (${strokeCount} strokes)\n${tag}\n`;
            }
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (prog) prog.classList.add('hidden');
        const modal = document.getElementById('vlmModal');
        if (modal) modal.classList.add('hidden');
        if (typeof scheduleRenderCallback === 'function') {
            scheduleRenderCallback();
        }
    });
}

export default processVlmDocument;
