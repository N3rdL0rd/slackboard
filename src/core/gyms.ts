import type { SaveWallInput } from "./api";
import type { Board } from "./types";

export interface Gym {
  id: number;
  username: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** One board (wall) a gym has published on its account. */
export interface GymWall {
  uuid: string;
  name: string;
  productId: number;
  isAdjustable: boolean;
  angle: number;
  layoutId: number;
  productSizeId: number;
  hsm: number;
  serial: string | null;
  setIds: number[];
}

export interface GymProfile {
  id: number;
  name: string;
  city: string | null;
  province: string | null;
  address: string | null;
  walls: GymWall[];
}

type Json = Record<string, any>;

/** `/pins?gyms=1` answers `{gyms:[...]}` when signed in and `{pins:{gyms:[...]}}` anonymously. */
export function parseGyms(json: Json): Gym[] {
  const list: Json[] = json?.gyms ?? json?.pins?.gyms ?? [];
  return list
    .filter((g) => g && typeof g.latitude === "number" && typeof g.longitude === "number" && g.name)
    .map((g) => ({ id: g.id, username: g.username, name: g.name, latitude: g.latitude, longitude: g.longitude }));
}

/** `GET /users/{gymId}`: the gym's contact details plus the boards it has published. */
export function parseGymProfile(json: Json): GymProfile | null {
  const u: Json | undefined = json?.users?.[0];
  if (!u) return null;
  const walls: GymWall[] = ((u.walls as Json[]) ?? [])
    .filter((w) => w.is_listed !== false && w.layout_id != null && w.product_size_id != null)
    .map((w) => ({
      uuid: w.uuid, name: w.name, productId: w.product_id, isAdjustable: !!w.is_adjustable, angle: w.angle, layoutId: w.layout_id,
      productSizeId: w.product_size_id, hsm: w.hsm, serial: w.serial_number ?? null, setIds: (w.set_ids as number[]) ?? [],
    }));
  return {
    id: u.id, name: u.name ?? u.username, city: u.gym?.city ?? null, province: u.gym?.province ?? null, address: u.gym?.address1 ?? null, walls,
  };
}

/**
 * The name for the board added to the user's account: the gym's own name. A gym with several boards
 * gets the board's size appended so they can be told apart.
 */
export function boardNameFor(gymName: string, wallCount: number, sizeName: string): string {
  return wallCount > 1 ? `${gymName} ${sizeName}` : gymName;
}

export function wallInputFor(wall: GymWall, name: string): SaveWallInput {
  return {
    name, isAdjustable: wall.isAdjustable, angle: wall.angle, layoutId: wall.layoutId, productSizeId: wall.productSizeId,
    setIds: wall.setIds, serial: wall.serial ?? undefined,
  };
}

/** True when the user already has this exact board: same controller serial, or same layout, size and hold sets. */
/** Ids and serials only mean something within one provider, so a board on another provider never counts. */
export function alreadyHave(boards: Pick<Board, "serial" | "spec">[], wall: GymWall, provider: string): boolean {
  return boards.filter((b) => b.spec.provider === provider).some((b) =>
    (wall.serial != null && b.serial === wall.serial) ||
    (b.spec.layoutId === wall.layoutId && b.spec.productSizeId === wall.productSizeId && b.spec.hsm === wall.hsm && b.serial === wall.serial));
}

/** Gyms matching a search, nearest-first when a position is known. */
export function searchGyms(gyms: Gym[], query: string, near?: { lat: number; lon: number }): Gym[] {
  const q = query.trim().toLowerCase();
  const hits = q ? gyms.filter((g) => g.name.toLowerCase().includes(q) || g.username.toLowerCase().includes(q)) : gyms;
  if (!near) return [...hits].sort((a, b) => a.name.localeCompare(b.name));
  const d = (g: Gym) => (g.latitude - near.lat) ** 2 + ((g.longitude - near.lon) * Math.cos((near.lat * Math.PI) / 180)) ** 2;
  return [...hits].sort((a, b) => d(a) - d(b));
}

const EARTH_KM = 6371;

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** The closest gyms to a position, each with its distance in km. */
export function nearest(gyms: Gym[], near: { lat: number; lon: number }, count: number): { gym: Gym; km: number }[] {
  return gyms.map((gym) => ({ gym, km: distanceKm(near, { lat: gym.latitude, lon: gym.longitude }) })).sort((a, b) => a.km - b.km).slice(0, count);
}

/** "0.4 mi" or "0.6 km" (miles for the few regions that use them). */
export function formatDistance(km: number, miles: boolean): string {
  const v = miles ? km * 0.621371 : km;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${miles ? "mi" : "km"}`;
}
