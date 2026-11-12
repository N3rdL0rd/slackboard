import { describe, expect, it } from "vitest";
import { alreadyHave, boardNameFor, distanceKm, formatDistance, nearest, parseGymProfile, parseGyms, searchGyms, wallInputFor, type Gym } from "./gyms";

const gym = (name: string, lat = 0, lon = 0): Gym => ({ id: 1, username: name.replace(/ /g, "_").toLowerCase(), name, latitude: lat, longitude: lon });

describe("gyms", () => {
  it("reads pins from both response shapes and drops entries without a position", () => {
    const g = { id: 1, username: "u", name: "A", latitude: 1, longitude: 2 };
    expect(parseGyms({ gyms: [g, { id: 2, name: "no position" }] })).toHaveLength(1);
    expect(parseGyms({ pins: { gyms: [g] } })).toHaveLength(1);
    expect(parseGyms({})).toEqual([]);
  });

  it("reads a gym's published boards", () => {
    const p = parseGymProfile({ users: [{ id: 83599, username: "adv", name: "Adventure Rock WKP", gym: { city: "Milwaukee", province: "WI", address1: "613 S 2nd St" },
      walls: [{ uuid: "W", name: "Tension Board", product_id: 5, is_adjustable: true, angle: 40, layout_id: 11, product_size_id: 8, hsm: 3, serial_number: "841428", is_listed: true, set_ids: [12, 13] },
        { uuid: "gone", is_listed: false, layout_id: 1, product_size_id: 1 }] }] })!;
    expect(p).toMatchObject({ name: "Adventure Rock WKP", city: "Milwaukee" });
    expect(p.walls).toEqual([{ uuid: "W", name: "Tension Board", productId: 5, isAdjustable: true, angle: 40, layoutId: 11, productSizeId: 8, hsm: 3, serial: "841428", setIds: [12, 13] }]);
    expect(parseGymProfile({ users: [] })).toBeNull();
  });

  it("names the board after the gym, adding the size only when the gym has several", () => {
    expect(boardNameFor("Adventure Rock WKP", 1, "12 high x 8 wide")).toBe("Adventure Rock WKP");
    expect(boardNameFor("Big Gym", 2, "12 high x 8 wide")).toBe("Big Gym 12 high x 8 wide");
  });

  it("copies the gym's board setup, including the controller serial", () => {
    const wall = { uuid: "W", name: "Tension Board", productId: 5, isAdjustable: true, angle: 40, layoutId: 11, productSizeId: 8, hsm: 3, serial: "841428", setIds: [12, 13] };
    expect(wallInputFor(wall, "Adventure Rock WKP")).toEqual({ name: "Adventure Rock WKP", isAdjustable: true, angle: 40, layoutId: 11, productSizeId: 8, setIds: [12, 13], serial: "841428" });
    expect(wallInputFor({ ...wall, serial: null }, "x").serial).toBeUndefined();
  });

  it("spots a board the user already has", () => {
    const wall = { uuid: "W", name: "", productId: 5, isAdjustable: true, angle: 40, layoutId: 11, productSizeId: 8, hsm: 3, serial: "841428", setIds: [12, 13] };
    const mine = (serial: string | null, size = 8) => ({ serial, spec: { provider: "tension", layoutId: 11, productSizeId: size, hsm: 3 } }) as never;
    expect(alreadyHave([mine("841428", 6)], wall, "tension")).toBe(true); // same controller
    expect(alreadyHave([mine(null)], { ...wall, serial: null }, "tension")).toBe(true); // same setup, neither has a serial
    expect(alreadyHave([mine("111", 8)], wall, "tension")).toBe(false);
    expect(alreadyHave([mine("841428", 6)], wall, "decoy")).toBe(false); // same ids on another brand are a different board
  });

  it("searches by name and sorts by distance when a position is known", () => {
    const gyms = [gym("Far Rock", 40, -100), gym("Adventure Rock WKP", 43, -87.9), gym("Near Boulders", 43.1, -88)];
    expect(searchGyms(gyms, "rock").map((g) => g.name)).toEqual(["Adventure Rock WKP", "Far Rock"]);
    expect(searchGyms(gyms, "", { lat: 43, lon: -88 }).map((g) => g.name)).toEqual(["Adventure Rock WKP", "Near Boulders", "Far Rock"]);
  });

  it("measures distance and finds the closest gyms", () => {
    // Milwaukee to Chicago is about 130 km.
    expect(distanceKm({ lat: 43.04, lon: -87.91 }, { lat: 41.88, lon: -87.63 })).toBeGreaterThan(125);
    expect(distanceKm({ lat: 43.04, lon: -87.91 }, { lat: 41.88, lon: -87.63 })).toBeLessThan(135);
    const gyms = [gym("Chicago", 41.88, -87.63), gym("Near", 43.03, -87.9), gym("Madison", 43.07, -89.4)];
    expect(nearest(gyms, { lat: 43.04, lon: -87.91 }, 2).map((n) => n.gym.name)).toEqual(["Near", "Madison"]);
    expect(formatDistance(1, true)).toBe("0.6 mi");
    expect(formatDistance(25, false)).toBe("25 km");
  });
});
