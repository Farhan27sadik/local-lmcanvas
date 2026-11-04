// src/shared/threads.test.mjs
import { describe, expect, test } from "bun:test";
import { computeThreads } from "./threads.ts";

const node = (id, parent, at, x = 0, y = 0) => ({
  id,
  type: "custom",
  position: { x, y },
  data: {
    title: id,
    chat: {
      parentIds: parent ? [parent] : [],
      childIds: [],
      messages: at === undefined ? [] : [{ id: `${id}-m`, role: "user", blocks: [{ type: "text", text: id }], createdAt: at }],
    },
  },
});

// r has three children (a oldest, then b, then c) and a second root s started later than r.
const canvas = (place) => {
  const nodes = [node("r", undefined, 1, ...place.r), node("a", "r", 2, ...place.a), node("b", "r", 3, ...place.b), node("c", "r", 4, ...place.c), node("s", undefined, 5, ...place.s)];
  for (const n of nodes) {
    const p = n.data.chat.parentIds[0];
    if (p) nodes.find((x) => x.id === p).data.chat.childIds.push(n.id);
  }
  return nodes;
};
const shape = (tree) => tree.map((t) => [t.startNodeId, shape(t.children)]);

describe("computeThreads", () => {
  test("lists the newest thread first at every level", () => {
    const tree = computeThreads(canvas({ r: [0, 0], a: [0, 100], b: [0, 200], c: [0, 300], s: [500, 0] }));
    expect(shape(tree)).toEqual([["s", []], ["r", [["c", []], ["b", []]]]]);
  });

  test("laying the canvas out differently doesn't change the order", () => {
    const stacked = computeThreads(canvas({ r: [0, 0], a: [0, 100], b: [0, 200], c: [0, 300], s: [500, 0] }));
    const scattered = computeThreads(canvas({ r: [900, 900], a: [700, 50], b: [-400, 10], c: [-900, 1200], s: [0, -300] }));
    expect(shape(scattered)).toEqual(shape(stacked));
  });

  test("a node with no message yet counts as the newest", () => {
    const nodes = [node("old", undefined, 1), node("blank", undefined, undefined)];
    expect(computeThreads(nodes).map((t) => t.startNodeId)).toEqual(["blank", "old"]);
  });
});
