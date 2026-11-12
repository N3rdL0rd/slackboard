import { describe, expect, it } from "vitest";
import { avatarUrl, nextCursor, parseClimbInfo, parseFeed, relativeTime } from "./feed";

const user = { id: 94272, username: "DaveGolias", name: null, avatar_image: null, is_verified: false };
const climb = { uuid: "18e0834c", name: "Masquerade", type: "boulder" };

describe("feed", () => {
  it("parses each event kind and drops incomplete or unknown ones", () => {
    const events = parseFeed({ notifications: [
      { _type: "ascent", uuid: "a", angle: 30, quality: 3, difficulty: 16, difficulty_name: "6a/V3", is_mirror: true, comment: "hard", created_at: "2026-10-29 21:20:57", climb, user },
      { _type: "bid", uuid: "b", angle: 40, bid_count: 4, created_at: "2026-10-29 20:00:00", climb, user },
      { _type: "like", uuid: "l", created_at: "t", climb, user },
      { _type: "follow", uuid: "f", state: "pending", created_at: "t", follower: user, followee: { ...user, id: 1, username: "me" } },
      { _type: "ascent", uuid: "broken", climb },
      { _type: "mystery", uuid: "x" },
    ] });
    expect(events.map((e) => e.kind)).toEqual(["ascent", "bid", "like", "follow"]);
    expect(events[0]).toMatchObject({ gradeName: "6a/V3", isMirror: true, comment: "hard", climb: { uuid: "18E0834C" } });
    expect(nextCursor(events)).toBe("t");
    expect(nextCursor([])).toBeNull();
  });

  it("parses climb info with sorted histograms and the first ascent", () => {
    const info = parseClimbInfo({ uuid: "abc", name: "N", description: "d", is_nomatch: true, user, fa: { created_at: "2022", user }, ascent_count: 9,
      stats: { difficulty: [{ difficulty: 17, count: 1 }, { difficulty: 16, count: 5 }], quality: [{ quality: 3, count: 6 }] } })!;
    expect(info).toMatchObject({ uuid: "ABC", isNoMatch: true, ascentCount: 9, firstAscent: { at: "2022" } });
    expect(info.difficulty).toEqual([{ value: 16, count: 5 }, { value: 17, count: 1 }]);
    expect(parseClimbInfo({})).toBeNull();
  });

  it("builds avatar urls and relative times", () => {
    expect(avatarUrl("avatars/1.jpg")).toBe("https://api.tensionboardapp2.com/img/avatars/1.jpg");
    expect(avatarUrl(null)).toBeNull();
    const now = new Date("2026-10-31T12:00:00Z");
    expect(relativeTime("2026-10-31 11:58:00", now)).toBe("2 min ago");
    expect(relativeTime("2026-10-31 09:00:00", now)).toBe("3 h ago");
    expect(relativeTime("2026-10-29 12:00:00", now)).toBe("2 d ago");
  });
});

import { parseExhibits } from "./feed";
describe("exhibits", () => {
  it("reads lit climbs and skips incomplete rows", () => {
    expect(parseExhibits({ exhibits: [{ climb_uuid: "abc", serial_number: 841428, created_at: "2026-10-31 10:00:00" }, { climb_uuid: "x" }] }))
      .toEqual([{ climbUuid: "ABC", serial: "841428", createdAt: "2026-10-31 10:00:00" }]);
    expect(parseExhibits(null)).toEqual([]);
  });
});
