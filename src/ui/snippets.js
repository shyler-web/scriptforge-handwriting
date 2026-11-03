/**
 * ScriptForge Insert Palette presets (`src/ui/snippets.js`).
 * Every entry is a self-contained block that can be inserted at the cursor.
 */

export const SNIPPET_CATEGORIES = [
  'All',
  'Math',
  'Diagrams',
  'Layouts',
  'CS & Systems',
  'Chemistry',
  'Discrete',
  'Physics',
  '3D & Calculus',
  'Page',
  'Text',
];

export const SNIPPETS = [
  // ------------------------------------------------------------------ Math
  {
    id: 'math_integral',
    title: '2D Integral / Fraction',
    category: 'Math',
    desc: 'Display integral, nested fraction, root and Greek letters',
    snippet: '\n$$ \\int_{0}^{\\pi} \\frac{\\sin(x) + \\sqrt{x^2 + 1}}{2\\alpha}\\,dx $$\n',
  },
  {
    id: 'math_matrix',
    title: 'Matrix / Cases',
    category: 'Math',
    desc: 'Bracketed matrix and piecewise cases',
    snippet: '\n$$ A = \\begin{bmatrix} \\lambda_1 & -\\omega \\\\ \\omega & \\lambda_2 \\end{bmatrix}, \\quad g(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases} $$\n',
  },
  {
    id: 'math_aligned',
    title: 'Aligned Equations',
    category: 'Math',
    desc: 'Multi-line aligned derivation',
    snippet: '\n$$ \\begin{aligned} T_0 &: AR \\leftarrow PC \\\\ T_1 &: IR \\leftarrow M[AR], \\; PC \\leftarrow PC + 1 \\end{aligned} $$\n',
  },

  // --------------------------------------------------------------- Diagrams
  {
    id: 'diag_bitfield',
    title: '32-bit Bitfield',
    category: 'Diagrams',
    desc: 'Instruction or register field strip',
    snippet: '\n[DIAGRAM: bitfield | bits=32 | fields=Opcode:6,R1:4,R2:4,R3:4,Unused:14]\n',
  },
  {
    id: 'diag_grid',
    title: 'Table / Pipeline',
    category: 'Diagrams',
    desc: 'Compact hand-ruled table or pipeline timing chart',
    snippet: '\n[DIAGRAM: grid | cols=Cycle,1,2,3,4,5,6 | rows=I1~IF~ID~EX~MEM~WB~;I2~~IF~ID~EX~MEM~WB]\n',
  },
  {
    id: 'diag_kmap',
    title: 'Karnaugh Map',
    category: 'Diagrams',
    desc: 'Four-variable K-map with minterms',
    snippet: '\n[DIAGRAM: kmap | vars=A,B,C,D | ones=0,2,5,7,8,10,13,15]\n',
  },
  {
    id: 'diag_circuit',
    title: 'Flip-Flop / Circuit',
    category: 'Diagrams',
    desc: 'SR flip-flop or logic circuit',
    snippet: '\n[DIAGRAM: schematic | type=flipflop | ff=SR | target=T]\n',
  },
  {
    id: 'diag_dfa',
    title: 'Automaton / DFA',
    category: 'Diagrams',
    desc: 'State machine with accepting state',
    snippet: '\n[DIAGRAM: dfa | states=q0,q1,q2 | accept=q2 | edges=q0->q1:0,q1->q2:1,q0->q0:1,q1->q1:0,q2->q1:0]\n',
  },
  {
    id: 'diag_tree_legacy',
    title: 'Binary Tree (legacy)',
    category: 'Diagrams',
    desc: 'Compact tree diagram',
    snippet: '\n[DIAGRAM: tree | edges=50->30,50->70,30->20,30->40,70->60,70->80]\n',
  },
  {
    id: 'diag_graph_legacy',
    title: 'Graph (legacy)',
    category: 'Diagrams',
    desc: 'General graph with circular layout',
    snippet: '\n[DIAGRAM: graph | nodes=A,B,C,D | edges=A-B,B-C,C-D,D-A,A-C | layout=circular]\n',
  },
  {
    id: 'diag_svg',
    title: 'Raw SVG',
    category: 'Diagrams',
    desc: 'Arbitrary SVG geometry, re-inked as handwriting',
    snippet: '\n[DIAGRAM: svg | <svg viewBox="0 0 320 95"><rect x="15" y="20" width="80" height="48" stroke="#1b3b8c" fill="none"/><text x="32" y="50">Source</text><line x1="95" y1="44" x2="175" y2="44" stroke="#1b3b8c"/><circle cx="215" cy="44" r="32" stroke="#b91c1c" fill="none"/><text x="196" y="49">Sink</text></svg>]\n',
  },

  // ---------------------------------------------------------------- Layouts
  {
    id: 'sketch_tree',
    title: 'Sketch Tree + Costs',
    category: 'Layouts',
    desc: 'Reingold-Tilford tree with phantom leaves and level costs',
    snippet: '\n[sketch:\n  title "Tree + costs"\n  tree edges="10->5, 10->15, 5->2, 5->7, 15->_, 15->20" costs="0:cn, 1:2c(n/2)"\n]\n',
  },
  {
    id: 'sketch_dag',
    title: 'Sketch DAG / Flowchart',
    category: 'Layouts',
    desc: 'Sugiyama layered flowchart, left to right',
    snippet: '\n[sketch:\n  title "Compiler pipeline"\n  dag dir=LR edges="Lexer->Parser->AST->Codegen"\n]\n',
  },
  {
    id: 'sketch_graph',
    title: 'Sketch Force Graph',
    category: 'Layouts',
    desc: 'Deterministic force-directed graph',
    snippet: '\n[sketch:\n  title "Network"\n  graph layout=force edges="A--B, B--C, C--A, A--D"\n]\n',
  },
  {
    id: 'sketch_router',
    title: 'Relative Nodes + A* Router',
    category: 'Layouts',
    desc: 'TikZ-style relative placement and obstacle-avoiding wire',
    snippet: '\n[sketch:\n  title "Relative placement and routing"\n  node A at=(0, 0) "Source"\n  node Block right="of A" gap=45 "Obstacle"\n  node B right="of Block" gap=45 "Target"\n  arrow A -> B route=ortho label="bypass"\n  arrow A -> A loop=s label="self"\n]\n',
  },
  {
    id: 'sketch_selfloop',
    title: 'Self-Loop / State Machine',
    category: 'Layouts',
    desc: 'Circular states with a labelled self-loop',
    snippet: '\n[sketch:\n  title "State machine"\n  node q0 at=(0, 0) shape=circle "q0"\n  node q1 right="of q0" gap=70 shape=circle "q1"\n  arrow q0 -> q1 label="1"\n  arrow q0 -> q0 loop=n label="0"\n]\n',
  },

  // ---------------------------------------------------------- CS & Systems
  {
    id: 'sketch_waveform',
    title: 'Digital Timing Waveform',
    category: 'CS & Systems',
    desc: 'Clock, data, high-Z and bus cycles',
    snippet: '\n[sketch:\n  title "Digital timing"\n  waveform at=(0, 0) signals="CLK:P......., D:0.1..0.., Q:x.01..0., BUS:=A0..=FF.."\n]\n',
  },
  {
    id: 'sketch_linkedlist',
    title: 'Linked List',
    category: 'CS & Systems',
    desc: 'Singly linked cells with head, slow and fast pointers',
    snippet: '\n[sketch:\n  title "Linked list"\n  linkedlist at=(0, 0) values="10, 20, 35, 50" head="head" pointers="1:slow, 3:fast"\n]\n',
  },
  {
    id: 'sketch_memframe',
    title: 'Stack / Heap Frame',
    category: 'CS & Systems',
    desc: 'Addressable activation records with a pointer arrow',
    snippet: '\n[sketch:\n  title "Stack and heap"\n  memframe id=Stack at=(-80, 0) title="Stack" fields="n: 4, head: ->Heap.0"\n  memframe id=Heap at=(80, 0) title="Heap" fields="val: 42, next: NULL"\n]\n',
  },
  {
    id: 'sketch_btree',
    title: 'B-Tree',
    category: 'CS & Systems',
    desc: 'Slotted multi-key B-tree nodes',
    snippet: '\n[sketch:\n  title "B-tree"\n  btree at=(0, 0) edges="20|40 -> 5|10|15, 20|40 -> 25|30, 20|40 -> 45|55"\n]\n',
  },
  {
    id: 'sketch_pipeline',
    title: 'CPU Pipeline',
    category: 'CS & Systems',
    desc: 'Stage waterfall with a hatched stall bubble',
    snippet: '\n[sketch:\n  title "CPU pipeline"\n  pipeline at=(0, 0) rows="ADD R1,R2: IF ID EX MEM WB | SUB R3,R1: _ IF ID STALL EX MEM"\n]\n',
  },
  {
    id: 'sketch_gantt',
    title: 'OS Gantt Chart',
    category: 'CS & Systems',
    desc: 'Scheduling bars with start and end ticks',
    snippet: '\n[sketch:\n  title "OS scheduling"\n  gantt at=(0, 0) tasks="P1:0..4, P2:4..7, P3:7..11"\n]\n',
  },
  {
    id: 'sketch_packet',
    title: 'Packet Header',
    category: 'CS & Systems',
    desc: 'Byte-aligned TCP/IP or memory word fields',
    snippet: '\n[sketch:\n  title "Packet header"\n  packet at=(0, 0) bits=32 fields="Src Port:16, Dst Port:16, Seq Num:32"\n]\n',
  },

  // ------------------------------------------------------------- Chemistry
  {
    id: 'sketch_chain',
    title: 'Skeletal Carbon Chain',
    category: 'Chemistry',
    desc: 'IUPAC zig-zag with double bonds and wedge/dash groups',
    snippet: '\n[sketch:\n  title "Skeletal ketone"\n  chain at=(0, 0) carbons=6 bonds="2:=, 5:#" branches="4:=O, 3:^OH, 5:_Br"\n]\n',
  },
  {
    id: 'sketch_chair',
    title: 'Cyclohexane Chair',
    category: 'Chemistry',
    desc: 'Chair conformation with axial and equatorial substituents',
    snippet: '\n[sketch:\n  title "Cyclohexane chair"\n  chair at=(0, 0) axial="1:OH, 4:CH3" equatorial="2:Br"\n]\n',
  },
  {
    id: 'sketch_newman',
    title: 'Newman Projection',
    category: 'Chemistry',
    desc: 'Front Y-spokes and rear dihedral bonds',
    snippet: '\n[sketch:\n  title "Staggered Newman"\n  newman at=(0, 0) angle=60 front="CH3,H,H" back="Br,H,CH3"\n]\n',
  },
  {
    id: 'sketch_stereobonds',
    title: 'Wedge / Dash Bonds',
    category: 'Chemistry',
    desc: 'Solid wedge and hashed dash stereobonds',
    snippet: '\n[sketch:\n  title "Stereobonds"\n  chain at=(0, 0) carbons=4\n  wedge C1 -> C2\n  dash C2 -> C3\n]\n',
  },

  // ---------------------------------------------------------------- Discrete
  {
    id: 'sketch_venn',
    title: 'Shaded Venn Diagram',
    category: 'Discrete',
    desc: '2-set or 3-set boolean shading',
    snippet: '\n[sketch:\n  title "Venn diagram"\n  venn at=(0, 0) sets="A,B,C" shade="(A&B)-C"\n]\n',
  },
  {
    id: 'sketch_mapping',
    title: 'Function Mapping',
    category: 'Discrete',
    desc: 'Domain/codomain ovals with mapping arrows',
    snippet: '\n[sketch:\n  title "Function mapping"\n  mapping at=(0, 0) domain="1,2,3,4" codomain="a,b,c" pairs="1->a, 2->b, 3->b, 4->c"\n]\n',
  },
  {
    id: 'sketch_hasse',
    title: 'Hasse Diagram',
    category: 'Discrete',
    desc: 'Bottom-up poset lattice',
    snippet: '\n[sketch:\n  title "Hasse lattice"\n  hasse at=(0, 0) edges="1->2, 1->3, 2->6, 3->6"\n]\n',
  },

  // ----------------------------------------------------------------- Physics
  {
    id: 'sketch_incline',
    title: 'Inclined Plane FBD',
    category: 'Physics',
    desc: 'Rotated block with mg, N, friction and components',
    snippet: '\n[sketch:\n  title "Inclined plane"\n  incline at=(0, 0) angle=30 mass="$m$" friction="$f_k$" components=true\n]\n',
  },
  {
    id: 'sketch_atwood',
    title: 'Atwood Machine',
    category: 'Physics',
    desc: 'Pulley, rope and hanging masses',
    snippet: '\n[sketch:\n  title "Atwood machine"\n  atwood at=(0, 0) r=28 m1="$m_1$" m2="$m_2$"\n]\n',
  },
  {
    id: 'sketch_optics',
    title: 'Thin Lens Ray Trace',
    category: 'Physics',
    desc: 'Principal rays, focal points, real/virtual image',
    snippet: '\n[sketch:\n  title "Thin lens"\n  optics at=(0, 0) kind=convex f=65 u=125 h=40\n]\n',
  },
  {
    id: 'sketch_charges',
    title: 'Electric Dipole',
    category: 'Physics',
    desc: 'RK4 field streamlines around point charges',
    snippet: '\n[sketch:\n  title "Electric dipole"\n  charges at=(0, 0) q1=1 q2=-1 rays=10\n]\n',
  },
  {
    id: 'sketch_vectorfield',
    title: 'Vector Field',
    category: 'Physics',
    desc: 'Quiver grid for arbitrary fx and fy',
    snippet: '\n[sketch:\n  title "Vector field"\n  vectorfield at=(0, 0) fx="-y" fy="x"\n]\n',
  },

  // ----------------------------------------------------------- 3D & Calculus
  {
    id: 'sketch_surface3d',
    title: '3D Surface',
    category: '3D & Calculus',
    desc: 'Depth-sorted z=f(x,y) mesh with hidden-line removal',
    snippet: '\n[sketch:\n  title "3D saddle surface"\n  surface3d at=(0, 0) fn="0.35*(x^2 - y^2)" xrange=(-2.5,2.5) yrange=(-2.5,2.5) steps=12\n]\n',
  },
  {
    id: 'sketch_riemann',
    title: 'Riemann Sum',
    category: '3D & Calculus',
    desc: 'Left/right/mid/trapezoid integral partitions',
    snippet: '\n[sketch:\n  title "Midpoint Riemann sum"\n  riemann at=(0, 0) fn="0.2*x^2 + 0.5" domain=(0,4) n=6 method=mid\n]\n',
  },
  {
    id: 'sketch_matrixgrid',
    title: '2x2 Matrix Grid',
    category: '3D & Calculus',
    desc: 'Transformed lattice, basis vectors and determinant area',
    snippet: '\n[sketch:\n  title "2x2 matrix shear"\n  matrixgrid at=(0, 0) matrix="1.4, 0.5, 0.3, 1.1" range=2 det=true\n]\n',
  },
  {
    id: 'sketch_slopefield',
    title: 'ODE Slope Field',
    category: '3D & Calculus',
    desc: 'Tangent field plus forward/backward RK4 trajectories',
    snippet: '\n[sketch:\n  title "ODE slope field"\n  slopefield at=(0, 0) dy="x - y" solutions="(-2, 1.5), (-2, -0.5)"\n]\n',
  },

  // -------------------------------------------------------------------- Page
  {
    id: 'page_a4_2col',
    title: 'A4 Cheat Sheet (2 Cols)',
    category: 'Page',
    desc: 'Switch the document to the two-column A4 preset',
    snippet: '\n@page size=a4-2col\n',
  },
  {
    id: 'page_a3',
    title: 'A3 Landscape (3 Cols)',
    category: 'Page',
    desc: 'Switch to the three-column A3 landscape chart',
    snippet: '\n@page size=a3-landscape cols=3\n',
  },
  {
    id: 'page_xl',
    title: 'Mega Wall Chart (4 Cols)',
    category: 'Page',
    desc: 'Switch to the four-column wall-chart canvas',
    snippet: '\n@page size=chart-xl cols=4\n',
  },
  {
    id: 'page_break',
    title: 'Page Break',
    category: 'Page',
    desc: 'Force the next content onto a new page',
    snippet: '\n---PAGE---\n',
  },
  {
    id: 'text_strike',
    title: 'Scratch-Out',
    category: 'Text',
    desc: 'Hand-scratched strike-through text',
    snippet: ' ~~mistake~~ ',
  },
];
