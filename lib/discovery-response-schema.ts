/** Inline local OpenAPI references so standalone Bazaar schemas are self-contained. */
export function discoveryResponseSchema(schema: unknown, schemas: Record<string, unknown>): Record<string, unknown> {
  function expand(value: unknown, seen: Set<string>): unknown {
    if (Array.isArray(value)) return value.map((entry) => expand(entry, seen));
    if (!value || typeof value !== "object") return value;
    const object = value as Record<string, unknown>;
    if (typeof object.$ref === "string") {
      const name = object.$ref.replace(/^#\/components\/schemas\//, "");
      if (!(name in schemas) || seen.has(name)) throw Error("Invalid discovery schema reference");
      const rest = Object.fromEntries(Object.entries(object).filter(([key]) => key !== "$ref"));
      return { ...expand(schemas[name], new Set([...seen, name])) as object, ...expand(rest, seen) as object };
    }
    return Object.fromEntries(Object.entries(object).map(([key, entry]) => [key, expand(entry, seen)]));
  }
  return expand(schema, new Set()) as Record<string, unknown>;
}

// Bazaar describes output metadata, with the actual response schema under example.
// Omit a fabricated response example (especially job access tokens/signatures).
export function discoveryOutput(schema: unknown, schemas: Record<string, unknown>) {
  return {
    type: "object" as const,
    properties: { type: { type: "string", const: "json" }, example: discoveryResponseSchema(schema, schemas) },
    required: ["type"],
  };
}
