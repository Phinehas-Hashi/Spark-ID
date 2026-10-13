"use strict";
// Internal, dependency-injected HTTP handler. NOT a deployed or public OAuth service.
// Inject createApprovedDeveloperService({ directory, authenticate, lookupApproval }).
const { createApprovedDeveloperService } = require("./access-control");
function createDeveloperHttpHandler(options) {
  const service = createApprovedDeveloperService(options);
  return async function handle(req, res) {
    const reply = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(data));
    };
    const method = req.method;
    const url = req.url;
    if (!["GET", "POST"].includes(method) || typeof url !== "string") return reply(404, { error: "not_found" });
    const match = /^\/internal\/developer\/apps(?:\/(sid_[0-9a-f]{32}))?$/.exec(url);
    if (!match || (method === "POST" && match[1]) || (method === "GET" && !match[1])) return reply(404, { error: "not_found" });
    const auth = req.headers.authorization;
    if (typeof auth !== "string" || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth))
      return reply(401, { error: "unauthorized" });
    const credential = auth.slice(7);
    try {
      if (method === "GET") {
        const record = await service.get(credential, match[1]);
        return record ? reply(200, record) : reply(404, { error: "not_found" });
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
        return reply(415, { error: "unsupported_media_type" });
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString("utf8");
        if (Buffer.byteLength(body) > 16384) return reply(413, { error: "payload_too_large" });
      }
      let input;
      try { input = JSON.parse(body); } catch { return reply(400, { error: "invalid_json" }); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return reply(400, { error: "invalid_json" });
      const record = await service.register(credential, input);
      return reply(201, record);
    } catch (error) {
      // No credential, account or internal exception details in responses.
      if (/Unauthenticated developer|Invalid credential/.test(error.message || "")) return reply(403, { error: "forbidden" });
      if (/Invalid |required|must |redirect|scope|name/i.test(error.message || "")) return reply(400, { error: "invalid_registration" });
      return reply(503, { error: "service_unavailable" });
    }
  };
}
module.exports = { createDeveloperHttpHandler };
