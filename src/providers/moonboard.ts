import { NUS_RX, NUS_SERVICE } from "../core/led";
import { encodeLegacy, NAME_SUBSTRING, parseDeviceName } from "../core/moonboard";
import type { Provider } from "../core/provider";
import { grades } from "../data/grades";

/**
 * MoonBoard (the legacy LED box). Local only: no account, no server, no social features. Problems come from files the user
 * imports, logs are kept on the phone. The Bluetooth packet follows the community notes and has been used on a 2016 MoonBoard.
 */
export const moonboard: Provider = {
  id: "moonboard",
  kind: "local",
  name: "MoonBoard",
  host: "",
  imgHost: "",
  links: { climb: () => "", circuit: () => "", forgotPassword: "", terms: "", privacy: "", workoutImage: () => "" },
  capabilities: { circuits: false, publicCircuits: false, follow: false, leaderboards: false, explore: false, setClimbs: false, workouts: false, logbook: false, litHistory: false },
  ble: {
    scanService: NUS_SERVICE,
    nameSubstring: NAME_SUBSTRING,
    ignoreCase: true,
    uartService: NUS_SERVICE,
    uartRx: NUS_RX,
    parseName: parseDeviceName,
    encode: (holes) => encodeLegacy(holes),
  },
  // Problems carry Font grades, which the shared scale already holds; its difficulty numbers are used as they are.
  commonGrade: (d) => grades.toCommon(d),
  fromCommonGrade: (g) => grades.fromCommon(g),
};
