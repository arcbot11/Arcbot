import { expect, it } from "vitest";
import { parseHistory } from "../lib/bridge/validation";
const entry = {
  id: "test",
  chain: 5042,
  hash: "0x" + "11".repeat(32),
  state: "complete",
  message: "Confirmed",
};
it("reads a confirmed record while stripping untrusted extra fields", () => {
  expect(
    parseHistory(JSON.stringify([{ ...entry, injected: "ignore" }])),
  ).toEqual([entry]);
});
it.each([
  null,
  {},
  [null],
  [{ ...entry, state: "anything" }],
  [{ ...entry, hash: "not a hash" }],
  [{ ...entry, hash: undefined }],
  [{ ...entry, chain: 1 }],
  [{ ...entry, destinationHash: "javascript:alert(1)" }],
  [entry, entry],
  [{ ...entry, state: "unknown" }],
])("rejects malformed or ambiguous history %j", (v) => {
  expect(() => parseHistory(JSON.stringify(v))).toThrow("history is invalid");
});
it("accepts missing storage but never silently replaces corrupt storage", () => {
  expect(parseHistory(null)).toEqual([]);
  expect(() => parseHistory("{broken")).toThrow();
});
it("rejects oversized history before a signing request can be persisted", () => {
  expect(() =>
    parseHistory(
      JSON.stringify(
        Array.from({ length: 201 }, (_, i) => ({ ...entry, id: String(i) })),
      ),
    ),
  ).toThrow();
});
