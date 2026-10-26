/**
 * ScriptForge Multi-Page Demo Assignment Presets (`src/data/presets.js` - Wave 5)
 * Complete, multi-page handwritten solutions for the validation assignments in `demo_assignment/`.
 * `stress_turbo` is the generated Ultra Turbo Stress Suite (scripts/gen-stress-suite.mjs).
 */

import { STRESS_DOC } from './stressDoc.js';

export const PRESETS = {
    ee_kmap: `# Digital Logic & Sequential Circuits — Assignment
Name: Aarav Sharma

Q1. Simplify the 4-Variable Boolean Function via Karnaugh Map:
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
Q2. Convert a given SR Flip-Flop into a Toggle (T) Flip-Flop using excitation mapping.

Step 1: State Transition & SR Excitation Table:
[DIAGRAM: grid | cols=T,Q_n,Q_{n+1},S,R | rows=0~0~0~0~X;0~1~1~X~0;1~0~1~1~0;1~1~0~0~1]

Step 2: Boolean Equations for Flip-Flop Inputs $S$ and $R$:
$$ S = T \\cdot \\overline{Q_n}, \\qquad R = T \\cdot Q_n $$

Step 3: Complete Sequential Logic Diagram with Orthogonal Feedback Buses:
[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]`,

    calc_physics: `# Probability, Statistics & Stochastic Processes
Name: Aarav Sharma

Q4 & Q7: Continuous Density Transformation & Binomial Inverse Moment:
Given $f(x) = \\frac{8}{\\pi}\\sqrt{x(1-x)}$ on $0 < x < 1$, and $X \\sim \\text{Binomial}(n, p)$:
$$ E\\left[\\frac{1}{X+1}\\right] = \\sum_{k=0}^{n} \\frac{1}{k+1} \\binom{n}{k} p^k (1-p)^{n-k} = \\frac{1 - (1-p)^{n+1}}{(n+1)p} $$

Q8: Right-Triangle Ray Geometry ($\\Theta \\sim \\text{Uniform}(-\\pi/2, \\pi/2)$):
A ray from the origin at angle $\\Theta$ intersects the vertical line $x = 1$ at point $(1, Y)$ where $Y = \\tan\\Theta$:
[DIAGRAM: canvas2d | triangle=0,0,1,0,1,0.72 | angle=\\Theta | labels=(0,0);(1,0);(1,Y=\\tan\\Theta)]
$$ F_Y(y) = P(\\tan\\Theta \\leq y) = \\frac{\\arctan(y) + \\pi/2}{\\pi} \\implies f_Y(y) = \\frac{1}{\\pi(1 + y^2)} $$

---PAGE---

# Concentric Target Zones & Conditional Expectations
Q9: Target Discs of Radii $r_1 = \\frac{1}{\\sqrt{3}}, \\; r_2 = 1, \\; r_3 = \\sqrt{3}$ with radial PDF $f(r) = \\frac{2}{\\pi(1+r^2)}$:
[DIAGRAM: canvas2d | circles=0.58:4 pts (1/sqrt(3)),1.0:3 pts (r=1),1.73:2 pts (sqrt(3)) | label=E[Score] = 9.583]

Evaluating the ring probabilities via $P(a < R \\leq b) = \\frac{2}{\\pi}\\left[\\arctan(b) - \\arctan(a)\\right]$:
$$ P(R \\leq 1/\\sqrt{3}) = \\frac{1}{3}, \\quad P(1/\\sqrt{3} < R \\leq 1) = \\frac{1}{6}, \\quad P(1 < R \\leq \\sqrt{3}) = \\frac{1}{6} $$

Q10: Conditional Density $f(x) = 4x^3$ on $0 < x < 1$ Shaded Over $[1/3, 2/3]$:
[DIAGRAM: canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | xlabel=x | ylabel=f(x) | label=f(x)=4x^3]
$$ E\\left[X \\,\\middle|\\, \\frac{1}{3} < X < \\frac{2}{3}\\right] = \\frac{\\int_{1/3}^{2/3} x \\cdot 4x^3 \\, dx}{\\int_{1/3}^{2/3} 4x^3 \\, dx} = \\frac{4}{5} \\cdot \\frac{(2/3)^5 - (1/3)^5}{(2/3)^4 - (1/3)^4} = \\frac{124}{225} \\approx 0.5511 $$`,

    cs_dfa: `# Principles of Computer Systems (PCS) — Assignment 2
Name: Aarav Sharma

Q1 & Q2. 32-Bit Instruction Word Format & Register Field Encoding:
For a CPU with 16 general-purpose registers ($R_0..R_{15}$) and a 6-bit Opcode executing ADD R1, R2, R3:
$$ \\text{Register Address Bits} = \\log_2(16) = 4\\text{ bits each}, \\quad \\text{Unused Bits} = 32 - (6 + 4 + 4 + 4) = 14\\text{ bits} $$
[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]

Q3 & Q4. Five-Stage Instruction Pipeline Timing Diagram ($k = 5, n = 4$):
[DIAGRAM: grid | cols=Cycle,1,2,3,4,5,6,7,8 | rows=I1~IF~ID~EX~MEM~WB~~~;I2~~IF~ID~EX~MEM~WB~~;I3~~~IF~ID~EX~MEM~WB~;I4~~~~IF~ID~EX~MEM~WB]
$$ T_{\\text{seq}} = n \\times k = 20\\text{ cycles}, \\quad T_{\\text{pipe}} = k + (n - 1) = 8\\text{ cycles} \\implies S = \\frac{20}{8} = 2.50\\times $$

---PAGE---

# RTL Microoperations, Automata & System Architecture
Q5 & Q6. Instruction Fetch & Memory-Reference ADD Microoperations:
$$ \\begin{aligned} T_0 &: AR \\leftarrow PC \\\\ T_1 &: IR \\leftarrow M[AR], \\quad PC \\leftarrow PC + 1 \\\\ T_2 &: D_0..D_7 \\leftarrow \\text{Decode}(IR(12..14)), \\quad AR \\leftarrow IR(0..11), \\quad I \\leftarrow IR(15) \\\\ D_1 T_4 &: DR \\leftarrow M[AR] \\\\ D_1 T_5 &: AC \\leftarrow AC + DR, \\quad E \\leftarrow C_{\\text{out}}, \\quad SC \\leftarrow 0 \\end{aligned} $$

Q7. Minimal DFA Accepting Binary Strings Ending with Substring "01":
[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0]

Q8. System Component Specification & Functional Role Summary:
[DIAGRAM: grid | cols=Component,Specification,System Role | rows=CPU~8-Core 4.2 GHz~Instruction fetch decode and ALU execution;RAM~16 GB DDR5~Volatile working store for active programs;SSD~1 TB NVMe~Non-volatile block storage for OS and files;GPU~12 GB VRAM~Parallel SIMD shader and matrix compute]`,

    stress_turbo: STRESS_DOC
};

export default PRESETS;
