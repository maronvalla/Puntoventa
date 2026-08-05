import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { jwtVerify, SignJWT } from "npm:jose@5";

import {
  corsHeaders,
  isOriginAllowed,
  parseAllowedOrigins,
  routeFromRequest,
} from "./routing.js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const jwtSecret = Deno.env.get("LEGACY_JWT_SECRET") || "";
const jwtExpiresIn = Deno.env.get("JWT_EXPIRES_IN") || "7d";
const configuredOrigins = parseAllowedOrigins(Deno.env.get("FRONTEND_URLS") || "");

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type BusinessRecord = {
  id: string;
  name: string;
  address: string;
  active: boolean;
};

type DbUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  name: string;
  role: "OWNER" | "CASHIER";
  active: boolean;
  businessId: string | null;
  business: BusinessRecord | null;
};

const userSelection = `
  id,
  username,
  email,
  password,
  name,
  role,
  active,
  businessId,
  business:businesses(id, name, address, active)
`;

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function publicUser(user: DbUser) {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

async function findUserByLogin(login: string) {
  const usernameResult = await db
    .from("users")
    .select(userSelection)
    .eq("username", login)
    .eq("active", true)
    .maybeSingle();

  if (usernameResult.error) throw usernameResult.error;
  if (usernameResult.data) return usernameResult.data as unknown as DbUser;

  const emailResult = await db
    .from("users")
    .select(userSelection)
    .eq("email", login)
    .eq("active", true)
    .maybeSingle();

  if (emailResult.error) throw emailResult.error;
  return emailResult.data as unknown as DbUser | null;
}

async function findUserById(id: string) {
  const result = await db
    .from("users")
    .select(userSelection)
    .eq("id", id)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data as unknown as DbUser | null;
}

function secretKey() {
  if (!jwtSecret) throw new Error("Falta configurar LEGACY_JWT_SECRET");
  return new TextEncoder().encode(jwtSecret);
}

async function createToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(jwtExpiresIn)
    .sign(secretKey());
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);
  const verification = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
  const userId = String(verification.payload.userId || "");
  if (!userId) return null;

  const user = await findUserById(userId);
  if (!user?.active) return null;
  if (user.role === "CASHIER" && (!user.business || !user.business.active)) return null;
  return user;
}

async function requireUser(request: Request, headers: Record<string, string>) {
  const user = await authenticatedUser(request).catch(() => null);
  if (!user) {
    return { response: json({ error: "Token inválido o expirado" }, 401, headers) };
  }
  return { user };
}

function requireOwner(user: DbUser, headers: Record<string, string>) {
  if (user.role !== "OWNER") {
    return json({ error: "Acceso exclusivo del dueño" }, 403, headers);
  }
  return null;
}

async function resolveBusiness(request: Request, user: DbUser) {
  const businessId = user.role === "OWNER"
    ? String(request.headers.get("x-business-id") || "").trim()
    : user.businessId;

  if (!businessId) return { error: "Seleccioná un negocio", status: 400 };
  if (user.role === "CASHIER" && businessId !== user.businessId) {
    return { error: "No autorizado para este negocio", status: 403 };
  }

  const result = await db
    .from("businesses")
    .select("id, name, address, active")
    .eq("id", businessId)
    .eq("active", true)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) return { error: "Negocio inexistente o desactivado", status: 403 };
  return { business: result.data as BusinessRecord };
}

function formatBusinessProduct(item: Record<string, unknown>) {
  const productValue = item.product;
  const product = (Array.isArray(productValue) ? productValue[0] : productValue) as
    | Record<string, unknown>
    | null;

  return {
    id: item.id,
    productId: item.productId,
    name: product?.name,
    code: product?.code,
    barcode: product?.barcode,
    catalogActive: product?.active,
    price: Number(item.price),
    costPrice: Number(item.costPrice),
    stock: item.stock,
    criticalStock: item.criticalStock,
    active: item.active,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

const businessProductSelection = `
  id,
  productId,
  price,
  costPrice,
  stock,
  criticalStock,
  active,
  createdAt,
  updatedAt,
  product:products!inner(id, name, code, barcode, active)
`;

async function fetchBusinessProduct(id: string, businessId: string) {
  const result = await db
    .from("business_products")
    .select(businessProductSelection)
    .eq("id", id)
    .eq("businessId", businessId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data ? formatBusinessProduct(result.data) : null;
}

const saleSelection = "*, items:sale_items(*)";
const purchaseSelection = "*, items:purchase_items(*)";

function formatSale(value: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    ...value,
    total: Number(value.total),
    cashAmount: Number(value.cashAmount),
    transferAmount: Number(value.transferAmount),
    items: items.map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        ...item,
        unitPrice: Number(item.unitPrice),
        itemCostPrice: Number(item.itemCostPrice),
        lineTotal: Number(item.lineTotal),
      };
    }),
  };
}

function formatPurchase(value: Record<string, unknown>): Record<string, unknown> {
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    ...value,
    totalCost: Number(value.totalCost),
    items: items.map((raw) => {
      const item = raw as Record<string, unknown>;
      return { ...item, costPrice: Number(item.costPrice) };
    }),
  };
}

function paymentData(methodValue: unknown, total: number, cashValue: unknown, transferValue: unknown) {
  const method = String(methodValue || "").toUpperCase();
  if (method === "CASH") return { paymentMethod: "CASH", cashAmount: total, transferAmount: 0 };
  if (method === "TRANSFER") return { paymentMethod: "TRANSFER", cashAmount: 0, transferAmount: total };
  if (method === "MIXED") {
    const cash = Number(cashValue);
    const transfer = Number(transferValue);
    if (!Number.isFinite(cash) || !Number.isFinite(transfer) || cash < 0 || transfer < 0 ||
      Math.abs(cash + transfer - total) > 0.01) {
      throw new Error("El pago mixto no coincide con el total");
    }
    return { paymentMethod: "MIXED", cashAmount: cash, transferAmount: transfer };
  }
  throw new Error("Método de pago inválido");
}

