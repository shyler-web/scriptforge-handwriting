// src/render/spatialLayout.js
// 2D Spatial Canvas, Text-Wrap Interval Carving, Side-by-Side Shelf Packer,
// Multi-Column Cheat-Sheet Manager, and AABB Collision-Avoidance Engine.

export const PAGE_PRESETS = {
  a4: {
    id: 'a4',
    label: 'A4 Notebook (1 Col)',
    width: 820,
    height: 1100,
    cols: 1,
    colGap: 28,
    marginLeft: 92,
    marginRight: 42,
    marginTop: 86,
    marginBottom: 56,
  },
  'a4-2col': {
    id: 'a4-2col',
    label: 'A4 Cheat Sheet (2 Cols)',
    width: 820,
    height: 1100,
    cols: 2,
    colGap: 24,
    marginLeft: 46,
    marginRight: 36,
    marginTop: 76,
    marginBottom: 46,
  },
  'a3-landscape': {
    id: 'a3-landscape',
    label: 'A3 Landscape Chart (3 Cols)',
    width: 1560,
    height: 1100,
    cols: 3,
    colGap: 28,
    marginLeft: 48,
    marginRight: 48,
    marginTop: 78,
    marginBottom: 48,
  },
  'chart-xl': {
    id: 'chart-xl',
    label: 'Mega Chapter Wall Chart (4 Cols)',
    width: 1920,
    height: 1360,
    cols: 4,
    colGap: 26,
    marginLeft: 48,
    marginRight: 48,
    marginTop: 82,
    marginBottom: 48,
  },
};

const SIZE_FRACTIONS = {
  xs: 0.28,
  sm: 0.38,
  small: 0.38,
  md: 0.48,
  half: 0.48,
  lg: 0.68,
  large: 0.68,
  full: 1.0,
};

/**
 * Parses inline layout directives from the top of any diagram spec or `@page` directive.
 * Examples inside `[sketch: ...]`:
 *   place=right w=45% scale=0.85
 *   place=row size=md
 *   place=xy(320, 180) w=240
 */
export function extractDiagramLayoutDirectives(rawSpec = '') {
  const layout = {
    place: 'auto', // 'auto' | 'left' | 'right' | 'center' | 'row' | 'full' | 'xy'
    widthSpec: null, // fraction (0..1) or pixel number
    scale: 1.0,
    pinX: null,
    pinY: null,
    pad: 12,
  };

  const lines = String(rawSpec || '').split(/\r?\n/);
  const keptLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Check for dedicated `@layout ...` line or inline layout attributes on the first non-empty line
    const isLayoutDirective = /^@layout\b/i.test(line);
    const isFirstHeaderLine = keptLines.length === 0 && /^(?:place|align|float|size|scale|w|width|pin)\s*=/i.test(line);

    if (isLayoutDirective || isFirstHeaderLine) {
      const clean = line.replace(/^@layout\s*/i, '');
      const kvRegex = /([a-zA-Z]+)\s*=\s*(\([^)]+\)|"[^"]+"|\S+)/g;
      let match;
      let consumedAll = true;
      const stripped = clean.replace(kvRegex, (_, k, v) => {
        const key = k.toLowerCase();
        const val = v.replace(/^"|"$/g, '').trim();
        if (key === 'place' || key === 'float' || key === 'align') {
          const p = val.toLowerCase();
          if (p.startsWith('xy(') || p.startsWith('(')) {
            layout.place = 'xy';
            const nums = val.replace(/^[a-zA-Z]*\(|\)$/g, '').split(',').map(Number);
            layout.pinX = nums[0] ?? 0;
            layout.pinY = nums[1] ?? 0;
          } else if (p === 'float-right' || p === 'right' || p === 'r') {
            layout.place = 'right';
          } else if (p === 'float-left' || p === 'left' || p === 'l') {
            layout.place = 'left';
          } else if (p === 'row' || p === 'side' || p === 'inline' || p === 'beside') {
            layout.place = 'row';
          } else if (p === 'center' || p === 'c' || p === 'block') {
            layout.place = 'center';
          } else if (p === 'full' || p === 'wide') {
            layout.place = 'full';
          } else {
            layout.place = 'auto';
          }
          return '';
        }
        if (key === 'size') {
          const frac = SIZE_FRACTIONS[val.toLowerCase()];
          if (frac) layout.widthSpec = { type: 'fraction', value: frac };
          return '';
        }
        if (key === 'w' || key === 'width') {
          if (val.endsWith('%')) {
            layout.widthSpec = { type: 'fraction', value: Math.max(0.2, Math.min(1, parseFloat(val) / 100)) };
          } else if (SIZE_FRACTIONS[val.toLowerCase()]) {
            layout.widthSpec = { type: 'fraction', value: SIZE_FRACTIONS[val.toLowerCase()] };
          } else {
            const px = parseFloat(val);
            if (Number.isFinite(px) && px > 0) {
              layout.widthSpec = px <= 1 ? { type: 'fraction', value: px } : { type: 'px', value: px };
            }
          }
          return '';
        }
        if (key === 'scale' || key === 'zoom') {
          const sc = parseFloat(val);
          if (Number.isFinite(sc) && sc > 0.15) layout.scale = Math.min(2.5, Math.max(0.25, sc));
          return '';
        }
        if (key === 'pin' || key === 'at') {
          const nums = val.replace(/^[(\[]|[)\]]$/g, '').split(',').map(Number);
          if (nums.length >= 2 && Number.isFinite(nums[0]) && Number.isFinite(nums[1])) {
            layout.place = 'xy';
            layout.pinX = nums[0];
            layout.pinY = nums[1];
            return '';
          }
        }
        consumedAll = false;
        return `${k}=${v}`;
      }).trim();

      if (isLayoutDirective || (!stripped && consumedAll)) {
        continue;
      }
      line = stripped;
    }

    keptLines.push(lines[i]);
  }

  return {
    layout,
    cleanSpec: keptLines.join('\n'),
  };
}

