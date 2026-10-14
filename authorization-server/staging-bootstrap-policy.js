"use strict";

const STAGING_PROJECT = "6ace02c3002acdb7604d";
const PRODUCTION_PROJECT = "6accc223002dbb161c74";
const EXPECTED_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const SUBJECT = /^[A-Za-z0-9_-]{3,128}$/;

function validateStagingBootstrap(config = {}) {
  const {
    endpoint,
    projectId,
    confirmedProjectId,
    administratorSubject,
    developerSubject,
    initialStatus = "pending",
    enabled = false
  } = config;

  if (
    projectId !== STAGING_PROJECT ||
    projectId === PRODUCTION_PROJECT ||
    confirmedProjectId !== STAGING_PROJECT
  ) {
    throw new Error("Explicit isolated staging project confirmation required");
  }

  if (endpoint !== EXPECTED_ENDPOINT) {
    throw new Error("Unexpected staging endpoint");
  }

  if (
    typeof administratorSubject !== "string" ||
    !SUBJECT.test(administratorSubject) ||
    typeof developerSubject !== "string" ||
    !SUBJECT.test(developerSubject) ||
    administratorSubject === developerSubject
  ) {
    throw new Error("Separate valid administrator and developer identities required");
  }

  if (initialStatus !== "pending" || enabled !== false) {
    throw new Error("Bootstrap must create only a disabled pending record");
  }

  return Object.freeze({
    projectId: STAGING_PROJECT,
    developerSubject,
    status: "pending",
    enabled: false
  });
}

module.exports = { validateStagingBootstrap };