function dayKeyTucuman() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchSale(id: string, businessId: string) {
  const result = await db
    .from("sales")
    .select(saleSelection)
    .eq("id", id)
    .eq("businessId", businessId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? formatSale(result.data) : null;
}

async function fetchPurchase(id: string, businessId: string) {
  const result = await db
    .from("purchases")
    .select(purchaseSelection)
    .eq("id", id)
    .eq("businessId", businessId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? formatPurchase(result.data) : null;
}

const publicUserSelection = "id, username, email, name, role, active, businessId, createdAt";

async function fetchReportSales(
  businessId: string,
  filters: { dayKey?: string; from?: string; to?: string; sellerId?: string } = {},
) {
  const pageSize = 1000;
  const sales: Array<Record<string, unknown>> = [];

  for (let offset = 0;; offset += pageSize) {
    let query = db
      .from("sales")
      .select(saleSelection)
      .eq("businessId", businessId);
    if (filters.dayKey) query = query.eq("dayKey", filters.dayKey);
    if (filters.from) query = query.gte("dayKey", filters.from);
    if (filters.to) query = query.lte("dayKey", filters.to);
    if (filters.sellerId) query = query.eq("sellerId", filters.sellerId);
    const result = await query
      .order("createdAt", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    sales.push(...result.data.map(formatSale));
    if (result.data.length < pageSize) break;
  }

  return sales;
}

const cleanText = (value: unknown) => String(value || "").trim();
function safeInteger(value: unknown, label: string, allowZero = true) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || (!allowZero && number === 0)) throw new Error(`${label} inválida`);
  return number;
}
function safeMoney(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} inválido`);
  return Math.round(number * 100) / 100;
}
function safePercent(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error("El porcentaje debe estar entre 0 y 100");
  return number;
}
function dayKeyArgentina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function plushMetrics(item: Record<string, unknown>) {
  const prizesDelivered = Number(item.prizesDelivered || 0), cashAmount = Number(item.cashAmount || 0), qrAmount = Number(item.qrAmount || 0);
  const cpp = Number(item.cppSnapshot || 0), locatorPercent = item.consignmentSnapshot ? Number(item.locatorPercentSnapshot || 0) : 0;
  const grossIncome = cashAmount + qrAmount, prizeCost = prizesDelivered * cpp, locatorAmount = grossIncome * locatorPercent / 100;
  const netProfit = grossIncome - prizeCost - locatorAmount;
  return { grossIncome, prizeCost, locatorAmount, netProfit, ipp: prizesDelivered ? grossIncome / prizesDelivered : null,
    gpp: prizesDelivered ? grossIncome / prizesDelivered - cpp : null, netProfitPerPlush: prizesDelivered ? netProfit / prizesDelivered : null };
}
function serializePlushSettlement(item: Record<string, unknown>) {
  const normalized = { ...item, cashAmount: Number(item.cashAmount), qrAmount: Number(item.qrAmount), cppSnapshot: Number(item.cppSnapshot), locatorPercentSnapshot: Number(item.locatorPercentSnapshot) };
  return { ...normalized, ...plushMetrics(normalized) };
}
function plushBounds(periodValue: unknown, yearValue: unknown, monthValue: unknown) {
  const period = periodValue === "year" ? "year" : "month", year = Number(yearValue), month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Año inválido");
  if (period === "month" && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error("Mes inválido");
  if (period === "year") return { period, from: `${year}-01-01`, to: `${year}-12-31` };
  const padded = String(month).padStart(2, "0"), last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { period, from: `${year}-${padded}-01`, to: `${year}-${padded}-${String(last).padStart(2, "0")}` };
}
async function plushInventoryState() {
  const [inventoryResult, purchasesResult, adjustmentsResult, loadsResult] = await Promise.all([
    db.from("plush_inventory").select("*").eq("id", "main").maybeSingle(),
    db.from("plush_purchases").select("quantity").eq("status", "ACTIVE"),
    db.from("plush_stock_adjustments").select("delta").eq("status", "ACTIVE"),
    db.from("plush_loads").select("quantity").eq("status", "ACTIVE"),
  ]);
  for (const result of [inventoryResult, purchasesResult, adjustmentsResult, loadsResult]) if (result.error) throw result.error;
  const inventory = inventoryResult.data, initialQuantity = Number(inventory?.initialQuantity || 0);
  const purchased = (purchasesResult.data || []).reduce((sum, item) => sum + Number(item.quantity), 0);
  const adjusted = (adjustmentsResult.data || []).reduce((sum, item) => sum + Number(item.delta), 0);
  const loaded = (loadsResult.data || []).reduce((sum, item) => sum + Number(item.quantity), 0);
  return { initialized: Boolean(inventory), initialQuantity, initialUnitCost: inventory ? Number(inventory.initialUnitCost) : null,
    locked: Boolean(inventory?.locked), purchased, adjusted, loaded, remaining: initialQuantity + purchased + adjusted - loaded };
}
async function rpcId(name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return String(result.data);
}

async function handleRequest(request: Request, headers: Record<string, string>) {
  const route = routeFromRequest(request.url);

  if (request.method === "GET" && (route === "/" || route === "/health")) {
    return json(
      { status: "healthy", runtime: "supabase-edge-functions", timestamp: new Date().toISOString() },
      200,
      headers,
    );
  }

  if (request.method === "POST" && route === "/auth/login") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const login = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!login || !password) {
      return json({ error: "Usuario y contraseña requeridos" }, 400, headers);
    }

    const user = await findUserByLogin(login);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return json({ error: "Usuario o contraseña incorrectos" }, 401, headers);
    }
    if (user.role === "CASHIER" && (!user.business || !user.business.active)) {
      return json({ error: "El negocio asignado está desactivado" }, 403, headers);
    }

    return json({ token: await createToken(user.id), user: publicUser(user) }, 200, headers);
  }

  if (route === "/auth/me" || route === "/auth/logout") {
    const user = await authenticatedUser(request).catch(() => null);
    if (!user) return json({ error: "Token inválido o expirado" }, 401, headers);

    if (request.method === "GET" && route === "/auth/me") {
      return json({ user: publicUser(user) }, 200, headers);
    }
    if (request.method === "POST" && route === "/auth/logout") {
      return json({ message: "Sesión cerrada" }, 200, headers);
    }
  }

  if (route === "/businesses" || route.startsWith("/businesses/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const ownerError = requireOwner(auth.user, headers);
    if (ownerError) return ownerError;

    if (request.method === "GET" && route === "/businesses") {
      const result = await db
        .from("businesses")
        .select("*")
        .order("active", { ascending: false })
        .order("name", { ascending: true });
      if (result.error) throw result.error;
      return json(result.data, 200, headers);
    }

    if (request.method === "POST" && route === "/businesses") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const name = String(body.name || "").trim();
      const address = String(body.address || "").trim();
      if (!name) return json({ error: "Nombre requerido" }, 400, headers);

      const result = await db
        .from("businesses")
        .insert({ id: crypto.randomUUID(), name, address })
        .select("*")
        .single();
      if (result.error) throw result.error;
      return json(result.data, 201, headers);
    }

    const match = route.match(/^\/businesses\/([^/]+)$/);
    if (request.method === "PATCH" && match) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.name != null) {
        const name = String(body.name).trim();
        if (!name) return json({ error: "Nombre requerido" }, 400, headers);
        changes.name = name;
      }
      if (body.address != null) changes.address = String(body.address).trim();
      if (body.active != null) changes.active = Boolean(body.active);

      const result = await db
        .from("businesses")
        .update(changes)
        .eq("id", decodeURIComponent(match[1]))
        .select("*")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: "Negocio no encontrado" }, 404, headers);
      return json(result.data, 200, headers);
    }
  }

  if (route === "/catalog" || route.startsWith("/catalog/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const ownerError = requireOwner(auth.user, headers);
    if (ownerError) return ownerError;

    if (request.method === "GET" && route === "/catalog") {
      const result = await db
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      if (result.error) throw result.error;
      return json(result.data, 200, headers);
    }

    if (request.method === "POST" && route === "/catalog") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const name = String(body.name || "").trim();
      const code = String(body.code || "").trim().toLowerCase();
      const barcode = String(body.barcode || "").trim() || null;
      if (!name || !code) return json({ error: "Nombre y código requeridos" }, 400, headers);

      const result = await db
        .from("products")
        .insert({ id: crypto.randomUUID(), name, code, barcode })
        .select("*")
        .single();
      if (result.error?.code === "23505") {
        return json({ error: "El código ya existe" }, 400, headers);
      }
      if (result.error) throw result.error;
      return json(result.data, 201, headers);
    }

    const match = route.match(/^\/catalog\/([^/]+)$/);
    if (request.method === "PATCH" && match) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.name != null) {
        const name = String(body.name).trim();
        if (!name) return json({ error: "Nombre requerido" }, 400, headers);
        changes.name = name;
      }
      if (body.code != null) {
        const code = String(body.code).trim().toLowerCase();
        if (!code) return json({ error: "Código requerido" }, 400, headers);
        changes.code = code;
      }
      if (body.barcode != null) changes.barcode = String(body.barcode).trim() || null;
      if (body.active != null) changes.active = Boolean(body.active);

      const result = await db
        .from("products")
        .update(changes)
        .eq("id", decodeURIComponent(match[1]))
        .select("*")
        .maybeSingle();
      if (result.error?.code === "23505") {
        return json({ error: "El código ya existe" }, 400, headers);
      }
      if (result.error) throw result.error;
      if (!result.data) return json({ error: "Producto no encontrado" }, 404, headers);
      return json(result.data, 200, headers);
    }
  }

  if (route === "/products" || route.startsWith("/products/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const businessContext = await resolveBusiness(request, auth.user);
    if (!businessContext.business) {
      return json({ error: businessContext.error }, businessContext.status || 400, headers);
    }
    const businessId = businessContext.business.id;

    if (request.method === "GET" && route === "/products") {
      const includeInactive = auth.user.role === "OWNER" &&
        new URL(request.url).searchParams.get("includeInactive") === "true";
      let query = db
        .from("business_products")
        .select(businessProductSelection)
        .eq("businessId", businessId);
      if (!includeInactive) query = query.eq("active", true).eq("product.active", true);
      const result = await query
        .order("active", { ascending: false })
        .order("createdAt", { ascending: false });
      if (result.error) throw result.error;
      return json(result.data.map(formatBusinessProduct), 200, headers);
    }

    if (request.method === "POST" && route === "/products") {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const price = Number(body.price);
      const costPrice = Number(body.costPrice);
      const stock = Number(body.stock);
      const criticalStock = body.criticalStock == null ? 5 : Number(body.criticalStock);
      if (body.price == null || body.costPrice == null || body.stock == null) {
        return json({ error: "Precio, costo y stock requeridos" }, 400, headers);
      }
      if (![price, costPrice, stock].every(Number.isFinite) || price < 0 || costPrice < 0) {
        return json({ error: "Precio, costo o stock inválidos" }, 400, headers);
      }
      if (!Number.isInteger(stock)) return json({ error: "El stock debe ser entero" }, 400, headers);
      if (!Number.isInteger(criticalStock) || criticalStock < 0) {
        return json({ error: "El stock crítico debe ser un número entero mayor o igual a cero" }, 400, headers);
      }

      const result = await db.rpc("pos_create_business_product", {
        p_business_id: businessId,
        p_product_id: body.productId ? String(body.productId) : null,
        p_name: body.name ? String(body.name) : null,
        p_code: body.code ? String(body.code) : null,
        p_barcode: body.barcode ? String(body.barcode) : null,
        p_price: price,
        p_cost_price: costPrice,
        p_stock: stock,
        p_critical_stock: criticalStock,
      });
      if (result.error) return json({ error: result.error.message }, 400, headers);
      const created = await fetchBusinessProduct(String(result.data), businessId);
      return json(created, 201, headers);
    }

    const adjustmentMatch = route.match(/^\/products\/([^/]+)\/adjust-stock$/);
    if (request.method === "POST" && adjustmentMatch) {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const delta = Number(body.delta);
      const reason = String(body.reason || "").trim();
      if (!Number.isInteger(delta) || delta === 0) return json({ error: "Delta inválido" }, 400, headers);
      if (!reason) return json({ error: "Motivo requerido" }, 400, headers);

      const result = await db.rpc("pos_adjust_stock", {
        p_business_id: businessId,
        p_business_product_id: decodeURIComponent(adjustmentMatch[1]),
        p_delta: delta,
        p_reason: reason,
        p_admin_id: auth.user.id,
        p_admin_name: auth.user.name,
      });
      if (result.error) return json({ error: result.error.message }, 400, headers);
      return json(await fetchBusinessProduct(String(result.data), businessId), 200, headers);
    }

    const productMatch = route.match(/^\/products\/([^/]+)$/);
    if (request.method === "GET" && productMatch) {
      const item = await fetchBusinessProduct(decodeURIComponent(productMatch[1]), businessId);
      if (!item) return json({ error: "Producto no encontrado" }, 404, headers);
      return json(item, 200, headers);
    }

    if (request.method === "PATCH" && productMatch) {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const id = decodeURIComponent(productMatch[1]);
      if (!(await fetchBusinessProduct(id, businessId))) {
        return json({ error: "Producto no encontrado" }, 404, headers);
      }
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const field of ["price", "costPrice"]) {
        if (body[field] != null) {
          const value = Number(body[field]);
          if (!Number.isFinite(value) || value < 0) {
            return json({ error: "Precio o costo inválido" }, 400, headers);
          }
          changes[field] = value;
        }
      }
      if (body.stock != null) {
        const stock = Number(body.stock);
        if (!Number.isInteger(stock)) return json({ error: "Stock inválido" }, 400, headers);
        changes.stock = stock;
      }
      if (body.criticalStock != null) {
        const criticalStock = Number(body.criticalStock);
        if (!Number.isInteger(criticalStock) || criticalStock < 0) {
          return json({ error: "El stock crítico debe ser un número entero mayor o igual a cero" }, 400, headers);
        }
        changes.criticalStock = criticalStock;
      }
      if (body.active != null) changes.active = Boolean(body.active);

      const result = await db
        .from("business_products")
        .update(changes)
        .eq("id", id)
        .eq("businessId", businessId);
      if (result.error) throw result.error;
      return json(await fetchBusinessProduct(id, businessId), 200, headers);
    }

    if (request.method === "DELETE" && productMatch) {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const id = decodeURIComponent(productMatch[1]);
      const result = await db
        .from("business_products")
        .update({ active: false, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .eq("businessId", businessId)
        .select("id")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: "Producto no encontrado" }, 404, headers);
      return json({ message: "Producto desactivado en este negocio" }, 200, headers);
    }
  }

  if (route === "/sales" || route.startsWith("/sales/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const businessContext = await resolveBusiness(request, auth.user);
    if (!businessContext.business) {
      return json({ error: businessContext.error }, businessContext.status || 400, headers);
    }
    const businessId = businessContext.business.id;

    if (request.method === "GET" && route === "/sales") {
      const params = new URL(request.url).searchParams;
      let query = db.from("sales").select(saleSelection).eq("businessId", businessId);
      if (params.get("dayKey")) query = query.eq("dayKey", params.get("dayKey"));
      if (auth.user.role !== "OWNER") query = query.eq("sellerId", auth.user.id);
      else if (params.get("sellerId") && params.get("sellerId") !== "all") {
        query = query.eq("sellerId", params.get("sellerId"));
      }
      const result = await query.order("createdAt", { ascending: false });
      if (result.error) throw result.error;
      return json(result.data.map(formatSale), 200, headers);
    }

    if (request.method === "POST" && route === "/sales/quick") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const code = String(body.code || "").trim().toLowerCase();
      if (!code) return json({ error: "Código requerido" }, 400, headers);

      const itemResult = await db
        .from("business_products")
        .select("id, product:products!inner(name, code, active)")
        .eq("businessId", businessId)
        .eq("active", true)
        .eq("product.code", code)
        .eq("product.active", true)
        .maybeSingle();
      if (itemResult.error) throw itemResult.error;
      if (!itemResult.data) return json({ error: `Código no encontrado: ${code}` }, 404, headers);

      const rpc = await db.rpc("pos_create_sale", {
        p_business_id: businessId,
        p_seller_id: auth.user.id,
        p_seller_name: auth.user.name,
        p_day_key: dayKeyTucuman(),
        p_payment_method: "CASH",
        p_cash_amount: null,
        p_transfer_amount: null,
        p_items: [{ id: itemResult.data.id, qty: 1 }],
      });
      if (rpc.error) return json({ error: rpc.error.message }, 400, headers);
      const productValue = itemResult.data.product;
      const product = Array.isArray(productValue) ? productValue[0] : productValue;
      return json({ ...(await fetchSale(String(rpc.data), businessId)), productName: product?.name }, 201, headers);
    }

    if (request.method === "POST" && route === "/sales") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length) return json({ error: "El carrito está vacío" }, 400, headers);
      const requested = new Map<string, number>();
      for (const raw of rawItems) {
        const item = raw as Record<string, unknown>;
        const id = String(item.id || "");
        const qty = Number(item.qty);
        if (!id || !Number.isInteger(qty) || qty <= 0) return json({ error: "Items inválidos" }, 400, headers);
        requested.set(id, (requested.get(id) || 0) + qty);
      }

      const rpc = await db.rpc("pos_create_sale", {
        p_business_id: businessId,
        p_seller_id: auth.user.id,
        p_seller_name: auth.user.name,
        p_day_key: dayKeyTucuman(),
        p_payment_method: String(body.paymentMethod || "CASH").toUpperCase(),
        p_cash_amount: body.cashAmount == null ? null : Number(body.cashAmount),
        p_transfer_amount: body.transferAmount == null ? null : Number(body.transferAmount),
        p_items: [...requested].map(([id, qty]) => ({ id, qty })),
      });
      if (rpc.error) return json({ error: rpc.error.message }, 400, headers);
      return json(await fetchSale(String(rpc.data), businessId), 201, headers);
    }

    const voidMatch = route.match(/^\/sales\/([^/]+)\/void$/);
    if (request.method === "POST" && voidMatch) {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const rpc = await db.rpc("pos_void_sale", {
        p_business_id: businessId,
        p_sale_id: decodeURIComponent(voidMatch[1]),
        p_reason: String(body.reason || ""),
      });
      if (rpc.error) return json({ error: rpc.error.message }, 400, headers);
      return json({ message: "Venta anulada", sale: await fetchSale(String(rpc.data), businessId) }, 200, headers);
    }

    const saleMatch = route.match(/^\/sales\/([^/]+)$/);
    if (request.method === "GET" && saleMatch) {
      const sale = await fetchSale(decodeURIComponent(saleMatch[1]), businessId);
      if (!sale) return json({ error: "Venta no encontrada" }, 404, headers);
      if (auth.user.role !== "OWNER" && sale.sellerId !== auth.user.id) {
        return json({ error: "No autorizado" }, 403, headers);
      }
      return json(sale, 200, headers);
    }

    if (request.method === "PATCH" && saleMatch) {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const id = decodeURIComponent(saleMatch[1]);
      const sale = await fetchSale(id, businessId);
      if (!sale) return json({ error: "Venta no encontrada" }, 404, headers);
      if (sale.status === "VOIDED") return json({ error: "No se puede editar una venta anulada" }, 400, headers);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      let payment;
      try {
        payment = paymentData(body.paymentMethod, Number(sale.total), body.cashAmount, body.transferAmount);
      } catch (error) {
        return json({ error: (error as Error).message }, 400, headers);
      }
      const result = await db
        .from("sales")
        .update({ ...payment, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .eq("businessId", businessId);
      if (result.error) throw result.error;
      return json(await fetchSale(id, businessId), 200, headers);
    }

    if (request.method === "DELETE" && saleMatch) {
      const ownerError = requireOwner(auth.user, headers);
      if (ownerError) return ownerError;
      const id = decodeURIComponent(saleMatch[1]);
      const sale = await fetchSale(id, businessId);
      if (!sale) return json({ error: "Venta no encontrada" }, 404, headers);
      if (sale.status !== "VOIDED") return json({ error: "Solo se pueden borrar ventas anuladas" }, 400, headers);
      const result = await db.from("sales").delete().eq("id", id).eq("businessId", businessId);
      if (result.error) throw result.error;
      return json({ message: "Venta borrada" }, 200, headers);
    }
  }

  if (route === "/purchases" || route.startsWith("/purchases/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const ownerError = requireOwner(auth.user, headers);
    if (ownerError) return ownerError;
    const businessContext = await resolveBusiness(request, auth.user);
    if (!businessContext.business) {
      return json({ error: businessContext.error }, businessContext.status || 400, headers);
    }
    const businessId = businessContext.business.id;

    if (request.method === "GET" && route === "/purchases") {
      const dayKey = new URL(request.url).searchParams.get("dayKey");
      let query = db.from("purchases").select(purchaseSelection).eq("businessId", businessId);
      if (dayKey) query = query.eq("dayKey", dayKey);
      const result = await query.order("createdAt", { ascending: false });
      if (result.error) throw result.error;
      return json(result.data.map(formatPurchase), 200, headers);
    }

    if (request.method === "POST" && route === "/purchases") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length) return json({ error: "Compra vacía" }, 400, headers);
      const requested = new Map<string, { qty: number; costPrice: number }>();
      for (const raw of rawItems) {
        const item = raw as Record<string, unknown>;
        const productId = String(item.productId || "");
        const qty = Number(item.qty);
        const costPrice = Number(item.costPrice);
        if (!productId || !Number.isInteger(qty) || qty <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
          return json({ error: "Items inválidos" }, 400, headers);
        }
        if (requested.has(productId)) return json({ error: "Producto duplicado en la compra" }, 400, headers);
        requested.set(productId, { qty, costPrice });
      }

      const rpc = await db.rpc("pos_create_purchase", {
        p_business_id: businessId,
        p_admin_id: auth.user.id,
        p_admin_name: auth.user.name,
        p_day_key: String(body.dayKey || new Date().toISOString().slice(0, 10)),
        p_items: [...requested].map(([productId, value]) => ({ productId, ...value })),
      });
      if (rpc.error) return json({ error: rpc.error.message }, 400, headers);
      return json(await fetchPurchase(String(rpc.data), businessId), 201, headers);
    }
  }

  if (route === "/users" || route.startsWith("/users/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const ownerError = requireOwner(auth.user, headers);
    if (ownerError) return ownerError;
    const businessContext = await resolveBusiness(request, auth.user);
    if (!businessContext.business) {
      return json({ error: businessContext.error }, businessContext.status || 400, headers);
    }
    const businessId = businessContext.business.id;

    if (request.method === "GET" && route === "/users") {
      const result = await db
        .from("users")
        .select(publicUserSelection)
        .eq("businessId", businessId)
        .eq("role", "CASHIER")
        .order("active", { ascending: false })
        .order("name", { ascending: true });
      if (result.error) throw result.error;
      return json(result.data, 200, headers);
    }

    if (request.method === "POST" && route === "/users") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      if (!username || !password || !name) {
        return json({ error: "Usuario, contraseña y nombre requeridos" }, 400, headers);
      }
      if (password.length < 6) {
        return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400, headers);
      }
      const email = `${username}@pos.local`;
      const existingResult = await db.from("users").select("id, active").eq("username", username).maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (existingResult.data?.active) return json({ error: "El usuario ya existe" }, 400, headers);

      const userData = {
        username,
        email,
        password: await bcrypt.hash(password, 10),
        name,
        role: "CASHIER",
        businessId,
        active: true,
        updatedAt: new Date().toISOString(),
      };
      const result = existingResult.data
        ? await db.from("users").update(userData).eq("id", existingResult.data.id).select(publicUserSelection).single()
        : await db.from("users").insert({ id: crypto.randomUUID(), ...userData }).select(publicUserSelection).single();
      if (result.error?.code === "23505") return json({ error: "El usuario ya existe" }, 400, headers);
      if (result.error) throw result.error;
      return json(result.data, existingResult.data ? 200 : 201, headers);
    }

    const userMatch = route.match(/^\/users\/([^/]+)$/);
    if (request.method === "PATCH" && userMatch) {
      const id = decodeURIComponent(userMatch[1]);
      const existingResult = await db
        .from("users")
        .select("id, businessId")
        .eq("id", id)
        .eq("role", "CASHIER")
        .maybeSingle();
      if (existingResult.error) throw existingResult.error;
      if (!existingResult.data) return json({ error: "Empleado no encontrado" }, 404, headers);
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const changes: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.name != null) {
        const name = String(body.name).trim();
        if (!name) return json({ error: "Nombre requerido" }, 400, headers);
        changes.name = name;
      }
      if (body.password) {
        const password = String(body.password);
        if (password.length < 6) {
          return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400, headers);
        }
        changes.password = await bcrypt.hash(password, 10);
      }
      if (body.active != null) changes.active = Boolean(body.active);
      if (body.businessId != null) {
        const targetResult = await db
          .from("businesses")
          .select("id")
          .eq("id", String(body.businessId))
          .eq("active", true)
          .maybeSingle();
        if (targetResult.error) throw targetResult.error;
        if (!targetResult.data) return json({ error: "Negocio destino inválido" }, 400, headers);
        changes.businessId = targetResult.data.id;
      } else if (existingResult.data.businessId !== businessId) {
        return json({ error: "Empleado no encontrado en este negocio" }, 404, headers);
      }

      const result = await db.from("users").update(changes).eq("id", id).select(publicUserSelection).single();
      if (result.error) throw result.error;
      return json(result.data, 200, headers);
    }

    if (request.method === "DELETE" && userMatch) {
      const id = decodeURIComponent(userMatch[1]);
      const result = await db
        .from("users")
        .update({ active: false, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .eq("businessId", businessId)
        .eq("role", "CASHIER")
        .select("id")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return json({ error: "Empleado no encontrado" }, 404, headers);
      return json({ message: "Empleado desactivado" }, 200, headers);
    }
  }

  if (route.startsWith("/reports/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const businessContext = await resolveBusiness(request, auth.user);
    if (!businessContext.business) {
      return json({ error: businessContext.error }, businessContext.status || 400, headers);
    }
    const businessId = businessContext.business.id;
    const params = new URL(request.url).searchParams;

    if (request.method === "GET" && route === "/reports/daily") {
      const isOwner = auth.user.role === "OWNER";
      const todayKey = dayKeyTucuman();
      const dayKey = isOwner ? String(params.get("dayKey") || todayKey) : todayKey;
      const sales = await fetchReportSales(businessId, {
        dayKey,
        sellerId: isOwner ? undefined : auth.user.id,
      });
      const activeSales = sales.filter((sale) => sale.status === "ACTIVE");
      const totalDay = activeSales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const totalsByPayment = { cash: 0, transfer: 0 };
      let cogsDay = 0;
      const totalsByUser: Record<string, number> = {};
      for (const sale of activeSales) {
        totalsByPayment.cash += Number(sale.cashAmount);
        totalsByPayment.transfer += Number(sale.transferAmount);
        if (isOwner) {
          const sellerName = String(sale.sellerName || "Sin usuario");
          totalsByUser[sellerName] = (totalsByUser[sellerName] || 0) + Number(sale.total);
          const items = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : [];
          cogsDay += items.reduce((sum, item) => sum + Number(item.qty) * Number(item.itemCostPrice), 0);
        }
      }
      return json({
        dayKey,
        todayKey,
        isAdmin: isOwner,
        totalDay,
        totalsByPayment,
        cogsDay: isOwner ? cogsDay : undefined,
        profitDay: isOwner ? totalDay - cogsDay : undefined,
        totalsByUser: isOwner ? totalsByUser : undefined,
        voidedCount: sales.filter((sale) => sale.status === "VOIDED").length,
        salesCount: activeSales.length,
        salesList: !isOwner
          ? activeSales.map((sale) => ({
            id: sale.id,
            total: Number(sale.total),
            itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
            createdAt: sale.createdAt,
          }))
          : undefined,
      }, 200, headers);
    }

    if (request.method === "GET" && route === "/reports/summary") {
      if (auth.user.role !== "OWNER") return json({ error: "Acceso denegado" }, 403, headers);
      const nowParts = dayKeyTucuman().split("-").map(Number);
      const period = params.get("period") === "year" ? "year" : "month";
      const year = Number(params.get("year") || nowParts[0]);
      const month = Number(params.get("month") || nowParts[1]);
      if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
        (period === "month" && (!Number.isInteger(month) || month < 1 || month > 12))) {
        return json({ error: "Período inválido" }, 400, headers);
      }
      const paddedMonth = String(month).padStart(2, "0");
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const from = period === "year" ? `${year}-01-01` : `${year}-${paddedMonth}-01`;
      const to = period === "year" ? `${year}-12-31` : `${year}-${paddedMonth}-${String(daysInMonth).padStart(2, "0")}`;
      const sales = (await fetchReportSales(businessId, { from, to })).filter((sale) => sale.status === "ACTIVE");
      let grossSales = 0;
      let cogs = 0;
      let cash = 0;
      let transfer = 0;
      const productTotals = new Map<string, { name: string; qty: number; revenue: number }>();
      const bucketCount = period === "year" ? 12 : daysInMonth;
      const trend = Array.from({ length: bucketCount }, (_, index) => ({
        key: index + 1,
        label: period === "year"
          ? new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" })
            .format(new Date(Date.UTC(2024, index, 1))).replace(".", "")
          : String(index + 1),
        grossSales: 0,
        profit: 0,
        transactions: 0,
      }));
      for (const sale of sales) {
        const saleTotal = Number(sale.total || 0);
        const items = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : [];
        const saleCogs = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.itemCostPrice || 0), 0);
        grossSales += saleTotal;
        cogs += saleCogs;
        cash += Number(sale.cashAmount || 0);
        transfer += Number(sale.transferAmount || 0);
        const dayKey = String(sale.dayKey || "");
        const bucket = period === "year" ? Number(dayKey.slice(5, 7)) - 1 : Number(dayKey.slice(8, 10)) - 1;
        if (trend[bucket]) {
          trend[bucket].grossSales += saleTotal;
          trend[bucket].profit += saleTotal - saleCogs;
          trend[bucket].transactions += 1;
        }
        for (const item of items) {
          const name = String(item.name || "");
          const current = productTotals.get(name) || { name, qty: 0, revenue: 0 };
          current.qty += Number(item.qty || 0);
          current.revenue += Number(item.lineTotal || Number(item.qty || 0) * Number(item.unitPrice || 0));
          productTotals.set(name, current);
        }
      }
      const profit = grossSales - cogs;
      const topProducts = [...productTotals.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 5);
      return json({
        period,
        year,
        month: period === "month" ? month : null,
        from,
        to,
        grossSales,
        cogs,
        profit,
        marginPercent: grossSales ? (profit / grossSales) * 100 : 0,
        transactions: sales.length,
        averageTicket: sales.length ? grossSales / sales.length : 0,
        paymentTotals: { cash, transfer },
        trend,
        topProduct: topProducts[0] || null,
        topProducts,
      }, 200, headers);
    }

    if (request.method === "GET" && route === "/reports/top-product") {
      const sales = (await fetchReportSales(businessId)).filter((sale) => sale.status === "ACTIVE");
      const totals = new Map<string, number>();
      for (const sale of sales) {
        const items = Array.isArray(sale.items) ? sale.items as Array<Record<string, unknown>> : [];
        for (const item of items) {
          const name = String(item.name || "");
          totals.set(name, (totals.get(name) || 0) + Number(item.qty || 0));
        }
      }
      const top = [...totals].sort((a, b) => b[1] - a[1])[0];
      return json(top ? { name: top[0], qty: top[1] } : null, 200, headers);
    }
  }

  if (route === "/plush/overview" || route.startsWith("/plush/")) {
    const auth = await requireUser(request, headers);
    if (auth.response) return auth.response;
    const ownerError = requireOwner(auth.user, headers);
    if (ownerError) return ownerError;

    if (request.method === "GET" && route === "/plush/overview") {
      const params = new URL(request.url).searchParams, today = dayKeyArgentina().split("-").map(Number);
      let bounds;
      try { bounds = plushBounds(params.get("period") || "month", params.get("year") || today[0], params.get("month") || today[1]); }
      catch (error) { return json({ error: (error as Error).message }, 400, headers); }
      const [inventory, machinesR, purchasesR, adjustmentsR, loadsR, settlementsR, periodR] = await Promise.all([
        plushInventoryState(),
        db.from("plush_machines").select("*, photos:plush_machine_photos(*)").order("active", { ascending: false }).order("name"),
        db.from("plush_purchases").select("*").order("createdAt", { ascending: false }).limit(100),
        db.from("plush_stock_adjustments").select("*").order("createdAt", { ascending: false }).limit(100),
        db.from("plush_loads").select("*, machine:plush_machines(name,code)").order("createdAt", { ascending: false }).limit(200),
        db.from("plush_settlements").select("*, machine:plush_machines(name,code)").order("createdAt", { ascending: false }).limit(500),
        db.from("plush_settlements").select("*").eq("status", "ACTIVE").gte("dayKey", bounds.from).lte("dayKey", bounds.to),
      ]);
      for (const result of [machinesR,purchasesR,adjustmentsR,loadsR,settlementsR,periodR]) if (result.error) throw result.error;
      const machineRows=machinesR.data||[],purchaseRows=purchasesR.data||[],adjustmentRows=adjustmentsR.data||[],loadRows=loadsR.data||[],settlementRows=settlementsR.data||[],periodRows=periodR.data||[];
      const activeLoads = loadRows.filter((item) => item.status === "ACTIVE"), activeSettlements = settlementRows.filter((item) => item.status === "ACTIVE");
      const machines = machineRows.map((machine) => {
        const loadQty = activeLoads.filter((item) => item.machineId === machine.id).reduce((sum,item)=>sum+Number(item.quantity),0);
        const prizes = activeSettlements.filter((item)=>item.machineId===machine.id).reduce((sum,item)=>sum+Number(item.prizesDelivered),0);
        const theoreticalStock = Number(machine.initialPlushQuantity)+loadQty-prizes;
        return { ...machine, locatorPercent:Number(machine.locatorPercent), theoreticalStock,
          initialValuesLocked: activeLoads.some((item)=>item.machineId===machine.id)||activeSettlements.some((item)=>item.machineId===machine.id), auditAlert:theoreticalStock<0 };
      });
      const ranking = new Map<string, {machineId:string;machineName:string;grossIncome:number;prizesDelivered:number;netProfit:number}>();
      let grossIncome=0,cashAmount=0,qrAmount=0,prizesDelivered=0,prizeCost=0,locatorAmount=0,netProfit=0;
      for (const raw of periodRows) { const item=raw as Record<string,unknown>, metrics=plushMetrics(item), prizes=Number(item.prizesDelivered||0);
        grossIncome+=metrics.grossIncome; cashAmount+=Number(item.cashAmount||0); qrAmount+=Number(item.qrAmount||0); prizesDelivered+=prizes;
        prizeCost+=metrics.prizeCost; locatorAmount+=metrics.locatorAmount; netProfit+=metrics.netProfit;
        const machine=machines.find((value)=>value.id===item.machineId), key=String(item.machineId);
        const current=ranking.get(key)||{machineId:key,machineName:String(machine?.name||"Máquina"),grossIncome:0,prizesDelivered:0,netProfit:0};
        current.grossIncome+=metrics.grossIncome; current.prizesDelivered+=prizes; current.netProfit+=metrics.netProfit; ranking.set(key,current); }
      const weightedCpp=prizesDelivered?prizeCost/prizesDelivered:null, ipp=prizesDelivered?grossIncome/prizesDelivered:null;
      return json({ inventory, machines, purchases:purchaseRows.map((item)=>({...item,totalCost:Number(item.totalCost),unitCost:Number(item.unitCost)})),
        adjustments:adjustmentRows, loads:loadRows, settlements:settlementRows.map((item)=>serializePlushSettlement(item)),
        dashboard:{grossIncome,cashAmount,qrAmount,prizesDelivered,prizeCost,locatorAmount,netProfit,weightedCpp,ipp,
          gpp:prizesDelivered?Number(ipp)-Number(weightedCpp):null,netProfitPerPlush:prizesDelivered?netProfit/prizesDelivered:null,
          ranking:[...ranking.values()].sort((a,b)=>b.netProfit-a.netProfit||b.grossIncome-a.grossIncome),...bounds,negativeMachines:machines.filter((item)=>item.auditAlert).length}},200,headers);
    }

    const body = request.method === "GET" ? {} : (await request.json().catch(() => ({}))) as Record<string,unknown>;
    const actorArgs = { p_actor_id: auth.user.id, p_actor_name: auth.user.name };
    try {
      if (request.method === "POST" && route === "/plush/inventory/initialize") {
        const id=await rpcId("pos_plush_initialize",{p_quantity:safeInteger(body.initialQuantity,"Cantidad inicial"),p_unit_cost:safeMoney(body.initialUnitCost,"CPP inicial"),...actorArgs});
        const result=await db.from("plush_inventory").select("*").eq("id",id).single(); if(result.error)throw result.error;
        return json({...result.data,initialUnitCost:Number(result.data.initialUnitCost)},201,headers);
      }
      if (request.method === "POST" && route === "/plush/inventory/adjustments") {
        const raw=Number(body.delta), delta=safeInteger(Math.abs(raw),"Cantidad",false)*(raw<0?-1:1), reason=cleanText(body.reason); if(!reason)throw new Error("El motivo es obligatorio");
        const id=await rpcId("pos_plush_adjust",{p_delta:delta,p_reason:reason,...actorArgs}); const result=await db.from("plush_stock_adjustments").select("*").eq("id",id).single(); return json(result.data,201,headers);
      }
      let match=route.match(/^\/plush\/inventory\/adjustments\/([^/]+)\/void$/);
      if(request.method==="POST"&&match){const reason=cleanText(body.reason);if(!reason)throw new Error("El motivo es obligatorio");const id=await rpcId("pos_plush_void_adjustment",{p_id:decodeURIComponent(match[1]),p_reason:reason,...actorArgs});const result=await db.from("plush_stock_adjustments").select("*").eq("id",id).single();return json(result.data,200,headers);}
      if(request.method==="POST"&&route==="/plush/purchases"){const quantity=safeInteger(body.quantity,"Cantidad",false),totalCost=safeMoney(body.totalCost,"Importe total");const id=await rpcId("pos_plush_purchase",{p_quantity:quantity,p_total_cost:totalCost,p_supplier:cleanText(body.supplier),p_notes:cleanText(body.notes),...actorArgs});const result=await db.from("plush_purchases").select("*").eq("id",id).single();return json({...result.data,totalCost:Number(result.data.totalCost),unitCost:Number(result.data.unitCost)},201,headers);}
      match=route.match(/^\/plush\/purchases\/([^/]+)\/void$/);
      if(request.method==="POST"&&match){const reason=cleanText(body.reason);if(!reason)throw new Error("El motivo es obligatorio");const id=await rpcId("pos_plush_void_purchase",{p_id:decodeURIComponent(match[1]),p_reason:reason,...actorArgs});const result=await db.from("plush_purchases").select("*").eq("id",id).single();return json({...result.data,totalCost:Number(result.data.totalCost),unitCost:Number(result.data.unitCost)},200,headers);}
      if(request.method==="POST"&&route==="/plush/loads"){const id=await rpcId("pos_plush_load",{p_machine_id:String(body.machineId||""),p_quantity:safeInteger(body.quantity,"Cantidad",false),p_notes:cleanText(body.notes),...actorArgs});const result=await db.from("plush_loads").select("*").eq("id",id).single();return json(result.data,201,headers);}
      match=route.match(/^\/plush\/loads\/([^/]+)\/void$/);
      if(request.method==="POST"&&match){const reason=cleanText(body.reason);if(!reason)throw new Error("El motivo es obligatorio");const id=await rpcId("pos_plush_void_load",{p_id:decodeURIComponent(match[1]),p_reason:reason,...actorArgs});const result=await db.from("plush_loads").select("*").eq("id",id).single();return json(result.data,200,headers);}
      if(request.method==="POST"&&route==="/plush/settlements"){const id=await rpcId("pos_plush_settlement",{p_machine_id:String(body.machineId||""),p_final_counter:safeInteger(body.finalCounter,"Lectura final"),p_cash:safeMoney(body.cashAmount||0,"Efectivo"),p_qr:safeMoney(body.qrAmount||0,"QR"),p_notes:cleanText(body.notes),p_day_key:dayKeyArgentina(),...actorArgs});const result=await db.from("plush_settlements").select("*").eq("id",id).single();return json(serializePlushSettlement(result.data),201,headers);}
      match=route.match(/^\/plush\/settlements\/([^/]+)$/);
      if(request.method==="PATCH"&&match){const existing=await db.from("plush_settlements").select("*").eq("id",decodeURIComponent(match[1])).single();if(existing.error)throw new Error("Liquidación inexistente o anulada");const id=await rpcId("pos_plush_update_settlement",{p_id:decodeURIComponent(match[1]),p_final_counter:safeInteger(body.finalCounter,"Lectura final"),p_cash:safeMoney(body.cashAmount??existing.data.cashAmount,"Efectivo"),p_qr:safeMoney(body.qrAmount??existing.data.qrAmount,"QR"),p_notes:body.notes==null?existing.data.notes:cleanText(body.notes)});const result=await db.from("plush_settlements").select("*").eq("id",id).single();return json(serializePlushSettlement(result.data),200,headers);}
      match=route.match(/^\/plush\/settlements\/([^/]+)\/void$/);
      if(request.method==="POST"&&match){const reason=cleanText(body.reason);if(!reason)throw new Error("El motivo es obligatorio");const id=await rpcId("pos_plush_void_settlement",{p_id:decodeURIComponent(match[1]),p_reason:reason,...actorArgs});const result=await db.from("plush_settlements").select("*").eq("id",id).single();return json(serializePlushSettlement(result.data),200,headers);}
      if(request.method==="POST"&&route==="/plush/machines"){const name=cleanText(body.name),code=cleanText(body.code),location=cleanText(body.location);if(!name||!code||!location)throw new Error("Nombre, código y ubicación son obligatorios");const consignment=Boolean(body.consignment),locatorName=consignment?cleanText(body.locatorName):"";if(consignment&&!locatorName)throw new Error("Ingresá el nombre del locador");const result=await db.from("plush_machines").insert({id:crypto.randomUUID(),name,code,location,model:cleanText(body.model),serialNumber:cleanText(body.serialNumber),notes:cleanText(body.notes),active:body.active==null?true:Boolean(body.active),consignment,locatorName,locatorPercent:consignment?safePercent(body.locatorPercent):0,initialCounter:safeInteger(body.initialCounter,"Contador inicial"),initialPlushQuantity:safeInteger(body.initialPlushQuantity,"Cantidad inicial"),createdById:auth.user.id,createdByName:auth.user.name}).select("*,photos:plush_machine_photos(*)").single();if(result.error?.code==="23505")return json({error:"Ya existe una máquina con ese código"},409,headers);if(result.error)throw result.error;return json({...result.data,locatorPercent:Number(result.data.locatorPercent),theoreticalStock:Number(result.data.initialPlushQuantity),initialValuesLocked:false,auditAlert:false},201,headers);}
      match=route.match(/^\/plush\/machines\/([^/]+)$/);
      if(request.method==="PATCH"&&match){const id=decodeURIComponent(match[1]),current=await db.from("plush_machines").select("*").eq("id",id).maybeSingle();if(current.error)throw current.error;if(!current.data)return json({error:"Máquina no encontrada"},404,headers);const counts=await Promise.all([db.from("plush_loads").select("id",{count:"exact",head:true}).eq("machineId",id),db.from("plush_settlements").select("id",{count:"exact",head:true}).eq("machineId",id)]),hasMovements=counts.some((item)=>Number(item.count)>0);const changes:Record<string,unknown>={updatedAt:new Date().toISOString()};for(const field of ["name","code","location","model","serialNumber","notes","locatorName"])if(body[field]!=null)changes[field]=cleanText(body[field]);if(body.active!=null)changes.active=Boolean(body.active);if(body.consignment!=null)changes.consignment=Boolean(body.consignment);if(body.locatorPercent!=null)changes.locatorPercent=safePercent(body.locatorPercent);if(!String(changes.name??current.data.name)||!String(changes.code??current.data.code)||!String(changes.location??current.data.location))throw new Error("Nombre, código y ubicación son obligatorios");const nextConsignment=Boolean(changes.consignment??current.data.consignment);if(nextConsignment&&!String(changes.locatorName??current.data.locatorName))throw new Error("Ingresá el nombre del locador");for(const field of ["initialCounter","initialPlushQuantity"]){if(body[field]!=null){const value=safeInteger(body[field],field==="initialCounter"?"Contador inicial":"Cantidad inicial");if(hasMovements&&value!==current.data[field])throw new Error("Los valores iniciales quedan bloqueados después del primer movimiento");if(!hasMovements)changes[field]=value;}}if(changes.consignment===false){changes.locatorName="";changes.locatorPercent=0;}const result=await db.from("plush_machines").update(changes).eq("id",id).select("*,photos:plush_machine_photos(*)").single();if(result.error?.code==="23505")return json({error:"Ya existe una máquina con ese código"},409,headers);if(result.error)throw result.error;return json(result.data,200,headers);}
      match=route.match(/^\/plush\/machines\/([^/]+)\/photos$/);
      if(request.method==="POST"&&match){const machineId=decodeURIComponent(match[1]),dataUrl=String(body.dataUrl||""),imageMatch=dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);if(!imageMatch)throw new Error("La foto debe ser JPEG, PNG o WebP");const padding=(imageMatch[2].match(/=*$/)?.[0].length||0),bytes=Math.floor(imageMatch[2].length*3/4)-padding;if(bytes>1500000)throw new Error("La foto supera el límite de 1,5 MB");const machine=await db.from("plush_machines").select("id").eq("id",machineId).maybeSingle();if(!machine.data)throw new Error("Máquina no encontrada");const photos=await db.from("plush_machine_photos").select("id,isCover,sortOrder").eq("machineId",machineId).order("sortOrder");if(photos.error)throw photos.error;if(photos.data.length>=6)throw new Error("La máquina ya tiene el máximo de seis fotos");const isCover=photos.data.length===0||Boolean(body.isCover);if(isCover)await db.from("plush_machine_photos").update({isCover:false}).eq("machineId",machineId);const result=await db.from("plush_machine_photos").insert({id:crypto.randomUUID(),machineId,dataUrl,mimeType:imageMatch[1],isCover,sortOrder:photos.data.length}).select("*").single();if(result.error)throw result.error;return json(result.data,201,headers);}
      match=route.match(/^\/plush\/machines\/([^/]+)\/photos\/([^/]+)\/cover$/);
      if(request.method==="PATCH"&&match){const machineId=decodeURIComponent(match[1]),photoId=decodeURIComponent(match[2]),photo=await db.from("plush_machine_photos").select("id").eq("id",photoId).eq("machineId",machineId).maybeSingle();if(!photo.data)throw new Error("Foto no encontrada");await db.from("plush_machine_photos").update({isCover:false}).eq("machineId",machineId);const result=await db.from("plush_machine_photos").update({isCover:true}).eq("id",photoId).select("*").single();return json(result.data,200,headers);}
      match=route.match(/^\/plush\/machines\/([^/]+)\/photos\/([^/]+)$/);
      if(request.method==="DELETE"&&match){const machineId=decodeURIComponent(match[1]),photoId=decodeURIComponent(match[2]),photo=await db.from("plush_machine_photos").select("*").eq("id",photoId).eq("machineId",machineId).maybeSingle();if(!photo.data)throw new Error("Foto no encontrada");await db.from("plush_machine_photos").delete().eq("id",photoId);if(photo.data.isCover){const next=await db.from("plush_machine_photos").select("id").eq("machineId",machineId).order("sortOrder").limit(1).maybeSingle();if(next.data)await db.from("plush_machine_photos").update({isCover:true}).eq("id",next.data.id);}return json({message:"Foto eliminada"},200,headers);}
    } catch (error) { return json({ error: (error as Error).message || "Error en Pelucheras" }, 400, headers); }
  }

  return json({ error: "Ruta todavía no migrada a Supabase" }, 404, headers);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin, configuredOrigins);

  if (!isOriginAllowed(origin, configuredOrigins)) {
    return json({ error: "Origen no permitido" }, 403, headers);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "La función no tiene configuradas las credenciales de Supabase" }, 500, headers);
  }

  try {
    return await handleRequest(request, headers);
  } catch (error) {
    console.error("API error", error);
    return json({ error: "Error interno del servidor" }, 500, headers);
  }
});
