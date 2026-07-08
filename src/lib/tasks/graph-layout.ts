import type { TaskDTO } from "./types";

/**
 * Layout helper for the dependency graph (v0.3 orchestration view).
 *
 * Takes the live task list and assigns each task a (col, x, y) coordinate
 * for SVG rendering. Two-phase:
 *   1. topological columns — every task sits in the column of (max parent
 *      column + 1) so dependencies flow left → right.
 *   2. y-position within column — vertical ordering by status priority
 *      (running first, then queued, then done) followed by createdAt.
 */

export const NODE_W = 220;
export const NODE_H = 64;
export const COL_GAP = 40;
export const ROW_GAP = 16;
export const PAD_X = 24;
export const PAD_Y = 24;

export interface GraphNode {
  id: string;
  task: TaskDTO;
  x: number;
  y: number;
  col: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Path "M x1 y1 C ... x2 y2" — Bezier for a clean flowing line. */
  path: string;
}

const STATUS_RANK: Record<string, number> = {
  running: 0,
  queued: 1,
  done: 2,
  failed: 3,
  cancelled: 4,
};

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export function buildGraphLayout(tasks: TaskDTO[]): GraphLayout {
  const byId = new Map<string, TaskDTO>(tasks.map((t) => [t.id, t]));
  const colById = new Map<string, number>();

  // Pass 1: assign columns (longest-path from any root).
  function colOf(id: string, stack: Set<string> = new Set()): number {
    const cached = colById.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) {
      // Cycle — treat as root so we don't loop forever.
      return 0;
    }
    const task = byId.get(id);
    if (!task || task.parentIds.length === 0) {
      colById.set(id, 0);
      return 0;
    }
    stack.add(id);
    let maxParent = -1;
    for (const pid of task.parentIds) {
      if (!byId.has(pid)) continue; // missing parent → treat as root
      maxParent = Math.max(maxParent, colOf(pid, stack));
    }
    stack.delete(id);
    const col = maxParent + 1;
    colById.set(id, col);
    return col;
  }
  tasks.forEach((t) => colOf(t.id));

  // Group by column + sort within column by status + creation time.
  const byCol = new Map<number, TaskDTO[]>();
  for (const t of tasks) {
    const c = colById.get(t.id)!;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c)!.push(t);
  }
  const orderedNodes: GraphNode[] = [];
  const cols = Array.from(byCol.keys()).sort((a, b) => a - b);
  let maxX = 0;
  let maxY = 0;
  for (const c of cols) {
    const list = byCol.get(c)!;
    list.sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
        a.createdAt.localeCompare(b.createdAt),
    );
    list.forEach((task, i) => {
      const x = PAD_X + c * (NODE_W + COL_GAP);
      const y = PAD_Y + i * (NODE_H + ROW_GAP);
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + NODE_H);
      orderedNodes.push({ id: task.id, task, x, y, col: c });
    });
  }

  // Pass 3: edges use Bezier paths between parent (right edge) and child (left edge).
  const nodeIndex = new Map<string, GraphNode>(orderedNodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  for (const node of orderedNodes) {
    for (const pid of node.task.parentIds) {
      const parent = nodeIndex.get(pid);
      if (!parent) continue;
      const x1 = parent.x + NODE_W;
      const y1 = parent.y + NODE_H / 2;
      const x2 = node.x;
      const y2 = node.y + NODE_H / 2;
      const dx = Math.max(40, (x2 - x1) / 2);
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      edges.push({ from: pid, to: node.id, path });
    }
  }

  return {
    nodes: orderedNodes,
    edges,
    width: maxX + PAD_X,
    height: Math.max(maxY + PAD_Y, NODE_H + PAD_Y * 2),
  };
}
