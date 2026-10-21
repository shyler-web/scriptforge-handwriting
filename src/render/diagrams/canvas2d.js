/**
 * ScriptForge Universal 2D Coordinate, Function Plot & Geometry Engine (Wave 2 - Engine #4)
 * Supports:
 * 1. Arbitrary explicit functions y = f(x) with safe math evaluation, ticks, and asymptotes
 * 2. Shaded integration / probability density regions (shade=a,b) with hand-sketched hachure lines
 * 3. Concentric target rings & radial dimensions (circles=r1:lbl1,r2:lbl2...)
 * 4. Geometric ray/triangle constructions (triangle=0,0,1,0,1,0.7 | angle=theta)
 * 5. Free-body force vector diagrams (vectors=0:F_x,90:N,-90:mg)
 */

import { drawHandwrittenWord, drawAllographicChar } from '../glyph.js';
import {
    drawSharpArrowhead,
    drawArrowLine,
    drawLabelOrMath
} from './primitives.js';

/**
 * Safe math-expression evaluator for `fn=` diagram parameters.
 *
 * Security model (mission file §2.3): the expression is parsed by a
 * recursive-descent parser that recognises exactly one numeric variable (`x`),
 * two constants, and an explicit allowlist of `Math` functions. There is no
 * `eval`, no `new Function`, no property access, no indexing and no
 * assignment, so an expression can never reach the DOM or the window.
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('+' | '-') unary | power
 *   power   := primary ('^' unary)?          -- right associative
 *   primary := number | 'x' | 'pi' | 'e' | ident '(' expr (',' expr)* ')' | '(' expr ')'
 *
 * Implicit multiplication is accepted where it is unambiguous: `2x`, `4x^3`,
 * `2sin(x)`, `(x+1)(x-1)`.
 */

const MATH_FUNCTIONS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log10,
    log10: Math.log10,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    sign: Math.sign,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    pow: Math.pow,
    min: Math.min,
    max: Math.max,
    hypot: Math.hypot
};

const CONSTANTS = {
    pi: Math.PI,
    e: Math.E
};

class MathParseError extends Error {}

function tokenize(src) {
    const tokens = [];
    let i = 0;

    while (i < src.length) {
        const ch = src[i];

        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }

        if (ch >= '0' && ch <= '9' || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
            const start = i;
            while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
            if (src[i] === '.') {
                i++;
                while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
            }
            if (src[i] === 'e' || src[i] === 'E') {
                const save = i;
                i++;
                if (src[i] === '+' || src[i] === '-') i++;
                if (src[i] >= '0' && src[i] <= '9') {
                    while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
                } else {
                    i = save;
                }
            }
            tokens.push({ type: 'number', value: parseFloat(src.slice(start, i)) });
            continue;
        }

        if (/[A-Za-z_]/.test(ch)) {
            const start = i;
            while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
            tokens.push({ type: 'ident', value: src.slice(start, i) });
            continue;
        }

        if ('+-*/^%(),'.includes(ch)) {
            tokens.push({ type: ch });
            i++;
            continue;
        }

        throw new MathParseError(`Illegal character "${ch}"`);
    }

    return insertImplicitMultiplication(tokens);
}

const ENDS_VALUE = new Set(['number', 'ident']);

function insertImplicitMultiplication(tokens) {
    const out = [];
    for (const tok of tokens) {
        const prev = out[out.length - 1];
        if (prev) {
            const prevEnds = ENDS_VALUE.has(prev.type) || prev.type === ')';
            const curStarts = ENDS_VALUE.has(tok.type) || tok.type === '(';
            // An identifier directly followed by '(' is a call only when it names a
            // known function; otherwise it is an implicit product such as x(x+1).
            const isCall = prev.type === 'ident'
                && tok.type === '('
                && Object.prototype.hasOwnProperty.call(MATH_FUNCTIONS, prev.value.toLowerCase());
            if (prevEnds && curStarts && !isCall) out.push({ type: '*' });
        }
        out.push(tok);
    }
    return out;
}