/**
 * Parses a document-level `@page` directive, e.g.:
 *   `@page size=a3-landscape cols=3` or `@page size=chart-xl cols=4`
 */
export function parsePageDirective(line) {
  const m = String(line || '').trim().match(/^@page\b(.*)$/i);
  if (!m) return null;
  const body = m[1] || '';
  const cfg = {};
  const kv = /([a-zA-Z]+)\s*=\s*(\S+)/g;
  let match;
  while ((match = kv.exec(body)) !== null) {
    const k = match[1].toLowerCase();
    const v = match[2].toLowerCase();
    if (k === 'size' || k === 'preset' || k === 'mode' || k === 'format') cfg.preset = v;
    else if (k === 'cols' || k === 'columns') cfg.cols = Math.max(1, Math.min(6, parseInt(v, 10) || 1));
    else if (k === 'w' || k === 'width') cfg.width = Math.max(480, parseInt(v, 10) || 820);
    else if (k === 'h' || k === 'height') cfg.height = Math.max(600, parseInt(v, 10) || 1100);
  }
  return cfg;
}

/**
 * 2D Axis-Aligned Bounding Box (AABB) intersection test with safety padding.
 */
export function rectsOverlap(a, b, pad = 0) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

/**
 * Per-Page 2D Spatial Exclusion & Collision-Avoidance Manager.
 * Tracks all placed diagrams/callouts/text blocks on a page, carves out collision-free
 * horizontal line intervals for text wrapping, and resolves diagram-diagram overlaps.
 */
export class SpatialExclusionManager {
  constructor({
    colLeft = 92,
    colRight = 778,
    pageTop = 86,
    pageBottom = 1044,
    minTextWidth = 145,
  } = {}) {
    this.colLeft = colLeft;
    this.colRight = colRight;
    this.pageTop = pageTop;
    this.pageBottom = pageBottom;
    this.minTextWidth = minTextWidth;
    this.obstacles = []; // Array of { id, x, y, w, h, pad, kind }
    this.lastRowShelf = null; // Tracks open side-by-side shelf { y, bottom, rightCursor }
  }

  get colWidth() {
    return Math.max(100, this.colRight - this.colLeft);
  }

  /**
   * Registers a placed rectangle (e.g. a diagram or callout box) as a hard obstacle.
   */
  addObstacle(rect, { pad = 12, kind = 'diagram', id = null } = {}) {
    const obs = {
      id: id || `obs_${this.obstacles.length + 1}`,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      pad,
      kind,
    };
    this.obstacles.push(obs);
    return obs;
  }

  /**
   * Given a vertical band [yTop, yBottom] for a line of text, subtracts all intersecting
   * padded obstacle intervals from [colLeft, colRight] and returns sorted free X-intervals:
   *   [{ x1, x2, width }]
   */
  getAvailableLineIntervals(yTop, yBottom, leftBound = this.colLeft, rightBound = this.colRight) {
    let intervals = [{ x1: leftBound, x2: rightBound }];

    for (const obs of this.obstacles) {
      const oy1 = obs.y - obs.pad * 0.5;
      const oy2 = obs.y + obs.h + obs.pad * 0.5;
      if (yBottom <= oy1 || yTop >= oy2) continue;

      const cutLeft = obs.x - obs.pad;
      const cutRight = obs.x + obs.w + obs.pad;
      const next = [];

      for (const iv of intervals) {
        if (cutRight <= iv.x1 || cutLeft >= iv.x2) {
          next.push(iv);
        } else {
          if (cutLeft > iv.x1) next.push({ x1: iv.x1, x2: cutLeft });
          if (cutRight < iv.x2) next.push({ x1: cutRight, x2: iv.x2 });
        }
      }
      intervals = next;
    }

    return intervals
      .map((iv) => ({ x1: iv.x1, x2: iv.x2, width: iv.x2 - iv.x1 }))
      .filter((iv) => iv.width >= this.minTextWidth)
      .sort((a, b) => b.width - a.width || a.x1 - b.x1);
  }

