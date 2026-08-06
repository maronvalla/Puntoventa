import { test, expect } from "@playwright/test";

const owner = { id: "owner-1", username: "admin", name: "Alejandro", role: "OWNER" };
const business = { id: "business-1", name: "Sucursal Centro", address: "San Martín 120", active: true };
const product = { id: "inventory-1", productId: "product-1", name: "Gaseosa 500 ml", code: "gas-500", barcode: "7790001", price: 1800, costPrice: 1000, stock: 3, criticalStock: 4, active: true };
const cashier = { id: "cashier-1", username: "caja1", name: "María", role: "CASHIER", businessId: business.id, business };
const plushMachine = { id: "machine-1", name: "Garra Centro", code: "PEL-01", location: "Shopping Centro", model: "Garra XL", serialNumber: "A-100", notes: "", active: true, consignment: true, locatorName: "Shopping", locatorPercent: 15, initialCounter: 100, initialPlushQuantity: 30, theoreticalStock: 22, auditAlert: false, photos: [] };
const plushOverview = {
  inventory: { initialized: true, initialQuantity: 100, initialUnitCost: 500, locked: true, purchased: 50, adjusted: 0, loaded: 40, remaining: 110 },
  machines: [plushMachine], purchases: [], adjustments: [], loads: [], settlements: [],
  dashboard: { period: "month", from: "2026-08-01", to: "2026-08-31", grossIncome: 12000, cashAmount: 7000, qrAmount: 5000, prizesDelivered: 8, prizeCost: 4000, locatorAmount: 1800, netProfit: 6200, weightedCpp: 500, ipp: 1500, gpp: 1000, netProfitPerPlush: 775, negativeMachines: 0, ranking: [{ machineId: plushMachine.id, machineName: plushMachine.name, prizesDelivered: 8, grossIncome: 12000, netProfit: 6200 }] },
};

async function mockApi(page, { currentUser = owner, currentProduct = product } = {}) {
  await page.addInitScript(() => localStorage.setItem("token", "test-token"));
  await page.route("http://api.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/auth/me" ? { user: currentUser }
      : path === "/businesses" ? [business]
      : path === "/products" ? [currentProduct]
      : path === "/users" ? [{ id: "user-1", username: "caja1", name: "María", role: "CASHIER", active: true, businessId: business.id }]
      : path === "/catalog" ? [{ id: product.productId, name: product.name, code: product.code, barcode: product.barcode, active: true }]
      : path === "/sales" ? [{ id: "sale-1", sellerName: "María", total: 3500, status: "ACTIVE", cashAmount: 3500, transferAmount: 0, createdAt: new Date().toISOString(), items: [{ qty: 1, itemCostPrice: 1000 }] }]
      : path === "/reports/summary" ? { period: "month", year: 2026, month: 7, grossSales: 3500, cogs: 1000, profit: 2500, marginPercent: 71.4, transactions: 1, averageTicket: 3500, paymentTotals: { cash: 3500, transfer: 0 }, trend: [{ key: 1, label: "1", grossSales: 3500, profit: 2500, transactions: 1 }], topProduct: { name: product.name, qty: 1, revenue: 3500 }, topProducts: [{ name: product.name, qty: 1, revenue: 3500 }] }
      : path === "/reports/top-product" ? { name: product.name, qty: 4 }
      : path === "/plush/overview" ? plushOverview
      : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

test("el empleado suma stock únicamente desde el portal habilitado", async ({ page }) => {
  const zeroCostProduct = { ...product, costPrice: 0 };
  await mockApi(page, { currentUser: cashier, currentProduct: zeroCostProduct });
  await page.goto("/");

  await page.getByRole("button", { name: "Cargar stock", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cargar stock" })).toBeVisible();
  await expect(page.getByText("Gaseosa 500 ml")).toBeVisible();

  const adjustmentRequest = page.waitForRequest((request) =>
    request.url().endsWith("/products/inventory-1/adjust-stock") && request.method() === "POST"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Unidades a sumar").fill("6");
  await page.getByRole("button", { name: "Sumar", exact: true }).click();

  const request = await adjustmentRequest;
  expect(request.postDataJSON()).toEqual({ delta: 6, reason: "Carga desde portal de empleado" });
});

test("el dueño inicia en el resumen y gestiona productos con panel lateral", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.getByText("Ventas de hoy")).toBeVisible();
  await expect(page.getByText("Notificaciones de inventario")).toBeVisible();
  await expect(page.getByText("Avisar en 4 u.")).toBeVisible();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await expect(page.getByRole("table").getByText("Gaseosa 500 ml")).toBeVisible();
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await expect(page.getByRole("dialog").getByText("Nuevo producto")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Stock crítico")).toHaveValue("5");
});

test("la navegación administrativa se adapta al móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Empleados" })).toBeVisible();
});

