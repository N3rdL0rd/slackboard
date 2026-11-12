import { AURORA_ADVERTISED_SERVICE, encodeV2, encodeV3, NUS_RX, NUS_SERVICE } from "../core/led";
import type { Provider, ProviderBle } from "../core/provider";
import { grades } from "../data/grades";

/**
 * Every Aurora-platform brand talks the same wire protocol: same endpoints and sync tables, same
 * Bluetooth service and packets. A brand differs by its domain, its Bluetooth name substring and the data its server returns.
 */
export function auroraBle(nameSubstring: string, ledsPerHold = 1): ProviderBle {
  return {
    scanService: AURORA_ADVERTISED_SERVICE,
    nameSubstring,
    uartService: NUS_SERVICE,
    uartRx: NUS_RX,
    // `<Brand><anything>#<serial>@<apiLevel>`; the level is 2 when absent.
    parseName: (name) => {
      const level = /@([0-9]+)/.exec(name)?.[1];
      return { displayName: name.split(/[#@]/)[0], serial: /#([a-z0-9]+)/i.exec(name)?.[1] ?? null, apiLevel: level ? parseInt(level, 10) : 2 };
    },
    encode: (holes, apiLevel) => (apiLevel >= 3 ? encodeV3(holes) : encodeV2(holes, ledsPerHold)),
  };
}

export function auroraProvider(opts: { id: string; name: string; domain: string; bleName: string; ledsPerHold?: number }): Provider {
  const host = `https://${opts.domain}`;
  return {
    id: opts.id,
    kind: "remote",
    name: opts.name,
    host,
    imgHost: `https://api.${opts.domain}/img`,
    links: {
      climb: (uuid) => `${host}/climbs/${uuid.toLowerCase()}`,
      circuit: (uuid) => `${host}/circuits/${uuid.toLowerCase()}`,
      forgotPassword: `${host}/forgot-password`,
      terms: `${host}/terms-of-use`,
      privacy: `${host}/privacy-policy`,
      workoutImage: (template) => `${host}/img/workouts/${template}.png`,
    },
    capabilities: { circuits: true, publicCircuits: true, follow: true, leaderboards: true, explore: true, setClimbs: true, workouts: true, logbook: true, litHistory: true },
    ble: auroraBle(opts.bleName, opts.ledsPerHold),
    commonGrade: (d) => grades.toCommon(d),
    fromCommonGrade: (g) => grades.fromCommon(g),
  };
}
