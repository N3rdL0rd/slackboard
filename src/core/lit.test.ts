import { describe, expect, it } from "vitest";
import { litRequest } from "./lit";

const session = { token: "t", userId: 7 };
const base = { enabled: true, session, serial: "841428", climbUuid: "ABC" };

describe("litRequest", () => {
  it("records the climb against the controller serial", () => {
    expect(litRequest(base)).toEqual({ path: "/exhibits", fields: { user_id: 7, climb_uuid: "ABC", serial_number: "841428" } });
  });
  it("sends nothing when the user has opted out", () => {
    expect(litRequest({ ...base, enabled: false })).toBeNull();
  });
  it("sends nothing without a session or a controller serial", () => {
    expect(litRequest({ ...base, session: null })).toBeNull();
    expect(litRequest({ ...base, serial: null })).toBeNull();
  });
});