test("reportes conserva diario y agrega mensual y anual", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Reportes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Diario", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mensual", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anual", exact: true })).toBeVisible();
  await expect(page.getByText("Producto estrella")).toBeVisible();
  await page.getByRole("button", { name: "Diario", exact: true }).click();
  await expect(page.getByText("Ventas por empleado")).toBeVisible();
});

test("el portal de pelucheras está separado del negocio POS", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Pelucheras", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Control de pelucheras" })).toBeVisible();
  await expect(page.getByText("110 peluches")).toBeVisible();
  await expect(page.getByText("Garra Centro")).toBeVisible();
  await page.getByRole("button", { name: "Máquinas", exact: true }).click();
  await page.getByText("Garra Centro").click();
  await expect(page.getByText("Shopping Centro")).toBeVisible();
  await expect(page.getByText("Saldo interno")).toBeVisible();
  await expect(page.getByText("22", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cargar peluches" }).click();
  await page.getByLabel("Cantidad").fill("5");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const passWithoutLoadRequest = page.waitForRequest((request) =>
    request.url().endsWith("/plush/passes") && request.method() === "POST"
  );
  await page.getByRole("button", { name: "Registrar pasada" }).click();
  await page.getByLabel("Lectura actual").fill("110");
  await page.getByLabel("Dinero retirado").fill("1000");
  await page.getByLabel("QR").fill("500");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("10", { exact: true })).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await page.getByText("No cargar", { exact: true }).click();
  await expect(page.getByText("12 peluches", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("dialog").getByText("110 peluches", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pasada" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect((await passWithoutLoadRequest).postDataJSON()).toEqual({
    machineId: "machine-1", finalCounter: 110, cashAmount: 1000, qrAmount: 500, notes: "", loadQuantity: 0,
  });

  const passWithLoadRequest = page.waitForRequest((request) =>
    request.url().endsWith("/plush/passes") && request.method() === "POST"
  );
  await page.getByRole("button", { name: "Registrar pasada" }).click();
  await page.getByLabel("Lectura actual").fill("110");
  await page.getByLabel("Dinero retirado").fill("2000");
  await page.getByLabel("QR").fill("0");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("Sí, cargar", { exact: true }).click();
  await page.getByLabel("Cantidad a cargar").fill("5");
  await expect(page.getByText("17 peluches", { exact: true })).toBeVisible();
  await expect(page.getByText("105 peluches", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pasada" }).click();
  expect((await passWithLoadRequest).postDataJSON()).toEqual({
    machineId: "machine-1", finalCounter: 110, cashAmount: 2000, qrAmount: 0, notes: "", loadQuantity: 5,
  });

  await page.getByRole("button", { name: "Inventario", exact: true }).click();
  await page.getByRole("button", { name: "+ Registrar compra" }).click();
  await page.getByLabel("Cantidad").fill("10");
  await page.getByLabel("Importe total").fill("5000");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("registrar pasada bloquea contadores, importes y cargas inválidas", async ({ page }) => {
  await mockApi(page);
  let passRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/plush/passes")) passRequests += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Pelucheras", exact: true }).click();
  await page.getByRole("button", { name: "Máquinas", exact: true }).click();
  await page.getByText("Garra Centro").click();
  await page.getByRole("button", { name: "Registrar pasada" }).click();

  await page.getByLabel("Lectura actual").fill("99");
  await page.getByLabel("Dinero retirado").fill("1000");
  await page.getByLabel("QR").fill("0");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("dialog", { name: /Paso 1 de 2/ })).toBeVisible();

  await page.getByLabel("Lectura actual").fill("100.5");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("dialog", { name: /Paso 1 de 2/ })).toBeVisible();

  await page.getByLabel("Lectura actual").fill("110");
  await page.getByLabel("Dinero retirado").fill("-1");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("dialog", { name: /Paso 1 de 2/ })).toBeVisible();

  await page.getByLabel("Dinero retirado").fill("1000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("Sí, cargar", { exact: true }).click();
  await page.getByLabel("Cantidad a cargar").fill("0");
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pasada" }).click();
  await expect(page.getByRole("dialog", { name: /Paso 2 de 2/ })).toBeVisible();
  await page.getByLabel("Cantidad a cargar").fill("111");
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pasada" }).click();
  await expect(page.getByRole("dialog", { name: /Paso 2 de 2/ })).toBeVisible();
  expect(passRequests).toBe(0);
});
