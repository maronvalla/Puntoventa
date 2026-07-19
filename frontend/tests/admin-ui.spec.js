import { test, expect } from "@playwright/test";

const owner = { id: "owner-1", username: "admin", name: "Alejandro", role: "OWNER" };
const business = { id: "business-1", name: "Sucursal Centro", address: "San Martín 120", active: true };
const product = { id: "inventory-1", productId: "product-1", name: "Gaseosa 500 ml", code: "gas-500", barcode: "7790001", price: 1800, costPrice: 1000, stock: 3, criticalStock: 4, active: true };

async function mockApi(page) {
  await page.addInitScript(() => localStorage.setItem("token", "test-token"));
  await page.route("http://api.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/auth/me" ? { user: owner }
      : path === "/businesses" ? [business]
      : path === "/products" ? [product]
      : path === "/users" ? [{ id: "user-1", username: "caja1", name: "María", role: "CASHIER", active: true, businessId: business.id }]
      : path === "/catalog" ? [{ id: product.productId, name: product.name, code: product.code, barcode: product.barcode, active: true }]
      : path === "/sales" ? [{ id: "sale-1", sellerName: "María", total: 3500, status: "ACTIVE", cashAmount: 3500, transferAmount: 0, createdAt: new Date().toISOString(), items: [{ qty: 1, itemCostPrice: 1000 }] }]
      : path === "/reports/summary" ? { period: "month", year: 2026, month: 7, grossSales: 3500, cogs: 1000, profit: 2500, marginPercent: 71.4, transactions: 1, averageTicket: 3500, paymentTotals: { cash: 3500, transfer: 0 }, trend: [{ key: 1, label: "1", grossSales: 3500, profit: 2500, transactions: 1 }], topProduct: { name: product.name, qty: 1, revenue: 3500 }, topProducts: [{ name: product.name, qty: 1, revenue: 3500 }] }
      : path === "/reports/top-product" ? { name: product.name, qty: 4 }
      : {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

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
