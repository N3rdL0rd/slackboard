import { describe, expect, it } from "vitest";
import { encodeForm, followReq, profileParts, signUpFields, workoutReq, workoutTemplatesPath } from "./api";
import { circuitFilterCount, DEFAULT_CIRCUIT_FILTER, defaultKnobs, filterCircuits, followButton, leaderboardChoices, parseExplore, parseLeaderboardName, parseLeaderboards, parseProfile, parseScores, parseWorkout, parseWorkoutTemplates, pickLeaderboard, type ExploreCircuit } from "./social";

const person = { id: 1, username: "u", name: "U", avatar_image: "a.jpg", is_verified: true };

describe("social parsing", () => {
  it("reads a profile with counts and the follow relationship", () => {
    const p = parseProfile({ users: [{ ...person, instagram_username: "ig", is_public: false, followee_state: "pending", social: { followers_accepted: 3, followees_accepted: 2, followers_pending: 1 }, logbook: { count: 9 }, circuits: [{ uuid: "ab", name: "Warm", color: "FF0000", count: 4 }] }] })!;
    expect(p).toMatchObject({ username: "u", isPublic: false, followState: "pending", followers: 3, following: 2, followRequests: 1, logbookCount: 9 });
    expect(p.circuits).toEqual([{ uuid: "AB", name: "Warm", color: "FF0000", count: 4 }]);
    expect(parseProfile({ users: [] })).toBeNull();
  });

  it("chooses the follow button from the relationship", () => {
    expect(followButton(null, false)).toEqual({ label: "Follow", action: "pending" });
    expect(followButton(null, true)).toEqual({ label: "Follow back", action: "pending" });
    expect(followButton("pending", false)).toEqual({ label: "Requested", action: "unfollowed" });
    expect(followButton("accepted", false)).toEqual({ label: "Following", action: "unfollowed" });
    expect(followButton("blocked", false).action).toBeNull();
  });

  it("parses mixed explore results and leaderboards", () => {
    const r = parseExplore({ results: [{ _type: "climb", uuid: "ab", name: "C", layout: { name: "L" }, user: person }, { _type: "circuit", uuid: "cd", name: "Circ", count: 4, user: person }, { _type: "user", ...person }, { _type: "?" }] });
    expect(r.map((x) => x.kind)).toEqual(["climb", "circuit", "user"]);
    expect(parseLeaderboards({ leaderboards: [{ id: 1, name: "All time" }, { id: 2 }] })).toEqual([{ id: 1, name: "All time" }]);
    expect(parseScores({ scores: [{ rank: 1, user_id: 5, username: "x", total_score: 99, ascent_count: 3 }] })[0]).toMatchObject({ rank: 1, score: 99, ascents: 3 });
  });

  it("splits a leaderboard name and picks the closest board", () => {
    expect(parseLeaderboardName("Tension Board 2 Mirror, 12 high x 12 wide, All Time")).toEqual({ layout: "Tension Board 2 Mirror", size: "12 high x 12 wide", period: "All Time" });
    expect(parseLeaderboardName("nonsense")).toBeNull();
    const choices = leaderboardChoices(parseLeaderboards({ leaderboards: [
      { id: 1, name: "Original Layout, 12 high x 8 wide, All Time" }, { id: 11, name: "Original Layout, 12 high x 8 wide, 1 Year" },
      { id: 3, name: "Tension Board 2 Mirror, 12 high x 12 wide, All Time" }, { id: 4, name: "Tension Board 2 Spray, 12 high x 8 wide, All Time" }] }));
    expect(pickLeaderboard(choices, { layout: "Tension Board 2 Mirror", size: "12 high x 12 wide", period: "All Time" })?.id).toBe(3);
    expect(pickLeaderboard(choices, { layout: "Original Layout", size: "12 high x 8 wide", period: "1 Year" })?.id).toBe(11);
    expect(pickLeaderboard(choices, { layout: "Tension Board 2 Spray", size: "10 high x 8 wide", period: "All Time" })?.id).toBe(4);
  });

  it("reads workout templates (knob type 'integer' as the live server sends it) and results", () => {
    const [t] = parseWorkoutTemplates({ templates: [{ name: "volume", title: "Volume", description: "d", knobs: [
      { name: "count", title: "Climbs", type: "integer", default: 20, min: 1, max: 100 }, { name: "x", title: "X", type: "boolean", default: 1 },
      { name: "warmup", title: "Warm", type: "select", default: 2, options: [{ value: 0, title: "None" }] }, { name: "z", type: "mystery" }] }] });
    expect(t.knobs.map((k) => k.type)).toEqual(["integer", "boolean", "select"]);
    expect(defaultKnobs(t)).toEqual({ count: 20, x: true, warmup: 2 });
    expect(parseWorkout({ climbs: [{ uuid: "ab", difficulty: 14, section: "Warm Up" }] })).toEqual([{ uuid: "AB", difficulty: 14, section: "Warm Up" }]);
    expect(parseWorkout({})).toBeNull();
  });
});