function evaluateTokens(tokens, x) {
    let pos = 0;

    const peek = () => tokens[pos];
    const eat = (type) => {
        if (tokens[pos] && tokens[pos].type === type) { pos++; return true; }
        return false;
    };
    const expect = (type) => {
        if (!eat(type)) throw new MathParseError(`Expected "${type}"`);
    };

    function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().type === '+' || peek().type === '-')) {
            const op = tokens[pos++].type;
            const right = parseTerm();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    function parseTerm() {
        let left = parseUnary();
        while (peek() && (peek().type === '*' || peek().type === '/' || peek().type === '%')) {
            const op = tokens[pos++].type;
            const right = parseUnary();
            if (op === '*') left = left * right;
            else if (op === '/') left = left / right;
            else left = left % right;
        }
        return left;
    }

    function parseUnary() {
        const tok = peek();
        if (tok && tok.type === '+') { pos++; return parseUnary(); }
        if (tok && tok.type === '-') { pos++; return -parseUnary(); }
        return parsePower();
    }

    function parsePower() {
        const base = parsePrimary();
        if (peek() && peek().type === '^') {
            pos++;
            const exponent = parseUnary();
            return Math.pow(base, exponent);
        }
        return base;
    }

    function parsePrimary() {
        const tok = peek();
        if (!tok) throw new MathParseError('Unexpected end of expression');

        if (tok.type === 'number') { pos++; return tok.value; }

        if (tok.type === '(') {
            pos++;
            const inner = parseExpr();
            expect(')');
            return inner;
        }

        if (tok.type === 'ident') {
            pos++;
            const name = tok.value.toLowerCase();
            if (name === 'x') return x;
            if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];

            if (peek() && peek().type === '(') {
                if (!Object.prototype.hasOwnProperty.call(MATH_FUNCTIONS, name)) {
                    throw new MathParseError(`Unknown function "${name}"`);
                }
                pos++;
                const args = [parseExpr()];
                while (eat(',')) args.push(parseExpr());
                expect(')');
                const fn = MATH_FUNCTIONS[name];
                if ((name === 'min' || name === 'max') && args.length < 2) {
                    throw new MathParseError(`"${name}" needs at least two arguments`);
                }
                return fn.apply(null, args);
            }

            throw new MathParseError(`Unknown identifier "${name}"`);
        }

        throw new MathParseError(`Unexpected token "${tok.type}"`);
    }

    const result = parseExpr();
    if (pos !== tokens.length) throw new MathParseError('Trailing input');
    return result;
}

/**
 * Evaluates a mathematical expression string f(x) safely at numeric value `xVal`.
 * Supports the allowlisted Math functions above and the named presets below.
 */
export function evaluateMathFunction(exprRaw, xVal) {
    const expr = String(exprRaw == null ? '' : exprRaw).trim();

    // Named engineering & probability presets
    if (expr === 'damped_sine') {
        return Math.exp(-0.32 * xVal) * Math.cos(2.85 * xVal);
    }
    if (expr === 'semicircle' || expr === 'beta_half') {
        return (xVal > 0 && xVal < 1) ? (8 / Math.PI) * Math.sqrt(xVal * (1 - xVal)) : 0;
    }
    if (expr === 'cauchy_radial') {
        return 2 / (Math.PI * (1 + xVal * xVal));
    }
    if (expr === 'normal' || expr === 'gaussian') {
        return Math.exp(-0.5 * Math.pow((xVal - 3) / 1.15, 2));
    }

    if (!expr) return 0;

    try {
        const y = evaluateTokens(tokenize(expr), xVal);
        return Number.isFinite(y) ? y : 0;
    } catch {
        return Math.exp(-0.32 * xVal) * Math.cos(2.85 * xVal);
    }
}

/**
 * 1. Concentric Circles / Target Geometry (e.g. Probability target rings of radii 1/sqrt(3), 1, sqrt(3))
 * Syntax: `[DIAGRAM: canvas2d | circles=0.58:4pts,1.0:3pts,1.73:2pts | label=Target Scoring Zones]`
 */
