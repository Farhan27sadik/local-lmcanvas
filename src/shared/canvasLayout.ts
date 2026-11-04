import type { CanvasNode, NodeId, OrganizePlan } from "./types";
import { byCreation, chatNodes } from "./canvasOrganize";

type Size = { width: number; height: number };
type Position = { x: number; y: number };

/**
 * Positions for every chat node, from an organize plan. Each line (a node and the children that
 * continue it) is one column, stacked downward. A branch starts a new line level with the node it
 * left, in the nearest free column to the right (deep dive) or left (off-topic). Each line reserves
 * its whole height in its column, so lines can't overlap. Sticky notes get no position.
 */
export function layoutCanvas(
  nodes: CanvasNode[],
  plan: OrganizePlan,
  sizeOf: (node: CanvasNode) => Size,
  gap: { x: number; y: number },
): Record<NodeId, Position> {
  const chats = byCreation(chatNodes(nodes));
  if (chats.length === 0) return {};
  const byId = new Map(chats.map((n) => [n.id, n]));
  const parentOf = (n: CanvasNode): NodeId | undefined => {
    const p = n.data.chat.parentIds[0];
    return p !== undefined && p !== n.id && byId.has(p) ? p : undefined;
  };
  const childrenOf = new Map<NodeId, CanvasNode[]>();
  for (const n of chats) {
    const p = parentOf(n);
    if (p) childrenOf.set(p, [...(childrenOf.get(p) ?? []), n]);
  }
  const roots = chats.filter((n) => !parentOf(n));
  const origin = (roots[0] ?? chats[0]).position;
  const pitch = Math.max(...chats.map((n) => sizeOf(n).width)) + gap.x;
  const isSide = (id: NodeId) => plan[id]?.kind === "deep-dive" || plan[id]?.kind === "off-topic";

  // Columns of the tree being laid out; each tree gets its own, so trees never interleave.
  let columns = new Map<number, Array<[number, number]>>();
  const placed = new Map<NodeId, { col: number; y: number }>();

  const lineFrom = (start: CanvasNode): CanvasNode[] => {
    const line: CanvasNode[] = [];
    for (let n: CanvasNode | undefined = start; n && !placed.has(n.id) && !line.includes(n); ) {
      line.push(n);
      const kids: CanvasNode[] = (childrenOf.get(n.id) ?? []).filter((k) => !placed.has(k.id) && !line.includes(k));
      const next: NodeId | undefined = plan[n.id]?.next;
      n = kids.find((k) => k.id === next) ?? kids.find((k) => !isSide(k.id));
    }
    return line;
  };
  const heightOf = (line: CanvasNode[]) =>
    line.reduce((h, n, i) => h + sizeOf(n).height + (i > 0 ? gap.y : 0), 0);
  const isFree = (col: number, top: number, bottom: number) =>
    !(columns.get(col) ?? []).some(([t, b]) => top < b + gap.y && bottom + gap.y > t);

  const placeLine = (start: CanvasNode, col: number, top: number): void => {
    const line = lineFrom(start);
    columns.set(col, [...(columns.get(col) ?? []), [top, top + heightOf(line)]]);
    let y = top;
    for (const n of line) {
      placed.set(n.id, { col, y });
      y += sizeOf(n).height + gap.y;
    }
    for (const n of line) {
      const branchTop = placed.get(n.id)!.y;
      for (const kid of childrenOf.get(n.id) ?? []) {
        if (placed.has(kid.id)) continue;
        const dir = plan[kid.id]?.kind === "off-topic" ? -1 : 1;
        const bottom = branchTop + heightOf(lineFrom(kid));
        let c = col + dir;
        while (!isFree(c, branchTop, bottom)) c += dir;
        placeLine(kid, c, branchTop);
      }
    }
  };

  // Trees side by side, oldest first, then anything only reachable through a cycle. Each tree is
  // laid out on its own, then shifted so its leftmost column sits right of the previous tree.
  let rightEdge: number | null = null;
  for (const start of [...roots, ...chats]) {
    if (placed.has(start.id)) continue;
    columns = new Map();
    const earlier = new Set(placed.keys());
    placeLine(start, 0, 0);
    const tree = [...placed].filter(([id]) => !earlier.has(id));
    const cols = tree.map(([, p]) => p.col);
    const shift: number = rightEdge === null ? 0 : rightEdge + 1 - Math.min(...cols);
    for (const [id, p] of tree) placed.set(id, { col: p.col + shift, y: p.y });
    rightEdge = Math.max(...cols) + shift;
  }

  return Object.fromEntries(
    [...placed].map(([id, { col, y }]) => [id, { x: origin.x + col * pitch, y: origin.y + y }]),
  );
}

