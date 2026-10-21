/**
 * Application entry point.
 * Boots the studio once the document and its fonts are ready.
 */

import { PRESETS } from './data/presets.js';
import { renderFullPage } from './render/page.js';
import { scheduleRender } from './ui/controls.js';
import { initEvents } from './ui/events.js';

window.addEventListener('load', function() {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.getElementById('docInput').value = PRESETS.ee_kmap;
    document.getElementById('docInput').addEventListener('input', scheduleRender);
    initEvents();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            renderFullPage();
        });
    } else {
        setTimeout(renderFullPage, 300);
    }
});
