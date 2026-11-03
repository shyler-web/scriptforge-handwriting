// src/render/sketch/vecmath.js
// Pure 2D/3D Vector Algebra, Safe Math Formula Compiler, Exact Boundary Ray-Casting,
// Scanline Polygon Hatching, Smooth Splines, and 3D Axonometric Projection.

export const EPS = 1e-7;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// ============================================================================
// 1. 2D & 3D VECTOR ALGEBRA
// ============================================================================
export const Vec2 = {
  of: (x = 0, y = 0) => ({ x: Number(x) || 0, y: Number(y) || 0 }),
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  lenSq: (a) => a.x * a.x + a.y * a.y,
  len: (a) => Math.hypot(a.x, a.y),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: (a) => {
    const l = Math.hypot(a.x, a.y);
    return l > EPS ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
  },
  // Screen-space normal (rotates 90 deg counter-clockwise in standard math, or upwards on screen)
  perp: (a) => ({ x: -a.y, y: a.x }),
  rot: (a, rad) => {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
  },
  rotAround: (p, center, rad) => Vec2.add(center, Vec2.rot(Vec2.sub(p, center), rad)),
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
  mid: (a, b) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }),
  // Note: In math-space y points UP, in canvas-space y points DOWN.
  // polar(r, deg) uses standard mathematical angle where +deg is counter-clockwise (upward on screen: y - r*sin)
  polar: (r, deg, yDown = true) => {
    const rad = deg * DEG2RAD;
    return {
      x: r * Math.cos(rad),
      y: (yDown ? -1 : 1) * r * Math.sin(rad),
    };
  },
  angle: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
};

export const Vec3 = {
  of: (x = 0, y = 0, z = 0) => ({ x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }),
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  len: (a) => Math.hypot(a.x, a.y, a.z),
  norm: (a) => {
    const l = Math.hypot(a.x, a.y, a.z);
    return l > EPS ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 1 };
  },
};

// ============================================================================
// 2. SAFE MATHEMATICAL EXPRESSION COMPILER (Zero `eval`, Shunting-Yard AST)
// ============================================================================
const MATH_CONSTANTS = {
  pi: Math.PI,
  PI: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  E: Math.E,
  phi: 1.618033988749895,
  deg: DEG2RAD,
};

const MATH_FUNCS = {
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
  sqrt: (x) => Math.sqrt(Math.max(0, x)),
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: (x) => Math.log(Math.max(EPS, x)),
  log: (x) => Math.log10(Math.max(EPS, x)),
  log2: (x) => Math.log2(Math.max(EPS, x)),
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  mod: (a, b) => ((a % b) + b) % b,
  step: (x) => (x >= 0 ? 1 : 0),
  sinc: (x) => (Math.abs(x) < 1e-5 ? 1 : Math.sin(x) / x),
  clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
};

function tokenizeMathExpr(expr) {
  const s = String(expr || '0').trim();
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.eE+-]/.test(s[i])) {
        if ((s[i] === '+' || s[i] === '-') && !/[eE]/.test(s[i - 1])) break;
        num += s[i++];
      }
      tokens.push({ type: 'num', value: parseFloat(num) });
      // Implicit multiplication: e.g. "2x" or "2(x+1)" or "2pi"
      if (i < s.length && /[a-zA-Z_(]/.test(s[i])) {
        tokens.push({ type: 'op', value: '*' });
      }
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) id += s[i++];
      tokens.push({ type: 'id', value: id });
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    i++;
  }
  return tokens;
}

