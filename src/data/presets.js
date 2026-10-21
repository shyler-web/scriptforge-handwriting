/**
 * ScriptForge Multi-Domain Showcase Presets (`src/data/presets.js`)
 * Demonstrates all 5 Universal Spatial Grammars across Digital Logic, PCS Computer Architecture,
 * Probability/Calculus, and Automata/DSA.
 */

export const PRESETS = {
    ee_kmap: `# Digital Logic & Sequential Design - Assignment #2
Name: Aarav Sharma    

1. 32-Bit Instruction Format & Register Bitfield Allocation:
Given 16 registers ($R_0$ to $R_{15}$) and a 6-bit opcode for ADD R1, R2, R3:
$$ \\text{Bits per register} = \\log_2(16) = 4\\text{ bits}, \\quad \\text{Unused} = 32 - (6 + 3 \\times 4) = 14\\text{ bits} $$
[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]

2. Simplify Boolean Function via 4-Variable Karnaugh Map:
$$ F(A,B,C,D) = \\sum m(0, 2, 5, 7, 8, 10, 13, 15) $$
[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]

Notice that ~~F = A'B' + CD~~ corner minterms wrap around to yield $F = \\overline{B}\\,\\overline{D} + BD$:
[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]`,

    calc_physics: `# Probability, Statistics & Stochastic Processes
Date: Oct 22, 2026    Submission: Handwritten Derivation

Q4 & Q7: Density Transformation & Binomial Expectation Identity:
Given $f(x) = \\frac{8}{\\pi}\\sqrt{x(1-x)}$ on $0 < x < 1$, for $X \\sim \\text{Binomial}(n, p)$:
$$ E\\left[\\frac{1}{X+1}\\right] = \\sum_{k=0}^{n} \\frac{1}{k+1} \\binom{n}{k} p^k (1-p)^{n-k} = \\frac{1 - (1-p)^{n+1}}{(n+1)p} $$

Q9: Concentric Target Scoring Discs ($r_1 = \\frac{1}{\\sqrt{3}}, r_2 = 1, r_3 = \\sqrt{3}$):
With radial density $f(r) = \\frac{2}{\\pi(1+r^2)}$, each ring's probability integral is:
[DIAGRAM: canvas2d | circles=0.58:4 pts (1/sqrt(3)),1.0:3 pts (r=1),1.73:2 pts (sqrt(3)) | label=E[Score] = 9.583]

Q10: Conditional Density $f(x) = 4x^3$ shaded on $[1/3, 2/3]$:
[DIAGRAM: canvas2d | fn=4*x^3 | domain=0,1 | shade=0.33,0.67 | xlabel=x | ylabel=f(x) | label=f(x)=4x^3]`,

    cs_dfa: `# Theory of Computation & Computer Systems (PCS)
Topic: Automata, 5-Stage Instruction Pipelining & RTL Microoperations

1. Minimal DFA Accepting Binary Strings Ending in "01":
$$ M = \\left( \\{q_0, q_1, q_2\\}, \\{0, 1\\}, \\delta, q_0, \\{q_2\\} \\right) $$
[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0]

2. Five-Stage Instruction Pipeline Timing Diagram ($k=5, n=4$):
[DIAGRAM: grid | cols=Cycle,1,2,3,4,5,6,7,8 | rows=I1~IF~ID~EX~MEM~WB~~~;I2~~IF~ID~EX~MEM~WB~~;I3~~~IF~ID~EX~MEM~WB~;I4~~~~IF~ID~EX~MEM~WB]

3. Basic Computer Fetch & Execute Microoperations:
$$ \\begin{aligned} T_0 &: AR \\leftarrow PC \\\\ T_1 &: IR \\leftarrow M[AR], \\; PC \\leftarrow PC + 1 \\\\ D_4 T_3 &: DR \\leftarrow M[AR], \\; D_4 T_4 : AC \\leftarrow AC + DR \\end{aligned} $$`
};

export default PRESETS;
