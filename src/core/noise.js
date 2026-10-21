/**
 * Deterministic Perlin / value noise & PRNG engine.
 * Used for continuous baseline drift, hand tremor, and sub-glyph slicing.
 */

export class NoiseEngine {
    constructor(seed = 1337) {
        this.setSeed(seed);
    }
    setSeed(seed) {
        this.seed = seed;
        this.perm = new Uint8Array(512);
        let s = seed;
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            s = (s * 1664525 + 1013904223) >>> 0;
            const j = s % (i + 1);
            const tmp = p[i];
            p[i] = p[j];
            p[j] = tmp;
        }
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    // Pseudo-random float [0, 1] for index
    hash(n) {
        let x = Math.sin(n * 12.9898 + this.seed * 78.233) * 43758.5453;
        return x - Math.floor(x);
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad1D(hash, x) { return (hash & 1) === 0 ? x : -x; }
    noise1D(x) {
        const X = Math.floor(x) & 255;
        x -= Math.floor(x);
        const u = this.fade(x);
        return this.lerp(u, this.grad1D(this.perm[X], x), this.grad1D(this.perm[X + 1], x - 1));
    }
}

export const noise = new NoiseEngine(4219);
