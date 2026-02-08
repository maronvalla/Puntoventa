import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "./services/api.js";

/**
 * Helpers
 */
function dayKeyTucuman(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function formatTime(dateString) {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Tucuman",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function App() {
  // Auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [profiles, setProfiles] = useState([]);

  // Role
  const isAdmin = user?.role === "ADMIN";

  // UI
  const [view, setView] = useState("pos");
  const [cart, setCart] = useState([]);

  // Login gate
  const [login, setLogin] = useState({ username: "", password: "" });
  const [loginErr, setLoginErr] = useState("");

  // Scanner input invisible
  const scanRef = useRef(null);
  const [scanBuffer, setScanBuffer] = useState("");

  // Quick code buffer for rapid sales
  const [quickCodeBuffer, setQuickCodeBuffer] = useState("");

  // POS search
  const searchRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [isProcessingSale, setIsProcessingSale] = useState(false);

  // Inventory (admin)
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    costPrice: "",
    barcode: "",
    stock: "",
    code: "",
  });
  const [stockAdjust, setStockAdjust] = useState({});

  // Purchases (admin)
  const todayKey = dayKeyTucuman(new Date());
  const [purchaseDayKey, setPurchaseDayKey] = useState(todayKey);
  const [purchaseItem, setPurchaseItem] = useState({
    productId: "",
    qty: "",
    costPrice: "",
  });
  const [purchaseItems, setPurchaseItems] = useState([]);

  // Sales admin view
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [salesFilterUser, setSalesFilterUser] = useState("all");
  const [saleDetail, setSaleDetail] = useState(null);
  const [saleEdit, setSaleEdit] = useState(null);

  // New user form (admin)
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "CASHIER",
  });
  const [resetAdminForm, setResetAdminForm] = useState({
    username: "",
    password: "",
    name: "",
  });

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      if (api.getToken()) {
        try {
          const { user } = await api.getMe();
          setUser(user);
        } catch (e) {
          api.setToken(null);
        }
      }
      setAuthLoading(false);
    }
    checkAuth();
  }, []);

  // Load data when authenticated
  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [productsData, usersData] = await Promise.all([
        api.getProducts(),
        api.getUsers(),
      ]);
      setProducts(productsData);
      setProfiles(usersData);
    } catch (e) {
      console.error("Error loading data:", e);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load sales when day or filter changes
  const loadSales = useCallback(async () => {
    if (!user) return;
    try {
      const salesData = await api.getSales({
        dayKey: selectedDayKey,
        sellerId: isAdmin && salesFilterUser !== "all" ? salesFilterUser : undefined,
      });
      setSales(salesData);
    } catch (e) {
      console.error("Error loading sales:", e);
    }
  }, [user, selectedDayKey, salesFilterUser, isAdmin]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  // Polling for real-time updates (every 5 seconds)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      loadData();
      loadSales();
    }, 5000);
    return () => clearInterval(interval);
  }, [user, loadData, loadSales]);

  // Autofocus search when entering POS
  useEffect(() => {
    if (view === "pos") {
      setTimeout(() => searchRef.current?.focus(), 150);
    }
  }, [view]);

  // Global keyboard listener for quick code sales
  useEffect(() => {
    if (view !== "pos") return;

    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (/^[0-9]$/.test(e.key)) {
        setQuickCodeBuffer((prev) => prev + e.key);
      }

      if (e.key === "Enter" && quickCodeBuffer) {
        e.preventDefault();
        handleQuickSale(quickCodeBuffer);
        setQuickCodeBuffer("");
      }

      if (e.key === "Escape") {
        setQuickCodeBuffer("");
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        setQuickCodeBuffer((prev) => prev.slice(0, -1));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [view, quickCodeBuffer, products, isProcessingSale]);

  // Cart total
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0);
  }, [cart]);

  // Update amounts when payment method changes
  useEffect(() => {
    if (paymentMethod === "cash") {
      setCashAmount(String(cartTotal || 0));
      setTransferAmount("0");
    } else if (paymentMethod === "transfer") {
      setCashAmount("0");
      setTransferAmount(String(cartTotal || 0));
    }
  }, [paymentMethod, cartTotal]);

  function applyMixedAmount(value, total, setPrimary, setSecondary) {
    const raw = String(value ?? "");
    if (raw.trim() === "") {
      setPrimary("");
      setSecondary("");
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setPrimary(raw);
      return;
    }
    const rest = Math.max(0, Number(total || 0) - num);
    setPrimary(raw);
    setSecondary(String(rest));
  }

  async function doLogin() {
    setLoginErr("");
    const username = login.username.trim();
    const password = login.password;

    if (!username || !password) {
      setLoginErr("Ingresá usuario y contraseña.");
      return;
    }

    try {
      const { user: userData } = await api.login(username, password);
      setUser(userData);
      setLogin({ username: "", password: "" });
      setLoginErr("");
      setView("pos");
    } catch (e) {
      setLoginErr(e.message || "Usuario o contraseña incorrectos.");
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setCart([]);
    setProducts([]);
    setSales([]);
    setProfiles([]);
    setView("pos");
  }

  // POS helpers
  function addToCart(product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === product.id);
      if (ex) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: Number(product.price || 0),
          costPrice: Number(product.costPrice || 0),
          barcode: product.barcode || "",
          code: product.code || "",
          qty: 1,
        },
      ];
    });
  }

  function removeFromCart(id) {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }

  function handleBarcode(code) {
    const c = String(code || "").trim();
    if (!c) return;

    const product = products.find((p) => String(p.barcode || "") === c);
    if (!product) {
      alert("Código de barras no encontrado: " + c);
      return;
    }
    addToCart(product);
  }

  // Quick sale by short code
  async function handleQuickSale(code) {
    const c = String(code || "").trim();
    if (!c || isProcessingSale) return;

    setIsProcessingSale(true);
    try {
      const result = await api.quickSale(c);
      alert(`Venta rápida: ${result.productName} - $${money(result.total)}`);
      loadData();
      loadSales();
    } catch (e) {
      alert(e.message || "Error en venta rápida");
    } finally {
      setIsProcessingSale(false);
    }
  }

  // Process sale
  async function processSale() {
    if (isProcessingSale || !cart.length) return;

    // Validate mixed payment
    if (paymentMethod === "mixed") {
      const sum = Number(cashAmount || 0) + Number(transferAmount || 0);
      if (Math.abs(sum - cartTotal) > 0.01) {
        alert("El pago mixto no coincide con el total.");
        return;
      }
    }

    setIsProcessingSale(true);

    try {
      await api.createSale(
        cart,
        paymentMethod,
        Number(cashAmount || 0),
        Number(transferAmount || 0)
      );
      setCart([]);
      alert("Venta registrada");
      loadData();
      loadSales();
    } catch (e) {
      alert(e.message || "No se pudo registrar la venta");
    } finally {
      setIsProcessingSale(false);
    }
  }

  // Inventory (admin)
  async function addProduct() {
    if (!isAdmin) return;

    const name = newProduct.name.trim();
    const price = Number(newProduct.price);
    const costPrice = Number(newProduct.costPrice);
    const barcode = newProduct.barcode.trim();
    const code = newProduct.code.trim();
    const stock = Number(newProduct.stock);

    if (!name || !Number.isFinite(price) || !Number.isFinite(costPrice) || !barcode || !code || !Number.isFinite(stock)) {
      alert("Falta nombre / precio / costo / código barras / code / stock.");
      return;
    }

    try {
      await api.createProduct({ name, price, costPrice, barcode, code, stock });
      setNewProduct({ name: "", price: "", costPrice: "", barcode: "", stock: "", code: "" });
      loadData();
    } catch (e) {
      alert(e.message || "Error al crear producto");
    }
  }

  async function updatePrice(productId, value) {
    if (!isAdmin) return;
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    try {
      await api.updateProduct(productId, { price });
      loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async function updateCostPrice(productId, value) {
    if (!isAdmin) return;
    const costPrice = Number(value);
    if (!Number.isFinite(costPrice) || costPrice < 0) return;
    try {
      await api.updateProduct(productId, { costPrice });
      loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async function adjustStock(productId, delta, reason) {
    if (!isAdmin) return;
    const change = Number(delta);
    if (!Number.isFinite(change) || change === 0) return;
    if (!reason || !reason.trim()) {
      alert("Escribí un motivo para el ajuste.");
      return;
    }

    try {
      await api.adjustStock(productId, change, reason);
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo ajustar stock");
    }
  }

  // Purchases (admin)
  function addPurchaseItem() {
    if (!isAdmin) return;
    const pid = purchaseItem.productId;
    const qty = Number(purchaseItem.qty);
    const costPrice = Number(purchaseItem.costPrice);

    if (!pid || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
      alert("Compra: producto/cantidad/costo inválidos.");
      return;
    }

    const p = products.find((x) => x.id === pid);
    if (!p) {
      alert("Producto no encontrado.");
      return;
    }

    setPurchaseItems((prev) => {
      const ex = prev.find((i) => i.productId === pid);
      if (ex) {
        const nextQty = Number(ex.qty) + qty;
        return prev.map((i) => (i.productId === pid ? { ...i, qty: nextQty, costPrice } : i));
      }
      return [...prev, { productId: pid, name: p.name, qty, costPrice }];
    });

    setPurchaseItem({ productId: "", qty: "", costPrice: "" });
  }

  function removePurchaseItem(productId) {
    setPurchaseItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function registerPurchase() {
    if (!isAdmin || !purchaseItems.length) return;

    try {
      await api.createPurchase(purchaseDayKey, purchaseItems);
      setPurchaseItems([]);
      alert("Compra registrada");
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo registrar compra");
    }
  }

  // Sales filters for admin view
  const salesFiltered = useMemo(() => {
    return sales.filter((s) => (s.status || "ACTIVE") !== "VOIDED" || isAdmin);
  }, [sales, isAdmin]);

  // Reports
  const daySalesActive = useMemo(() => {
    return sales.filter((s) => (s.status || "ACTIVE") === "ACTIVE");
  }, [sales]);

  const voidedCount = useMemo(() => {
    return sales.filter((s) => (s.status || "ACTIVE") === "VOIDED").length;
  }, [sales]);

  const totalDay = useMemo(() => {
    return daySalesActive.reduce((a, s) => a + Number(s.total || 0), 0);
  }, [daySalesActive]);

  const totalsByUser = useMemo(() => {
    const acc = {};
    for (const s of daySalesActive) {
      const k = s.sellerName || "Sin usuario";
      acc[k] = (acc[k] || 0) + Number(s.total || 0);
    }
    return acc;
  }, [daySalesActive]);

  const totalsByPayment = useMemo(() => {
    const out = { cash: 0, transfer: 0 };
    for (const s of daySalesActive) {
      const method = s.paymentMethod || "CASH";
      if (method === "TRANSFER") {
        out.transfer += Number(s.transferAmount ?? s.total ?? 0);
      } else if (method === "MIXED") {
        out.cash += Number(s.cashAmount || 0);
        out.transfer += Number(s.transferAmount || 0);
      } else {
        out.cash += Number(s.cashAmount ?? s.total ?? 0);
      }
    }
    return out;
  }, [daySalesActive]);

  const cogsDay = useMemo(() => {
    let sum = 0;
    for (const s of daySalesActive) {
      for (const it of s.items || []) {
        sum += Number(it.qty || 0) * Number(it.itemCostPrice || 0);
      }
    }
    return sum;
  }, [daySalesActive]);

  const profitDay = useMemo(() => totalDay - cogsDay, [totalDay, cogsDay]);

  // Cashiers: force reports to today only
  useEffect(() => {
    if (!isAdmin && selectedDayKey !== todayKey) {
      setSelectedDayKey(todayKey);
    }
  }, [isAdmin, selectedDayKey, todayKey]);

  // Admin: void/delete/edit
  async function voidSale(sale) {
    if (!isAdmin) return;
    if ((sale.status || "ACTIVE") === "VOIDED") return;

    const reason = prompt("Motivo de anulación (opcional):", sale.voidReason || "");

    try {
      await api.voidSale(sale.id, reason || "");
      alert("Venta anulada");
      loadSales();
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo anular la venta");
    }
  }

  async function deleteSale(sale) {
    if (!isAdmin) return;

    const status = sale.status || "ACTIVE";
    if (status !== "VOIDED") {
      if (!confirm("Esta venta no está anulada. ¿Querés anularla y borrarla?")) return;
      await voidSale(sale);
    }
    if (!confirm("¿Borrar venta anulada?")) return;

    try {
      await api.deleteSale(sale.id);
      alert("Venta borrada");
      loadSales();
    } catch (e) {
      alert(e.message || "No se pudo borrar la venta");
    }
  }

  async function saveSaleEdit() {
    if (!isAdmin || !saleEdit) return;

    const { saleId } = saleEdit;
    const total = Number(saleEdit.total || 0);
    const pm = saleEdit.paymentMethod;

    if (pm === "mixed") {
      const sum = Number(saleEdit.cashAmount) + Number(saleEdit.transferAmount);
      if (Math.abs(sum - total) > 0.01) {
        alert("El pago mixto no coincide con el total");
        return;
      }
    }

    try {
      await api.updateSalePayment(
        saleId,
        pm,
        Number(saleEdit.cashAmount),
        Number(saleEdit.transferAmount)
      );
      setSaleEdit(null);
      loadSales();
    } catch (e) {
      alert(e.message || "No se pudo editar la venta");
    }
  }

  // User management
  async function createUser() {
    if (!isAdmin) return;

    if (!newUser.username || !newUser.password || !newUser.name) {
      alert("Usuario, contraseña y nombre requeridos");
      return;
    }

    try {
      await api.createUser(newUser);
      setNewUser({ username: "", password: "", name: "", role: "CASHIER" });
      alert("Usuario creado");
      loadData();
    } catch (e) {
      alert(e.message || "Error al crear usuario");
    }
  }

  async function resetAdmin() {
    if (!isAdmin) return;

    if (!resetAdminForm.username || !resetAdminForm.password || !resetAdminForm.name) {
      alert("Usuario, contraseña y nombre requeridos");
      return;
    }

    if (
      !confirm(
        "Esto desactiva todos los usuarios y deja solo un admin. ¿Continuar?"
      )
    ) {
      return;
    }

    try {
      await api.resetAdmin(resetAdminForm);
      setResetAdminForm({ username: "", password: "", name: "" });
      alert("Admin reiniciado. Se desactivaron los demás usuarios.");
      loadData();
    } catch (e) {
      alert(e.message || "Error al reiniciar admin");
    }
  }

  async function deleteUserAction(userId) {
    if (!isAdmin) return;
    if (!confirm("¿Desactivar este usuario?")) return;

    try {
      await api.deleteUser(userId);
      loadData();
    } catch (e) {
      alert(e.message || "Error al eliminar usuario");
    }
  }

  const viewTitle =
    view === "pos"
      ? "Punto de Venta"
      : view === "inventory"
        ? "Inventario"
        : view === "users"
          ? "Usuarios"
          : view === "purchases"
            ? "Compras"
            : view === "sales"
              ? "Ventas"
              : "Reporte Diario";

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-600">Cargando...</div>
      </div>
    );
  }

  // ===== LOGIN SCREEN =====
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg border border-slate-200">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-slate-500">Pago Fácil POS</div>
            <h1 className="text-3xl font-semibold text-slate-900 mt-1">Ingreso al sistema</h1>
            <p className="text-slate-500 mt-2">Ingresá con usuario y contraseña.</p>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-2">Usuario</label>
          <input
            className={`w-full p-3 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${
              loginErr ? "border-red-400" : "border-slate-200"
            }`}
            placeholder="ej: exequiel, caja1"
            value={login.username}
            onChange={(e) => setLogin((s) => ({ ...s, username: e.target.value }))}
          />

          <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
          <input
            className={`w-full p-3 border rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${
              loginErr ? "border-red-400" : "border-slate-200"
            }`}
            placeholder="••••••••"
            type="password"
            value={login.password}
            onChange={(e) => setLogin((s) => ({ ...s, password: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") doLogin();
            }}
          />

          {loginErr && (
            <div className="text-red-600 text-sm mt-1 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {loginErr}
            </div>
          )}

          <button
            onClick={doLogin}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg shadow-sm transition"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  // ===== APP SHELL =====
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Scanner invisible */}
      <input
        ref={scanRef}
        className="absolute opacity-0 pointer-events-none"
        value={scanBuffer}
        onChange={(e) => setScanBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleBarcode(scanBuffer);
            setScanBuffer("");
          }
        }}
      />

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-slate-100 p-6 flex flex-col gap-2 border-r border-slate-800 shadow-lg">
        <div className="mb-2">
          <div className="text-xs uppercase tracking-widest text-slate-400">Sistema</div>
          <div className="font-semibold text-2xl">Pago Fácil POS</div>
        </div>
        <div className="text-xs text-slate-300 mb-4">
          Sesión: <b>{user.name || user.email}</b> {isAdmin ? "(admin)" : "(caja)"}
        </div>

        <button
          onClick={() => {
            setView("pos");
            setTimeout(() => searchRef.current?.focus(), 150);
          }}
          className={
            "px-4 py-3 rounded-lg text-left transition " +
            (view === "pos" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
          }
        >
          Punto de Venta
        </button>

        <button
          onClick={() => setView("reports")}
          className={
            "px-4 py-3 rounded-lg text-left transition " +
            (view === "reports" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
          }
        >
          Reporte
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => setView("inventory")}
              className={
                "px-4 py-3 rounded-lg text-left transition " +
                (view === "inventory" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
              }
            >
              Inventario
            </button>

            <button
              onClick={() => setView("purchases")}
              className={
                "px-4 py-3 rounded-lg text-left transition " +
                (view === "purchases" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
              }
            >
              Compras
            </button>

            <button
              onClick={() => setView("sales")}
              className={
                "px-4 py-3 rounded-lg text-left transition " +
                (view === "sales" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
              }
            >
              Ventas
            </button>

            <button
              onClick={() => setView("users")}
              className={
                "px-4 py-3 rounded-lg text-left transition " +
                (view === "users" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
              }
            >
              Usuarios
            </button>
          </>
        )}

        <button
          onClick={logout}
          className="mt-auto bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition"
        >
          Salir
        </button>

        <div className="text-xs text-slate-400 border-t border-slate-700 pt-3">
          Fecha Tucumán: {todayKey}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">Panel</div>
            <h2 className="text-2xl font-semibold text-slate-900">{viewTitle}</h2>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-slate-400">Usuario actual</div>
            <div className="text-sm font-semibold text-slate-800">{user.name || user.email}</div>
            <div className="text-xs text-slate-500">{isAdmin ? "Administrador" : "Cajero"}</div>
          </div>
        </div>

        {/* POS */}
        {view === "pos" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick code indicator */}
            {quickCodeBuffer && (
              <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-2xl font-mono shadow-lg z-50">
                Código: {quickCodeBuffer}
              </div>
            )}

            <div className="lg:col-span-2">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">Productos</h2>

              <div className="mb-4 relative">
                <label className="block text-sm font-medium text-slate-700 mb-2">Buscar producto</label>
                <input
                  ref={searchRef}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white shadow-sm"
                  placeholder="Buscar por code / nombre / barcode"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearchOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const term = searchTerm.trim().toLowerCase();
                      if (!term) return;

                      const byBarcode = products.filter(
                        (p) => String(p.barcode || "").toLowerCase() === term
                      );
                      const byCode = products.filter((p) =>
                        String(p.code || "").toLowerCase().includes(term)
                      );
                      const byName = products.filter((p) =>
                        String(p.name || "").toLowerCase().includes(term)
                      );

                      const matches = byBarcode.length ? byBarcode : byCode.length ? byCode : byName;

                      if (matches.length === 1) {
                        addToCart(matches[0]);
                        setSearchTerm("");
                        setSearchOpen(false);
                      } else {
                        setSearchOpen(true);
                      }
                    }
                  }}
                />

                {searchOpen && searchTerm.trim() && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg">
                    {(() => {
                      const term = searchTerm.trim().toLowerCase();
                      const byCode = products.filter((p) =>
                        String(p.code || "").toLowerCase().includes(term)
                      );
                      const byName = products.filter((p) =>
                        String(p.name || "").toLowerCase().includes(term)
                      );
                      const matches = byCode.length ? byCode : byName;

                      if (matches.length === 0) {
                        return <div className="p-3 text-slate-500">Sin resultados</div>;
                      }

                      return matches.slice(0, 8).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            addToCart(p);
                            setSearchTerm("");
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                        >
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs text-slate-500">
                            code: {p.code || "-"} • $ {money(p.price)}
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-700">{p.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Code: {p.code || "-"} • CB: {p.barcode || "-"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-blue-600 font-semibold">$ {money(p.price)}</div>
                        {Number(p.stock || 0) < 0 && (
                          <div className="mt-1 text-xs font-bold text-rose-600">Stock negativo</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {products.length === 0 && (
                  <div className="p-4 text-slate-500 italic">No hay productos cargados.</div>
                )}
              </div>

              <div className="text-xs text-slate-500 mt-3">
                Tip: tocá una vez la pantalla y escaneá. El lector escribe y manda Enter.
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-fit">
              <h3 className="text-xl font-semibold mb-3">Carrito</h3>

              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {!cart.length && (
                  <div className="text-slate-400 italic text-center py-10">Vacío</div>
                )}
                {cart.map((i) => (
                  <div
                    key={i.id}
                    className="flex justify-between items-center bg-slate-50/80 p-3 rounded-lg border border-slate-100"
                  >
                    <div>
                      <div className="font-semibold">{i.name}</div>
                      <div className="text-xs text-slate-500">
                        {i.qty} x $ {money(i.price)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-semibold">$ {money(i.price * i.qty)}</div>
                      <button
                        onClick={() => removeFromCart(i.id)}
                        className="text-red-600 font-semibold hover:text-red-700"
                        title="Quitar"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Método de pago</div>
                <select
                  className="w-full p-3 border border-slate-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="mixed">Mixto</option>
                </select>

                {paymentMethod === "mixed" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Efectivo</div>
                      <input
                        className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                        placeholder="Efectivo"
                        type="number"
                        value={cashAmount}
                        onChange={(e) => applyMixedAmount(e.target.value, cartTotal, setCashAmount, setTransferAmount)}
                      />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Transferencia</div>
                      <input
                        className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                        placeholder="Transferencia"
                        type="number"
                        value={transferAmount}
                        onChange={(e) => applyMixedAmount(e.target.value, cartTotal, setTransferAmount, setCashAmount)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 mt-4 pt-4 flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>$ {money(cartTotal)}</span>
              </div>

              <button
                disabled={!cart.length || isProcessingSale}
                onClick={processSale}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-semibold py-3 rounded-lg shadow-sm transition"
              >
                {isProcessingSale ? "Registrando..." : "Registrar Venta"}
              </button>
            </div>
          </div>
        )}

        {/* INVENTORY (admin) */}
        {view === "inventory" && isAdmin && (
          <div className="max-w-5xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Inventario (admin)</h2>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <div className="font-bold mb-3">Nuevo producto</div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Nombre"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct((s) => ({ ...s, name: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Precio"
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct((s) => ({ ...s, price: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Costo"
                  type="number"
                  value={newProduct.costPrice}
                  onChange={(e) => setNewProduct((s) => ({ ...s, costPrice: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Código de barras"
                  value={newProduct.barcode}
                  onChange={(e) => setNewProduct((s) => ({ ...s, barcode: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Code (abreviatura)"
                  value={newProduct.code}
                  onChange={(e) => setNewProduct((s) => ({ ...s, code: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Stock inicial"
                  type="number"
                  value={newProduct.stock}
                  onChange={(e) => setNewProduct((s) => ({ ...s, stock: e.target.value }))}
                />
              </div>

              <button
                onClick={addProduct}
                className="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition"
              >
                Agregar
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Producto</th>
                    <th className="p-4">Venta</th>
                    <th className="p-4">Costo</th>
                    <th className="p-4">Margen $</th>
                    <th className="p-4">Margen %</th>
                    <th className="p-4">Barcode</th>
                    <th className="p-4">Code</th>
                    <th className="p-4">Stock</th>
                    <th className="p-4">Ajuste</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => {
                    const priceV = Number(p.price || 0);
                    const costV = Number(p.costPrice || 0);
                    const marginAmount = priceV - costV;
                    const marginPercent = priceV > 0 ? (marginAmount / priceV) * 100 : 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 even:bg-slate-50/60">
                        <td className="p-4 font-semibold">{p.name}</td>

                        <td className="p-4">
                          <input
                            type="number"
                            className="p-2 border border-slate-200 rounded-lg w-28"
                            defaultValue={p.price}
                            onBlur={(e) => updatePrice(p.id, e.target.value)}
                          />
                        </td>

                        <td className="p-4">
                          <input
                            type="number"
                            className="p-2 border border-slate-200 rounded-lg w-24"
                            defaultValue={p.costPrice || 0}
                            onBlur={(e) => updateCostPrice(p.id, e.target.value)}
                          />
                        </td>

                        <td className="p-4 text-slate-700">$ {money(marginAmount)}</td>
                        <td className="p-4 text-slate-700">{marginPercent.toFixed(1)}%</td>
                        <td className="p-4 text-slate-500">{p.barcode}</td>
                        <td className="p-4 text-slate-500">{p.code || "-"}</td>
                        <td className="p-4">
                          <span className="font-semibold">{Number(p.stock || 0)}</span>{" "}
                          {Number(p.stock || 0) < 0 && (
                            <span className="ml-2 text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                              Negativo
                            </span>
                          )}
                        </td>

                        <td className="p-4">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              className="p-2 border border-slate-200 rounded-lg w-20"
                              placeholder="+/-"
                              value={stockAdjust[p.id]?.delta ?? ""}
                              onChange={(e) =>
                                setStockAdjust((s) => ({
                                  ...s,
                                  [p.id]: { ...(s[p.id] || {}), delta: e.target.value },
                                }))
                              }
                            />
                            <input
                              type="text"
                              className="p-2 border border-slate-200 rounded-lg w-40"
                              placeholder="Motivo"
                              value={stockAdjust[p.id]?.reason ?? ""}
                              onChange={(e) =>
                                setStockAdjust((s) => ({
                                  ...s,
                                  [p.id]: { ...(s[p.id] || {}), reason: e.target.value },
                                }))
                              }
                            />
                            <button
                              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200"
                              onClick={() => {
                                const delta = Number(stockAdjust[p.id]?.delta || 0);
                                const reason = stockAdjust[p.id]?.reason || "";
                                adjustStock(p.id, delta, reason);
                                setStockAdjust((s) => ({ ...s, [p.id]: { delta: "", reason: "" } }));
                              }}
                            >
                              +/-
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {products.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-400">
                        Sin productos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PURCHASES (admin) */}
        {view === "purchases" && isAdmin && (
          <div className="max-w-5xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Compras (admin)</h2>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Fecha</div>
                  <input
                    type="date"
                    className="w-full p-2 border border-slate-200 rounded-lg"
                    value={purchaseDayKey}
                    onChange={(e) => setPurchaseDayKey(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <select
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  value={purchaseItem.productId}
                  onChange={(e) => setPurchaseItem((s) => ({ ...s, productId: e.target.value }))}
                >
                  <option value="">Producto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Cantidad"
                  type="number"
                  value={purchaseItem.qty}
                  onChange={(e) => setPurchaseItem((s) => ({ ...s, qty: e.target.value }))}
                />

                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Costo compra"
                  type="number"
                  value={purchaseItem.costPrice}
                  onChange={(e) => setPurchaseItem((s) => ({ ...s, costPrice: e.target.value }))}
                />

                <button
                  onClick={addPurchaseItem}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition"
                >
                  Agregar item
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div className="font-bold">Items</div>
                <div className="text-sm text-slate-600">
                  Total compra: $ {money(purchaseItems.reduce((a, i) => a + Number(i.qty || 0) * Number(i.costPrice || 0), 0))}
                </div>
              </div>

              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Producto</th>
                    <th className="p-4">Cantidad</th>
                    <th className="p-4">Costo</th>
                    <th className="p-4">Subtotal</th>
                    <th className="p-4">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseItems.map((i) => (
                    <tr key={i.productId} className="hover:bg-slate-50 even:bg-slate-50/60">
                      <td className="p-4 font-semibold">{i.name}</td>
                      <td className="p-4">{i.qty}</td>
                      <td className="p-4">$ {money(i.costPrice)}</td>
                      <td className="p-4">$ {money(Number(i.qty || 0) * Number(i.costPrice || 0))}</td>
                      <td className="p-4">
                        <button
                          onClick={() => removePurchaseItem(i.productId)}
                          className="text-red-600 font-semibold hover:text-red-700"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}

                  {purchaseItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400">
                        Sin items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="p-4 border-t border-slate-200">
                <button
                  disabled={!purchaseItems.length}
                  onClick={registerPurchase}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition"
                >
                  Registrar compra
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SALES (admin) */}
        {view === "sales" && isAdmin && (
          <div className="max-w-6xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Ventas (admin)</h2>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Fecha</div>
                  <input
                    type="date"
                    className="w-full p-2 border border-slate-200 rounded-lg"
                    value={selectedDayKey}
                    onChange={(e) => setSelectedDayKey(e.target.value)}
                  />
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Vendedor</div>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                    value={salesFilterUser}
                    onChange={(e) => setSalesFilterUser(e.target.value)}
                  >
                    <option value="all">Todos</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.username || p.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <div className="text-sm text-slate-600">
                    Total ventas (activas): $ {money(salesFiltered.filter((s) => (s.status || "ACTIVE") === "ACTIVE").reduce((a, s) => a + Number(s.total || 0), 0))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Hora</th>
                    <th className="p-4">Vendedor</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Pago</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesFiltered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400">
                        Sin ventas
                      </td>
                    </tr>
                  )}

                  {salesFiltered.map((s) => {
                    const status = s.status || "ACTIVE";
                    const method = s.paymentMethod || "CASH";
                    const cash = s.cashAmount != null ? Number(s.cashAmount) : Number(s.total || 0);
                    const transfer = s.transferAmount != null ? Number(s.transferAmount) : 0;

                    return (
                      <tr key={s.id} className={"hover:bg-slate-50 even:bg-slate-50/60 " + (status === "VOIDED" ? "opacity-60" : "")}>
                        <td className="p-4">{formatTime(s.createdAt)}</td>
                        <td className="p-4">{s.sellerName || s.sellerId}</td>
                        <td className="p-4 font-semibold">$ {money(s.total)}</td>
                        <td className="p-4 text-slate-600">
                          {method === "CASH" && `Efectivo $ ${money(cash)}`}
                          {method === "TRANSFER" && `Transferencia $ ${money(transfer)}`}
                          {method === "MIXED" && `Mixto $ ${money(cash)} / $ ${money(transfer)}`}
                        </td>
                        <td className="p-4">
                          <span className={status === "VOIDED" ? "text-rose-600" : "text-emerald-700"}>
                            {status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <button className="text-blue-600 font-semibold" onClick={() => setSaleDetail(s)}>
                              Ver
                            </button>
                            <button
                              className="text-indigo-600 font-semibold"
                              disabled={status === "VOIDED"}
                              onClick={() => setSaleEdit({
                                saleId: s.id,
                                total: s.total,
                                paymentMethod: method.toLowerCase(),
                                cashAmount: cash,
                                transferAmount: transfer,
                              })}
                            >
                              Editar pago
                            </button>
                            <button className="text-amber-600 font-semibold" disabled={status === "VOIDED"} onClick={() => voidSale(s)}>
                              Anular
                            </button>
                            <button className="text-red-600 font-semibold" onClick={() => deleteSale(s)}>
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {saleDetail && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
                <div className="bg-white max-w-lg w-full rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-lg">Detalle de venta</div>
                    <button className="text-slate-500" onClick={() => setSaleDetail(null)}>X</button>
                  </div>
                  <div className="text-sm text-slate-500 mb-3">
                    {saleDetail.sellerName} • {formatTime(saleDetail.createdAt)} • {saleDetail.status || "ACTIVE"}
                    {saleDetail.voidReason ? ` • ${saleDetail.voidReason}` : ""}
                  </div>
                  <div className="space-y-2">
                    {(saleDetail.items || []).map((it) => (
                      <div key={it.productId} className="flex justify-between border-b border-slate-100 pb-2">
                        <div>
                          <div className="font-semibold">{it.name}</div>
                          <div className="text-xs text-slate-500">{it.qty} x $ {money(it.unitPrice)}</div>
                        </div>
                        <div className="font-semibold">$ {money(it.lineTotal)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 font-semibold text-right">Total: $ {money(saleDetail.total)}</div>
                </div>
              </div>
            )}

            {saleEdit && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
                <div className="bg-white max-w-lg w-full rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-lg">Editar pago</div>
                    <button className="text-slate-500" onClick={() => setSaleEdit(null)}>X</button>
                  </div>
                  <div className="space-y-3">
                    <select
                      className="w-full p-3 border border-slate-200 rounded-lg bg-white"
                      value={saleEdit.paymentMethod}
                      onChange={(e) => {
                        const method = e.target.value;
                        if (method === "cash") {
                          setSaleEdit((s) => ({ ...s, paymentMethod: method, cashAmount: s.total, transferAmount: 0 }));
                        } else if (method === "transfer") {
                          setSaleEdit((s) => ({ ...s, paymentMethod: method, cashAmount: 0, transferAmount: s.total }));
                        } else {
                          setSaleEdit((s) => ({ ...s, paymentMethod: method }));
                        }
                      }}
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="mixed">Mixto</option>
                    </select>

                    {saleEdit.paymentMethod === "mixed" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Efectivo</div>
                          <input
                            className="p-3 border border-slate-200 rounded-lg"
                            type="number"
                            placeholder="Efectivo"
                            value={saleEdit.cashAmount}
                            onChange={(e) =>
                              setSaleEdit((s) => {
                                const raw = String(e.target.value ?? "");
                                if (raw.trim() === "") return { ...s, cashAmount: "", transferAmount: "" };
                                const num = Number(raw);
                                if (!Number.isFinite(num)) return { ...s, cashAmount: raw };
                                const rest = Math.max(0, Number(s.total || 0) - num);
                                return { ...s, cashAmount: raw, transferAmount: String(rest) };
                              })
                            }
                          />
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Transferencia</div>
                          <input
                            className="p-3 border border-slate-200 rounded-lg"
                            type="number"
                            placeholder="Transferencia"
                            value={saleEdit.transferAmount}
                            onChange={(e) =>
                              setSaleEdit((s) => {
                                const raw = String(e.target.value ?? "");
                                if (raw.trim() === "") return { ...s, transferAmount: "", cashAmount: "" };
                                const num = Number(raw);
                                if (!Number.isFinite(num)) return { ...s, transferAmount: raw };
                                const rest = Math.max(0, Number(s.total || 0) - num);
                                return { ...s, transferAmount: raw, cashAmount: String(rest) };
                              })
                            }
                          />
                        </div>
                      </div>
                    )}

                    <div className="text-sm text-slate-600">Total: $ {money(saleEdit.total)}</div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button className="px-4 py-2 rounded-lg bg-slate-100" onClick={() => setSaleEdit(null)}>Cancelar</button>
                    <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold" onClick={saveSaleEdit}>Guardar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* USERS (admin) */}
        {view === "users" && isAdmin && (
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Usuarios (admin)</h2>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <div className="font-bold mb-3">Crear usuario</div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Usuario"
                  value={newUser.username}
                  onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Contraseña"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Nombre completo"
                  value={newUser.name}
                  onChange={(e) => setNewUser((s) => ({ ...s, name: e.target.value }))}
                />
                <select
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  value={newUser.role}
                  onChange={(e) => setNewUser((s) => ({ ...s, role: e.target.value }))}
                >
                  <option value="CASHIER">Cajero</option>
                  <option value="ADMIN">Administrador</option>
                </select>
                <button
                  onClick={createUser}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition"
                >
                  Crear
                </button>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <div className="font-bold mb-3">Reiniciar admin</div>
              <div className="text-sm text-slate-500 mb-3">
                Esto deja un solo administrador activo y desactiva el resto.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Usuario admin"
                  value={resetAdminForm.username}
                  onChange={(e) =>
                    setResetAdminForm((s) => ({ ...s, username: e.target.value }))
                  }
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Contraseña admin"
                  type="password"
                  value={resetAdminForm.password}
                  onChange={(e) =>
                    setResetAdminForm((s) => ({ ...s, password: e.target.value }))
                  }
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg bg-white shadow-sm"
                  placeholder="Nombre completo"
                  value={resetAdminForm.name}
                  onChange={(e) =>
                    setResetAdminForm((s) => ({ ...s, name: e.target.value }))
                  }
                />
                <button
                  onClick={resetAdmin}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition"
                >
                  Reiniciar admin
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 even:bg-slate-50/60">
                      <td className="p-4 font-semibold">{u.name}</td>
                      <td className="p-4 text-slate-600">{u.username}</td>
                      <td className="p-4 text-slate-600">{u.role}</td>
                      <td className="p-4">
                        {u.id !== user.id && (
                          <button
                            onClick={() => deleteUserAction(u.id)}
                            className="text-red-600 font-semibold hover:text-red-700"
                          >
                            Desactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {profiles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-slate-400">
                        Sin usuarios
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORTS */}
        {view === "reports" && (
          <div className="max-w-4xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Reporte Diario</h2>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col gap-4 mb-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-slate-500">Fecha</div>
                    <input
                      type="date"
                      className="mt-1 p-2 border border-slate-200 rounded-lg"
                      value={selectedDayKey}
                      onChange={(e) => setSelectedDayKey(e.target.value)}
                      max={isAdmin ? undefined : todayKey}
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-100 text-blue-700 font-semibold px-4 py-2 rounded-lg">
                    Total: $ {money(totalDay)}
                  </div>
                </div>

                <div className={`grid grid-cols-1 ${isAdmin ? "sm:grid-cols-5" : "sm:grid-cols-2"} gap-3`}>
                  {isAdmin && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <div className="text-xs uppercase tracking-widest text-emerald-600">Ventas Brutas</div>
                      <div className="text-lg font-semibold text-emerald-800">$ {money(totalDay)}</div>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Efectivo</div>
                    <div className="text-lg font-semibold text-slate-800">$ {money(totalsByPayment.cash)}</div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Transferencia</div>
                    <div className="text-lg font-semibold text-slate-800">$ {money(totalsByPayment.transfer)}</div>
                  </div>

                  {isAdmin && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                      <div className="text-xs uppercase tracking-widest text-amber-600">CMV</div>
                      <div className="text-lg font-semibold text-amber-800">$ {money(cogsDay)}</div>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-xs uppercase tracking-widest text-slate-500">Ganancia</div>
                      <div className="text-lg font-semibold text-slate-800">$ {money(profitDay)}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="font-bold border-b pb-2 mb-3 flex items-center justify-between">
                <span>{isAdmin ? "Por usuario" : "Tus ventas"}</span>
                {voidedCount > 0 && <span className="text-xs text-rose-600">Anuladas: {voidedCount}</span>}
              </div>

              {isAdmin ? (
                <>
                  {Object.keys(totalsByUser).length === 0 && (
                    <div className="text-slate-400 italic text-center py-10">Sin ventas</div>
                  )}

                  <div className="space-y-2">
                    {Object.entries(totalsByUser).map(([name, tot]) => (
                      <div key={name} className="flex justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="font-semibold">{name}</div>
                        <div className="font-semibold">$ {money(tot)}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {daySalesActive.length === 0 && (
                    <div className="text-slate-400 italic text-center py-10">Sin ventas</div>
                  )}
                  <div className="space-y-2">
                    {daySalesActive.map((s) => (
                      <div key={s.id} className="flex justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="font-semibold">{(s.items || []).length} items</div>
                        <div className="font-semibold">$ {money(s.total)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
