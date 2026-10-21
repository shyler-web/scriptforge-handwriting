/**
 * ScriptForge Zero-Dependency Multi-Page HiDPI PDF 1.4 Compiler (`src/render/pdfExport.js` - Wave 3)
 * Compiles all active `.notebook-page-canvas` elements into a genuine multi-page binary `.pdf`
 * document 100% client-side (zero external CDN dependencies required), plus PNG page export.
 */

/**
 * Converts a base64 dataURL into a raw Uint8Array binary buffer.
 */
function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
}

/**
 * Encodes an ASCII string to Uint8Array.
 */
function strToBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        out[i] = str.charCodeAt(i) & 0xff;
    }
    return out;
}

/**
 * Builds a valid multi-page PDF 1.4 binary Blob from an array of HTMLCanvasElements.
 * Each canvas is embedded as a high-quality DCTDecode (JPEG) XObject stream on an A4-proportioned page.
 */
export function buildMultiPagePdfBlob(canvases) {
    const pageW = 595.28; // A4 width in PDF points (72 dpi)
    const pageH = 798.58; // Proportioned to 820x1100 notebook aspect ratio

    const chunks = [];
    let byteOffset = 0;
    const offsets = [0]; // 1-indexed PDF object byte offsets

    const pushBytes = (uint8) => {
        chunks.push(uint8);
        byteOffset += uint8.byteLength;
    };
    const pushStr = (str) => pushBytes(strToBytes(str));

    // PDF Header
    pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    const numPages = canvases.length;
    // Object ID allocation:
    // 1: Catalog
    // 2: Pages Tree
    // For each page i (0..numPages-1):
    //   pageObjId    = 3 + i * 3
    //   contentObjId = 4 + i * 3
    //   imageObjId   = 5 + i * 3
    const kidsRefs = [];
    for (let i = 0; i < numPages; i++) {
        kidsRefs.push(`${3 + i * 3} 0 R`);
    }

    // Object 1: Catalog
    offsets[1] = byteOffset;
    pushStr(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);

    // Object 2: Pages Root
    offsets[2] = byteOffset;
    pushStr(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs.join(' ')} ] /Count ${numPages} >>\nendobj\n`);

    // Emit Page, Content Stream, and JPEG XObject for each notebook page
    for (let i = 0; i < numPages; i++) {
        const cv = canvases[i];
        const pageObjId = 3 + i * 3;
        const contentObjId = 4 + i * 3;
        const imageObjId = 5 + i * 3;
        const imgName = `/Im${i + 1}`;

        const jpegDataUrl = cv.toDataURL('image/jpeg', 0.94);
        const jpegBytes = dataUrlToUint8Array(jpegDataUrl);

        // Page Object
        offsets[pageObjId] = byteOffset;
        pushStr(
            `${pageObjId} 0 obj\n` +
            `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)} ] ` +
            `/Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> ` +
            `/Contents ${contentObjId} 0 R >>\nendobj\n`
        );

        // Page Content Stream (scales XObject to fill page)
        const contentCmd = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n${imgName} Do\nQ\n`;
        offsets[contentObjId] = byteOffset;
        pushStr(
            `${contentObjId} 0 obj\n<< /Length ${contentCmd.length} >>\nstream\n${contentCmd}endstream\nendobj\n`
        );

        // Image XObject Stream
        offsets[imageObjId] = byteOffset;
        pushStr(
            `${imageObjId} 0 obj\n` +
            `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\n` +
            `stream\n`
        );
        pushBytes(jpegBytes);
        pushStr(`\nendstream\nendobj\n`);
    }

    // Cross-Reference Table (xref)
    const totalObjs = 2 + numPages * 3;
    const xrefStart = byteOffset;
    pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
    for (let objId = 1; objId <= totalObjs; objId++) {
        const offStr = String(offsets[objId] || 0).padStart(10, '0');
        pushStr(`${offStr} 00000 n \n`);
    }

    // PDF Trailer
    pushStr(
        `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\n` +
        `startxref\n${xrefStart}\n%%EOF\n`
    );

    return new Blob(chunks, { type: 'application/pdf' });
}

/**
 * Exports all rendered notebook pages as a single downloadable HiDPI `.pdf` file.
 */
export function exportMultiPagePdf() {
    const canvases = Array.from(document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)'));
    const fallback = document.getElementById('notebookCanvas');
    const targets = canvases.length > 0 ? canvases : (fallback ? [fallback] : []);
    if (targets.length === 0) return;

    const blob = buildMultiPagePdfBlob(targets);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `ScriptForge_Notebook_${targets.length}p_${Date.now()}.pdf`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Exports the current/first page (or a stitched vertical tall PNG if multi-page) as a high-res PNG.
 */
export function exportCurrentPagePng() {
    const canvases = Array.from(document.querySelectorAll('canvas.notebook-page-canvas:not(.hidden)'));
    const fallback = document.getElementById('notebookCanvas');
    const targets = canvases.length > 0 ? canvases : (fallback ? [fallback] : []);
    if (targets.length === 0) return;

    if (targets.length === 1) {
        const link = document.createElement('a');
        link.download = `ScriptForge_Scan_${Date.now()}.png`;
        link.href = targets[0].toDataURL('image/png');
        link.click();
        return;
    }

    // Stitch multiple pages into a clean vertical strip PNG if user clicks PNG export on a multi-page doc
    const gap = 24;
    const w = targets[0].width;
    const singleH = targets[0].height;
    const stitched = document.createElement('canvas');
    stitched.width = w;
    stitched.height = targets.length * singleH + (targets.length - 1) * gap;
    const sctx = stitched.getContext('2d');
    sctx.fillStyle = '#090d16';
    sctx.fillRect(0, 0, stitched.width, stitched.height);

    targets.forEach((cv, idx) => {
        sctx.drawImage(cv, 0, idx * (singleH + gap));
    });

    const link = document.createElement('a');
    link.download = `ScriptForge_Scan_${targets.length}Pages_${Date.now()}.png`;
    link.href = stitched.toDataURL('image/png');
    link.click();
}

export default { exportMultiPagePdf, exportCurrentPagePng, buildMultiPagePdfBlob };
