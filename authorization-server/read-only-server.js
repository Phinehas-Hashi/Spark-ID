"use strict";
// Read-only composition root. No listener starts when this module is imported.
// Requires private server environment; no approval writes or OAuth issuance.
const http = require("node:http");
const { validateListingEnvironment } = require("./listing-environment");
const { createAppwriteApplicationStore } = require("./appwrite-application-store");
const { createAppwriteDeveloperListing } = require("./appwrite-developer-listing");
const { createAppwriteDeveloperListingApi } = require("./appwrite-developer-listing-api");

function createReadOnlyDeveloperServer({ applications, auth, approvals, authOptions, approvalOptions } = {}) {
  const store = applications || createAppwriteApplicationStore();
  const list = createAppwriteDeveloperListing({
    applications: store, auth, approvals, authOptions, approvalOptions
  });
  const handler = createAppwriteDeveloperListingApi({ list });
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    // Do not allow browser-based cross-origin credential use.
    if (req.headers.origin) {
      res.writeHead(403, { "Cache-Control": "no-store", "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Browser origin not allowed" }));
      return;
    }
    void handler(req, res);
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (require.main === module) {
  // Loopback-only local validation. A public deployment requires independently
  // reviewed TLS ingress, rate limits, operational controls and secret storage.
  if (process.env.SPARK_ID_ENABLE_LOCAL_LISTING !== "true") {
    process.stderr.write("Local listing is disabled. Set SPARK_ID_ENABLE_LOCAL_LISTING=true explicitly.\\n");
    process.exitCode = 1;
  } else {
    try {
      validateListingEnvironment();
      const server = createReadOnlyDeveloperServer();
      server.listen(0, "127.0.0.1", () => {
        process.stdout.write("Read-only developer listing listening on loopback port " +
          server.address().port + "\\n");
      });
    } catch {
      process.stderr.write("Developer listing configuration unavailable.\\n");
      process.exitCode = 1;
    }
  }
}
module.exports = { createReadOnlyDeveloperServer };
