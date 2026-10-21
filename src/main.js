/**
 * ScriptForge Application Entry Point (`src/main.js` - Wave 3)
 */

import { PRESETS } from './data/presets.js';
import { initEvents } from './ui/events.js';
import { renderFullPage } from './render/page.js';

function bootScriptForge() {
    paintLucideIcons();

    const docInput = document.getElementById('docInput');
    if (docInput && !docInput.value.trim()) {
        docInput.value = PRESETS.ee_kmap;
    }

    initEvents();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            renderFullPage();
        });
    } else {
        setTimeout(renderFullPage, 250);
    }
}

/**
 * Lucide is loaded from a CDN with `defer`, so it may be missing or late when
 * the offline-first studio boots. Icons are cosmetic: never let them break the
 * renderer.
 */
function paintLucideIcons() {
    try {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.warn('[ScriptForge] icon hydration skipped:', err.message);
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootScriptForge);
} else {
    bootScriptForge();
}

// If the icon CDN resolves after boot, hydrate the icons then.
window.addEventListener('load', paintLucideIcons);
