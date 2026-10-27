import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { createPostgresOidcAdapter } = require('./postgres-oidc-adapter.js');
const { createOidcHandoffService } = require('./oidc-handoff-service.js');
const { createOidcHandoffApi } = require('./oidc-handoff-api.js');

const ALLOWED_SCOPES = new Set(['openid', 'profile', 'email']);
const ACCOUNT_ID = /^[A-Za-z0-9_-]{3,128}$/;

function validateConfig({ issuer, client, jwks, cookieKeys, pool, authenticateAppwriteJwt, localOnly, trustedProxy }) {
  let issuerUrl;
  try { issuerUrl = new URL(issuer); } catch { throw new Error('A valid OIDC issuer URL is required'); }
  const loopbackHttp = issuerUrl.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(issuerUrl.hostname) && localOnly === true;
  if (
    issuerUrl.protocol !== 'https:' && !loopbackHttp ||
    issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash || issuerUrl.pathname !== '/' && issuerUrl.pathname !== ''
  ) throw new Error('OIDC issuer must be a canonical HTTPS URL (loopback HTTP is local-only)');
  if (!client || typeof client !== 'object' || Array.isArray(client)) throw new Error('Static Spark Studio OIDC client configuration is required');
  if (
    typeof client.client_id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(client.client_id) ||
    typeof client.client_secret !== 'string' || client.client_secret.length < 32 ||
    !Array.isArray(client.redirect_uris) || client.redirect_uris.length < 1 || client.redirect_uris.length > 5 ||
    client.redirect_uris.some((uri) => {
      try { const parsed = new URL(uri); return parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash; }
      catch { return true; }
    })
  ) throw new Error('Invalid Spark Studio OIDC client configuration');
  if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length < 1 || jwks.keys.length > 5 ||
      !jwks.keys.some((key) => key?.kty === 'RSA' && typeof key.d === 'string' && key.kid) ||
      jwks.keys.some((key) => !key || !['RSA', 'EC'].includes(key.kty) || typeof key.d !== 'string' || !key.kid)) {
    throw new Error('An RSA private signing key with a key ID is required');
  }
  if (!Array.isArray(cookieKeys) || cookieKeys.length < 1 || cookieKeys.some((key) => typeof key !== 'string' || key.length < 32)) {
    throw new Error('Long random OIDC cookie-signing keys are required');
  }
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function' || typeof authenticateAppwriteJwt !== 'function') {
    throw new Error('PostgreSQL and trusted Appwrite authentication adapters are required');
  }
  if (typeof trustedProxy !== 'boolean') throw new Error('Explicit trustedProxy setting is required');
  return { issuer: issuerUrl.origin, client, jwks, cookieKeys, pool, authenticateAppwriteJwt, trustedProxy };
}

function reply(res, status, body, contentType = 'application/json; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    ...extraHeaders,
  });
  res.end(body);
}

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function requestedScopes(details) {
  const raw = typeof details.params.scope === 'string' ? details.params.scope.trim() : '';
  const scopes = raw ? [...new Set(raw.split(/\s+/))] : [];
  if (scopes.length < 1 || scopes.length > 3 || !scopes.includes('openid') || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    throw new Error('Unsupported OIDC scope request');
  }
  return scopes;
}

function interactionPath(uid) {
  return `/interaction/${encodeURIComponent(uid)}`;
}

