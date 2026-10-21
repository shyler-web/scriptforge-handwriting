/**
 * Demo documents shipped with the studio. Plain strings — no logic.
 */

export const PRESETS = {
    ee_kmap: `# Digital Logic Design - Assignment #4
Name: Aarav Sharma    Roll No: 22EC1049

1. Simplify the 4-variable Boolean function using a Karnaugh Map:
$$ F(A,B,C,D) = \\sum m(0, 2, 5, 7, 8, 10, 13, 15) $$

Step 1: Construct the 4-variable K-Map and group adjacent minterms:
[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]

Step 2: Extracting prime implicants from the two quad groups:
Notice that ~~F = A'B' + CD~~ corner minterms (0, 2, 8, 10) wrap around the edges:
$$ F_{simplified} = \\frac{\\overline{B} \\cdot \\overline{D} + B \\cdot D}{1} = \\overline{B \\oplus D} $$

Step 3: Realization using basic logic gates:
[DIAGRAM: circuit | expr=(B' AND D') OR (B AND D)]`,

    calc_physics: `# Multivariable Calculus & Linear Systems
Date: Oct 21, 2026    Section: B-2

Problem 1: Evaluate the Gaussian damped harmonic integral and state transition matrix.
Given the differential operator equation:
$$ I(\\alpha) = \\int_{0}^{\\infty} \\frac{\\sin(\\omega x) \\cdot e^{-\\alpha x}}{\\sqrt{x^2 + \\delta^2}} dx $$

For the coupled linear oscillator, the state Jacobian matrix is:
$$ J(x, y) = \\begin{bmatrix} \\frac{\\partial f_1}{\\partial x} & -\\omega_0^2 \\\\ \\gamma & \\frac{\\partial f_2}{\\partial y} \\end{bmatrix} \\cdot \\begin{bmatrix} x_1 \\\\ x_2 \\end{bmatrix} $$

Below is the sketched phase-plane damped response curve $y(t) = e^{-0.3t}\\cos(3t)$:
[DIAGRAM: plot | fn=damped_sine | label=Underdamped Response y(t)]

Therefore, the eigenvalues satisfy $\\lambda_{1,2} = -\\zeta\\omega_n \\pm \\omega_n\\sqrt{\\zeta^2 - 1}$.`,

    cs_dfa: `# Theory of Computation — Homework 3
Topic: Deterministic Finite Automata (DFA) & Parse Trees

Q1: Design a minimal DFA over alphabet $\\Sigma = \\{0, 1\\}$ that accepts all binary strings ending with the substring "01".

Formal 5-Tuple Definition:
$$ M = \\left( \\{q_0, q_1, q_2\\}, \\{0, 1\\}, \\delta, q_0, \\{q_2\\} \\right) $$

State Transition Diagram:
[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2]

Transition Function Table Verification:
If input $w = 1001$, path is ~~q0 -> q1 -> q0~~ $q_0 \\rightarrow q_0 \\rightarrow q_1 \\rightarrow q_1 \\rightarrow q_2$ (Accepted).

Recurrence relation for state space complexity:
$$ T(n) = 2 T\\left(\\frac{n}{2}\\right) + \\sqrt{n \\log n} $$`
};
