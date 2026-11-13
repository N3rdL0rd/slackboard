import { describe, expect, it } from "vitest";
import { styleInsight, type StyleInput } from "./styleProfile";

const NOW = new Date(2026, 10, 12);
const s = (angle: number, grade: number, n: number) => Array.from({ length: n }, (_, i) => ({ angle, grade, climbedAt: `2026-11-0${(i % 9) + 1} 10:00:00` }));
const base = (over: Partial<StyleInput> = {}): StyleInput => ({ samples: [], boardWorking: null, outsideWorking: null, ropedV: null, boulderV: null, sends: { board: 0, outside: 0, roped: 0, boulder: 0 }, now: NOW, ...over });

describe("what the logs say", () => {
  it("says there is too little to tell when nothing can be compared", () => {
    const r = styleInsight(base());
    expect(r.emphasis).toBe("unknown");
    expect(r.findings[0]).toMatch(/too little/);
  });

  it("points to strength when steep grades are well below easy-angle grades, with the numbers", () => {
    const r = styleInsight(base({ samples: [...s(-5, 5, 4), ...s(30, 2, 4)] }));
    expect(r.emphasis).toBe("strength");
    expect(r.findings[0]).toBe("Your overhang grade is 3 V below your slab grade.");
  });

  it("needs enough sends on each side, and a gap of at least two", () => {
    expect(styleInsight(base({ samples: [...s(-5, 5, 4), ...s(30, 2, 2)] })).emphasis).toBe("unknown");
    expect(styleInsight(base({ samples: [...s(-5, 5, 4), ...s(30, 4, 4)] })).emphasis).toBe("balanced");
  });

  it("points to strength when board grades are below gym and outdoor grades", () => {
    const r = styleInsight(base({ boardWorking: 1, outsideWorking: 4, sends: { board: 5, outside: 5, roped: 0, boulder: 5 } }));
    expect(r.emphasis).toBe("strength");
    expect(r.findings[0]).toBe("Your board grades are 3 V below your gym and outdoor grades.");
  });

  it("points to endurance when roped grades are far below bouldering, unless strength shows too", () => {
    const rope = { ropedV: 1, boulderV: 4, sends: { board: 0, outside: 0, roped: 4, boulder: 4 } };
    expect(styleInsight(base(rope)).emphasis).toBe("endurance");
    const both = styleInsight(base({ ...rope, boardWorking: 1, outsideWorking: 4, sends: { board: 5, outside: 5, roped: 4, boulder: 4 } }));
    expect(both.emphasis).toBe("strength");
    expect(both.findings).toHaveLength(3);
  });

  it("says balanced, plainly, when comparisons exist and nothing stands out", () => {
    const r = styleInsight(base({ boardWorking: 3, outsideWorking: 3.5, sends: { board: 5, outside: 5, roped: 0, boulder: 5 } }));
    expect(r.emphasis).toBe("balanced");
  });
});
