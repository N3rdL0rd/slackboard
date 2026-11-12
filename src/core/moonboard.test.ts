import { describe, expect, it } from "vitest";
import {
  edgesOf, holeIdOf, placementIdOf, positionOfPlacement, productOf,
  COLS, difficultyOfFont, encodeLegacy, guessFromFileName, layoutIdOf, ledIndex, parseDeviceName, parsePosition, positionName, positionOfLed,
  problemFromRecord, RecordSplitter, ROLE_COLORS, rowsOf, setupByKey, SETUPS, stableId, toClimb,
} from "./moonboard";
import { parseFrames } from "./frames";

/** The reference decoder from e-sr/moonboard (`position_trans`), ported as is. */
function reference(p: number, rows: number): string {
  let col = Math.floor(p / rows);
  let row = (p % rows) + 1;
  if (col % 2 === 1) row = rows + 1 - row;
  return "ABCDEFGHIJK"[col] + row;
}

describe("grid and LED mapping", () => {
  it("agrees with the community decoder for every LED, on both board sizes", () => {
    for (const rows of [18, 12]) {
      for (let led = 0; led < COLS * rows; led++) expect(positionName(positionOfLed(led, rows))).toBe(reference(led, rows));
    }
  });

  it("is one-to-one: every hole has its own LED", () => {
    for (const rows of [18, 12]) {
      const seen = new Set<number>();
      for (let col = 0; col < COLS; col++) for (let row = 1; row <= rows; row++) seen.add(ledIndex({ col, row }, rows));
      expect(seen.size).toBe(COLS * rows);
      expect(Math.max(...seen)).toBe(COLS * rows - 1);
    }
  });

  it("runs up column A and down column B", () => {
    expect(ledIndex(parsePosition("A1", 18)!, 18)).toBe(0);
    expect(ledIndex(parsePosition("A18", 18)!, 18)).toBe(17);
    expect(ledIndex(parsePosition("B18", 18)!, 18)).toBe(18);
    expect(ledIndex(parsePosition("B1", 18)!, 18)).toBe(35);
    expect(ledIndex(parsePosition("H9", 12)!, 12)).toBe(87);
  });

  it("rejects holes off the board", () => {
    expect(parsePosition("L5", 18)).toBeNull();
    expect(parsePosition("A19", 18)).toBeNull();
    expect(parsePosition("A13", 12)).toBeNull();
    expect(parsePosition("A0", 18)).toBeNull();
    expect(parsePosition("", 18)).toBeNull();
    expect(parsePosition(" k18 ", 18)).toEqual({ col: 10, row: 18 });
  });
});

describe("Bluetooth packet", () => {
  const ascii = (b: number[]) => String.fromCharCode(...b);
  it("writes a type letter and LED index per hold, chosen by role colour", () => {
    expect(ascii(encodeLegacy([
      { position: 3, color: ROLE_COLORS.start }, { position: 17, color: ROLE_COLORS.middle }, { position: 40, color: ROLE_COLORS.finish },
    ]))).toBe("l#S3,P17,E40#");
  });
  it("clears the board with an empty list", () => {
    expect(ascii(encodeLegacy([]))).toBe("l##");
  });
  it("reads the advertised name as it is, with no serial", () => {
    expect(parseDeviceName("Moonboard A")).toEqual({ displayName: "Moonboard A", serial: null, apiLevel: 0 });
  });
});

describe("dump records", () => {
  const community = { name: "FAR", grade: "6B+", userGrade: "6C", setby: "Ben Moon", method: "Feet follow hands", isBenchmark: true,
    moves: [{ description: "G4", isStart: true }, { description: "A10" }, { description: "A12", isEnd: true }] };

  it("reads the community dump shape, preferring the community grade", () => {
    expect(problemFromRecord(community)).toEqual({
      name: "FAR", setter: "Ben Moon", grade: "6C", method: "Feet follow hands", benchmark: true,
      holds: [{ position: "G4", role: "start" }, { position: "A10", role: "middle" }, { position: "A12", role: "finish" }],
    });
  });

  it("reads the old site's capitalised shape", () => {
    const p = problemFromRecord({ Name: "X", Grade: "7A", UserGrade: "", Setter: { Nickname: "nick" }, Method: "m", IsBenchmark: false,
      Moves: [{ Description: "C5", IsStart: true, IsEnd: false }] });
    expect(p).toMatchObject({ name: "X", setter: "nick", grade: "7A", benchmark: false, holds: [{ position: "C5", role: "start" }] });
  });

  it("rejects records that are not problems", () => {
    expect(problemFromRecord(null)).toBeNull();
    expect(problemFromRecord({ name: "no moves" })).toBeNull();
    expect(problemFromRecord({ name: "bad", moves: [{ foo: 1 }] })).toBeNull();
  });

  it("builds a climb with its edges, frame and stable identity", () => {
    const setup = setupByKey("mini2020")!;
    const c = toClimb(problemFromRecord(community)!, setup, 40)!;
    expect(c).toMatchObject({ left: 1, right: 7, bottom: 4, top: 12, difficulty: difficultyOfFont("6C") });
    const frame = parseFrames(c.frames)[0];
    expect(frame.size).toBe(3);
    expect(c.uuid).toMatch(/^[0-9A-F]{32}$/);
    expect(toClimb(problemFromRecord(community)!, setup, 40)!.uuid).toBe(c.uuid);
    expect(toClimb(problemFromRecord(community)!, setup, 25)!.uuid).not.toBe(c.uuid);
  });

  it("drops problems that cannot be drawn on the setup", () => {
    const setup = setupByKey("mini2020")!;
    const tall = problemFromRecord({ name: "tall", grade: "6A", moves: [{ description: "A18", isStart: true }] })!;
    expect(toClimb(tall, setup, 40)).toBeNull();
    expect(toClimb(tall, setupByKey("2016")!, 40)).not.toBeNull();
    expect(toClimb({ ...tall, holds: [] }, setupByKey("2016")!, 40)).toBeNull();
    expect(toClimb({ ...tall, name: "  " }, setupByKey("2016")!, 40)).toBeNull();
  });

  it("keeps a problem with an unknown grade, ungraded", () => {
    const p = problemFromRecord({ name: "odd", grade: "5+", moves: [{ description: "A1", isStart: true }] })!;
    expect(toClimb(p, setupByKey("2016")!, 40)!.difficulty).toBeNull();
  });

  it("gives the same id to a different order of the same holds, but not to a different hold", () => {
    const a = problemFromRecord({ name: "n", grade: "6A", moves: [{ description: "A1", isStart: true }, { description: "B2" }] })!;
    const b = { ...a, holds: [...a.holds].reverse() };
    const c = { ...a, holds: [a.holds[0], { position: "B3", role: "middle" as const }] };
    const setup = setupByKey("2016")!;
    expect(toClimb(b, setup, 40)!.uuid).toBe(toClimb(a, setup, 40)!.uuid);
    expect(toClimb(c, setup, 40)!.uuid).not.toBe(toClimb(a, setup, 40)!.uuid);
  });
});

