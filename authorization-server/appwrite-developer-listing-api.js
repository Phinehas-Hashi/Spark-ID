"use strict";
// Minimal read-only HTTP boundary; no write handlers or approval mutations.
function createAppwriteDeveloperListingApi({ list } = {}) {
  if (typeof list !== "function") throw new Error("Trusted developer listing required");
  return async function handler(req, res) {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, "http://internal.invalid");
      if (url.pathname !== "/v1/developer/apps" || url.search || url.hash)
        return reply(404, { error: "Not found" });
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return reply(405, { error: "Method not allowed" });
      }
      const authorization = req.headers && req.headers.authorization;
      if (typeof authorization !== "string" || !/^Bearer [^\s]{20,8192}$/.test(authorization))
        return reply(401, { error: "Authentication required" });
      const applications = await list(authorization.slice(7));
      return reply(200, { applications });
    } catch (error) {
      // Only a typed, known policy denial is 403. Infrastructure failures remain 503.
      if (error && error.code === "DEVELOPER_ACCESS_DENIED")
        return reply(403, { error: "Developer access denied" });
      return reply(503, { error: "Developer service unavailable" });
    }
  };
}
module.exports = { createAppwriteDeveloperListingApi };
