/**
 * Runs a full sync against the live server into a SQLite file, to check the engine end to end.
 *   SB_USER=... SB_PASS=... npx tsx scripts/live-sync.ts ./live-sync.db
 */
import { signIn } from "../src/core/api";
import { openNodeDb } from "../src/core/nodeDb";
import { ensureSchema } from "../src/core/schema";
import { syncAll } from "../src/core/sync";

async function main() {
  const path = process.argv[2] ?? "./live-sync.db";
  const login = await signIn(process.env.SB_USER!, process.env.SB_PASS!);
  if (!login.ok) throw new Error(`sign-in failed: ${login.reason}`);
  const db = openNodeDb(path);
  await ensureSchema(db);
  const t0 = Date.now();
  let last = 0;
  const res = await syncAll(db, { token: login.token, userId: login.userId }, {
    onProgress: (p) => {
      if (Date.now() - last > 4000) {
        last = Date.now();
        console.log(`page ${p.page}: climbs=${p.totals.climbs ?? 0} stats=${p.totals.climb_stats ?? 0} placements=${p.totals.placements ?? 0}`);
      }
    },
  });
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${res.page} pages`);
  console.log("rows applied:", res.totals);
  for (const t of ["climbs", "climb_stats", "holes", "placements", "leds", "layouts", "walls", "ascents"]) {
    console.log(t, (await db.all<{ n: number }>(`SELECT count(*) n FROM ${t}`))[0].n);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
