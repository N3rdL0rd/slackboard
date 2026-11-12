import { describe, expect, it } from "vitest";
import { deleteSendReq, encodeForm, get, sendReq, serverTime, signIn, submit, tagReq, USER_AGENT, wallReq } from "./api";

const res = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status }) as Response;
const session = { token: "t", userId: 7 };

describe("api", () => {
  it("encodes booleans as 1/0, escapes values and repeats array fields", () => {
    expect(encodeForm({ a: true, b: false, c: "x y&z" })).toBe("a=1&b=0&c=x%20y%26z");
    expect(encodeForm({ set_ids: [12, 13] })).toBe("set_ids%5B%5D=12&set_ids%5B%5D=13");
  });

  it("maps sign-in responses and identifies as the app", async () => {
    expect(await signIn("u", "p", res(201, { session: { token: "t", user_id: 7 } }))).toEqual({ ok: true, token: "t", userId: 7 });
    expect(await signIn("u", "p", res(422, { errors: { password: ["bad"] } }))).toMatchObject({ ok: false, reason: "invalid" });
    expect(await signIn("u", "p", res(429))).toEqual({ ok: false, reason: "rate_limited" });
    expect(await signIn("u", "p", async () => { throw new Error("x"); })).toEqual({ ok: false, reason: "network" });
    let seen: Record<string, string> = {};
    await signIn("u", "p", async (_u, init) => { seen = init!.headers as Record<string, string>; return new Response("{}", { status: 422 }); });
    expect(seen["User-Agent"]).toBe(USER_AGENT);
  });

  it("builds a send as an ascent and an attempt as a bid", () => {
    const base = { climbUuid: "c", angle: 40, isMirror: true, bidCount: 2, comment: "hi", climbedAt: new Date(2026, 10, 1, 9, 5, 7) };
    const send = sendReq(session, { ...base, quality: 3, difficulty: 17 });
    const bid = sendReq(session, base);
    expect(send.path).toBe("/ascents/save");
    expect(send.fields).toMatchObject({ is_mirror: true, quality: 3, difficulty: 17, climbed_at: "2026-11-01 09:05:07.000000", user_id: 7 });
    expect(bid.path).toBe("/bids/save");
    expect(bid.fields).not.toHaveProperty("quality");
    expect(deleteSendReq("bid", "u")).toEqual({ path: "/bids/delete", fields: { uuid: "u" } });
  });

  it("builds board and tag requests", () => {
    const wall = wallReq(session, { name: "Home", isAdjustable: true, angle: 40, layoutId: 10, productSizeId: 6, setIds: [12, 13], serial: "123" });
    expect(encodeForm(wall.fields)).toContain("set_ids%5B%5D=12&set_ids%5B%5D=13");
    expect(wall.fields).toMatchObject({ serial_number: "123", is_adjustable: true });
    expect(wallReq(session, { uuid: "W1", name: "x", isAdjustable: false, angle: 20, layoutId: 1, productSizeId: 1, setIds: [] }).fields.uuid).toBe("W1");
    expect(tagReq(session, "C1", "~flag", true).fields).toEqual({ entity_uuid: "C1", user_id: 7, name: "~flag", is_listed: true });
  });

  it("classifies submit outcomes so the outbox knows whether to retry", async () => {
    const req = { path: "/x", fields: { a: 1 } };
    expect(await submit(session, req, res(200, { ok: 1 }) as never)).toEqual({ status: "ok", body: { ok: 1 } });
    expect(await submit(session, req, res(503) as never)).toEqual({ status: "retry" });
    expect(await submit(session, req, (async () => { throw new Error("offline"); }) as never)).toEqual({ status: "retry" });
    expect(await submit(session, req, res(422, { errors: { name: ["bad"] } }) as never)).toEqual({ status: "rejected", code: 422, errors: { name: ["bad"] } });
    expect(await submit(session, req, res(401) as never)).toMatchObject({ status: "rejected", code: 401 });
  });

  it("reads with get, returning null on failure", async () => {
    expect(await get(session, "/x", res(200, { a: 1 }) as never)).toEqual({ a: 1 });
    expect(await get(session, "/x", res(401) as never)).toBeNull();
  });

  it("formats server timestamps in local time with microsecond padding", () => {
    expect(serverTime(new Date(2026, 0, 2, 3, 4, 5, 6))).toBe("2026-01-02 03:04:05.006000");
  });
});