describe("request builders", () => {
  it("never turns the mailing list on", () => {
    expect(signUpFields({ username: "u", password: "p", email: "e@x.com" }).ml).toBe(false);
    expect(encodeForm(signUpFields({ username: "u", password: "p", email: "e@x.com" }))).toContain("ml=0");
  });
  it("builds profile parts, follow and workout requests", () => {
    expect(profileParts(7, { name: " A ", email: "e@x", instagram: "@ig", isPublic: false })).toEqual({ id: "7", name: "A", email_address: "e@x", instagram_username: "ig", is_public: "false" });
    expect(profileParts(7, { name: "", email: "e", instagram: " ", isPublic: true })).not.toHaveProperty("instagram_username");
    expect(followReq(2, 1, "accepted").fields).toEqual({ followee_id: 2, follower_id: 1, state: "accepted" });
    const w = { layoutId: 11, edges: { left: -44, right: 44, bottom: 0, top: 144 }, hsm: 3, angle: 40 };
    expect(workoutTemplatesPath(w)).toContain("wall_layout_id=11&wall_edge_left=-44");
    expect(workoutReq(w, "volume", { count: 20, x: true }, false).fields).toMatchObject({ template_name: "volume", template_knob_count: 20, template_knob_x: true, regen: false, wall_hsm: 3 });
  });
});

describe("circuit browsing", () => {
  const mk = (name: string, color: string, count: number, createdAt: string, owner = "o"): ExploreCircuit => ({ kind: "circuit", uuid: name, name, color, count, createdAt, owner: { id: 1, username: owner, name: null, avatar: null, verified: false } });
  const list = [mk("Warm up", "FF0000", 4, "2026-10-01"), mk("Project list", "0000FF", 30, "2026-10-20"), mk("Alpha", "FF0000", 12, "2026-10-10", "zed")];
  const names = (f: Partial<typeof DEFAULT_CIRCUIT_FILTER>, q = "") => filterCircuits(list, { ...DEFAULT_CIRCUIT_FILTER, ...f }, q).map((c) => c.name);

  it("keeps the server's order by default and sorts on request", () => {
    expect(names({})).toEqual(["Warm up", "Project list", "Alpha"]);
    expect(names({ sort: "newest" })).toEqual(["Project list", "Alpha", "Warm up"]);
    expect(names({ sort: "most" })).toEqual(["Project list", "Alpha", "Warm up"]);
    expect(names({ sort: "name" })).toEqual(["Alpha", "Project list", "Warm up"]);
  });
  it("filters by colour, size and a name or owner search", () => {
    expect(names({ colors: ["FF0000"] })).toEqual(["Warm up", "Alpha"]);
    expect(names({ minClimbs: 10 })).toEqual(["Project list", "Alpha"]);
    expect(names({}, "proj")).toEqual(["Project list"]);
    expect(names({}, "ZED")).toEqual(["Alpha"]);
    expect(circuitFilterCount({ colors: ["FF0000"], minClimbs: 5, sort: "most" })).toBe(2);
    expect(circuitFilterCount(DEFAULT_CIRCUIT_FILTER)).toBe(0);
  });
});