function renderConcentricGeometry(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const rawCircles = String(params.circles || '0.58:4 pts,1.0:3 pts,1.73:2 pts')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const parsed = rawCircles.map(item => {
        const [rStr, lbl = ''] = item.split(':').map(s => s.trim());
        return { r: Math.max(0.2, parseFloat(rStr) || 1), lbl };
    }).sort((a, b) => a.r - b.r);

    const maxR = parsed[parsed.length - 1]?.r || 1.732;
    const outerPx = 68;
    const cx = startX + 125;
    const cy = startY + 84;
    const boxH = 168;

    // Subtle crosshair axes through center
    rc.line(cx - outerPx - 16, cy, cx + outerPx + 20, cy, {
        ...roughOpts, strokeWidth: 1.1, stroke: ink.secondary, seed: charCounterRef.count++
    });
    rc.line(cx, cy - outerPx - 14, cx, cy + outerPx + 14, {
        ...roughOpts, strokeWidth: 1.1, stroke: ink.secondary, seed: charCounterRef.count++
    });

    const angles = [-0.45, 0.35, 1.10, -1.25];
    parsed.forEach((c, idx) => {
        const radPx = Math.max(18, (c.r / maxR) * outerPx);
        rc.circle(cx, cy, radPx * 2, {
            ...roughOpts,
            stroke: idx === 0 ? ink.accent : ink.color,
            strokeWidth: (idx === parsed.length - 1 ? 1.8 : 1.45) * (ink.widthScale || 1.0),
            seed: charCounterRef.count++
        });

        // Radial leader arrow and label
        const theta = angles[idx % angles.length];
        const rx = cx + radPx * Math.cos(theta);
        const ry = cy + radPx * Math.sin(theta);
        drawArrowLine(ctx, rc, cx, cy, rx, ry, 7, {
            ...roughOpts, stroke: ink.secondary, strokeWidth: 1.2, seed: charCounterRef.count++
        });

        if (c.lbl) {
            const calloutX = cx + outerPx + 34;
            const calloutY = startY + 34 + idx * 36;
            rc.line(rx, ry, calloutX - 6, calloutY - 5, {
                ...roughOpts, stroke: ink.secondary, strokeWidth: 1.0, seed: charCounterRef.count++
            });
            drawLabelOrMath(ctx, rc, c.lbl, calloutX, calloutY, 18, charCounterRef, opts);
        }
    });

    if (params.label || params.title) {
        drawLabelOrMath(ctx, rc, params.label || params.title, cx + outerPx + 34, startY + 34 + parsed.length * 36, 18, charCounterRef, opts);
    }

    return boxH + 14;
}

/**
 * 2. Geometric Ray & Right-Triangle Construction (e.g. Ray at angle \theta intersecting line x = 1 at (1, Y))
 * Syntax: `[DIAGRAM: canvas2d | triangle=0,0,1,0,1,0.72 | angle=\theta | labels=(0,0),(1,0),(1,Y)]`
 */
