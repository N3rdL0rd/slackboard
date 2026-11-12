import { describe, expect, it } from "vitest";
import { cardComment, cardFileName, communityLine, isFlash, localStamp, sendHeadline, shortDate } from "./shareCard";

describe("send headline", () => {
  it("calls a first-try send a flash and anything later a send with its attempt count", () => {
    expect(isFlash(1)).toBe(true);
    expect(sendHeadline(1)).toEqual({ text: "Flashed!", sub: "" });
    expect(sendHeadline(2)).toEqual({ text: "Sent!", sub: "In 2 attempts" });
    expect(sendHeadline(5)).toEqual({ text: "Sent!", sub: "In 5 attempts" });
  });
});

describe("card text", () => {
  it("formats the logbook time as a short date and survives a bad one", () => {
    expect(shortDate("2026-11-01 01:06:58")).toBe("1 Nov 2026");
    expect(shortDate("not a date")).toBe("");
  });

  it("collapses whitespace and cuts long comments with an ellipsis", () => {
    expect(cardComment("  felt \n  hard  ")).toBe("felt hard");
    const out = cardComment("x".repeat(300), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith("\u2026")).toBe(true);
    expect(cardComment("short", 20)).toBe("short");
  });

  it("describes community sends, and says nothing for a project", () => {
    expect(communityLine([16, null, 17410, 2.98])).toBe("17,410 sends by climbers");
    expect(communityLine([16, null, 1, 3])).toBe("1 send by climbers");
    expect(communityLine([16, null, 0, 0])).toBeNull();
    expect(communityLine(undefined)).toBeNull();
  });

  it("makes safe file names", () => {
    expect(cardFileName("send", "Masquerade - CROP!")).toBe("slackboard-send-masquerade-crop");
    expect(cardFileName("climb", "***")).toBe("slackboard-climb");
  });
});

describe("local time", () => {
  it("writes the device's own date, which shortDate reads back to the same day", () => {
    const d = new Date(2026, 10, 1, 23, 59, 5);
    expect(localStamp(d)).toBe("2026-11-01 23:59:05");
    expect(shortDate(localStamp(d))).toBe("1 Nov 2026");
  });
});