  /**
   * Finds the next Y coordinate >= cursorY where at least `minWidth` of horizontal text
   * space is available, plus the primary [x1, x2] interval at that Y.
   */
  resolveTextLineSlot(cursorY, lineHeight = 28, requiredWidth = this.minTextWidth) {
    let y = cursorY;
    const maxSearchY = this.pageBottom + 600;

    while (y <= maxSearchY) {
      const ivs = this.getAvailableLineIntervals(y, y + lineHeight);
      const best = ivs.find((iv) => iv.width >= requiredWidth);
      if (best) {
        return { y, x1: best.x1, x2: best.x2, width: best.width };
      }
      // Jump directly past the lowest bottom of the blocking obstacle at `y`
      let nextY = y + lineHeight * 0.5;
      for (const obs of this.obstacles) {
        const oy1 = obs.y - obs.pad * 0.5;
        const oy2 = obs.y + obs.h + obs.pad * 0.5;
        if (y + lineHeight > oy1 && y < oy2) {
          nextY = Math.max(nextY, oy2 + 2);
        }
      }
      y = nextY;
    }

    return { y, x1: this.colLeft, x2: this.colRight, width: this.colWidth };
  }

  /**
   * Computes a guaranteed collision-free 2D placement rectangle for a diagram
   * according to `layout.place` ('right', 'left', 'row', 'auto', 'center', 'xy')
   * and returns `{ x, y, w, h, advancesCursorY, newCursorY }`.
   */
  placeDiagram({
    naturalW,
    naturalH,
    cursorY,
    layout = {},
  }) {
    const colW = this.colWidth;
    const scale = Number(layout.scale || 1);
    const place = (layout.place || 'auto').toLowerCase();
    const pad = Number(layout.pad ?? 12);

    // 1. Determine target width and scaled height
    let targetW = naturalW * scale;
    if (layout.widthSpec) {
      if (layout.widthSpec.type === 'fraction') {
        targetW = colW * layout.widthSpec.value * scale;
      } else if (layout.widthSpec.type === 'px') {
        targetW = Math.min(colW, layout.widthSpec.value * scale);
      }
    } else if (place === 'right' || place === 'left') {
      targetW = Math.min(colW * 0.46, Math.max(160, naturalW * scale));
    } else if (place === 'row') {
      targetW = Math.min(colW * 0.48, Math.max(150, naturalW * scale));
    } else if (place === 'full') {
      targetW = colW;
    } else {
      targetW = Math.min(colW, naturalW * scale);
    }

    const aspect = naturalH / Math.max(1, naturalW);
    const w = Math.min(colW, Math.max(110, Math.round(targetW)));
    const h = Math.max(60, Math.round(w * aspect));

    // 2. Compute desired initial (x, y) based on placement mode
    let desiredX = this.colLeft + (colW - w) * 0.5;
    let desiredY = Math.max(this.pageTop, cursorY);
    let isFloating = false;
    let isRowShelf = false;

    if (place === 'xy' && Number.isFinite(layout.pinX) && Number.isFinite(layout.pinY)) {
      desiredX = layout.pinX <= 100 && layout.pinX >= 0
        ? this.colLeft + (layout.pinX / 100) * Math.max(0, colW - w)
        : this.colLeft + layout.pinX;
      desiredY = layout.pinY <= 100 && layout.pinY >= 0
        ? this.pageTop + (layout.pinY / 100) * Math.max(0, this.pageBottom - this.pageTop - h)
        : this.pageTop + layout.pinY;
      isFloating = true;
    } else if (place === 'right') {
      desiredX = this.colRight - w;
      desiredY = Math.max(this.pageTop, cursorY);
      isFloating = colW - w - pad >= this.minTextWidth;
    } else if (place === 'left') {
      desiredX = this.colLeft;
      desiredY = Math.max(this.pageTop, cursorY);
      isFloating = colW - w - pad >= this.minTextWidth;
    } else if (
      (place === 'row' || (place === 'auto' && w <= colW * 0.48)) &&
      this.lastRowShelf &&
      this.lastRowShelf.rightCursor + pad + w <= this.colRight
    ) {
      // Pack side-by-side into the active horizontal shelf!
      desiredX = this.lastRowShelf.rightCursor + pad;
      desiredY = this.lastRowShelf.y;
      isRowShelf = true;
    } else if (place === 'row' || (place === 'auto' && w <= colW * 0.48)) {
      // Start a new left-aligned shelf so the next compact diagram can sit beside it!
      desiredX = this.colLeft;
      desiredY = Math.max(this.pageTop, cursorY);
      isRowShelf = true;
    }

    // 3. Run 2D Collision-Avoidance Resolution against all existing obstacles on the page
    const resolved = this.findCollisionFreeRect({ x: desiredX, y: desiredY, w, h }, pad);
    const obstacle = this.addObstacle(resolved, { pad, kind: 'diagram' });

    // 4. Update shelf & cursorY state
    if (isRowShelf) {
      const shelfTop = this.lastRowShelf && Math.abs(resolved.y - this.lastRowShelf.y) < 16
        ? this.lastRowShelf.y
        : resolved.y;
      const shelfBottom = this.lastRowShelf && Math.abs(resolved.y - this.lastRowShelf.y) < 16
        ? Math.max(this.lastRowShelf.bottom, resolved.y + resolved.h)
        : resolved.y + resolved.h;
      this.lastRowShelf = {
        y: shelfTop,
        bottom: shelfBottom,
        rightCursor: resolved.x + resolved.w,
      };
      return {
        ...resolved,
        obstacle,
        advancesCursorY: false, // Wait until text or a wide block flushes the shelf, or advance to shelfBottom
        shelfBottom: shelfBottom + pad,
        isFloating: false,
        isRowShelf: true,
      };
    }

    this.lastRowShelf = null;

    if (isFloating) {
      // Floating diagram: text continues at current cursorY and wraps alongside the diagram!
      return {
        ...resolved,
        obstacle,
        advancesCursorY: false,
        newCursorY: cursorY,
        isFloating: true,
        isRowShelf: false,
      };
    }

    return {
      ...resolved,
      obstacle,
      advancesCursorY: true,
      newCursorY: resolved.y + resolved.h + pad,
      isFloating: false,
      isRowShelf: false,
    };
  }

