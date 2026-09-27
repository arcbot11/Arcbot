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
import { config, DESCRIPTION, NAME } from "./config";
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
      return json({
        name: NAME,
        description: DESCRIPTION,
        openapi: "/openapi.json",
        documentation: "/llms.txt",
        status: config().enabled ? "enabled" : "not_enabled",
        routes: config().enabled
          ? [
              {
                method: "GET",
                path: "/v1/lookup",
                priceUSDC: config("lookup").price,
              },
              {
                method: "POST",
                path: "/v1/jobs",
                priceUSDC: config("job").price,
              },
            ]
          : [],
      });
    if (req.method === "GET" && path === "/v1/lookup") {
      if (
        [...url.searchParams.keys()].some(
          (k) => url.searchParams.getAll(k).length !== 1,
        )
      )
        throw new ApiError("invalid_input", "Duplicate query parameter", 400);
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
        { config: config("lookup") },
      );
    }
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
      });
    }
    if (req.method === "POST" && path === "/v1/jobs") {
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
    // Avoid returning RPC URLs, credentials or raw error payloads from dependencies.
    return json(
      {
        error: {
          code: "operation_unavailable",
          message:
            "Operation could not be verified. Preserve the job and transaction hashes; retry status before submitting anything again.",
        },
      },
      503,
    );
  }
}