export function compileMathExpr(exprStr) {
  const tokens = tokenizeMathExpr(exprStr);
  const output = [];
  const ops = [];
  const prec = { 'u-': 4, '^': 3, '*': 2, '/': 2, '+': 1, '-': 1 };
  const rightAssoc = { '^': true, 'u-': true };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : null;
    if (t.type === 'num') {
      output.push(t);
    } else if (t.type === 'id') {
      const next = tokens[i + 1];
      if (next && next.type === 'op' && next.value === '(') {
        ops.push({ type: 'func', value: t.value, argCount: 1 });
      } else {
        output.push(t);
      }
    } else if (t.type === 'op') {
      if (t.value === '(') {
        ops.push(t);
      } else if (t.value === ',') {
        while (ops.length && ops[ops.length - 1].value !== '(') {
          output.push(ops.pop());
        }
        if (ops.length >= 2 && ops[ops.length - 2].type === 'func') {
          ops[ops.length - 2].argCount++;
        }
      } else if (t.value === ')') {
        while (ops.length && ops[ops.length - 1].value !== '(') {
          output.push(ops.pop());
        }
        if (ops.length && ops[ops.length - 1].value === '(') ops.pop();
        if (ops.length && ops[ops.length - 1].type === 'func') {
          output.push(ops.pop());
        }
      } else {
        let opVal = t.value;
        if (
          opVal === '-' &&
          (!prev || (prev.type === 'op' && prev.value !== ')'))
        ) {
          opVal = 'u-';
        } else if (
          opVal === '+' &&
          (!prev || (prev.type === 'op' && prev.value !== ')'))
        ) {
          continue;
        }
        while (ops.length) {
          const top = ops[ops.length - 1];
          if (top.type !== 'op' || top.value === '(') break;
          const pTop = prec[top.value] || 0;
          const pCur = prec[opVal] || 0;
          if (pTop > pCur || (pTop === pCur && !rightAssoc[opVal])) {
            output.push(ops.pop());
          } else {
            break;
          }
        }
        ops.push({ type: 'op', value: opVal });
      }
    }
  }
  while (ops.length) output.push(ops.pop());

  return function evaluate(vars = {}) {
    const stack = [];
    for (const item of output) {
      if (item.type === 'num') {
        stack.push(item.value);
      } else if (item.type === 'id') {
        if (item.value in vars) stack.push(Number(vars[item.value]));
        else if (item.value in MATH_CONSTANTS) stack.push(MATH_CONSTANTS[item.value]);
        else stack.push(0);
      } else if (item.type === 'op') {
        if (item.value === 'u-') {
          stack.push(-(stack.pop() || 0));
        } else {
          const b = stack.pop() ?? 0;
          const a = stack.pop() ?? 0;
          switch (item.value) {
            case '+': stack.push(a + b); break;
            case '-': stack.push(a - b); break;
            case '*': stack.push(a * b); break;
            case '/': stack.push(Math.abs(b) < EPS ? 0 : a / b); break;
            case '^': stack.push(Math.pow(a, b)); break;
            default: stack.push(0);
          }
        }
      } else if (item.type === 'func') {
        const fn = MATH_FUNCS[item.value];
        const argc = item.argCount || 1;
        const args = [];
        for (let k = 0; k < argc; k++) args.unshift(stack.pop() ?? 0);
        stack.push(fn ? fn(...args) : 0);
      }
    }
    const res = stack.pop();
    return Number.isFinite(res) ? res : 0;
  };
}

// ============================================================================
// 3. CUBIC BEZIER & CATMULL-ROM / HOBBY SMOOTH SPLINES
// ============================================================================
export function bezierPointAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

export function bezierTangentAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const dx =
    3 * u * u * (p1.x - p0.x) +
    6 * u * t * (p2.x - p1.x) +
    3 * t * t * (p3.x - p2.x);
  const dy =
    3 * u * u * (p1.y - p0.y) +
    6 * u * t * (p2.y - p1.y) +
    3 * t * t * (p3.y - p2.y);
  return Vec2.norm({ x: dx, y: dy });
}

export function quadBezierToCubic(p0, cp, p2) {
  return [
    p0,
    { x: p0.x + (2 / 3) * (cp.x - p0.x), y: p0.y + (2 / 3) * (cp.y - p0.y) },
    { x: p2.x + (2 / 3) * (cp.x - p2.x), y: p2.y + (2 / 3) * (cp.y - p2.y) },
    p2,
  ];
}

export function solveSmoothSpline(points, tension = 0.5, closed = false, segmentsPerSpan = 16) {
  if (!points || points.length < 2) return points ? [...points] : [];
  if (points.length === 2) return [points[0], points[1]];

  const pts = closed
    ? [points[points.length - 1], ...points, points[0], points[1]]
    : [points[0], ...points, points[points.length - 1]];

  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    const cp1 = {
      x: p1.x + ((p2.x - p0.x) * tension) / 3,
      y: p1.y + ((p2.y - p0.y) * tension) / 3,
    };
    const cp2 = {
      x: p2.x - ((p3.x - p1.x) * tension) / 3,
      y: p2.y - ((p3.y - p1.y) * tension) / 3,
    };

    for (let s = 0; s < segmentsPerSpan; s++) {
      out.push(bezierPointAt(p1, cp1, cp2, p2, s / segmentsPerSpan));
    }
  }
  out.push(pts[pts.length - 2]);
  return out;
}