function renderTriangleGeometry(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const ox = startX + 64;
    const oy = startY + 136;
    const scaleX = 150;
    const scaleY = 115;

    // Coordinate axes
    drawArrowLine(ctx, rc, ox - 18, oy, ox + 235, oy, 8.5, { ...roughOpts, seed: charCounterRef.count++ });
    drawArrowLine(ctx, rc, ox, oy + 18, ox, oy - 122, 8.5, { ...roughOpts, seed: charCounterRef.count++ });
    drawLabelOrMath(ctx, rc, 'x', ox + 242, oy + 5, 19, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, 'y', ox - 6, oy - 128, 19, charCounterRef, opts);

    const x1 = ox + scaleX;
    const yTop = oy - scaleY * 0.74;

    // Vertical line x = 1 (extended dashed/light line)
    rc.line(x1, oy + 14, x1, oy - 118, {
        ...roughOpts, stroke: ink.secondary, strokeWidth: 1.25, seed: charCounterRef.count++
    });

    // Diagonal hachure shading inside triangle (0,0)-(1,0)-(1,Y)
    for (let s = 18; s < scaleX - 8; s += 14) {
        const frac = s / scaleX;
        const hTop = oy - frac * (oy - yTop);
        rc.line(ox + s, oy - 2, ox + s - 10, Math.max(hTop + 3, oy - 28), {
            ...roughOpts, stroke: ink.secondary, strokeWidth: 0.95, roughness: 0.3, seed: charCounterRef.count++
        });
    }

    // Triangle edges & ray from origin through (1, Y)
    rc.line(ox, oy, x1, oy, { ...roughOpts, strokeWidth: 1.85, seed: charCounterRef.count++ });
    rc.line(x1, oy, x1, yTop, { ...roughOpts, stroke: ink.accent, strokeWidth: 1.85, seed: charCounterRef.count++ });
    drawArrowLine(ctx, rc, ox, oy, x1 + 36, yTop - 26, 9, {
        ...roughOpts, stroke: ink.accent, strokeWidth: 1.8, seed: charCounterRef.count++
    });

    // Right-angle marker at (1, 0)
    rc.linearPath([
        [x1 - 11, oy],
        [x1 - 11, oy - 11],
        [x1, oy - 11]
    ], { ...roughOpts, strokeWidth: 1.25, seed: charCounterRef.count++ });

    // Angle arc at origin
    rc.curve([
        [ox + 34, oy],
        [ox + 31, oy - 13],
        [ox + 24, oy - 20]
    ], { ...roughOpts, stroke: ink.secondary, seed: charCounterRef.count++ });

    const angleLbl = params.angle || '$\\Theta$';
    drawLabelOrMath(ctx, rc, angleLbl, ox + 40, oy - 8, 18, charCounterRef, opts);

    // Vertex labels
    const rawLbls = (params.labels || '(0,0);(1,0);(1,Y)').split(';').map(s => s.trim());
    drawLabelOrMath(ctx, rc, rawLbls[0] || '(0,0)', ox - 42, oy + 20, 17, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, rawLbls[1] || '(1,0)', x1 - 16, oy + 22, 17, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, rawLbls[2] || '(1,Y)', x1 + 8, yTop + 4, 18, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, params.line || '$x = 1$', x1 + 6, oy - 102, 17, charCounterRef, opts);

    return 172;
}

/**
 * 3. Free-Body Force Vector Diagram
 * Syntax: `[DIAGRAM: canvas2d | vectors=0:F_{pull},90:N,-90:mg,180:f_k | label=m]`
 */
function renderVectorDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    const cx = startX + 145;
    const cy = startY + 82;
    const boxSize = 44;

    // Central mass block
    rc.rectangle(cx - boxSize / 2, cy - boxSize / 2, boxSize, boxSize, {
        ...roughOpts, strokeWidth: 1.85, seed: charCounterRef.count++
    });
    drawLabelOrMath(ctx, rc, params.label || 'm', cx - 7, cy + 6, 20, charCounterRef, opts);

    const vecs = (params.vectors || '0:F,90:N,-90:mg,180:f_k').split(',').map(s => s.trim()).filter(Boolean);
    vecs.forEach(vStr => {
        const [degStr, lbl = 'F'] = vStr.split(':').map(s => s.trim());
        const rad = -(parseFloat(degStr) || 0) * (Math.PI / 180);
        const sx = cx + (boxSize / 2 + 2) * Math.cos(rad);
        const sy = cy + (boxSize / 2 + 2) * Math.sin(rad);
        const ex = cx + (boxSize / 2 + 48) * Math.cos(rad);
        const ey = cy + (boxSize / 2 + 48) * Math.sin(rad);

        drawArrowLine(ctx, rc, sx, sy, ex, ey, 8.5, {
            ...roughOpts, stroke: ink.accent, strokeWidth: 1.75, seed: charCounterRef.count++
        });
        drawLabelOrMath(ctx, rc, lbl, ex + 10 * Math.cos(rad) - 8, ey + 10 * Math.sin(rad) + 6, 18, charCounterRef, opts);
    });

    return 166;
}

