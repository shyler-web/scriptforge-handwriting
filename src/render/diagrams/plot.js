/**
 * Legacy Alias (`src/render/diagrams/plot.js`) -> Routes directly to Universal Engine #4 (`canvas2d.js`)
 */
import { renderCanvas2D } from './canvas2d.js';

export const renderPlot = renderCanvas2D;
export const drawPlot = renderCanvas2D;
export default renderCanvas2D;