  /**
   * Guaranteed Collision-Free 2D Placement Solver.
   * If `cand` overlaps any existing obstacle in `this.obstacles`, searches horizontal
   * side-by-side slots first, then pushes down along the Skyline contour until
   * zero overlap is achieved.
   */
  findCollisionFreeRect(cand, pad = 12) {
    let rect = {
      x: Math.max(this.colLeft, Math.min(this.colRight - cand.w, cand.x)),
      y: Math.max(this.pageTop, cand.y),
      w: cand.w,
      h: cand.h,
    };

    const hasCollision = (r) =>
      this.obstacles.some((obs) => rectsOverlap(r, obs, Math.max(pad, obs.pad || 10)));

    if (!hasCollision(rect)) return rect;

    // Candidate search: try shifting right or left on the same Y band before pushing down
    let guard = 0;
    while (hasCollision(rect) && guard++ < 80) {
      const colliding = this.obstacles.filter((obs) =>
        rectsOverlap(rect, obs, Math.max(pad, obs.pad || 10))
      );

      // Try placing immediately to the right of the rightmost colliding obstacle on this row
      const rightCandidateX = Math.max(...colliding.map((o) => o.x + o.w + pad));
      if (rightCandidateX + rect.w <= this.colRight) {
        const rightRect = { ...rect, x: rightCandidateX };
        if (!hasCollision(rightRect)) return rightRect;
      }

      // Try placing immediately to the left of the leftmost colliding obstacle on this row
      const leftCandidateX = Math.min(...colliding.map((o) => o.x - pad - rect.w));
      if (leftCandidateX >= this.colLeft) {
        const leftRect = { ...rect, x: leftCandidateX };
        if (!hasCollision(leftRect)) return leftRect;
      }

      // Otherwise push Y down below the lowest colliding obstacle edge (Skyline step)
      const nextY = Math.max(...colliding.map((o) => o.y + o.h + pad));
      rect.y = Math.max(rect.y + 8, nextY);
    }

    return rect;
  }

  /**
   * Returns the maximum bottom Y of all obstacles registered so far (useful when
   * finishing a section or checking page overflow).
   */
  getMaxObstacleBottom() {
    let maxB = this.pageTop;
    for (const obs of this.obstacles) {
      if (obs.y + obs.h + obs.pad > maxB) maxB = obs.y + obs.h + obs.pad;
    }
    return maxB;
  }
}