/**
 * 4. Universal Explicit Function Plotter y = f(x) with Shaded Integral Hachures & Envelopes
 * Syntax: `[DIAGRAM: canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | xlabel=x | ylabel=f(x) | label=PDF f(x)=4x^3]`
 */
export function renderCanvas2D(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts) {
    if (params.circles) {
        return renderConcentricGeometry(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    if (params.triangle || params.angle) {
        return renderTriangleGeometry(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }
    if (params.vectors) {
        return renderVectorDiagram(ctx, rc, params, startX, startY, availWidth, charCounterRef, opts, ink, roughOpts);
    }

    const fnExpr = params.fn || params.func || 'damped_sine';
    const isDampedPreset = fnExpr === 'damped_sine';

    // Domain parsing [xMin, xMax]
    let xMin = 0;
    let xMax = isDampedPreset ? 8.0 : 1.0;
    if (params.domain) {
        const [d0, d1] = params.domain.split(',').map(Number);
        if (Number.isFinite(d0) && Number.isFinite(d1) && d1 > d0) {
            xMin = d0;
            xMax = d1;
        }
    }

    // Sample curve across 90 points to find automatic y-range
    const numSamples = 84;
    const samples = [];
    let yMinSample = 0;
    let yMaxSample = 0.2;

    for (let i = 0; i <= numSamples; i++) {
        const xv = xMin + (i / numSamples) * (xMax - xMin);
        const yv = evaluateMathFunction(fnExpr, xv);
        samples.push({ x: xv, y: yv });
        if (yv < yMinSample) yMinSample = yv;
        if (yv > yMaxSample) yMaxSample = yv;
    }

    const hasNegativeY = yMinSample < -0.05 || isDampedPreset;
    const ox = startX + 58;
    const plotW = Math.min(availWidth - 110, 385);
    const plotH = 142;
    const oy = hasNegativeY ? (startY + 80) : (startY + 128);
    const maxAbsY = Math.max(0.001, Math.max(Math.abs(yMaxSample), Math.abs(yMinSample)));
    const scaleY = (hasNegativeY ? 52 : 96) / maxAbsY;

    const mapX = (xv) => ox + ((xv - xMin) / (xMax - xMin)) * (plotW - 22);
    const mapY = (yv) => oy - yv * scaleY;

    // Draw Axes with sharp arrowheads
    const topAxisY = startY + 16;
    const botAxisY = hasNegativeY ? (startY + 144) : (oy + 12);
    rc.line(ox, botAxisY, ox, topAxisY, { ...roughOpts, strokeWidth: 1.65 * (ink.widthScale || 1.0), seed: charCounterRef.count++ });
    drawSharpArrowhead(ctx, rc, ox, topAxisY, -Math.PI / 2, 8.5, { ...roughOpts, seed: charCounterRef.count++ });

    rc.line(ox - 14, oy, ox + plotW, oy, { ...roughOpts, strokeWidth: 1.65 * (ink.widthScale || 1.0), seed: charCounterRef.count++ });
    drawSharpArrowhead(ctx, rc, ox + plotW, oy, 0, 8.5, { ...roughOpts, seed: charCounterRef.count++ });

    // Axis labels
    const yLbl = params.ylabel || (isDampedPreset ? 'y(t)' : 'f(x)');
    const xLbl = params.xlabel || (isDampedPreset ? 't (sec)' : 'x');
    drawLabelOrMath(ctx, rc, yLbl, ox - 44, topAxisY + 12, 19, charCounterRef, opts);
    drawLabelOrMath(ctx, rc, xLbl, ox + plotW + 8, oy + 6, 18, charCounterRef, opts);

    // Optional Shaded Definite Integral / Probability Region (`shade=a,b`)
    if (params.shade) {
        const [sA, sB] = params.shade.split(',').map(Number);
        if (Number.isFinite(sA) && Number.isFinite(sB) && sB > sA) {
            const clampedA = Math.max(xMin, sA);
            const clampedB = Math.min(xMax, sB);
            const pxA = mapX(clampedA);
            const pxB = mapX(clampedB);

            // Vertical boundary lines at x = a and x = b
            const pyA = mapY(evaluateMathFunction(fnExpr, clampedA));
            const pyB = mapY(evaluateMathFunction(fnExpr, clampedB));
            rc.line(pxA, oy, pxA, pyA, { ...roughOpts, stroke: ink.secondary, strokeWidth: 1.3, seed: charCounterRef.count++ });
            rc.line(pxB, oy, pxB, pyB, { ...roughOpts, stroke: ink.secondary, strokeWidth: 1.3, seed: charCounterRef.count++ });

            // Hand-sketched hachure lines inside [a, b]
            const stepPx = 9;
            for (let px = pxA + 4; px < pxB - 2; px += stepPx) {
                const xv = xMin + ((px - ox) / (plotW - 22)) * (xMax - xMin);
                const py = mapY(evaluateMathFunction(fnExpr, xv));
                rc.line(px, oy - 1, px + 4, py + 2, {
                    ...roughOpts,
                    stroke: ink.secondary,
                    strokeWidth: 1.0,
                    roughness: 0.35,
                    seed: charCounterRef.count++
                });
            }

            // Tick labels for integration bounds a and b
            drawLabelOrMath(ctx, rc, String(Number(clampedA.toFixed(2))), pxA - 8, oy + 18, 15, charCounterRef, opts);
            drawLabelOrMath(ctx, rc, String(Number(clampedB.toFixed(2))), pxB - 8, oy + 18, 15, charCounterRef, opts);
        }
    }

    // Damped Sine Envelope if applicable
    if (isDampedPreset) {
        for (let px = 0; px < plotW - 35; px += 16) {
            const t1 = (px / (plotW - 22)) * (xMax - xMin);
            const t2 = ((px + 8) / (plotW - 22)) * (xMax - xMin);
            const env1 = Math.exp(-0.32 * t1) * scaleY;
            const env2 = Math.exp(-0.32 * t2) * scaleY;
            rc.line(ox + px, oy - env1, ox + px + 8, oy - env2, {
                ...roughOpts, stroke: ink.secondary, strokeWidth: 1.0, roughness: 0.25, seed: charCounterRef.count++
            });
            rc.line(ox + px, oy + env1, ox + px + 8, oy + env2, {
                ...roughOpts, stroke: ink.secondary, strokeWidth: 1.0, roughness: 0.25, seed: charCounterRef.count++
            });
        }
    }

    // Axis ticks
    for (let tx = 65; tx < plotW - 25; tx += 65) {
        rc.line(ox + tx, oy - 4, ox + tx, oy + 4, { ...roughOpts, strokeWidth: 1.2, seed: charCounterRef.count++ });
    }
    const peakPy = mapY(yMaxSample);
    rc.line(ox - 4, peakPy, ox + 4, peakPy, { ...roughOpts, strokeWidth: 1.2, seed: charCounterRef.count++ });
    drawLabelOrMath(ctx, rc, String(Number(yMaxSample.toFixed(1))), ox - 30, peakPy + 5, 16, charCounterRef, opts);

    // Main Function Curve
    const pts = samples.map(pt => [mapX(pt.x), mapY(pt.y)]);
    rc.curve(pts, {
        ...roughOpts,
        stroke: ink.accent,
        strokeWidth: 1.90 * (ink.widthScale || 1.0),
        roughness: (opts.diagRoughness ?? 0.55) * 0.5,
        seed: charCounterRef.count++
    });

    if (params.label || params.title) {
        drawLabelOrMath(ctx, rc, params.label || params.title, ox + 125, topAxisY + 18, 19, charCounterRef, opts);
    }

    return plotH + 26;
}

export const renderPlot = renderCanvas2D;
export const drawPlot = renderCanvas2D;
export default renderCanvas2D;