export function polylinePointAndTangentAt(pts, frac = 0.5) {
  if (!pts || pts.length === 0) return { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
  if (pts.length === 1) return { point: pts[0], tangent: { x: 1, y: 0 } };
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Vec2.dist(pts[i - 1], pts[i]);
    lengths.push(total);
  }
  const target = Math.max(0, Math.min(1, frac)) * total;
  for (let i = 1; i < pts.length; i++) {
    if (lengths[i] >= target || i === pts.length - 1) {
      const segLen = lengths[i] - lengths[i - 1];
      const localT = segLen > EPS ? (target - lengths[i - 1]) / segLen : 0;
      return {
        point: Vec2.lerp(pts[i - 1], pts[i], localT),
        tangent: Vec2.norm(Vec2.sub(pts[i], pts[i - 1])),
      };
    }
  }
  return { point: pts[0], tangent: { x: 1, y: 0 } };
}

// ============================================================================
// 4. EXACT SHAPE BOUNDARY RAY-CASTING & ANCHOR GEOMETRY
// ============================================================================
export function intersectSegments(a1, a2, b1, b2) {
  const r = Vec2.sub(a2, a1);
  const s = Vec2.sub(b2, b1);
  const rxs = Vec2.cross(r, s);
  if (Math.abs(rxs) < EPS) return null;
  const qp = Vec2.sub(b1, a1);
  const t = Vec2.cross(qp, s) / rxs;
  const u = Vec2.cross(qp, r) / rxs;
  if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
    return Vec2.add(a1, Vec2.scale(r, t));
  }
  return null;
}

export function getShapePolygon(node) {
  const { x, y, w = 80, h = 44, shape = 'box' } = node;
  const hw = w / 2;
  const hh = h / 2;
  switch (shape) {
    case 'diamond':
    case 'rhombus':
      return [
        { x, y: y - hh },
        { x: x + hw, y },
        { x, y: y + hh },
        { x: x - hw, y },
      ];
    case 'parallelogram': {
      const skew = Math.min(hw * 0.35, 16);
      return [
        { x: x - hw + skew, y: y - hh },
        { x: x + hw + skew, y: y - hh },
        { x: x + hw - skew, y: y + hh },
        { x: x - hw - skew, y: y + hh },
      ];
    }
    case 'trapezoid': {
      const inset = Math.min(hw * 0.3, 16);
      return [
        { x: x - hw + inset, y: y - hh },
        { x: x + hw - inset, y: y - hh },
        { x: x + hw, y: y + hh },
        { x: x - hw, y: y + hh },
      ];
    }
    case 'hex':
    case 'hexagon': {
      const inset = Math.min(hw * 0.35, 18);
      return [
        { x: x - hw + inset, y: y - hh },
        { x: x + hw - inset, y: y - hh },
        { x: x + hw, y },
        { x: x + hw - inset, y: y + hh },
        { x: x - hw + inset, y: y + hh },
        { x: x - hw, y },
      ];
    }
    case 'triangle':
      return [
        { x, y: y - hh },
        { x: x + hw, y: y + hh },
        { x: x - hw, y: y + hh },
      ];
    default:
      return [
        { x: x - hw, y: y - hh },
        { x: x + hw, y: y - hh },
        { x: x + hw, y: y + hh },
        { x: x - hw, y: y + hh },
      ];
  }
}

/**
 * Computes the exact point on the perimeter of `node` in the direction towards `targetPt`.
 */
export function computeShapeBoundaryPoint(node, targetPt) {
  const center = { x: node.x, y: node.y };
  const dir = Vec2.sub(targetPt, center);
  const dist = Vec2.len(dir);
  if (dist < EPS) return { ...center };
  const u = { x: dir.x / dist, y: dir.y / dist };

  const shape = (node.shape || 'box').toLowerCase();
  const hw = (node.w || 80) / 2;
  const hh = (node.h || 44) / 2;

  if (shape === 'point' || shape === 'none' || shape === 'text') {
    if (node.w && node.h && shape === 'text') {
      const tx = Math.abs(u.x) > EPS ? (hw + 4) / Math.abs(u.x) : Infinity;
      const ty = Math.abs(u.y) > EPS ? (hh + 4) / Math.abs(u.y) : Infinity;
      const t = Math.min(tx, ty);
      return Vec2.add(center, Vec2.scale(u, t));
    }
    return { ...center };
  }

  if (shape === 'circle' || shape === 'doublecircle') {
    const r = Math.max(hw, hh);
    return Vec2.add(center, Vec2.scale(u, r));
  }

  if (shape === 'ellipse' || shape === 'oval' || shape === 'cloud') {
    // Parametric ellipse ray intersection: (t*ux / hw)^2 + (t*uy / hh)^2 = 1
    const denom = Math.hypot(u.x / Math.max(1, hw), u.y / Math.max(1, hh));
    const t = denom > EPS ? 1 / denom : hw;
    return Vec2.add(center, Vec2.scale(u, t));
  }

  // Polygon intersection (box, diamond, parallelogram, hex, triangle, cylinder)
  const poly = getShapePolygon(node);
  const farPt = Vec2.add(center, Vec2.scale(u, Math.max(hw, hh) * 4 + 100));
  let bestHit = null;
  let bestDist = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const hit = intersectSegments(center, farPt, a, b);
    if (hit) {
      const d = Vec2.dist(center, hit);
      if (d < bestDist) {
        bestDist = d;
        bestHit = hit;
      }
    }
  }
  return bestHit || Vec2.add(center, Vec2.scale(u, Math.min(hw, hh)));
}