describe("grades", () => {
  it("maps Font grades onto the shared scale", () => {
    expect(difficultyOfFont("6A")).toBe(16);
    expect(difficultyOfFont("6b+")).toBe(19);
    expect(difficultyOfFont("8B+")).toBe(31);
    expect(difficultyOfFont("9z")).toBeNull();
  });
});

describe("setups", () => {
  it("guesses the setup and angle from a file name", () => {
    expect(guessFromFileName("Problems Moonboard 2019 40.json")).toEqual({ setup: "2019", angle: 40 });
    expect(guessFromFileName("Problems Moonboard Mini 2020 40.json")).toEqual({ setup: "mini2020", angle: 40 });
    expect(guessFromFileName("Problems Moonboard Mini 2025 40.json")).toEqual({ setup: "mini2025", angle: 40 });
    expect(guessFromFileName("moonboard_2016_25deg.json")).toEqual({ setup: "2016", angle: 25 });
    expect(guessFromFileName("moon_problems.db")).toEqual({ setup: null, angle: null });
    expect(guessFromFileName("Problems Moonboard 2016.json")).toEqual({ setup: "2016", angle: null });
  });

  it("gives every setup and angle its own layout id", () => {
    const ids = SETUPS.flatMap((s) => [25, 40].map((a) => layoutIdOf(s, a)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(rowsOf(setupByKey("mini2025")!)).toBe(12);
  });

  it("makes the same id for the same text and a different one otherwise", () => {
    expect(stableId("a")).toBe(stableId("a"));
    expect(stableId("a")).not.toBe(stableId("b"));
  });
});

describe("RecordSplitter", () => {
  const records = [
    { name: 'brace } in "name"', moves: [{ description: "A1", isStart: true }] },
    { name: "back\\slash \\", moves: [{ description: "B2" }, { description: "C3", isEnd: true }] },
    { name: "plain", moves: [] },
  ];
  const wrapped = JSON.stringify({ total: 3, data: records });
  const bare = JSON.stringify(records);

  const split = (text: string, size: number) => {
    const s = new RecordSplitter();
    const out: string[] = [];
    for (let i = 0; i < text.length; i += size) out.push(...s.push(text.slice(i, i + size)));
    return out.map((r) => JSON.parse(r));
  };

  it("finds every record at any chunk size, wrapped or bare", () => {
    for (const text of [wrapped, bare]) {
      for (const size of [1, 2, 3, 7, 13, 64, text.length]) expect(split(text, size)).toEqual(records);
    }
  });

  it("does not take the inner move objects for records", () => {
    expect(split(wrapped, 5)).toHaveLength(3);
  });

  it("ignores everything outside the record array", () => {
    expect(split(JSON.stringify({ meta: { a: [1, { b: 2 }] }, data: records }), 9)).toHaveLength(3);
  });
});

describe("setting problems", () => {
  it("finds a hole again from its placement id, for every hole on every setup and angle", () => {
    for (const setup of SETUPS) {
      for (const angle of [25, 40]) {
        const rows = rowsOf(setup);
        for (let col = 0; col < COLS; col++) for (let row = 1; row <= rows; row++) {
          expect(positionOfPlacement(placementIdOf(layoutIdOf(setup, angle), holeIdOf(productOf(setup), { col, row })))).toEqual({ col, row });
        }
      }
    }
  });

  it("measures a frame's extent the same way the importer does", () => {
    const setup = setupByKey("mini2020")!;
    const problem = problemFromRecord({ name: "E", grade: "6A", moves: [{ description: "C4", isStart: true }, { description: "H9" }, { description: "B12", isEnd: true }] })!;
    const climb = toClimb(problem, setup, 40)!;
    const [frame] = parseFrames(climb.frames);
    expect(edgesOf(frame)).toEqual({ left: climb.left, right: climb.right, bottom: climb.bottom, top: climb.top });
    expect(edgesOf(new Map())).toBeNull();
  });
});
