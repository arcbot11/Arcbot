import { discovery } from "./discovery";
import { z } from "zod";
import { inputSchema } from "../bridge-api/model";
import { lookupReport } from "../bridge-api/lookup";
import { apiStore } from "../bridge-api/store";
import { hash } from "../bridge-api/payments";
import { boundedJson, RequestBodyError } from "../bounded-json";
import { hashSchema } from "../bridge/validation";
import {
  authorizeJob,
  authorization,
  jobToken,
  verifyAuthorization,
} from "./auth";
import { config, NAME } from "./config";
import { BridgeEngine, publicJob } from "./engine";
import { ApiError, createInput, jobInput } from "./model";
import { json, paid } from "./paid";
import { jobStore } from "./store";
import { openapi, guidance } from "./openapi";
const stepBody = z.object({ stepId: z.string().uuid() }).strict();
const txBody = stepBody.extend({ hash: hashSchema });
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url),
    path = url.pathname;
  try {
    if (req.method === "GET" && path === "/openapi.json")
      return json(openapi());
    if (req.method === "GET" && (path === "/llms.txt" || path === "/"))
      return new Response(guidance, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    if (req.method === "GET" && path === "/health")
      return json(
        {
          name: NAME,
          configured: config().configured,
          scope: "Configuration only; not a settlement or RPC health check",
        },
        config().configured ? 200 : 503,
      );
    if (req.method === "GET" && path === "/.well-known/x402")
      return json(discovery());
    if (
      req.method === "GET" &&
      ["/v1/lookup", "/v1/lookup/direct"].includes(path)
    ) {
      const lookupConfig = config(
        "lookup",
        path.endsWith("/direct") ? "direct" : "gateway",
      );
      if (
        [...url.searchParams.keys()].some(
          (k) => url.searchParams.getAll(k).length !== 1,
        )
      )
        throw new ApiError("invalid_input", "Duplicate query parameter", 400);
      if (!url.searchParams.size && !req.headers.has("payment-signature"))
        return paid(
          req,
          {},
          path,
          async () => {
            throw Error("Token query is required");
          },
          { config: lookupConfig },
        );
      const input = inputSchema.parse(Object.fromEntries(url.searchParams));
      return paid(
        req,
        input,
        `${path}?${url.searchParams.toString()}`,
        async () => {
          const r = await lookupReport(input, apiStore());
          if (r.status === "unavailable") throw Error("Lookup unavailable");
          return r;
        },
        { config: lookupConfig },
      );
    }
    // Discovery never executes a job. Paid requests still pass body and wallet
    // authorization checks below before a job is created or payment is settled.
    if (
      req.method === "POST" &&
      ["/v1/jobs", "/v1/jobs/direct"].includes(path) &&
      !req.headers.has("payment-signature")
    )
      return paid(req, {}, path, async () => {
        throw new ApiError("invalid_input", "A signed job request is required", 400);
      });
    // Shared database limits apply across replicas. Paid routes enforce their own limit.
    if (!config().configured)
      throw new ApiError(
        "not_configured",
        "Agent bridge service is not configured",
        503,
      );
    if (
      !(await apiStore().limit(
        hash(
          `agent:${req.headers.get("x-vercel-forwarded-for") || "standalone"}`,
        ),
      ))
    )
      return json(
        { error: { code: "rate_limited", message: "Retry later" } },
        429,
        { "Retry-After": "60" },
      );
    const engine = new BridgeEngine(jobStore());
    if (req.method === "POST" && path === "/v1/authorization") {
      const intent = jobInput.parse(await boundedJson(req, 12000)),
        expiresAt = Date.now() + 5 * 60_000;
      return json({
        intent,
        expiresAt,
        typedData: authorization(intent, expiresAt),
        purpose:
          "Authorize only this API job; this signature cannot move tokens. Sign each blockchain transaction separately.",
        apiFeeUSDC: config("job").price,
        directApiFeeUSDC: config("job", "direct").price,
      });
    }
    if (
      req.method === "POST" &&
      ["/v1/jobs", "/v1/jobs/direct"].includes(path)
    ) {
      const input = createInput.parse(await boundedJson(req, 14000));
      return paid(req, input, path, async (requestId) => {
        await verifyAuthorization(input);
        const j = await engine.create(input.intent, requestId);
        return {
          job: publicJob(j),
          accessToken: jobToken(j.id),
          feeScope:
            "One job, including preparation, status and recovery; gas and Circle forwarding fees are separate.",
        };
      });
    }
    const match = path.match(
      /^\/v1\/jobs\/(ab_[a-f0-9]{48})(?:\/(next|arm|renew|transactions|resume))?$/,
    );
    if (match) {
      const [, id, operation] = match;
      try {
        authorizeJob(id, req.headers.get("authorization"));
      } catch {
        throw new ApiError(
          "unauthorized",
          "Supply this job's Bearer access token",
          401,
        );
      }
      if (req.method === "GET" && !operation)
        return json(publicJob(await engine.get(id)));
      if (req.method === "POST" && operation === "next")
        return json(publicJob(await engine.next(id)));
      if (req.method === "POST" && operation === "resume")
        return json(publicJob(await engine.refresh(id)));
      if (req.method === "POST" && operation === "arm") {
        const b = stepBody.parse(await boundedJson(req, 1000));
        return json(publicJob(await engine.arm(id, b.stepId)));
      }
      if (req.method === "POST" && operation === "renew") {
        const b = stepBody.parse(await boundedJson(req, 1000));
        return json(publicJob(await engine.renew(id, b.stepId)));
      }
      if (req.method === "POST" && operation === "transactions") {
        const b = txBody.parse(await boundedJson(req, 1000));
        return json(publicJob(await engine.submit(id, b.stepId, b.hash)));
      }
    }
    return json(
      { error: { code: "not_found", message: "Unknown endpoint or method" } },
      404,
    );
  } catch (e) {
    if (e instanceof RequestBodyError)
      return json(
        { error: { code: "invalid_body", message: e.message } },
        e.status,
      );
    if (e instanceof z.ZodError)
      return json(
        {
          error: {
            code: "invalid_input",
            message: "Request does not match the documented schema",
          },
        },
        400,
      );
    if (e instanceof ApiError)
      return json({ error: { code: e.code, message: e.message } }, e.status);
    const safeMessages = new Set([
      "Not enough token balance.",
      "Approval simulation failed.",
      "Bridge gas estimate is unavailable or exceeds policy.",
      "Quote expired during verification. Review again.",
      "This wallet has a pending transaction. Wait before bridging.",
      "Not enough Base ETH for forwarding and network fees, or gas exceeds policy.",
      "Not enough Arc USDC for forwarding and network fees, or gas exceeds policy.",
      "Bridge quote verification is not configured.",
    ]);
    if (e instanceof Error && safeMessages.has(e.message))
      return json(
        { error: { code: "preparation_failed", message: e.message } },
        503,
      );
    const category =
      e instanceof Error && /^[A-Za-z]{1,60}$/.test(e.name)
        ? e.name
        : "UnknownError";
    console.warn("CTS API operation failed", {
      operation: path.split("/").at(-1),
      category:
        e instanceof Error && /^[A-Za-z]{1,60}$/.test(e.name)
          ? e.name
          : "UnknownError",
    });
    // Avoid returning RPC URLs, credentials or raw error payloads from dependencies.
    return json(
      {
        error: {
          code: "operation_unavailable",
          category,
          message:
            "Operation could not be verified. Preserve the job and transaction hashes; retry status before submitting anything again.",
        },
      },
      503,
    );
  }
}