const TOPIC_TREE_ROOT_BRANCH_OFFSET = 1100;

/**
 * A reference-style tree: each root child owns one column and all its descendants stack beneath it.
 * The root stays centered over those columns. Separate roots and cycles become trees side by side.
 * Sticky notes get no position.
 */
export function layoutTopicTree(
  nodes: CanvasNode[],
  sizeOf: (node: CanvasNode) => Size,
  gap: { x: number; y: number },
): Record<NodeId, Position> {
  const chats = byCreation(chatNodes(nodes));
  if (chats.length === 0) return {};
  const byId = new Map(chats.map((n) => [n.id, n]));
  const parentOf = (n: CanvasNode): NodeId | undefined => {
    const p = n.data.chat.parentIds[0];
    return p !== undefined && p !== n.id && byId.has(p) ? p : undefined;
  };
  const childrenOf = new Map<NodeId, CanvasNode[]>();
  for (const n of chats) {
    const p = parentOf(n);
    if (p) childrenOf.set(p, [...(childrenOf.get(p) ?? []), n]);
  }
  const roots = chats.filter((n) => !parentOf(n));
  const origin = (roots[0] ?? chats[0]).position;

  // Break cycles by accepting only edges to nodes not already reached in this forest walk.
  const forestRoots: CanvasNode[] = [];
  const forestChildren = new Map<NodeId, CanvasNode[]>();
  const reached = new Set<NodeId>();
  for (const start of [...roots, ...chats]) {
    if (reached.has(start.id)) continue;
    forestRoots.push(start);
    const stack = [start];
    while (stack.length > 0) {
      const n = stack.pop() as CanvasNode;
      if (reached.has(n.id)) continue;
      reached.add(n.id);
      const children = (childrenOf.get(n.id) ?? []).filter((child) => !reached.has(child.id));
      forestChildren.set(n.id, children);
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
  }

  const columnFrom = (start: CanvasNode): CanvasNode[] => {
    const column: CanvasNode[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const n = stack.pop() as CanvasNode;
      column.push(n);
      const children = forestChildren.get(n.id) ?? [];
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
    }
    return column;
  };

  const placed: Record<NodeId, Position> = {};
  let nextLeft: number | undefined;
  for (const root of forestRoots) {
    const columns = (forestChildren.get(root.id) ?? []).map(columnFrom);
    const columnWidths = columns.map((column) => Math.max(...column.map((n) => sizeOf(n).width)));
    const columnsWidth = columnWidths.reduce((width, columnWidth, i) => width + columnWidth + (i > 0 ? gap.x : 0), 0);
    const treeWidth = Math.max(sizeOf(root).width, columnsWidth);
    const left = nextLeft ?? origin.x - (treeWidth - sizeOf(root).width) / 2;
    placed[root.id] = { x: left + (treeWidth - sizeOf(root).width) / 2, y: origin.y };

    const branchTop = origin.y + Math.max(TOPIC_TREE_ROOT_BRANCH_OFFSET, sizeOf(root).height + gap.y);
    let columnLeft = left + (treeWidth - columnsWidth) / 2;
    for (const [index, column] of columns.entries()) {
      let y = branchTop;
      for (const n of column) {
        placed[n.id] = { x: columnLeft + (columnWidths[index] - sizeOf(n).width) / 2, y };
        y += sizeOf(n).height + gap.y;
      }
      columnLeft += columnWidths[index] + gap.x;
    }
    nextLeft = left + treeWidth + gap.x;
  }
  return placed;
}
