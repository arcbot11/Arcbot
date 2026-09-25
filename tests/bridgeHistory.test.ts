import { expect, it } from "vitest";
import { compactHistory, parseHistory } from "../lib/bridge/validation";
const entry = {
  id: "test",
  chain: 5042,
  hash: "0x" + "11".repeat(32),
  state: "complete",
  message: "Confirmed",
};
it("retains delivered but unfinalized transfers as unresolved history", () => {
  const delivered = { ...entry, state: "delivered", destination: 8453, destinationHash: entry.hash };
  const parsed = parseHistory(JSON.stringify([delivered]));
  const full = compactHistory([...parsed, ...Array.from({ length: 200 }, (_, i) => ({ ...parsed[0], id: `done-${i}`, state: "complete" as const }))]);
  expect(full).toHaveLength(200);
  expect(full[0].state).toBe("delivered");
  expect(() => parseHistory(JSON.stringify([{ ...delivered, destinationHash: undefined }]))).toThrow();
});
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
