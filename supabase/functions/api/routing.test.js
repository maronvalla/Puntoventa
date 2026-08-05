import test from "node:test";
import assert from "node:assert/strict";

import {
  corsHeaders,
  isOriginAllowed,
  parseAllowedOrigins,
  routeFromRequest,
} from "./routing.js";

test("extrae la ruta pública de la Edge Function", () => {
  assert.equal(
    routeFromRequest("https://example.supabase.co/functions/v1/api/auth/login"),
    "/auth/login",
  );
  assert.equal(
    routeFromRequest("http://127.0.0.1:54321/functions/v1/api/health/"),
    "/health",
  );
  assert.equal(
    routeFromRequest("https://example.supabase.co/functions/v1/api"),
    "/",
  );
  assert.equal(routeFromRequest("https://edge-runtime.internal/api/auth/me"), "/auth/me");
  assert.equal(routeFromRequest("https://edge-runtime.internal/api"), "/");
});

test("normaliza la lista de orígenes permitidos", () => {
  assert.deepEqual(parseAllowedOrigins("https://pos.test, http://localhost:5173 "), [
    "https://pos.test",
    "http://localhost:5173",
  ]);
});

test("rechaza un origen no configurado", () => {
  const allowed = parseAllowedOrigins("https://pos.test");
  assert.equal(isOriginAllowed("https://pos.test", allowed), true);
  assert.equal(isOriginAllowed("https://otro.test", allowed), false);
  assert.equal(isOriginAllowed(null, allowed), true);
  assert.equal(
    corsHeaders("https://otro.test", allowed)["Access-Control-Allow-Origin"],
    "https://pos.test",
  );
});

test("permite cualquier origen cuando no hay una lista configurada", () => {
  const headers = corsHeaders("https://pos.test", []);
  assert.equal(headers["Access-Control-Allow-Origin"], "*");
});