/**
 * Resolves named anchors on a shape: .c, .n, .s, .e, .w, .ne, .nw, .se, .sw, or perimeter degree angle.
 */
export function resolveNodeAnchor(node, anchorName = 'c') {
  const a = String(anchorName || 'c').toLowerCase();
  const c = { x: node.x, y: node.y };
  if (a === 'c' || a === 'center') return c;

  const angleMap = {
    e: 0,
    right: 0,
    ne: 45,
    n: 90,
    top: 90,
    up: 90,
    nw: 135,
    w: 180,
    left: 180,
    sw: 225,
    s: 270,
    bottom: 270,
    down: 270,
    se: 315,
  };

  let deg = angleMap[a];
  if (deg === undefined) {
    const parsed = parseFloat(a);
    if (Number.isFinite(parsed)) deg = parsed;
  }
  if (deg !== undefined) {
    const farTarget = Vec2.add(c, Vec2.polar(1000, deg, true));
    return computeShapeBoundaryPoint(node, farTarget);
  }
  return c;
}

// ============================================================================
// 5. SCANLINE POLYGON HATCHING ENGINE (Hand-Drawn Shading)
// ============================================================================
/**
 * Generates clipped parallel line segments inside an arbitrary closed polygon
 * at any angle `angleDeg` and `spacing`, allowing Rough.js to draw organic pen shading.
 */
export function generatePolygonHatchLines(polygonPts, angleDeg = 45, spacing = 7) {
  if (!polygonPts || polygonPts.length < 3) return [];
  const rad = -angleDeg * DEG2RAD;
  const step = Math.max(2.5, Number(spacing) || 7);

  // Rotate polygon into hatch-aligned coordinate space where hatch lines are horizontal (y = const)
  const rotated = polygonPts.map((p) => Vec2.rot(p, rad));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rotated) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const segments = [];
  for (let y = minY + step * 0.5; y <= maxY - step * 0.25; y += step) {
    const xs = [];
    for (let i = 0; i < rotated.length; i++) {
      const a = rotated[i];
      const b = rotated[(i + 1) % rotated.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] > 1.5) {
        const p1 = Vec2.rot({ x: xs[k], y }, -rad);
        const p2 = Vec2.rot({ x: xs[k + 1], y }, -rad);
        segments.push([p1, p2]);
      }
    }
  }
  return segments;
}

// ============================================================================
// 6. 3D AXONOMETRIC / ISOMETRIC CAMERA PROJECTOR
// ============================================================================
export class Projector3D {
  constructor({ azimuth = 35, elevation = 25, scale = 1, origin = { x: 0, y: 0 } } = {}) {
    this.setAngles(azimuth, elevation);
    this.scale = scale;
    this.origin = origin;
  }

  setAngles(azimuthDeg = 35, elevationDeg = 25) {
    this.az = azimuthDeg * DEG2RAD;
    this.el = elevationDeg * DEG2RAD;
    this.cosAz = Math.cos(this.az);
    this.sinAz = Math.sin(this.az);
    this.cosEl = Math.cos(this.el);
    this.sinEl = Math.sin(this.el);
  }

  /**
   * Projects (x, y, z) where X is right-forward, Y is depth-right, and Z is vertical UP
   * into 2D canvas coordinates (x, y) plus depth `zCam`.
   */
  project(x, y, z) {
    const px = (x * this.cosAz - y * this.sinAz) * this.scale;
    const pyHoriz = (x * this.sinAz + y * this.cosAz) * this.scale;
    // Canvas Y goes down, so +Z goes negative Y on screen
    const screenX = this.origin.x + px;
    const screenY = this.origin.y + pyHoriz * this.sinEl - z * this.cosEl * this.scale;
    const depth = pyHoriz * this.cosEl + z * this.sinEl * this.scale;
    return { x: screenX, y: screenY, depth };
  }
}
