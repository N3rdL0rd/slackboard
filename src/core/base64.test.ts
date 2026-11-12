import { describe, expect, it } from "vitest";
import { toBase64 } from "./base64";

describe("toBase64", () => {
  it("matches the platform encoder for every length remainder", () => {
    for (const n of [0, 1, 2, 3, 4, 19, 20]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(toBase64(b)).toBe(Buffer.from(b).toString("base64"));
    }
  });
  it("encodes a protocol header", () => {
    expect(toBase64(Uint8Array.from([1, 31, 254, 2, 84]))).toBe("AR/+AlQ=");
  });
});
