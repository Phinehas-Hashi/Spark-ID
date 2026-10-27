"use strict";

const MAX_BODY_BYTES = 4096;

function createOidcHandoffApi({ handoffs } = {}) {
  if (!handoffs || typeof handoffs.details !== "function" || typeof handoffs.approve !== "function" || typeof handoffs.deny !== "function") {
    throw new Error("OIDC handoff service is required");
  }

  return async function handle(req, res) {
    const reply = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(JSON.stringify(data));
    };

    if (req.method !== "POST" || ![
      "/internal/oidc/handoff/details",
      "/internal/oidc/handoff/approve",
      "/internal/oidc/handoff/deny",
    ].includes(req.url)) {
      return reply(404, { error: "not_found" });
    }
    if (req.headers.origin) return reply(403, { error: "forbidden" });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
      return reply(415, { error: "unsupported_media_type" });
    }

    let body = "";
    try {
      for await (const chunk of req) {
        body += chunk.toString("utf8");
        if (Buffer.byteLength(body) > MAX_BODY_BYTES) return reply(413, { error: "payload_too_large" });
      }
    } catch {
      return reply(400, { error: "invalid_request" });
    }

    let input;
    try { input = JSON.parse(body); } catch { return reply(400, { error: "invalid_request" }); }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).length !== 1 || typeof input.ticket !== "string") {
      return reply(400, { error: "invalid_request" });
    }

    if (req.url === "/internal/oidc/handoff/details") {
      try {
        const details = await handoffs.details(input.ticket);
        return details ? reply(200, details) : reply(404, { error: "request_expired" });
      } catch {
        return reply(503, { error: "service_unavailable" });
      }
    }

    if (req.url === "/internal/oidc/handoff/deny") {
      try {
        const denied = await handoffs.deny(input.ticket);
        return denied ? reply(200, { denied: true }) : reply(404, { error: "request_expired" });
      } catch {
        return reply(503, { error: "service_unavailable" });
      }
    }

    const appwriteJwt = req.headers["x-spark-id-jwt"];
    if (typeof appwriteJwt !== "string") return reply(401, { error: "unauthorized" });
    try {
      await handoffs.approve({ ticket: input.ticket, appwriteJwt });
      return reply(200, { approved: true });
    } catch (error) {
      if (/verified Spark ID account|required/i.test(error.message || "")) return reply(403, { error: "account_not_eligible" });
      if (/invalid|expired|unavailable/i.test(error.message || "")) return reply(404, { error: "request_expired" });
      return reply(503, { error: "service_unavailable" });
    }
  };
}

module.exports = { MAX_BODY_BYTES, createOidcHandoffApi };
