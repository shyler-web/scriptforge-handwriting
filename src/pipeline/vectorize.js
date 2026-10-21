import { setCustomContours, state } from '../core/state.js';
import { insertCustomImageTag } from '../ui/controls.js';

/**
 * PIPELINE A: HIGH-RESOLUTION IMAGE DIAGRAM -> HAND-SKETCHED VECTOR CONTOURS
 * Uses a 480x190 resolution grid with luminance-gradient edge thresholding and
 * chained 8-neighbour contour walks for crisp, faithful diagram tracing.
 */
export function handleImageDiagramUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const off = document.createElement('canvas');
            const targetW = 480;
            const targetH = 190;
            off.width = targetW;
            off.height = targetH;
            const octx = off.getContext('2d');
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, targetW, targetH);

            // Preserve aspect ratio inside target box
            const scale = Math.min(targetW / img.width, targetH / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            octx.drawImage(img, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);

            const imgData = octx.getImageData(0, 0, targetW, targetH).data;
            const visited = new Uint8Array(targetW * targetH);
            const isEdge = (x, y) => {
                if (x < 1 || y < 1 || x >= targetW - 1 || y >= targetH - 1) return false;
                const idx = (y * targetW + x) * 4;
                const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
                const idxR = (y * targetW + (x + 1)) * 4;
                const lumR = 0.299 * imgData[idxR] + 0.587 * imgData[idxR + 1] + 0.114 * imgData[idxR + 2];
                const idxB = ((y + 1) * targetW + x) * 4;
                const lumB = 0.299 * imgData[idxB] + 0.587 * imgData[idxB + 1] + 0.114 * imgData[idxB + 2];
                return (Math.abs(lum - lumR) + Math.abs(lum - lumB) > 36) || lum < 128;
            };

            const polylines = [];
            const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

            for (let y = 1; y < targetH - 1; y++) {
                for (let x = 1; x < targetW - 1; x++) {
                    const pIdx = y * targetW + x;
                    if (!visited[pIdx] && isEdge(x, y)) {
                        const chain = [[x, y]];
                        visited[pIdx] = 1;
                        let cx = x, cy = y;
                        for (let step = 0; step < 64; step++) {
                            let found = false;
                            for (const [dx, dy] of dirs) {
                                const nx = cx + dx, ny = cy + dy;
                                const nIdx = ny * targetW + nx;
                                if (nx > 0 && ny > 0 && nx < targetW - 1 && ny < targetH - 1 && !visited[nIdx] && isEdge(nx, ny)) {
                                    visited[nIdx] = 1;
                                    chain.push([nx, ny]);
                                    cx = nx;
                                    cy = ny;
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) break;
                        }
                        if (chain.length >= 5) {
                            polylines.push(chain.filter((_, idx) => idx % 3 === 0 || idx === chain.length - 1));
                        }
                    }
                }
            }

            setCustomContours(polylines.slice(0, 320));
            document.getElementById('uploadedDiagramStatus').classList.remove('hidden');
            document.getElementById('uploadedDiagramName').textContent = `Vectorized ${state.customContours.length} crisp strokes from "${file.name}"`;
            insertCustomImageTag();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
