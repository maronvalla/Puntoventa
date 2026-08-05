const FUNCTION_PREFIX = "/functions/v1/api";
const DEPLOYED_FUNCTION_PREFIX = "/api";

export function routeFromRequest(requestUrl) {
  const pathname = new URL(requestUrl).pathname.replace(/\/+$/, "") || "/";

  if (pathname === FUNCTION_PREFIX) return "/";
  if (pathname.startsWith(`${FUNCTION_PREFIX}/`)) {
    return pathname.slice(FUNCTION_PREFIX.length);
  }
  if (pathname === DEPLOYED_FUNCTION_PREFIX) return "/";
  if (pathname.startsWith(`${DEPLOYED_FUNCTION_PREFIX}/`)) {
    return pathname.slice(DEPLOYED_FUNCTION_PREFIX.length);
  }

  return pathname;
}

export function parseAllowedOrigins(value = "") {
  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin, configuredOrigins) {
  if (!origin || configuredOrigins.length === 0) return true;
  return configuredOrigins.includes(origin);
}

export function corsHeaders(origin, configuredOrigins) {
  const allowOrigin = configuredOrigins.length === 0
    ? "*"
    : origin && configuredOrigins.includes(origin)
      ? origin
      : configuredOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-business-id, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    Vary: "Origin",
  };
}
