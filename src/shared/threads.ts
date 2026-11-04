import type { CanvasNode, NodeId } from "./types";
import { messageTextForTitle } from "./history";

export type ThreadTree = {
  /** Stable per-canvas thread id, derived from the starting node. */
  id: string;
  startNodeId: NodeId;
  title: string;
  children: ThreadTree[];
};

const MAX_TITLE_LEN = 40;

function deriveTitle(node: CanvasNode): string {
  if (node.data.title && node.data.title.trim()) {
    const t = node.data.title.trim();
    return t.length > MAX_TITLE_LEN ? `${t.slice(0, MAX_TITLE_LEN)}…` : t;
  }
  const firstUser = node.data.chat.messages.find((m) => m.role === "user");
  if (firstUser) {
    const text = messageTextForTitle(firstUser).trim();
    if (text) {
      return text.length > MAX_TITLE_LEN ? `${text.slice(0, MAX_TITLE_LEN)}…` : text;
    }
  }
  return "Untitled thread";
}

/** When the node was started: its first message. A node with none yet is the newest. */
function startedAt(node: CanvasNode): number {
  const times = node.data.chat.messages.map((m) => m.createdAt).filter((t) => Number.isFinite(t));
  return times.length > 0 ? Math.min(...times) : Infinity;
}

/** Oldest first, then by id. Where a node sits on the canvas never decides this, so laying the
 *  canvas out again can't reorder the list. */
function byStart(a: CanvasNode, b: CanvasNode): number {
  const diff = startedAt(a) - startedAt(b);
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  return a.id.localeCompare(b.id);
}

function primaryChild(
  node: CanvasNode,
  byId: Record<NodeId, CanvasNode>,
): CanvasNode | undefined {
  for (const childId of node.data.chat.childIds) {
    const child = byId[childId];
    if (!child) continue;
    if (child.data.chat.parentIds[0] === node.id) return child;
  }
  return undefined;
}

/**
 * Compute the sidebar thread tree for a canvas.
 *
 * A thread is a linear segment along the primary-parent chain. Threads start
 * at every root node and at every secondary child of a branching node (the
 * oldest child continues the parent thread; later children each start a
 * sub-thread nested under their parent's thread). Threads are listed newest
 * first at every level.
 *
 * The returned tree is flattened past depth 2 — visually we only indent one
 * level, so deeper branches are promoted alongside their level-2 siblings.
 */
export function computeThreads(nodes: CanvasNode[]): ThreadTree[] {
  const byId: Record<NodeId, CanvasNode> = {};
  for (const n of nodes) byId[n.id] = n;

  type ThreadInfo = {
    startNodeId: NodeId;
    /** Nodes that belong to this thread, in order. */
    members: NodeId[];
  };

  const threads: ThreadInfo[] = [];
  const threadByMember: Record<NodeId, number> = {};

  // Walk a thread from its starting node along the primary chain.
  const walkThread = (start: CanvasNode): ThreadInfo => {
    const info: ThreadInfo = { startNodeId: start.id, members: [start.id] };
    threadByMember[start.id] = threads.length;
    let cursor: CanvasNode | undefined = start;
    while (cursor) {
      const next = primaryChild(cursor, byId);
      if (!next) break;
      // If `next` already started a thread (e.g. a merge node treated as a
      // new root because parentIds[0] points back here through a non-primary
      // edge), stop — don't suck a foreign thread's nodes into this one.
      if (threadByMember[next.id] !== undefined) break;
      info.members.push(next.id);
      threadByMember[next.id] = threads.length;
      cursor = next;
    }
    return info;
  };

  // Seed: every root node starts a thread.
  const roots = nodes.filter((n) => n.data.chat.parentIds.length === 0);
  roots.sort(byStart);
  for (const r of roots) threads.push(walkThread(r));

  // Now scan every node for branching points: their children past the first
  // (oldest first) each begin a sub-thread.
  // Capture parent-thread + sub-threads.
  type Branch = { parentThreadIdx: number; subThreadIdx: number };
  const branches: Branch[] = [];

  for (const node of nodes) {
    const kids = node.data.chat.childIds
      .map((cid) => byId[cid])
      .filter((c): c is CanvasNode => Boolean(c))
      .filter((c) => c.data.chat.parentIds[0] === node.id);
    if (kids.length <= 1) continue;
    kids.sort(byStart);
    // First kid continues node's thread; rest start sub-threads.
    const parentThreadIdx = threadByMember[node.id];
    if (parentThreadIdx === undefined) continue;
    for (let i = 1; i < kids.length; i += 1) {
      const kid = kids[i];
      if (threadByMember[kid.id] !== undefined) continue;
      const subIdx = threads.length;
      threads.push(walkThread(kid));
      branches.push({ parentThreadIdx, subThreadIdx: subIdx });
    }
  }

  // Catch any orphans — nodes the walks didn't reach. Treat each as a root.
  for (const node of nodes) {
    if (threadByMember[node.id] !== undefined) continue;
    threads.push(walkThread(node));
  }

  // Build tree, flattened past depth 2: any sub-thread-of-sub-thread is
  // re-parented to its nearest top-level ancestor.
  const childrenByThread: Record<number, number[]> = {};
  for (const b of branches) {
    if (!childrenByThread[b.parentThreadIdx]) {
      childrenByThread[b.parentThreadIdx] = [];
    }
    childrenByThread[b.parentThreadIdx].push(b.subThreadIdx);
  }

  // Determine top-level threads: those whose parent isn't another thread.
  const parentOf: Record<number, number | undefined> = {};
  for (const b of branches) parentOf[b.subThreadIdx] = b.parentThreadIdx;
  const isTopLevel = (idx: number): boolean => parentOf[idx] === undefined;
  const topLevelAncestor = (idx: number): number => {
    let cur = idx;
    while (parentOf[cur] !== undefined) cur = parentOf[cur] as number;
    return cur;
  };

  // Re-parent children at depth >=2 to their top-level ancestor.
  const flatChildren: Record<number, number[]> = {};
  for (const b of branches) {
    const parentTop = topLevelAncestor(b.parentThreadIdx);
    if (!flatChildren[parentTop]) flatChildren[parentTop] = [];
    flatChildren[parentTop].push(b.subThreadIdx);
  }

  const toTree = (idx: number): ThreadTree => {
    const info = threads[idx];
    const startNode = byId[info.startNodeId];
    const kids = newestFirst(flatChildren[idx] ?? [])
      .filter((k) => k !== idx)
      .map(toTree);
    return {
      id: info.startNodeId,
      startNodeId: info.startNodeId,
      title: startNode ? deriveTitle(startNode) : "Untitled thread",
      children: kids,
    };
  };

  const newestFirst = (idxs: number[]): number[] =>
    [...idxs].sort((a, b) => byStart(byId[threads[b].startNodeId], byId[threads[a].startNodeId]));

  const topIdxs: number[] = [];
  for (let i = 0; i < threads.length; i += 1) {
    if (isTopLevel(i)) topIdxs.push(i);
  }
  return newestFirst(topIdxs).map(toTree);
}
