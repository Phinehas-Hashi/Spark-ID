"use strict";
const http = require("node:http");

// Injectable HTTP boundary. No server starts on import. Deploy only behind HTTPS.
// Credential is an opaque session token; never place it in a URL.
function createDeveloperApi({ workspace, maxBytes = 16384 } = {}) {
  if (!workspace || typeof workspace.list !== "function" || typeof workspace.register !== "function" ||
      typeof workspace.replaceRedirects !== "function") throw new Error("Developer workspace required");
  return async function handler(req, res) {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, "http://internal.invalid");
      if (url.search || url.hash) return reply(400, { error: "Query parameters are not supported" });
      const match = /^\/v1\/developer\/apps\/([A-Za-z0-9_-]{8,128})\/redirects$/.exec(url.pathname);
      const listing = url.pathname === "/v1/developer/apps";
      if (!listing && !match) return reply(404, { error: "Not found" });
      if ((listing && !["GET", "POST"].includes(req.method)) || (match && req.method !== "PUT")) {
        res.setHeader("Allow", listing ? "GET, POST" : "PUT");
        return reply(405, { error: "Method not allowed" });
      }
      const authorization = req.headers.authorization;
      if (typeof authorization !== "string" || !/^Bearer [^\s]{20,8192}$/.test(authorization)) return reply(401, { error: "Authentication required" });
      const credential = authorization.slice(7);
      if (req.method === "GET") return reply(200, { applications: await workspace.list(credential) });
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers["content-type"] || "")) return reply(415, { error: "JSON required" });
      let length = 0, parts = [];
      for await (const chunk of req) {
        length += chunk.length;
        if (length > maxBytes) return reply(413, { error: "Request too large" });
        parts.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return reply(400, { error: "Invalid JSON" }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "JSON object required" });
      if (listing) {
        if (Object.keys(body).some(key => !["name", "type", "redirects"].includes(key))) return reply(400, { error: "Unexpected fields" });
        return reply(201, { application: await workspace.register(credential, body) });
      }
      if (Object.keys(body).some(key => key !== "redirects")) return reply(400, { error: "Unexpected fields" });
      return reply(200, { application: await workspace.replaceRedirects(credential, match[1], body.redirects) });
    } catch (error) {
      // Do not expose database, authorization, or audit internals in public responses.
      if (/approval required|Verified developer required|Unauthenticated developer/.test(error.message)) return reply(403, { error: "Developer access denied" });
      if (/Invalid |Duplicate |HTTPS |redirect|registration/.test(error.message)) return reply(400, { error: "Invalid application request" });
      return reply(503, { error: "Developer service unavailable" });
    }
  };
}
module.exports = { createDeveloperApi };
