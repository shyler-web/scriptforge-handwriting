/**
 * Reads the live control-panel values into the render options object.
 * Single source of truth for what the renderer is allowed to see.
 */

export function readOptions() {
    return {
        fontFamily: document.getElementById('fontArchetype').value,
        glyphWarp: parseFloat(document.getElementById('glyphWarp').value),
        baselineDrift: parseFloat(document.getElementById('baselineDrift').value),
        pressureVar: parseFloat(document.getElementById('pressureVar').value),
        slantAngle: parseFloat(document.getElementById('slantAngle').value),
        enableLigatures: document.getElementById('enableLigatures').checked,
        diagRoughness: parseFloat(document.getElementById('diagRoughness').value),
        diagBowing: parseFloat(document.getElementById('diagBowing').value),
        singlePassStroke: document.getElementById('singlePassStroke').checked,
        paperStyle: document.getElementById('paperStyle').value,
        camShadow: parseFloat(document.getElementById('camShadow').value),
        paperGrain: parseFloat(document.getElementById('paperGrain').value),
        pageTilt: parseFloat(document.getElementById('pageTilt').value)
    };
}
