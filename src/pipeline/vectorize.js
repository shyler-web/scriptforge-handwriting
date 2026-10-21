/**
 * ScriptForge Pipeline A: 1px Zhang-Suen Morphological Skeletonizer & RDP Curve Simplifier (Wave 2)
 * Converts any uploaded diagram photo/screenshot into crisp 1px centerline polylines
 * (eliminating hollow double-outlines) and stores them in `state.customContours`.
 */

import * as stateMod from '../core/state.js';

/**
 * Ramer-Douglas-Peucker (RDP) Polyline Simplification
 */
export function simplifyPolylineRDP(pts, epsilon = 1.6) {
    if (!Array.isArray(pts) || pts.length <= 2) return pts;

    let maxDist = 0;
    let index = 0;
    const [x1, y1] = pts[0];
    const [x2, y2] = pts[pts.length - 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    for (let i = 1; i < pts.length - 1; i++) {
        const [px, py] = pts[i];
        let dist;
        if (lenSq === 0) {
            dist = Math.hypot(px - x1, py - y1);
        } else {
            const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
            dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
        }
        if (dist > maxDist) {
            index = i;
            maxDist = dist;
        }
    }

    if (maxDist > epsilon) {
        const left = simplifyPolylineRDP(pts.slice(0, index + 1), epsilon);
        const right = simplifyPolylineRDP(pts.slice(index), epsilon);
        return left.slice(0, -1).concat(right);
    }
    return [pts[0], pts[pts.length - 1]];
}

/**
 * Zhang-Suen Morphological Thinning (Skeletonization) on a binary Uint8Array(W * H)
 * Reduces thick strokes to 1-pixel-wide topological centerlines.
 */
export function zhangSuenThinning(bin, W, H, maxIterations = 24) {
    const toClear = new Int32Array(W * H);

    for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;

        for (let step = 0; step < 2; step++) {
            let clearCount = 0;

            for (let y = 1; y < H - 1; y++) {
                const row = y * W;
                for (let x = 1; x < W - 1; x++) {
                    const idx = row + x;
                    if (bin[idx] === 0) continue;

                    const p2 = bin[idx - W];
                    const p3 = bin[idx - W + 1];
                    const p4 = bin[idx + 1];
                    const p5 = bin[idx + W + 1];
                    const p6 = bin[idx + W];
                    const p7 = bin[idx + W - 1];
                    const p8 = bin[idx - 1];
                    const p9 = bin[idx - W - 1];

                    const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                    if (B < 2 || B > 6) continue;

                    const A = (p2 === 0 && p3 === 1 ? 1 : 0) +
                              (p3 === 0 && p4 === 1 ? 1 : 0) +
                              (p4 === 0 && p5 === 1 ? 1 : 0) +
                              (p5 === 0 && p6 === 1 ? 1 : 0) +
                              (p6 === 0 && p7 === 1 ? 1 : 0) +
                              (p7 === 0 && p8 === 1 ? 1 : 0) +
                              (p8 === 0 && p9 === 1 ? 1 : 0) +
                              (p9 === 0 && p2 === 1 ? 1 : 0);

                    if (A !== 1) continue;

                    const m1 = step === 0 ? (p2 * p4 * p6) : (p2 * p4 * p8);
                    const m2 = step === 0 ? (p4 * p6 * p8) : (p2 * p6 * p8);
                    if (m1 === 0 && m2 === 0) {
                        toClear[clearCount++] = idx;
                    }
                }
            }

            if (clearCount > 0) {
                changed = true;
                for (let k = 0; k < clearCount; k++) {
                    bin[toClear[k]] = 0;
                }
            }
        }

        if (!changed) break;
    }

    return bin;
}

/**
 * Extracts simplified centerline polylines from an HTMLImageElement.
 */
export function extractSkeletonPolylinesFromImage(img, targetW = 480, targetH = 190) {
    const off = document.createElement('canvas');
    off.width = targetW;
    off.height = targetH;
    const octx = off.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, targetW, targetH);

    const scale = Math.min((targetW - 16) / img.width, (targetH - 16) / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    octx.drawImage(img, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);

    const rgba = octx.getImageData(0, 0, targetW, targetH).data;
    const lum = new Float32Array(targetW * targetH);
    let sumLum = 0;

    for (let i = 0; i < targetW * targetH; i++) {
        const idx = i * 4;
        const l = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
        lum[i] = l;
        sumLum += l;
    }

    const meanLum = sumLum / (targetW * targetH);
    const thresh = Math.min(205, Math.max(95, meanLum * 0.86));
    const bin = new Uint8Array(targetW * targetH);

    for (let y = 1; y < targetH - 1; y++) {
        for (let x = 1; x < targetW - 1; x++) {
            const i = y * targetW + x;
            const grad = Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + targetW]);
            if (lum[i] < thresh || grad > 42) {
                bin[i] = 1;
            }
        }
    }

    // Thin thick lines down to 1px centerlines
    zhangSuenThinning(bin, targetW, targetH, 22);

    // Trace 8-connected skeleton chains
    const visited = new Uint8Array(targetW * targetH);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const polylines = [];

    for (let y = 1; y < targetH - 1; y++) {
        for (let x = 1; x < targetW - 1; x++) {
            const startIdx = y * targetW + x;
            if (bin[startIdx] && !visited[startIdx]) {
                const chain = [[x, y]];
                visited[startIdx] = 1;
                let cx = x, cy = y;

                for (let step = 0; step < 140; step++) {
                    let moved = false;
                    for (const [dx, dy] of dirs) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        const nIdx = ny * targetW + nx;
                        if (nx > 0 && ny > 0 && nx < targetW - 1 && ny < targetH - 1 && bin[nIdx] && !visited[nIdx]) {
                            visited[nIdx] = 1;
                            chain.push([nx, ny]);
                            cx = nx;
                            cy = ny;
                            moved = true;
                            break;
                        }
                    }
                    if (!moved) break;
                }

                if (chain.length >= 4) {
                    const simplified = simplifyPolylineRDP(chain, 1.45);
                    if (simplified.length >= 2) {
                        polylines.push(simplified);
                    }
                }
            }
        }
    }

    return polylines.slice(0, 360);
}

/**
 * Handles file upload event from `#diagramUpload` or `#vlmImageInput`.
 */
export function handleImageDiagramUpload(event, onCompleteCallback) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const contours = extractSkeletonPolylinesFromImage(img);
            const stateObj = stateMod.state || stateMod.default || stateMod;
            if (stateObj) {
                stateObj.customContours = contours;
                stateObj.customDiagramContours = contours;
            }
            if (typeof window !== 'undefined') {
                window.customDiagramContours = contours;
            }

            const statusEl = document.getElementById('uploadedDiagramStatus');
            const nameEl = document.getElementById('uploadedDiagramName');
            if (statusEl) statusEl.classList.remove('hidden');
            if (nameEl) {
                nameEl.textContent = `Skeletonized ${contours.length} crisp 1px strokes from "${file.name}"`;
            }

            const editor = document.getElementById('docInput');
            if (editor && !editor.value.includes('[DIAGRAM: custom_image]')) {
                editor.value += '\n\n[DIAGRAM: custom_image]\n';
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }

            if (typeof onCompleteCallback === 'function') {
                onCompleteCallback(contours, file);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export const vectorizeImage = handleImageDiagramUpload;
export default handleImageDiagramUpload;