function createInteractionHtml({ uid, handoff, clientName, scopes }) {
  const nonce = crypto.randomBytes(18).toString('base64');
  const path = interactionPath(uid);
  const deepLink = `sparkid://oidc-login?request_token=${encodeURIComponent(handoff.ticket)}`;
  const list = scopes.map((scope) => `<li>${htmlEscape(scope)}</li>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continue with Spark ID</title><style nonce="${nonce}">body{font:16px system-ui,sans-serif;background:#08101f;color:#eef3ff;margin:0;min-height:100vh;display:grid;place-items:center}.card{max-width:440px;margin:24px;padding:28px;background:#111b30;border:1px solid #273752;border-radius:18px}h1{font-size:1.5rem}a{display:block;text-align:center;background:#ffb703;color:#111;padding:13px;border-radius:10px;text-decoration:none;font-weight:700}small{color:#aab7ce}li{margin:6px 0}</style></head><body><main class="card"><h1>Continue with Spark ID</h1><p><strong>${htmlEscape(clientName)}</strong> is requesting:</p><ul>${list}</ul><p>Open Spark ID to review and approve this sign-in. This request expires soon.</p><a href="${htmlEscape(deepLink)}" rel="noreferrer">Open Spark ID</a><p id="status" aria-live="polite"><small>Waiting for approval…</small></p></main><script nonce="${nonce}">(async()=>{const p=${JSON.stringify(path)};const s=document.getElementById('status');for(;;){try{const r=await fetch(p+'/status',{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error();const d=await r.json();if(d.status==='approved'){location.replace(p+'/continue');return}if(d.status==='expired'||d.status==='denied'){s.textContent='This sign-in request expired or was declined. Return to Spark Studio and try again.';return}}catch{}await new Promise(resolve=>setTimeout(resolve,1500))}})();</script></body></html>`;
  return { nonce, html };
}

/**
 * Creates a local OIDC server. It does not listen until the returned server is
 * explicitly started by its caller. Public deployments need separate review.
 */
export async function createSparkOidcServer(config) {
  const validated = validateConfig(config);
  const { Provider } = await import('oidc-provider');
  const handoffs = createOidcHandoffService({
    pool: validated.pool,
    authenticateAppwriteJwt: validated.authenticateAppwriteJwt,
  });
  const handoffApi = createOidcHandoffApi({ handoffs });
  const provider = new Provider(validated.issuer, {
    adapter: createPostgresOidcAdapter(validated.pool),
    clients: [{
      client_id: validated.client.client_id,
      client_secret: validated.client.client_secret,
      client_name: 'Spark Studio',
      redirect_uris: [...validated.client.redirect_uris],
      response_types: ['code'],
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'RS256',
    }],
    jwks: validated.jwks,
    cookies: { keys: validated.cookieKeys },
    scopes: ['openid', 'profile', 'email'],
    claims: {
      openid: ['sub'],
      profile: ['name'],
      email: ['email', 'email_verified'],
    },
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      deviceFlow: { enabled: false },
    },
    interactions: {
      url(_ctx, interaction) { return interactionPath(interaction.uid); },
    },
    async findAccount(_ctx, subject) {
      if (typeof subject !== 'string' || !ACCOUNT_ID.test(subject)) return undefined;
      const result = await validated.pool.query(
        `SELECT email, email_verified, display_name FROM spark_oidc_accounts WHERE subject = $1`,
        [subject],
      );
      if (result.rows.length !== 1 || result.rows[0].email_verified !== true) return undefined;
      const account = result.rows[0];
      return {
        accountId: subject,
        async claims(_use, scope) {
          const granted = new Set((scope || '').split(/\s+/));
          const claims = { sub: subject };
          if (granted.has('profile')) claims.name = account.display_name;
          if (granted.has('email')) {
            claims.email = account.email;
            claims.email_verified = true;
          }
          return claims;
        },
      };
    },
  });
  provider.proxy = validated.trustedProxy;
  const oidcCallback = provider.callback();

  async function interactionDetails(req, res, uid) {
    const details = await provider.interactionDetails(req, res);
    if (details.uid !== uid || details.params.client_id !== validated.client.client_id) {
      throw new Error('OIDC interaction does not match this client');
    }
    if (typeof details.params.prompt === 'string' && details.params.prompt.split(/\s+/).includes('none')) {
      await provider.interactionFinished(req, res, { error: 'login_required' });
      return null;
    }
    return details;
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, validated.issuer); }
    catch { return reply(res, 400, JSON.stringify({ error: 'invalid_request' })); }

    if (req.method === 'GET' && url.pathname === '/healthz' && !url.search) {
      return reply(res, 200, JSON.stringify({ status: 'ok' }));
    }

    const detailsMatch = /^\/interaction\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
    const statusMatch = /^\/interaction\/([A-Za-z0-9_-]{1,128})\/status$/.exec(url.pathname);
    const continueMatch = /^\/interaction\/([A-Za-z0-9_-]{1,128})\/continue$/.exec(url.pathname);

    if (detailsMatch && req.method === 'GET' && !url.search) {
      try {
        const details = await interactionDetails(req, res, detailsMatch[1]);
        if (!details || res.writableEnded) return;
        const scopes = requestedScopes(details);
        const redirectUri = details.params.redirect_uri;
        const handoff = await handoffs.create({
          interactionUid: details.uid,
          clientId: details.params.client_id,
          clientName: 'Spark Studio',
          redirectUri,
          scopes,
        });
        const page = createInteractionHtml({ uid: details.uid, handoff, clientName: 'Spark Studio', scopes });
        return reply(res, 200, page.html, 'text/html; charset=utf-8', {
          'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${page.nonce}'; style-src 'nonce-${page.nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        });
      } catch {
        return reply(res, 400, 'This Spark ID sign-in request is invalid or expired.', 'text/plain; charset=utf-8');
      }
    }

    if (statusMatch && req.method === 'GET' && !url.search) {
      try {
        const details = await interactionDetails(req, res, statusMatch[1]);
        if (!details || res.writableEnded) return;
        const status = await handoffs.status(details.uid);
        return reply(res, 200, JSON.stringify({ status }));
      } catch {
        return reply(res, 400, JSON.stringify({ status: 'expired' }));
      }
    }

    if (continueMatch && req.method === 'GET' && !url.search) {
      try {
        const details = await interactionDetails(req, res, continueMatch[1]);
        if (!details || res.writableEnded) return;
        const identity = await handoffs.approvedIdentity(details.uid);
        if (!identity) {
          return reply(res, 403, 'Spark ID approval is required in the Spark ID app.', 'text/plain; charset=utf-8');
        }
        const scopes = requestedScopes(details);
        if (identity.scopes.length !== scopes.length || scopes.some((scope) => !identity.scopes.includes(scope))) {
          return reply(res, 400, 'The approved scopes do not match this sign-in request.', 'text/plain; charset=utf-8');
        }
        const grant = new provider.Grant({ accountId: identity.subject, clientId: validated.client.client_id });
        grant.addOIDCScope(identity.scopes);
        const grantId = await grant.save();
        await provider.interactionFinished(req, res, {
          login: { accountId: identity.subject, remember: false },
          consent: { grantId },
        });
        return;
      } catch {
        if (!res.headersSent) {
          return reply(res, 400, 'Spark ID could not complete this sign-in. Start again from Spark Studio.', 'text/plain; charset=utf-8');
        }
        if (!res.writableEnded) res.end();
        return;
      }
    }

    if (url.pathname.startsWith('/internal/oidc/')) return handoffApi(req, res);
    try {
      await oidcCallback(req, res);
    } catch {
      if (!res.headersSent) reply(res, 500, JSON.stringify({ error: 'server_error' }));
      else if (!res.writableEnded) res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return Object.freeze({ provider, handoffs, server });
}

export function parseJsonSecret(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 32768) throw new Error(`${label} is required`);
  try { return JSON.parse(value); } catch { throw new Error(`${label} is invalid JSON`); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.stderr.write('This module is a local integration component. Configure an isolated database and reviewed secrets before starting a server.\n');
  process.exitCode = 1;
}
