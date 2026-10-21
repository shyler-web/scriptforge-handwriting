/**
 * Helper: Draws a crisp hand-drawn rounded rectangle loop (for K-Map Prime Implicant groups)
 */
export function drawHandRoundedRect(rc, x, y, w, h, r, roughOpts) {
    const pts = [
        [x + r, y],
        [x + w - r, y],
        [x + w, y + r],
        [x + w, y + h - r],
        [x + w - r, y + h],
        [x + r, y + h],
        [x, y + h - r],
        [x, y + r],
        [x + r, y]
    ];
    rc.curve(pts, roughOpts);
}

/**
 * Helper: Draws a sharp hand-inked arrowhead at (tipX, tipY) pointing along angle `angleRad`
 */
export function drawSharpArrowhead(ctx, rc, tipX, tipY, angleRad, size, roughOpts) {
    const spread = 0.46;
    const x1 = tipX - size * Math.cos(angleRad - spread);
    const y1 = tipY - size * Math.sin(angleRad - spread);
    const x2 = tipX - size * Math.cos(angleRad + spread);
    const y2 = tipY - size * Math.sin(angleRad + spread);
    rc.linearPath([[x1, y1], [tipX, tipY], [x2, y2]], {
        ...roughOpts,
        roughness: roughOpts.roughness * 0.45
    });
}
