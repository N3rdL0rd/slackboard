import { auroraProvider } from "./aurora";

/** Decoy Board (Aurora platform). Checked against the 4.6.18 app. Not yet exercised with a login. */
export const decoy = auroraProvider({ id: "decoy", name: "Decoy Board", domain: "decoyboardapp.com", bleName: "Decoy" });
