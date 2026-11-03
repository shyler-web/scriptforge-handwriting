/**
 * ScriptForge Multi-Page Demo Study Note Presets (`src/data/presets.js` - Wave 5)
 * Complete, multi-page handwritten study notes for the local coursework notebooks.
 */

export const PRESETS = {
    ee_kmap: `# Digital Logic & Sequential Circuits — Study Notes

Example 1. Simplify the 4-Variable Boolean Function via Karnaugh Map:
$$ F(A, B, C, D) = \\sum m(0, 2, 5, 7, 8, 10, 13, 15) $$

Step 1: Construct the 4-variable K-Map and form maximal power-of-2 prime implicant quads:
[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]

Step 2: Algebraic Extraction of Prime Implicants:
Notice that ~~F = A'B' + CD~~ the four corner minterms $(m_0, m_2, m_8, m_{10})$ wrap around both axes to yield $\\overline{B}\\,\\overline{D}$, while the center quad $(m_5, m_7, m_{13}, m_{15})$ yields $BD$:
$$ F(A,B,C,D) = \\overline{B}\\,\\overline{D} + B D = \\overline{B \\oplus D} $$

Step 3: Two-Level Combinational Logic Gate Realization:
[DIAGRAM: circuit | expr=(B' AND D') OR (B AND D)]

---PAGE---

# Sequential Circuit Synthesis: SR-to-T Flip-Flop
Example 2. Convert a given SR Flip-Flop into a Toggle (T) Flip-Flop using excitation mapping.

Step 1: State Transition & SR Excitation Table:
[DIAGRAM: grid | cols=T,Q_n,Q_{n+1},S,R | rows=0~0~0~0~X;0~1~1~X~0;1~0~1~1~0;1~1~0~0~1]

Step 2: Boolean Equations for Flip-Flop Inputs $S$ and $R$:
$$ S = T \\cdot \\overline{Q_n}, \\qquad R = T \\cdot Q_n $$

Step 3: Complete Sequential Logic Diagram with Orthogonal Feedback Buses:
[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]`,

    calc_physics: `# Probability, Statistics & Stochastic Processes

Examples 4 & 7: Continuous Density Transformation & Binomial Inverse Moment:
Given $f(x) = \\frac{8}{\\pi}\\sqrt{x(1-x)}$ on $0 < x < 1$, and $X \\sim \\text{Binomial}(n, p)$:
$$ E\\left[\\frac{1}{X+1}\\right] = \\sum_{k=0}^{n} \\frac{1}{k+1} \\binom{n}{k} p^k (1-p)^{n-k} = \\frac{1 - (1-p)^{n+1}}{(n+1)p} $$

Example 8: Right-Triangle Ray Geometry ($\\Theta \\sim \\text{Uniform}(-\\pi/2, \\pi/2)$):
A ray from the origin at angle $\\Theta$ intersects the vertical line $x = 1$ at point $(1, Y)$ where $Y = \\tan\\Theta$:
[DIAGRAM: canvas2d | triangle=0,0,1,0,1,0.72 | angle=\\Theta | labels=(0,0);(1,0);(1,Y=\\tan\\Theta)]
$$ F_Y(y) = P(\\tan\\Theta \\leq y) = \\frac{\\arctan(y) + \\pi/2}{\\pi} \\implies f_Y(y) = \\frac{1}{\\pi(1 + y^2)} $$

---PAGE---

# Concentric Target Zones & Conditional Expectations
Example 9: Target Discs of Radii $r_1 = \\frac{1}{\\sqrt{3}}, \\; r_2 = 1, \\; r_3 = \\sqrt{3}$ with radial PDF $f(r) = \\frac{2}{\\pi(1+r^2)}$:
[DIAGRAM: canvas2d | circles=0.58:4 pts (1/sqrt(3)),1.0:3 pts (r=1),1.73:2 pts (sqrt(3)) | label=E[Score] = 9.583]

Evaluating the ring probabilities via $P(a < R \\leq b) = \\frac{2}{\\pi}\\left[\\arctan(b) - \\arctan(a)\\right]$:
$$ P(R \\leq 1/\\sqrt{3}) = \\frac{1}{3}, \\quad P(1/\\sqrt{3} < R \\leq 1) = \\frac{1}{6}, \\quad P(1 < R \\leq \\sqrt{3}) = \\frac{1}{6} $$

Example 10: Conditional Density $f(x) = 4x^3$ on $0 < x < 1$ Shaded Over $[1/3, 2/3]$:
[DIAGRAM: canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | xlabel=x | ylabel=f(x) | label=f(x)=4x^3]
$$ E\\left[X \\,\\middle|\\, \\frac{1}{3} < X < \\frac{2}{3}\\right] = \\frac{\\int_{1/3}^{2/3} x \\cdot 4x^3 \\, dx}{\\int_{1/3}^{2/3} 4x^3 \\, dx} = \\frac{4}{5} \\cdot \\frac{(2/3)^5 - (1/3)^5}{(2/3)^4 - (1/3)^4} = \\frac{124}{225} \\approx 0.5511 $$`,

    cs_dfa: `# Principles of Computer Systems (PCS) — Study Notes

Examples 1 & 2. 32-Bit Instruction Word Format & Register Field Encoding:
For a CPU with 16 general-purpose registers ($R_0..R_{15}$) and a 6-bit Opcode executing ADD R1, R2, R3:
$$ \\text{Register Address Bits} = \\log_2(16) = 4\\text{ bits each}, \\quad \\text{Unused Bits} = 32 - (6 + 4 + 4 + 4) = 14\\text{ bits} $$
[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]

Examples 3 & 4. Five-Stage Instruction Pipeline Timing Diagram ($k = 5, n = 4$):
[DIAGRAM: grid | cols=Cycle,1,2,3,4,5,6,7,8 | rows=I1~IF~ID~EX~MEM~WB~~~;I2~~IF~ID~EX~MEM~WB~~;I3~~~IF~ID~EX~MEM~WB~;I4~~~~IF~ID~EX~MEM~WB]
$$ T_{\\text{seq}} = n \\times k = 20\\text{ cycles}, \\quad T_{\\text{pipe}} = k + (n - 1) = 8\\text{ cycles} \\implies S = \\frac{20}{8} = 2.50\\times $$

---PAGE---

# RTL Microoperations, Automata & System Architecture
Examples 5 & 6. Instruction Fetch & Memory-Reference ADD Microoperations:
$$ \\begin{aligned} T_0 &: AR \\leftarrow PC \\\\ T_1 &: IR \\leftarrow M[AR], \\quad PC \\leftarrow PC + 1 \\\\ T_2 &: D_0..D_7 \\leftarrow \\text{Decode}(IR(12..14)), \\quad AR \\leftarrow IR(0..11), \\quad I \\leftarrow IR(15) \\\\ D_1 T_4 &: DR \\leftarrow M[AR] \\\\ D_1 T_5 &: AC \\leftarrow AC + DR, \\quad E \\leftarrow C_{\\text{out}}, \\quad SC \\leftarrow 0 \\end{aligned} $$

Example 7. Minimal DFA Accepting Binary Strings Ending with Substring "01":
[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0]

Example 8. System Component Specification & Functional Role Summary:
[DIAGRAM: grid | cols=Component,Specification,System Role | rows=CPU~8-Core 4.2 GHz~Instruction fetch decode and ALU execution;RAM~16 GB DDR5~Volatile working store for active programs;SSD~1 TB NVMe~Non-volatile block storage for OS and files;GPU~12 GB VRAM~Parallel SIMD shader and matrix compute]`,

    spatial_cheatsheet: `@page size=a3-landscape cols=3

# Spatial Cheat Sheet — Drops 4-7

A wall-chart sample: floating text wrap, side-by-side shelves, full-width figures and 3D surfaces.

## Organic chemistry

[sketch:
  @layout place=right w=40% scale=0.9
  title "Cyclohexane chair"
  chair at=(0, 0) axial="1:OH, 4:CH3" equatorial="2:Br"
]
The chair conformation removes angle strain and most torsional strain. Bulky groups prefer the equatorial position to avoid 1,3-diaxial clashes. This text wraps automatically to the left of the floating diagram.

[sketch:
  @layout place=row w=46%
  title "Staggered Newman"
  newman at=(0, 0) angle=60 front="CH3,H,H" back="Br,H,CH3"
]
[sketch:
  @layout place=row w=46%
  title "Skeletal ketone"
  chain at=(0, 0) carbons=6 bonds="2:=" branches="4:=O, 3:^OH, 5:_Br"
]

## Systems and memory

[sketch:
  @layout place=full
  title "Digital timing"
  waveform at=(0, 0) signals="CLK:P......., D:0.1..0.., Q:x.01..0."
]
[sketch:
  @layout place=right w=45%
  title "Stack and heap"
  memframe id=Stack at=(-70, 0) title="Stack" fields="n: 4, head: ->Heap.0"
  memframe id=Heap at=(70, 0) title="Heap" fields="val: 42, next: NULL"
]
The stack frame and heap record are separate addressable blocks. The pointer cell in Stack points at Heap.0 while this text wraps on the left.

[sketch:
  @layout place=row w=46%
  title "Linked list"
  linkedlist at=(0, 0) values="10, 20, 35, 50" head="head" pointers="1:slow, 3:fast"
]
[sketch:
  @layout place=row w=46%
  title "B-tree"
  btree at=(0, 0) edges="20|40 -> 5|10|15, 20|40 -> 25|30, 20|40 -> 45|55"
]

## Discrete and graphs

[sketch:
  @layout place=right w=42%
  title "Function mapping"
  mapping at=(0, 0) domain="1,2,3,4" codomain="a,b,c" pairs="1->a, 2->b, 3->b, 4->c"
]
A function maps each domain element to exactly one codomain element; a relation may map one element to several.

[sketch:
  @layout place=row w=46%
  title "Venn diagram"
  venn at=(0, 0) sets="A,B,C" shade="(A&B)-C" r=44
]
[sketch:
  @layout place=row w=46%
  title "Hasse lattice"
  hasse at=(0, 0) edges="1->2, 1->3, 2->6, 3->6"
]

## 3D surfaces and calculus

[sketch:
  @layout place=full
  title "3D saddle surface"
  surface3d at=(0, 0) fn="0.35*(x^2 - y^2)" steps=12
]
[sketch:
  @layout place=right w=44%
  title "Midpoint Riemann sum"
  riemann at=(0, 0) fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid
]
The Riemann partition approximates the area under the curve; left, right, mid and trapezoid change the estimate and the hatched rectangles.

[sketch:
  @layout place=row w=46%
  title "2x2 matrix shear"
  matrixgrid at=(0, 0) matrix="1.4, 0.5, 0.3, 1.1" det=true
]
[sketch:
  @layout place=row w=46%
  title "ODE slope field"
  slopefield at=(0, 0) dy="x - y" solutions="(-2, 1.5), (-2, -0.5)"
]`,

    organic_chem: `@page size=a4-2col

# Organic Chemistry — Conformations and Stereochemistry

[sketch:
  @layout place=right w=42% scale=0.9
  title "Cyclohexane chair"
  chair at=(0, 0) axial="1:OH, 4:CH3" equatorial="2:Br"
]
The chair conformation removes angle strain and most torsional strain. Bulky groups such as methyl strongly prefer the equatorial position to avoid 1,3-diaxial steric clashes, while the text wraps cleanly on the left.

[sketch:
  @layout place=row w=46%
  title "Staggered Newman"
  newman at=(0, 0) angle=60 front="CH3,H,H" back="Br,H,CH3"
]
[sketch:
  @layout place=row w=46%
  title "Skeletal ketone"
  chain at=(0, 0) carbons=6 bonds="2:=" branches="4:=O, 3:^OH, 5:_Br"
]

## Stereobonds

[sketch:
  @layout place=full
  title "Wedge and dash"
  chain at=(0, 0) carbons=5
  wedge C1 -> C2
  dash C2 -> C3
]

Skeletal structures omit carbon labels; multiple bonds are drawn as offset double or triple lines, and wedge/dash bonds encode stereochemistry.`,

    cs_systems: `@page size=a4-2col

# Computer Systems — Timing, Memory, Pipelines and Packets

[sketch:
  @layout place=full
  title "Digital timing"
  waveform at=(0, 0) signals="CLK:P......., D:0.1..0.., Q:x.01..0., BUS:=A0..=FF.."
]
[sketch:
  @layout place=right w=45%
  title "Stack and heap"
  memframe id=Stack at=(-70, 0) title="Stack" fields="n: 4, head: ->Heap.0"
  memframe id=Heap at=(70, 0) title="Heap" fields="val: 42, next: NULL"
]
The stack frame and heap record are separate addressable blocks. The pointer cell in Stack points at Heap.0 while this text wraps on the left.

[sketch:
  @layout place=row w=46%
  title "Linked list"
  linkedlist at=(0, 0) values="10, 20, 35, 50" head="head" pointers="1:slow, 3:fast"
]
[sketch:
  @layout place=row w=46%
  title "B-tree"
  btree at=(0, 0) edges="20|40 -> 5|10|15, 20|40 -> 25|30, 20|40 -> 45|55"
]

[sketch:
  @layout place=full
  title "CPU pipeline"
  pipeline at=(0, 0) rows="ADD R1,R2: IF ID EX MEM WB | SUB R3,R1: _ IF ID STALL EX MEM"
]
[sketch:
  @layout place=row w=46%
  title "OS Gantt"
  gantt at=(0, 0) tasks="P1:0..4, P2:4..7, P3:7..11"
]
[sketch:
  @layout place=row w=46%
  title "Packet header"
  packet at=(0, 0) bits=32 fields="Src Port:16, Dst Port:16, Seq Num:32"
]`,

    physics_optics: `@page size=a4-2col

# Physics — Mechanics, Optics and Fields

[sketch:
  @layout place=right w=44%
  title "Inclined plane"
  incline at=(0, 0) angle=30 mass="$m$" friction="$f_k$" components=true
]
The free-body diagram resolves weight into components along and perpendicular to the slope. Friction acts up the slope while the block tends to slide down.

[sketch:
  @layout place=row w=46%
  title "Atwood machine"
  atwood at=(0, 0) r=28 m1="$m_1$" m2="$m_2$"
]
[sketch:
  @layout place=row w=46%
  title "Electric dipole"
  charges at=(0, 0) q1=1 q2=-1 rays=10
]

[sketch:
  @layout place=full
  title "Thin lens"
  optics at=(0, 0) kind=convex f=65 u=125 h=40
]
[sketch:
  @layout place=full
  title "Vector field"
  vectorfield at=(0, 0) fx="-y" fy="x"
]`,

    three_d_calculus: `@page size=a4-2col

# 3D Surfaces, Calculus and Linear Algebra

[sketch:
  @layout place=full
  title "3D saddle surface"
  surface3d at=(0, 0) fn="0.35*(x^2 - y^2)" xrange=(-2.5,2.5) yrange=(-2.5,2.5) steps=12
]

[sketch:
  @layout place=right w=44%
  title "Midpoint Riemann sum"
  riemann at=(0, 0) fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid
]
The Riemann partition approximates the area under the curve; left, right, mid and trapezoid change the estimate and the hatched rectangles.

[sketch:
  @layout place=row w=46%
  title "2x2 matrix shear"
  matrixgrid at=(0, 0) matrix="1.4, 0.5, 0.3, 1.1" range=2 det=true
]
[sketch:
  @layout place=row w=46%
  title "ODE slope field"
  slopefield at=(0, 0) dy="x - y" solutions="(-2, 1.5), (-2, -0.5)"
]`
};

export default PRESETS;
