import http from "node:http";

const owner = { id: "owner-demo", username: "admin", name: "Alejandro", role: "OWNER", active: true };
const businesses = [
  { id: "business-1", name: "Sucursal Centro", address: "San Martín 120", active: true },
  { id: "business-2", name: "Sucursal Norte", address: "Av. Belgrano 845", active: true },
];
let products = [
  { id: "inv-1", productId: "prod-1", name: "Gaseosa 500 ml", code: "gas-500", barcode: "7790001", price: 1800, costPrice: 1000, stock: 3, active: true },
  { id: "inv-2", productId: "prod-2", name: "Agua mineral", code: "agua-500", barcode: "7790002", price: 1200, costPrice: 650, stock: 18, active: true },
  { id: "inv-3", productId: "prod-3", name: "Alfajor triple", code: "alfa-tri", barcode: "7790003", price: 1500, costPrice: 800, stock: 0, active: true },
  { id: "inv-4", productId: "prod-4", name: "Papas clásicas", code: "papas-90", barcode: "7790004", price: 2300, costPrice: 1400, stock: 11, active: true },
  { id: "inv-5", productId: "prod-5", name: "Chocolate con leche", code: "choco-100", barcode: "7790005", price: 2800, costPrice: 1700, stock: 6, active: false },
];
let employees = [
  { id: "user-1", username: "caja1", name: "María López", role: "CASHIER", active: true, businessId: "business-1" },
  { id: "user-2", username: "caja2", name: "Juan Pérez", role: "CASHIER", active: true, businessId: "business-1" },
  { id: "user-3", username: "turnotarde", name: "Lucía Díaz", role: "CASHIER", active: false, businessId: "business-1" },
];
const now = new Date();
const sales = [
  { id: "sale-1", sellerId: "user-1", sellerName: "María López", total: 5200, paymentMethod: "CASH", cashAmount: 5200, transferAmount: 0, status: "ACTIVE", createdAt: new Date(now - 12 * 60000).toISOString(), items: [{ name: "Gaseosa 500 ml", qty: 2, unitPrice: 1800, itemCostPrice: 1000, lineTotal: 3600 }] },
  { id: "sale-2", sellerId: "user-2", sellerName: "Juan Pérez", total: 7800, paymentMethod: "TRANSFER", cashAmount: 0, transferAmount: 7800, status: "ACTIVE", createdAt: new Date(now - 47 * 60000).toISOString(), items: [{ name: "Papas clásicas", qty: 2, unitPrice: 2300, itemCostPrice: 1400, lineTotal: 4600 }] },
  { id: "sale-3", sellerId: "user-1", sellerName: "María López", total: 4100, paymentMethod: "MIXED", cashAmount: 2000, transferAmount: 2100, status: "ACTIVE", createdAt: new Date(now - 95 * 60000).toISOString(), items: [{ name: "Agua mineral", qty: 2, unitPrice: 1200, itemCostPrice: 650, lineTotal: 2400 }] },
];

const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Business-Id", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS" });
  res.end(JSON.stringify(data));
};
const readBody = async (req) => { let raw = ""; for await (const chunk of req) raw += chunk; try { return JSON.parse(raw || "{}"); } catch { return {}; } };

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, "http://127.0.0.1:3000");
  const path = url.pathname;
  const body = await readBody(req);
  if (path === "/health") return send(res, 200, { ok: true });
  if (path === "/auth/login") return send(res, 200, { token: "demo-token", user: owner });
  if (path === "/auth/me") return send(res, 200, { user: owner });
  if (path === "/auth/logout") return send(res, 200, { ok: true });
  if (path === "/businesses" && req.method === "GET") return send(res, 200, businesses);
  if (path === "/products" && req.method === "GET") return send(res, 200, products);
  if (path === "/catalog" && req.method === "GET") return send(res, 200, products.map(({ productId: id, name, code, barcode, active }) => ({ id, name, code, barcode, active })));
  if (path === "/users" && req.method === "GET") return send(res, 200, employees);
  if (path === "/sales" && req.method === "GET") return send(res, 200, sales);
  if (path === "/reports/summary") {
    const period = url.searchParams.get("period") === "year" ? "year" : "month";
    const year = Number(url.searchParams.get("year") || 2026);
    const month = Number(url.searchParams.get("month") || 7);
    const count = period === "year" ? 12 : new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthlyValues = [184000, 236000, 198000, 312000, 285000, 341000, 267000, 390000, 352000, 428000, 401000, 476000];
    const trend = Array.from({ length: count }, (_, index) => {
      const grossSales = period === "year" ? monthlyValues[index] : (index > 16 ? 0 : [17100, 24800, 19600, 32200, 28500, 0, 36100, 22400, 41900, 35600, 29800, 0, 45300, 38700, 51200, 27400, 48600][index]);
      return { key: index + 1, label: period === "year" ? ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][index] : String(index + 1), grossSales, profit: Math.round(grossSales * .38), transactions: grossSales ? Math.max(1, Math.round(grossSales / 6500)) : 0 };
    });
    const grossSales = trend.reduce((sum, item) => sum + item.grossSales, 0);
    const topProducts = [{ name: "Gaseosa 500 ml", qty: period === "year" ? 486 : 74, revenue: period === "year" ? 874800 : 133200 }, { name: "Alfajor triple", qty: 61, revenue: 91500 }, { name: "Agua mineral", qty: 52, revenue: 62400 }, { name: "Papas clásicas", qty: 37, revenue: 85100 }, { name: "Chocolate con leche", qty: 24, revenue: 67200 }];
    return send(res, 200, { period, year, month: period === "month" ? month : null, grossSales, cogs: Math.round(grossSales * .62), profit: Math.round(grossSales * .38), marginPercent: 38, transactions: trend.reduce((sum, item) => sum + item.transactions, 0), averageTicket: 6520, paymentTotals: { cash: Math.round(grossSales * .57), transfer: Math.round(grossSales * .43) }, trend, topProduct: topProducts[0], topProducts });
  }
  if (path === "/reports/top-product") return send(res, 200, { name: "Gaseosa 500 ml", qty: 14 });
  if (path.startsWith("/products/") && req.method === "PATCH") { const item = products.find((p) => p.id === path.split("/")[2]); if (item) Object.assign(item, body); return send(res, 200, item || {}); }
  if (path.match(/^\/products\/[^/]+\/adjust-stock$/) && req.method === "POST") { const item = products.find((p) => p.id === path.split("/")[2]); if (item) item.stock += Number(body.delta || 0); return send(res, 200, item || {}); }
  if (path.startsWith("/users/") && req.method === "PATCH") { const item = employees.find((p) => p.id === path.split("/")[2]); if (item) Object.assign(item, body); return send(res, 200, item || {}); }
  if (req.method === "PATCH") return send(res, 200, body);
  if (req.method === "POST") return send(res, 201, { id: `demo-${Date.now()}`, active: true, ...body });
  if (req.method === "DELETE") return send(res, 200, { ok: true });
  return send(res, 404, { error: "Ruta demo no disponible" });
}).listen(3000, "127.0.0.1", () => console.log("Demo API: http://127.0.0.1:3000"));
