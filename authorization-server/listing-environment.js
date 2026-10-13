"use strict";
// Validate required private configuration without echoing secret values.
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
function validateListingEnvironment(env = process.env) {
  const required = ["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY",
    "APPWRITE_DATABASE_ID", "APPWRITE_APPROVALS_TABLE_ID", "APPWRITE_APPLICATIONS_TABLE_ID"];
  for (const key of required) {
    if (typeof env[key] !== "string" || !env[key].trim() ||
        /^(YOUR_|REPLACE_WITH_)/.test(env[key])) throw new Error("Missing or placeholder configuration: " + key);
  }
  let url;
  try { url = new URL(env.APPWRITE_ENDPOINT); } catch { throw new Error("Invalid APPWRITE_ENDPOINT"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/v1") throw new Error("Invalid APPWRITE_ENDPOINT");
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(env.APPWRITE_PROJECT_ID)) throw new Error("Invalid APPWRITE_PROJECT_ID");
  for (const key of ["APPWRITE_DATABASE_ID", "APPWRITE_APPROVALS_TABLE_ID", "APPWRITE_APPLICATIONS_TABLE_ID"]) {
    if (!ID.test(env[key])) throw new Error("Invalid " + key);
  }
  if (env.SPARK_ID_ENABLE_LOCAL_LISTING !== undefined &&
      !["true", "false"].includes(env.SPARK_ID_ENABLE_LOCAL_LISTING))
    throw new Error("Invalid SPARK_ID_ENABLE_LOCAL_LISTING");
  return true;
}
module.exports = { validateListingEnvironment };
