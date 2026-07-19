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

function isCriticalStock(product) {
  return Number(product.stock) <= Number(product.criticalStock ?? 5);
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

const iconPaths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  pos: <><path d="M4 7h16l-1 13H5L4 7Z"/><path d="M8 7a4 4 0 0 1 8 0"/></>,
  business: <><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6M9 9h.01M15 9h.01"/></>,
  box: <><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5v8l-9 5-9-5V8ZM12 13v8"/></>,
  purchase: <><path d="M3 3h2l2 13h10l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></>,
  sales: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  report: <><path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5"/><path d="M8 7h8M8 11h6"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>, search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>, edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>, chevron: <><path d="m9 18 6-6-6-6"/></>,
  alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
};

function Icon({ name, size = 20, className = "" }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}

function Drawer({ open, title, subtitle, onClose, children, footer }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
    <button aria-label="Cerrar" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} />
    <section className="admin-drawer relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
        <div><h3 className="text-xl font-bold text-slate-950">{title}</h3>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
        <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
      {footer && <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</footer>}
    </section>
  </div>;
}

function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true">
    <button aria-label="Cerrar" className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
    <section className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button className="icon-button" onClick={onClose}><Icon name="close" /></button></div>
      {children}<div className="mt-6 flex justify-end gap-3">{actions}</div>
    </section>
  </div>;
}

function Field({ label, hint, children }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}

export default function App() {
  // Auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState(api.getBusinessId() || "");
  const [newBusiness, setNewBusiness] = useState({ name: "", address: "" });
  const [catalogSelection, setCatalogSelection] = useState({ productId: "", price: "", costPrice: "", stock: "" });

  // Role
  const isAdmin = user?.role === "OWNER";
  const activeBusiness = isAdmin
    ? businesses.find((business) => business.id === activeBusinessId)
    : user?.business;

  // UI
  const [view, setView] = useState("pos");
  const [cart, setCart] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [productStatus, setProductStatus] = useState("active");
  const [productSort, setProductSort] = useState("name");
  const [drawer, setDrawer] = useState(null);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [stockDialog, setStockDialog] = useState(null);
  const [businessForm, setBusinessForm] = useState({ name: "", address: "" });
  const [productForm, setProductForm] = useState({ mode: "new", productId: "", name: "", code: "", barcode: "", price: "", costPrice: "", stock: "", criticalStock: "5" });
  const [userForm, setUserForm] = useState({ username: "", password: "", name: "", businessId: "" });

  // Login gate
  const [login, setLogin] = useState({ username: "", password: "" });
  const [loginErr, setLoginErr] = useState("");

  // Scanner input invisible
  const scanRef = useRef(null);
  const [scanBuffer, setScanBuffer] = useState("");


  // POS search
  const searchRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIndex, setSearchIndex] = useState(-1);

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
  const [voidSaleDialog, setVoidSaleDialog] = useState(null);

  // Advanced reports (owner)
  const currentDateParts = todayKey.split("-").map(Number);
  const [reportPeriod, setReportPeriod] = useState("month");
  const [reportYear, setReportYear] = useState(currentDateParts[0]);
  const [reportMonth, setReportMonth] = useState(currentDateParts[1]);
  const [reportSummary, setReportSummary] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  // KPI
  const [topProduct, setTopProduct] = useState(null);

  // New user form (admin)
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "CASHIER",
  });
  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      if (api.getToken()) {
        try {
          const { user } = await api.getMe();
          setUser(user);
          if (user.role === "OWNER") setView("dashboard");
          if (user.role === "CASHIER" && user.businessId) {
            api.setBusinessId(user.businessId);
            setActiveBusinessId(user.businessId);
          }
        } catch (e) {
          api.setToken(null);
        }
      }
      setAuthLoading(false);
    }
    checkAuth();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message, type = "success") => setToast({ message, type }), []);
  const feedback = useCallback((message, type = "success") => {
    if (isAdmin) notify(message, type);
    else alert(message);
  }, [isAdmin, notify]);

  const loadBusinesses = useCallback(async () => {
    if (!user || user.role !== "OWNER") return;
    try {
      const data = await api.getBusinesses();
      setBusinesses(data);
      const active = data.filter((business) => business.active);
      const selected = active.find((business) => business.id === api.getBusinessId()) || active[0];
      if (selected && selected.id !== api.getBusinessId()) {
        api.setBusinessId(selected.id);
        setActiveBusinessId(selected.id);
      } else if (!selected) {
        api.setBusinessId(null);
        setActiveBusinessId("");
        setView("businesses");
      } else {
        setActiveBusinessId(selected.id);
      }
    } catch (e) {
      console.error("Error loading businesses:", e);
    }
  }, [user]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  // Load data when authenticated
  const loadData = useCallback(async () => {
    if (!user || !activeBusinessId) return;
    try {
      const [productsData, usersData, catalogData] = await Promise.all([
        api.getProducts(isAdmin),
        isAdmin ? api.getUsers() : Promise.resolve([]),
        isAdmin ? api.getCatalog() : Promise.resolve([]),
      ]);
      setProducts(productsData);
      setProfiles(usersData);
      setCatalog(catalogData);
    } catch (e) {
      console.error("Error loading data:", e);
    }
  }, [user, activeBusinessId, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load sales when day or filter changes
  const loadSales = useCallback(async () => {
    if (!user || !activeBusinessId) return;
    try {
      const salesData = await api.getSales({
        dayKey: selectedDayKey,
        sellerId: isAdmin && salesFilterUser !== "all" ? salesFilterUser : undefined,
      });
      setSales(salesData);

      // Load top product if on sales view
      if (view === "sales") {
        api.getTopProduct().then(setTopProduct).catch(console.error);
      }
    } catch (e) {
      console.error("Error loading sales:", e);
    }
  }, [user, activeBusinessId, selectedDayKey, salesFilterUser, isAdmin, view]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const loadReportSummary = useCallback(async () => {
    if (!isAdmin || !activeBusinessId || view !== "reports" || reportPeriod === "day") return;
    setReportLoading(true);
    setReportError("");
    try {
      setReportSummary(await api.getReportSummary({ period: reportPeriod, year: reportYear, month: reportMonth }));
    } catch (error) {
      setReportError(error.message || "No se pudo cargar el reporte.");
    } finally {
      setReportLoading(false);
    }
  }, [isAdmin, activeBusinessId, view, reportPeriod, reportYear, reportMonth]);

  useEffect(() => { loadReportSummary(); }, [loadReportSummary]);

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

  // Keep focus when returning to the page
  useEffect(() => {
    if (view !== "pos") return;
    function handleWindowFocus() {
      searchRef.current?.focus();
    }
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [view]);

  // Global keyboard listener for quick sale
  useEffect(() => {
    if (view !== "pos") return;

    function handleKeyDown(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (e.key === "Escape" && cart.length > 0) {
        e.preventDefault();
        if (confirm("Vaciar carrito?")) {
          clearCart();
        }
        return;
      }
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Enter" && cart.length > 0 && !isProcessingSale) {
        e.preventDefault();
        processSale();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [view, cart.length, isProcessingSale]);

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
      if (userData.role === "CASHIER" && userData.businessId) {
        api.setBusinessId(userData.businessId);
        setActiveBusinessId(userData.businessId);
      }
      setLogin({ username: "", password: "" });
      setLoginErr("");
      setView(userData.role === "OWNER" ? "dashboard" : "pos");
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
    setBusinesses([]);
    setCatalog([]);
    setView("pos");
  }

  function switchBusiness(businessId) {
    api.setBusinessId(businessId);
    setActiveBusinessId(businessId);
    setCart([]);
    setProducts([]);
    setSales([]);
    setProfiles([]);
    setPurchaseItems([]);
    setSaleDetail(null);
    setSaleEdit(null);
    setStockAdjust({});
  }

  async function createBusiness() {
    if (!isAdmin || !newBusiness.name.trim()) return;
    try {
      const created = await api.createBusiness(newBusiness);
      setNewBusiness({ name: "", address: "" });
      await loadBusinesses();
      switchBusiness(created.id);
      alert("Negocio creado");
    } catch (e) {
      alert(e.message || "No se pudo crear el negocio");
    }
  }

  async function editBusiness(business) {
    const name = prompt("Nombre del negocio:", business.name);
    if (name == null || !name.trim()) return;
    const address = prompt("Dirección:", business.address || "");
    if (address == null) return;
    try {
      await api.updateBusiness(business.id, { name: name.trim(), address: address.trim() });
      loadBusinesses();
    } catch (e) {
      alert(e.message || "No se pudo actualizar el negocio");
    }
  }

  async function toggleBusiness(business) {
    const action = business.active ? "desactivar" : "reactivar";
    if (!confirm(`¿Querés ${action} ${business.name}?`)) return;
    try {
      await api.updateBusiness(business.id, { active: !business.active });
      if (business.id === activeBusinessId && business.active) {
        api.setBusinessId(null);
        setActiveBusinessId("");
        setView("businesses");
      }
      await loadBusinesses();
    } catch (e) {
      alert(e.message || `No se pudo ${action} el negocio`);
    }
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

  function clearCart() {
    setCart([]);
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


  // Process sale
  async function processSale() {
    if (isProcessingSale || !cart.length) return;

    // Validate mixed payment
    if (paymentMethod === "mixed") {
      const sum = Number(cashAmount || 0) + Number(transferAmount || 0);
      if (Math.abs(sum - cartTotal) > 0.01) {
        feedback("El pago mixto no coincide con el total.", "error");
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
      feedback("Venta registrada.");
      loadData();
      loadSales();
    } catch (e) {
      feedback(e.message || "No se pudo registrar la venta.", "error");
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

    if (!name || !Number.isFinite(price) || !Number.isFinite(costPrice) || !code || !Number.isFinite(stock)) {
      alert("Falta nombre / precio / costo / code / stock.");
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

  async function addCatalogProductToBusiness() {
    const price = Number(catalogSelection.price);
    const costPrice = Number(catalogSelection.costPrice);
    const stock = Number(catalogSelection.stock);
    if (!catalogSelection.productId || ![price, costPrice, stock].every(Number.isFinite)) {
      alert("Seleccioná producto, precio, costo y stock.");
      return;
    }
    try {
      await api.createProduct({ productId: catalogSelection.productId, price, costPrice, stock });
      setCatalogSelection({ productId: "", price: "", costPrice: "", stock: "" });
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo agregar el producto");
    }
  }

  async function editCatalogProduct(product) {
    const name = prompt("Nombre global:", product.name);
    if (name == null || !name.trim()) return;
    const code = prompt("Código global:", product.code || "");
    if (code == null || !code.trim()) return;
    const barcode = prompt("Código de barras:", product.barcode || "");
    if (barcode == null) return;
    try {
      await api.updateCatalogProduct(product.productId, { name: name.trim(), code: code.trim(), barcode: barcode.trim() });
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo editar el catálogo");
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

  async function deleteProductAction(product) {
    if (!isAdmin) return;
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.deleteProduct(product.id);
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo eliminar el producto");
    }
  }

  async function deactivateProductAction(product) {
    if (!isAdmin) return;
    if (!confirm(`¿Desactivar "${product.name}"?`)) {
      return;
    }
    try {
      await api.updateProduct(product.id, { active: false });
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo desactivar el producto");
    }
  }

  // Purchases (admin)
  function addPurchaseItem() {
    if (!isAdmin) return;
    const pid = purchaseItem.productId;
    const qty = Number(purchaseItem.qty);
    const costPrice = Number(purchaseItem.costPrice);

    if (!pid || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
      feedback("Revisá el producto, la cantidad y el costo.", "error");
      return;
    }

    const p = products.find((x) => x.id === pid);
    if (!p) {
      feedback("Producto no encontrado.", "error");
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
      feedback("Compra registrada.");
      loadData();
    } catch (e) {
      feedback(e.message || "No se pudo registrar la compra.", "error");
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
    setVoidSaleDialog({ sale, reason: sale.voidReason || "" });
  }

  async function confirmVoidSale() {
    if (!voidSaleDialog) return;
    try {
      await api.voidSale(voidSaleDialog.sale.id, voidSaleDialog.reason || "");
      setVoidSaleDialog(null);
      notify("Venta anulada.");
      loadSales();
      loadData();
    } catch (e) {
      notify(e.message || "No se pudo anular la venta.", "error");
    }
  }

  async function deleteSale(sale) {
    if (!isAdmin) return;
    setConfirmAction({ title: "Eliminar venta", message: (sale.status || "ACTIVE") === "VOIDED" ? "Esta venta se eliminará definitivamente." : "La venta se anulará y luego se eliminará definitivamente.", destructive: true, run: async () => {
      try {
        if ((sale.status || "ACTIVE") !== "VOIDED") await api.voidSale(sale.id, "Eliminada por administrador");
        await api.deleteSale(sale.id);
        notify("Venta eliminada.");
        loadSales();
      } catch (e) { notify(e.message || "No se pudo eliminar la venta.", "error"); }
      setConfirmAction(null);
    }});
  }

  async function saveSaleEdit() {
    if (!isAdmin || !saleEdit) return;

    const { saleId } = saleEdit;
    const total = Number(saleEdit.total || 0);
    const pm = saleEdit.paymentMethod;

    if (pm === "mixed") {
      const sum = Number(saleEdit.cashAmount) + Number(saleEdit.transferAmount);
      if (Math.abs(sum - total) > 0.01) {
        notify("El pago mixto no coincide con el total.", "error");
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
      notify("Forma de pago actualizada.");
      loadSales();
    } catch (e) {
      notify(e.message || "No se pudo editar la venta.", "error");
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

  async function toggleUserActive(employee) {
    try {
      await api.updateUser(employee.id, { active: !employee.active });
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo actualizar el empleado");
    }
  }

  async function moveUser(employee, businessId) {
    if (!businessId || businessId === employee.businessId) return;
    if (!confirm("¿Mover este empleado al negocio seleccionado?")) return;
    try {
      await api.updateUser(employee.id, { businessId });
      loadData();
    } catch (e) {
      alert(e.message || "No se pudo reasignar el empleado");
    }
  }

  const filteredProducts = useMemo(() => {
    const query = adminSearch.trim().toLowerCase();
    return products
      .filter((p) => productStatus === "all" || (productStatus === "critical" ? p.active && isCriticalStock(p) : productStatus === "active" ? p.active : !p.active))
      .filter((p) => !query || [p.name, p.code, p.barcode].some((value) => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => {
        if (productSort === "stock") return Number(a.stock) - Number(b.stock);
        if (productSort === "margin") return (Number(b.price) - Number(b.costPrice)) - (Number(a.price) - Number(a.costPrice));
        return String(a.name).localeCompare(String(b.name), "es");
      });
  }, [products, adminSearch, productStatus, productSort]);

  const criticalStockProducts = useMemo(() => products.filter((p) => p.active && isCriticalStock(p)).sort((a, b) => (Number(a.stock) - Number(a.criticalStock ?? 5)) - (Number(b.stock) - Number(b.criticalStock ?? 5))), [products]);
  const activeEmployees = useMemo(() => profiles.filter((profile) => profile.active), [profiles]);
  const recentSales = useMemo(() => [...daySalesActive].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5), [daySalesActive]);
  const reportChartMax = useMemo(() => Math.max(1, ...(reportSummary?.trend || []).map((item) => Number(item.grossSales || 0))), [reportSummary]);
  const reportPeriodLabel = useMemo(() => reportPeriod === "day"
    ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${selectedDayKey}T12:00:00Z`))
    : reportPeriod === "year" ? String(reportYear)
      : new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(reportYear, reportMonth - 1, 1)),
  [reportPeriod, reportYear, reportMonth, selectedDayKey]);

  function navigateAdmin(nextView) {
    setView(nextView);
    if (nextView === "dashboard") setSelectedDayKey(todayKey);
    setMobileNavOpen(false);
    setAdminSearch("");
  }

  function openBusinessDrawer(business = null) {
    setEditingBusiness(business);
    setBusinessForm({ name: business?.name || "", address: business?.address || "" });
    setDrawer("business");
  }

  async function saveBusinessForm() {
    if (!businessForm.name.trim()) return notify("Ingresá el nombre del negocio.", "error");
    try {
      if (editingBusiness) {
        await api.updateBusiness(editingBusiness.id, { name: businessForm.name.trim(), address: businessForm.address.trim() });
        notify("Negocio actualizado.");
      } else {
        const created = await api.createBusiness({ name: businessForm.name.trim(), address: businessForm.address.trim() });
        switchBusiness(created.id);
        notify("Negocio creado y seleccionado.");
      }
      setDrawer(null);
      await loadBusinesses();
    } catch (error) { notify(error.message || "No se pudo guardar el negocio.", "error"); }
  }

  function openProductDrawer(product = null) {
    setEditingProduct(product);
    setProductForm(product ? {
      mode: "edit", productId: product.productId, name: product.name, code: product.code || "", barcode: product.barcode || "",
      price: String(product.price), costPrice: String(product.costPrice), stock: String(product.stock), criticalStock: String(product.criticalStock ?? 5),
    } : { mode: "new", productId: "", name: "", code: "", barcode: "", price: "", costPrice: "", stock: "", criticalStock: "5" });
    setDrawer("product");
  }

  async function saveProductForm() {
    const price = Number(productForm.price), costPrice = Number(productForm.costPrice), stock = Number(productForm.stock), criticalStock = Number(productForm.criticalStock);
    if (!Number.isInteger(criticalStock) || criticalStock < 0) return notify("El stock crítico debe ser un número entero mayor o igual a cero.", "error");
    if (![price, costPrice, stock].every(Number.isFinite) || price < 0 || costPrice < 0) return notify("Revisá precio, costo y stock.", "error");
    try {
      if (editingProduct) {
        await Promise.all([
          api.updateCatalogProduct(editingProduct.productId, { name: productForm.name.trim(), code: productForm.code.trim(), barcode: productForm.barcode.trim() }),
          api.updateProduct(editingProduct.id, { price, costPrice, stock, criticalStock }),
        ]);
        notify("Producto actualizado.");
      } else if (productForm.mode === "catalog") {
        if (!productForm.productId) return notify("Seleccioná un producto del catálogo.", "error");
        await api.createProduct({ productId: productForm.productId, price, costPrice, stock, criticalStock });
        notify("Producto agregado al negocio.");
      } else {
        if (!productForm.name.trim() || !productForm.code.trim()) return notify("Nombre y código son obligatorios.", "error");
        await api.createProduct({ name: productForm.name.trim(), code: productForm.code.trim(), barcode: productForm.barcode.trim(), price, costPrice, stock, criticalStock });
        notify("Producto creado.");
      }
      setDrawer(null);
      await loadData();
    } catch (error) { notify(error.message || "No se pudo guardar el producto.", "error"); }
  }

  function openUserDrawer(employee = null) {
    setEditingUser(employee);
    setUserForm({ username: employee?.username || "", password: "", name: employee?.name || "", businessId: employee?.businessId || activeBusinessId });
    setDrawer("user");
  }

  async function saveUserForm() {
    if (!userForm.name.trim() || (!editingUser && (!userForm.username.trim() || userForm.password.length < 6))) return notify("Completá nombre, usuario y una contraseña de 6 caracteres.", "error");
    try {
      if (editingUser) {
        const changes = { name: userForm.name.trim(), businessId: userForm.businessId };
        if (userForm.password) changes.password = userForm.password;
        await api.updateUser(editingUser.id, changes);
        notify("Empleado actualizado.");
      } else {
        await api.createUser({ username: userForm.username.trim(), password: userForm.password, name: userForm.name.trim(), role: "CASHIER" });
        if (userForm.businessId && userForm.businessId !== activeBusinessId) {
          const fresh = await api.getUsers();
          const created = fresh.find((item) => item.username === userForm.username.trim().toLowerCase());
          if (created) await api.updateUser(created.id, { businessId: userForm.businessId });
        }
        notify("Empleado creado.");
      }
      setDrawer(null);
      await loadData();
    } catch (error) { notify(error.message || "No se pudo guardar el empleado.", "error"); }
  }

  async function submitStockAdjustment() {
    const delta = Number(stockDialog?.delta);
    if (!Number.isFinite(delta) || delta === 0 || !stockDialog?.reason?.trim()) return notify("Ingresá una cantidad y un motivo.", "error");
    try {
      await api.adjustStock(stockDialog.product.id, delta, stockDialog.reason.trim());
      setStockDialog(null);
      notify("Stock actualizado.");
      await loadData();
    } catch (error) { notify(error.message || "No se pudo ajustar el stock.", "error"); }
  }

  function requestToggle(kind, item) {
    const active = item.active;
    setConfirmAction({
      title: `${active ? "Desactivar" : "Reactivar"} ${kind}`,
      message: `¿Confirmás que querés ${active ? "desactivar" : "reactivar"} “${item.name}”?`,
      destructive: active,
      run: async () => {
        try {
          if (kind === "producto") await api.updateProduct(item.id, { active: !active });
          if (kind === "empleado") await api.updateUser(item.id, { active: !active });
          if (kind === "negocio") {
            await api.updateBusiness(item.id, { active: !active });
            if (active && item.id === activeBusinessId) { api.setBusinessId(null); setActiveBusinessId(""); navigateAdmin("businesses"); }
            await loadBusinesses();
          } else await loadData();
          notify(`${kind[0].toUpperCase() + kind.slice(1)} ${active ? "desactivado" : "reactivado"}.`);
        } catch (error) { notify(error.message || "No se pudo completar la acción.", "error"); }
        setConfirmAction(null);
      },
    });
  }

  const viewTitle =
    view === "dashboard"
      ? "Resumen"
      : view === "pos"
      ? "Punto de Venta"
      : view === "inventory"
        ? "Inventario"
        : view === "users"
          ? "Empleados"
          : view === "purchases"
            ? "Compras"
            : view === "sales"
              ? "Ventas"
              : view === "businesses"
                ? "Negocios"
                : isAdmin ? "Reportes" : "Reporte Diario";

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
            className={`w-full p-3 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${loginErr ? "border-red-400" : "border-slate-200"
              }`}
            placeholder="ej: exequiel, caja1"
            value={login.username}
            onChange={(e) => setLogin((s) => ({ ...s, username: e.target.value }))}
          />

          <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
          <input
            className={`w-full p-3 border rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-600/30 ${loginErr ? "border-red-400" : "border-slate-200"
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
    <div className={`min-h-screen bg-slate-50 text-slate-900 flex ${isAdmin ? "admin-shell" : ""}`}>
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

      {isAdmin && <>
        {mobileNavOpen && <button aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" onClick={() => setMobileNavOpen(false)} />}
        <aside className={`admin-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-950 text-white transition-transform lg:sticky lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-black shadow-lg shadow-blue-950/40">PF</div>
            <div><div className="font-bold tracking-tight">Pago Fácil</div><div className="text-xs text-slate-400">Administración</div></div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {[["dashboard", "dashboard", "Resumen"], ["pos", "pos", "Punto de venta"], ["businesses", "business", "Negocios"], ["inventory", "box", "Productos"], ["purchases", "purchase", "Compras"], ["sales", "sales", "Ventas"], ["users", "users", "Empleados"], ["reports", "report", "Reportes"]]
              .filter(([key]) => activeBusinessId || key === "businesses").map(([key, icon, label]) => (
                <button key={key} onClick={() => navigateAdmin(key)} className={`admin-nav-item ${view === key ? "active" : ""}`}><Icon name={icon} size={19}/><span>{label}</span></button>
              ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <button onClick={logout} className="admin-nav-item w-full"><Icon name="logout" size={19}/><span>Cerrar sesión</span></button>
            <div className="mt-3 flex items-center gap-3 px-3 pb-2"><div className="grid h-9 w-9 place-items-center rounded-full bg-blue-600/20 text-sm font-bold text-blue-300">{String(user.name || "A").slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-semibold">{user.name}</div><div className="text-xs text-slate-500">Dueño</div></div></div>
          </div>
        </aside>
      </>}

      {/* Sidebar de caja: se conserva sin cambios visuales */}
      <aside className={isAdmin ? "hidden" : "w-72 bg-slate-900 text-slate-100 p-6 flex flex-col gap-2 border-r border-slate-800 shadow-lg"}>
        <div className="mb-2">
          <div className="text-xs uppercase tracking-widest text-slate-400">Sistema</div>
          <div className="font-semibold text-2xl">Pago Fácil POS</div>
        </div>
        <div className="text-xs text-slate-300 mb-4">
          Sesión: <b>{user.name || user.email}</b> {isAdmin ? "(admin)" : "(caja)"}
        </div>

        {isAdmin ? (
          <select
            className="mb-3 p-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
            value={activeBusinessId}
            onChange={(e) => switchBusiness(e.target.value)}
          >
            <option value="">Seleccionar negocio</option>
            {businesses.filter((business) => business.active).map((business) => (
              <option key={business.id} value={business.id}>{business.name}</option>
            ))}
          </select>
        ) : (
          <div className="text-sm font-semibold text-blue-300 mb-3">{user.business?.name}</div>
        )}

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
          <button
            onClick={() => setView("businesses")}
            className={
              "px-4 py-3 rounded-lg text-left transition " +
              (view === "businesses" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:bg-slate-800")
            }
          >
            Negocios
          </button>
        )}

        {isAdmin && activeBusinessId && (
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
              Empleados
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
      <main className={`min-w-0 flex-1 overflow-y-auto ${isAdmin ? "admin-main p-4 sm:p-6 lg:p-8" : "p-6 lg:p-8"}`}>
        <div className={`mb-6 flex items-center justify-between ${isAdmin ? "admin-topbar" : "bg-white border border-slate-200 rounded-2xl px-6 py-4 shadow-sm"}`}>
          <div>
            {isAdmin && <button className="icon-button mb-3 lg:hidden" onClick={() => setMobileNavOpen(true)}><Icon name="menu" /></button>}
            <div className={`text-xs uppercase tracking-widest ${isAdmin ? "font-bold text-blue-600" : "text-slate-500"}`}>{isAdmin ? "Panel administrativo" : "Panel"}</div>
            <h2 className={`${isAdmin ? "mt-1 text-3xl font-bold tracking-tight" : "text-2xl font-semibold"} text-slate-900`}>{viewTitle}</h2>
          </div>
          {isAdmin ? <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><div className="text-xs font-medium text-slate-500">Negocio activo</div><div className="text-sm font-bold text-slate-900">{activeBusiness?.name || "Sin selección"}</div></div>
            <select className="admin-select max-w-[180px]" value={activeBusinessId} onChange={(e) => switchBusiness(e.target.value)}><option value="">Seleccionar</option>{businesses.filter((business) => business.active).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select>
          </div> : <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-slate-400">Usuario actual</div>
            <div className="text-sm font-semibold text-slate-800">{user.name || user.email}</div>
            <div className="text-xs text-slate-500">{isAdmin ? "Dueño" : "Cajero"}</div>
            <div className="text-xs font-semibold text-blue-600 mt-1">
              {activeBusiness?.name || "Sin negocio seleccionado"}
            </div>
          </div>}
        </div>

        {view === "dashboard" && isAdmin && activeBusinessId && (
          <div className="mx-auto max-w-7xl space-y-6">
            <section className="admin-hero">
              <div><p className="text-sm font-semibold text-blue-100">{new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h3 className="mt-2 text-2xl font-bold sm:text-3xl">Hola, {String(user.name || "Administrador").split(" ")[0]}</h3><p className="mt-2 max-w-xl text-sm text-blue-100">Este es el estado de {activeBusiness?.name}. Tenés las tareas importantes y los números del día en un solo lugar.</p></div>
              <button className="btn bg-white text-blue-700 hover:bg-blue-50" onClick={() => navigateAdmin("inventory")}><Icon name="plus" size={18}/>Nuevo producto</button>
            </section>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Ventas de hoy", `$ ${money(totalDay)}`, `${daySalesActive.length} operaciones`, "blue"],
                ["Ganancia", `$ ${money(profitDay)}`, "Venta menos costos", "emerald"],
                ["Stock crítico", criticalStockProducts.length, criticalStockProducts.length ? "Requieren atención" : "Todo en orden", "amber"],
                ["Equipo activo", activeEmployees.length, `${profiles.length} empleados totales`, "violet"],
              ].map(([label, value, note, tone]) => <article key={label} className="metric-card"><div className={`metric-icon ${tone}`}><Icon name={label === "Equipo activo" ? "users" : label === "Stock crítico" ? "alert" : "sales"} /></div><div className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{value}</div><div className="mt-1 text-xs text-slate-500">{note}</div></article>)}
            </section>
            <section className="grid gap-6 lg:grid-cols-5">
              <div className="admin-card lg:col-span-3"><div className="card-heading"><div><h3>Actividad reciente</h3><p>Últimas ventas registradas hoy</p></div><button className="text-button" onClick={() => navigateAdmin("sales")}>Ver todas <Icon name="chevron" size={16}/></button></div>
                <div className="divide-y divide-slate-100">{recentSales.map((sale) => <div key={sale.id} className="flex items-center justify-between py-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Icon name="sales" size={18}/></div><div><div className="text-sm font-bold">Venta de {sale.sellerName}</div><div className="text-xs text-slate-500">{formatTime(sale.createdAt)} · {(sale.items || []).length} productos</div></div></div><div className="text-sm font-black">$ {money(sale.total)}</div></div>)}{!recentSales.length && <div className="empty-state">Todavía no hay ventas registradas hoy.</div>}</div>
              </div>
              <div className="admin-card lg:col-span-2"><div className="card-heading"><div><h3>Notificaciones de inventario</h3><p>Productos que alcanzaron su stock crítico</p></div></div>
                <div className="space-y-3">{criticalStockProducts.slice(0, 5).map((product) => <button key={product.id} className="flex w-full items-center justify-between rounded-xl bg-amber-50 p-3 text-left hover:bg-amber-100" onClick={() => { navigateAdmin("inventory"); setAdminSearch(product.name); }}><div><div className="text-sm font-bold">{product.name}</div><div className="text-xs text-slate-500">{product.code} · Avisar en {product.criticalStock ?? 5} u.</div></div><span className={`status-badge ${Number(product.stock) <= 0 ? "danger" : "warning"}`}>{product.stock} u.</span></button>)}{!criticalStockProducts.length && <div className="empty-state">No hay notificaciones de stock crítico.</div>}</div>
              </div>
            </section>
          </div>
        )}

        {view === "businesses" && isAdmin && (
          <div className="mx-auto max-w-7xl">
            <div className="section-toolbar"><div><h3>Tus negocios</h3><p>Elegí el local que querés administrar o agregá uno nuevo.</p></div><button className="btn btn-primary" onClick={() => openBusinessDrawer()}><Icon name="plus" size={18}/>Nuevo negocio</button></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {businesses.map((business) => <article key={business.id} className={`business-card ${business.id === activeBusinessId ? "selected" : ""}`}>
                <div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name="business" /></div><span className={`status-badge ${business.active ? "success" : "neutral"}`}>{business.active ? "Activo" : "Inactivo"}</span></div>
                <h3 className="mt-5 text-lg font-bold">{business.name}</h3><p className="mt-1 min-h-5 text-sm text-slate-500">{business.address || "Sin dirección registrada"}</p>
                {business.id === activeBusinessId && <div className="mt-4 text-xs font-bold text-blue-600">NEGOCIO SELECCIONADO</div>}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{business.active && business.id !== activeBusinessId && <button className="btn btn-soft" onClick={() => { switchBusiness(business.id); notify("Negocio seleccionado."); }}>Seleccionar</button>}<button className="btn btn-ghost" onClick={() => openBusinessDrawer(business)}><Icon name="edit" size={16}/>Editar</button><button className={`btn btn-ghost ${business.active ? "text-rose-600" : "text-emerald-600"}`} onClick={() => requestToggle("negocio", business)}>{business.active ? "Desactivar" : "Reactivar"}</button></div>
              </article>)}
            </div>
          </div>
        )}

        {false && view === "businesses" && isAdmin && (
          <div className="max-w-5xl">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Crear negocio</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  className="p-3 border border-slate-200 rounded-lg"
                  placeholder="Nombre"
                  value={newBusiness.name}
                  onChange={(e) => setNewBusiness((current) => ({ ...current, name: e.target.value }))}
                />
                <input
                  className="p-3 border border-slate-200 rounded-lg"
                  placeholder="Dirección"
                  value={newBusiness.address}
                  onChange={(e) => setNewBusiness((current) => ({ ...current, address: e.target.value }))}
                />
                <button onClick={createBusiness} className="bg-blue-600 text-white font-semibold rounded-lg px-4 py-3">
                  Crear negocio
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr><th className="p-4">Negocio</th><th className="p-4">Dirección</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {businesses.map((business) => (
                    <tr key={business.id} className={business.active ? "" : "opacity-60"}>
                      <td className="p-4 font-semibold">{business.name}</td>
                      <td className="p-4 text-slate-600">{business.address || "-"}</td>
                      <td className="p-4">{business.active ? "Activo" : "Desactivado"}</td>
                      <td className="p-4 flex gap-3">
                        {business.active && <button className="text-blue-600 font-semibold" onClick={() => switchBusiness(business.id)}>Seleccionar</button>}
                        <button className="text-slate-600 font-semibold" onClick={() => editBusiness(business)}>Editar</button>
                        <button className={business.active ? "text-rose-600 font-semibold" : "text-emerald-600 font-semibold"} onClick={() => toggleBusiness(business)}>
                          {business.active ? "Desactivar" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* POS */}
        {view === "pos" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-2">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">Productos</h2>

              <div className="mb-4 relative">
                <label className="block text-sm font-medium text-slate-700 mb-2">Buscar producto</label>
                <input
                  ref={searchRef}
                  autoFocus={view === "pos"}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white shadow-sm"
                  placeholder="Buscar por code / nombre / barcode"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearchOpen(true);
                    setSearchIndex(-1);
                  }}
                  onBlur={() => {
                    if (view !== "pos") return;
                    setTimeout(() => {
                      const activeTag = document.activeElement?.tagName?.toLowerCase();
                      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
                        return;
                      }
                      searchRef.current?.focus();
                    }, 0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const term = e.currentTarget.value.trim().toLowerCase();
                      if (!term && cart.length > 0 && !isProcessingSale) {
                        e.preventDefault();
                        processSale();
                        return;
                      }
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
                        setSearchIndex(-1);
                        setSearchTerm("");
                        setSearchOpen(false);
                      } else {
                        if (searchIndex >= 0 && matches[searchIndex]) {
                          addToCart(matches[searchIndex]);
                          setSearchIndex(-1);
                          setSearchTerm("");
                          setSearchOpen(false);
                        } else {
                          setSearchOpen(true);
                        }
                      }
                    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      const term = e.currentTarget.value.trim().toLowerCase();
                      if (!term) return;
                      e.preventDefault();
                      const byCode = products.filter((p) =>
                        String(p.code || "").toLowerCase().includes(term)
                      );
                      const byName = products.filter((p) =>
                        String(p.name || "").toLowerCase().includes(term)
                      );
                      const matches = byCode.length ? byCode : byName;
                      if (matches.length === 0) return;
                      setSearchOpen(true);
                      setSearchIndex((prev) => {
                        if (e.key === "ArrowDown") {
                          return prev < matches.length - 1 ? prev + 1 : 0;
                        }
                        return prev > 0 ? prev - 1 : matches.length - 1;
                      });
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

                      return matches.slice(0, 8).map((p, idx) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            addToCart(p);
                            setSearchIndex(-1);
                            setSearchTerm("");
                            setSearchOpen(false);
                          }}
                          className={
                            "w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 " +
                            (idx === searchIndex
                              ? "bg-blue-50 outline outline-1 outline-blue-200"
                              : "hover:bg-slate-50")
                          }
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
                Tip: tocá una vez la pantalla y escaneá. El lector escribe y manda Enter. ESC vacía el carrito.
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
                      <div className="text-sm text-slate-600">
                        <span className="text-lg font-semibold text-slate-800">{i.qty}</span>{" "}
                        x $ {money(i.price)}
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
          <div className="mx-auto max-w-7xl">
            <div className="section-toolbar"><div><h3>Catálogo del negocio</h3><p>Administrá precios, costos y stock sin perder el contexto.</p></div><button className="btn btn-primary" onClick={() => openProductDrawer()}><Icon name="plus" size={18}/>Nuevo producto</button></div>
            <div className="admin-card mb-4 p-3 sm:p-4"><div className="grid gap-3 md:grid-cols-[1fr_auto_auto]"><div className="search-box"><Icon name="search" size={18}/><input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Buscar por nombre, código o barras..."/></div><select className="admin-select" value={productStatus} onChange={(event) => setProductStatus(event.target.value)}><option value="active">Activos</option><option value="critical">Stock crítico</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select><select className="admin-select" value={productSort} onChange={(event) => setProductSort(event.target.value)}><option value="name">Orden: Nombre</option><option value="stock">Orden: Menor stock</option><option value="margin">Orden: Mayor margen</option></select></div></div>
            <div className="admin-card overflow-hidden p-0">
              <div className="hidden overflow-x-auto md:block"><table className="admin-table"><thead><tr><th>Producto</th><th>Venta</th><th>Costo</th><th>Margen</th><th>Stock actual</th><th>Stock crítico</th><th>Estado</th><th></th></tr></thead><tbody>{filteredProducts.map((product) => { const margin = Number(product.price) - Number(product.costPrice); return <tr key={product.id}><td><div className="font-bold text-slate-900">{product.name}</div><div className="text-xs text-slate-500">{product.code}{product.barcode ? ` · ${product.barcode}` : ""}</div></td><td className="font-semibold">$ {money(product.price)}</td><td>$ {money(product.costPrice)}</td><td><span className={margin >= 0 ? "text-emerald-600" : "text-rose-600"}>$ {money(margin)}</span></td><td><button className={`stock-pill ${Number(product.stock) <= 0 ? "danger" : isCriticalStock(product) ? "warning" : ""}`} onClick={() => setStockDialog({ product, delta: "", reason: "" })}>{product.stock} u.</button></td><td><span className={`status-badge ${isCriticalStock(product) ? "warning" : "neutral"}`}>{product.criticalStock ?? 5} u.</span></td><td><span className={`status-badge ${product.active ? "success" : "neutral"}`}>{product.active ? "Activo" : "Inactivo"}</span></td><td><div className="flex justify-end gap-1"><button className="icon-button" title="Editar" onClick={() => openProductDrawer(product)}><Icon name="edit" size={17}/></button><button className={`text-button px-2 ${product.active ? "text-rose-600" : "text-emerald-600"}`} onClick={() => requestToggle("producto", product)}>{product.active ? "Desactivar" : "Reactivar"}</button></div></td></tr>; })}</tbody></table></div>
              <div className="divide-y divide-slate-100 md:hidden">{filteredProducts.map((product) => <article key={product.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{product.name}</h3><p className="text-xs text-slate-500">{product.code}</p></div><span className={`status-badge ${product.active ? "success" : "neutral"}`}>{product.active ? "Activo" : "Inactivo"}</span></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><span className="block text-xs text-slate-500">Venta</span><b>$ {money(product.price)}</b></div><div><span className="block text-xs text-slate-500">Costo</span><b>$ {money(product.costPrice)}</b></div><div><span className="block text-xs text-slate-500">Stock actual</span><b className={isCriticalStock(product) ? "text-amber-700" : ""}>{product.stock} u.</b></div><div><span className="block text-xs text-slate-500">Avisar en</span><b>{product.criticalStock ?? 5} u.</b></div></div><div className="mt-3 flex gap-2"><button className="btn btn-soft flex-1" onClick={() => openProductDrawer(product)}>Editar</button><button className="btn btn-ghost flex-1" onClick={() => setStockDialog({ product, delta: "", reason: "" })}>Ajustar stock</button></div></article>)} </div>
              {!filteredProducts.length && <div className="empty-state m-6">No encontramos productos con esos filtros.</div>}
            </div>
          </div>
        )}

        {false && view === "inventory" && isAdmin && (
          <div className="max-w-5xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Inventario (admin)</h2>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm">
              <div className="font-bold mb-3">Agregar desde el catálogo compartido</div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <select
                  className="p-3 border border-slate-200 rounded-lg bg-white"
                  value={catalogSelection.productId}
                  onChange={(e) => setCatalogSelection((current) => ({ ...current, productId: e.target.value }))}
                >
                  <option value="">Seleccionar producto</option>
                  {catalog.filter((item) => !products.some((product) => product.productId === item.id)).map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                  ))}
                </select>
                <input type="number" className="p-3 border rounded-lg" placeholder="Precio" value={catalogSelection.price} onChange={(e) => setCatalogSelection((current) => ({ ...current, price: e.target.value }))} />
                <input type="number" className="p-3 border rounded-lg" placeholder="Costo" value={catalogSelection.costPrice} onChange={(e) => setCatalogSelection((current) => ({ ...current, costPrice: e.target.value }))} />
                <input type="number" className="p-3 border rounded-lg" placeholder="Stock" value={catalogSelection.stock} onChange={(e) => setCatalogSelection((current) => ({ ...current, stock: e.target.value }))} />
                <button className="bg-slate-900 text-white font-semibold rounded-lg" onClick={addCatalogProductToBusiness}>Agregar</button>
              </div>
            </div>

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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
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
                    <th className="p-4">Acciones</th>
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
                        <td className="p-4 font-semibold whitespace-nowrap">{p.name}</td>

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
                          <div className="flex flex-wrap gap-2">
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
                              className="p-2 border border-slate-200 rounded-lg w-44"
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
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <button
                              className="text-blue-600 font-semibold hover:text-blue-700"
                              onClick={() => editCatalogProduct(p)}
                            >
                              Editar catálogo
                            </button>
                            <button
                              className="text-amber-600 font-semibold hover:text-amber-700"
                              onClick={() => deactivateProductAction(p)}
                            >
                              Desactivar
                            </button>
                            <button
                              className="text-red-600 font-semibold hover:text-red-700"
                              onClick={() => deleteProductAction(p)}
                            >
                              Eliminar
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

            {/* Top Product KPI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Producto más vendido (Histórico)</div>
                {topProduct ? (
                  <>
                    <div className="text-xl font-bold text-slate-900">{topProduct.name}</div>
                    <div className="text-sm text-slate-600">{topProduct.qty} unidades vendidas</div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400 italic">Cargando o sin datos...</div>
                )}
              </div>
            </div>

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
          <div className="mx-auto max-w-7xl">
            <div className="section-toolbar"><div><h3>Equipo de trabajo</h3><p>Gestioná accesos y asignaciones del negocio seleccionado.</p></div><button className="btn btn-primary" onClick={() => openUserDrawer()}><Icon name="plus" size={18}/>Nuevo empleado</button></div>
            <div className="admin-card mb-4 p-3 sm:p-4"><div className="search-box"><Icon name="search" size={18}/><input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Buscar por nombre o usuario..."/></div></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{profiles.filter((employee) => !adminSearch || [employee.name, employee.username].some((value) => String(value).toLowerCase().includes(adminSearch.toLowerCase()))).map((employee) => <article key={employee.id} className="employee-card"><div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-lg font-black text-blue-700">{String(employee.name).slice(0, 1).toUpperCase()}</div><span className={`status-badge ${employee.active ? "success" : "neutral"}`}>{employee.active ? "Activo" : "Inactivo"}</span></div><h3 className="mt-4 text-lg font-bold">{employee.name}</h3><p className="text-sm text-slate-500">@{employee.username}</p><div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Negocio</span><div className="font-semibold">{businesses.find((business) => business.id === employee.businessId)?.name || activeBusiness?.name}</div></div><div className="mt-4 flex gap-2"><button className="btn btn-soft flex-1" onClick={() => openUserDrawer(employee)}><Icon name="edit" size={16}/>Editar</button><button className={`btn btn-ghost flex-1 ${employee.active ? "text-rose-600" : "text-emerald-600"}`} onClick={() => requestToggle("empleado", employee)}>{employee.active ? "Desactivar" : "Reactivar"}</button></div></article>)} </div>
            {!profiles.length && <div className="empty-state admin-card">Todavía no hay empleados en este negocio.</div>}
          </div>
        )}

        {false && view === "users" && isAdmin && (
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-slate-900 mb-4">Empleados</h2>

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
                </select>
                <button
                  onClick={createUser}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition"
                >
                  Crear
                </button>
              </div>
            </div>



            {false && (
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
            )}

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Negocio</th>
                    <th className="p-4">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 even:bg-slate-50/60">
                      <td className="p-4 font-semibold">{u.name}</td>
                      <td className="p-4 text-slate-600">{u.username}</td>
                      <td className="p-4 text-slate-600">
                        <select className="p-2 border rounded-lg" value={u.businessId || ""} onChange={(e) => moveUser(u, e.target.value)}>
                          {businesses.filter((business) => business.active).map((business) => (
                            <option key={business.id} value={business.id}>{business.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-4">
                        {u.id !== user.id && (
                          <button
                            onClick={() => u.active ? deleteUserAction(u.id) : toggleUserActive(u)}
                            className={u.active ? "text-red-600 font-semibold hover:text-red-700" : "text-emerald-600 font-semibold"}
                          >
                            {u.active ? "Desactivar" : "Reactivar"}
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
        {view === "reports" && isAdmin && (
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="section-toolbar"><div><h3>Rendimiento del negocio</h3><p>Analizá facturación, rentabilidad y productos para tomar mejores decisiones.</p></div><button className="btn btn-ghost" onClick={reportPeriod === "day" ? loadSales : loadReportSummary} disabled={reportLoading}>{reportLoading ? "Actualizando..." : "Actualizar datos"}</button></div>

            <section className="admin-card report-filters"><div className="period-switch"><button className={reportPeriod === "day" ? "active" : ""} onClick={() => setReportPeriod("day")}>Diario</button><button className={reportPeriod === "month" ? "active" : ""} onClick={() => setReportPeriod("month")}>Mensual</button><button className={reportPeriod === "year" ? "active" : ""} onClick={() => setReportPeriod("year")}>Anual</button></div><div className="flex flex-wrap gap-3">{reportPeriod === "day" ? <input className="admin-input min-w-40" type="date" value={selectedDayKey} onChange={(event) => setSelectedDayKey(event.target.value)} /> : <>{reportPeriod === "month" && <select className="admin-select min-w-40" value={reportMonth} onChange={(event) => setReportMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(2024, index, 1))}</option>)}</select>}<select className="admin-select min-w-28" value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))}>{Array.from({ length: Math.max(7, currentDateParts[0] - 2019) }, (_, index) => currentDateParts[0] - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></>}</div><div className="ml-auto text-right"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Período analizado</div><div className="mt-1 font-bold capitalize text-slate-800">{reportPeriodLabel}</div></div></section>

            {reportPeriod === "day" && <>
              <section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><article className="report-kpi primary"><div className="report-kpi-icon"><Icon name="sales" /></div><div><span>Venta bruta</span><strong>$ {money(totalDay)}</strong><small>{daySalesActive.length} operaciones</small></div></article><article className="report-kpi success"><div className="report-kpi-icon">↗</div><div><span>Ganancia</span><strong>$ {money(profitDay)}</strong><small>{totalDay ? ((profitDay / totalDay) * 100).toFixed(1) : 0}% de margen</small></div></article><article className="report-kpi neutral"><div className="report-kpi-icon">−</div><div><span>Costo de mercadería</span><strong>$ {money(cogsDay)}</strong><small>Del día seleccionado</small></div></article><article className="report-kpi warm"><div className="report-kpi-icon">$</div><div><span>Ticket promedio</span><strong>$ {money(daySalesActive.length ? totalDay / daySalesActive.length : 0)}</strong><small>Por operación</small></div></article></section>
              <section className="grid gap-6 lg:grid-cols-2"><div className="admin-card"><div className="card-heading"><div><h3>Medios de pago</h3><p>Ingresos del día seleccionado</p></div></div>{[["Efectivo", totalsByPayment.cash, "cash"], ["Transferencia", totalsByPayment.transfer, "transfer"]].map(([label, value, kind]) => <div key={label} className="payment-row"><div className="flex justify-between text-sm"><span>{label}</span><b>$ {money(value)}</b></div><div className="payment-track"><div className={kind} style={{ width: `${totalDay ? Math.min(100, Number(value) / totalDay * 100) : 0}%` }}></div></div></div>)}</div><div className="admin-card"><div className="card-heading"><div><h3>Ventas por empleado</h3><p>Desempeño del equipo durante el día</p></div></div><div className="space-y-2">{Object.entries(totalsByUser).sort((a, b) => b[1] - a[1]).map(([name, total], index) => <div className="ranking-row" key={name}><span className={`ranking-position ${index < 3 ? "top" : ""}`}>{index + 1}</span><div className="flex-1 font-bold">{name}</div><div className="font-extrabold">$ {money(total)}</div></div>)}{!Object.keys(totalsByUser).length && <div className="empty-state">No hubo ventas en esta fecha.</div>}</div></div></section>
            </>}

            {reportPeriod !== "day" && reportError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{reportError}</div>}
            {reportPeriod !== "day" && (reportLoading && !reportSummary ? <div className="admin-card empty-state">Preparando el reporte...</div> : reportSummary && <>
              <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <article className="report-kpi primary"><div className="report-kpi-icon"><Icon name="sales" /></div><div><span>Venta bruta</span><strong>$ {money(reportSummary.grossSales)}</strong><small>{reportSummary.transactions} operaciones</small></div></article>
                <article className="report-kpi success"><div className="report-kpi-icon">↗</div><div><span>Ganancia</span><strong>$ {money(reportSummary.profit)}</strong><small>{Number(reportSummary.marginPercent || 0).toFixed(1)}% de margen</small></div></article>
                <article className="report-kpi neutral"><div className="report-kpi-icon">−</div><div><span>Costo de mercadería</span><strong>$ {money(reportSummary.cogs)}</strong><small>Inversión recuperada</small></div></article>
                <article className="report-kpi warm"><div className="report-kpi-icon">$</div><div><span>Ticket promedio</span><strong>$ {money(reportSummary.averageTicket)}</strong><small>Por operación</small></div></article>
              </section>

              <section className="grid gap-6 xl:grid-cols-5">
                <div className="admin-card xl:col-span-3"><div className="card-heading"><div><h3>Evolución de ventas</h3><p>{reportPeriod === "month" ? "Facturación diaria" : "Facturación por mes"} · barras naranjas; ganancia en verde</p></div></div><div className={`report-chart ${reportPeriod === "month" ? "monthly" : "yearly"}`}>{reportSummary.trend.map((item) => <div key={item.key} className="report-bar-column" title={`${item.label}: $ ${money(item.grossSales)}`}><div className="report-bar-values">{item.grossSales > 0 && <span>$ {money(item.grossSales)}</span>}</div><div className="report-bar-track"><div className="report-bar-profit" style={{ height: `${Math.max(0, Number(item.profit || 0)) / reportChartMax * 100}%` }}></div><div className="report-bar-gross" style={{ height: `${Number(item.grossSales || 0) / reportChartMax * 100}%` }}></div></div><small>{item.label}</small></div>)}</div></div>

                <div className="space-y-6 xl:col-span-2">
                  <article className="star-product-card"><div className="star-glow">★</div><div className="relative"><div className="text-xs font-extrabold uppercase tracking-[.16em] text-orange-200">Producto estrella</div>{reportSummary.topProduct ? <><h3 className="mt-3 text-2xl font-extrabold text-white">{reportSummary.topProduct.name}</h3><div className="mt-5 grid grid-cols-2 gap-3"><div><span>Unidades</span><strong>{reportSummary.topProduct.qty}</strong></div><div><span>Facturación</span><strong>$ {money(reportSummary.topProduct.revenue)}</strong></div></div></> : <p className="mt-4 text-sm text-orange-100">No hubo ventas de productos en este período.</p>}</div></article>
                  <div className="admin-card"><div className="card-heading"><div><h3>Medios de pago</h3><p>Distribución de la facturación</p></div></div>{[ ["Efectivo", reportSummary.paymentTotals?.cash || 0, "cash"], ["Transferencia", reportSummary.paymentTotals?.transfer || 0, "transfer"] ].map(([label, value, kind]) => <div key={label} className="payment-row"><div className="flex justify-between text-sm"><span>{label}</span><b>$ {money(value)}</b></div><div className="payment-track"><div className={kind} style={{ width: `${reportSummary.grossSales ? Math.min(100, Number(value) / Number(reportSummary.grossSales) * 100) : 0}%` }}></div></div></div>)}</div>
                </div>
              </section>

              <section className="admin-card"><div className="card-heading"><div><h3>Productos más vendidos</h3><p>Ranking del período por unidades vendidas</p></div></div><div className="product-ranking">{reportSummary.topProducts?.map((product, index) => <div className="ranking-row" key={product.name}><span className={`ranking-position ${index < 3 ? "top" : ""}`}>{index + 1}</span><div className="min-w-0 flex-1"><div className="truncate font-bold text-slate-900">{product.name}</div><div className="text-xs text-slate-500">$ {money(product.revenue)} facturados</div></div><div className="text-right"><strong>{product.qty}</strong><span> unidades</span></div></div>)}{!reportSummary.topProducts?.length && <div className="empty-state">No hay productos vendidos en este período.</div>}</div></section>
            </>)}
          </div>
        )}

        {view === "reports" && !isAdmin && (
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

      <Drawer open={drawer === "business"} title={editingBusiness ? "Editar negocio" : "Nuevo negocio"} subtitle="La información que verá todo el equipo." onClose={() => setDrawer(null)} footer={<div className="flex justify-end gap-3"><button className="btn btn-ghost" onClick={() => setDrawer(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveBusinessForm}>Guardar negocio</button></div>}>
        <div className="space-y-5"><Field label="Nombre del negocio"><input className="admin-input" autoFocus value={businessForm.name} onChange={(event) => setBusinessForm((form) => ({ ...form, name: event.target.value }))} placeholder="Ej. Sucursal Centro"/></Field><Field label="Dirección" hint="Opcional; ayuda a distinguir sucursales."><input className="admin-input" value={businessForm.address} onChange={(event) => setBusinessForm((form) => ({ ...form, address: event.target.value }))} placeholder="Calle y número"/></Field></div>
      </Drawer>

      <Drawer open={drawer === "product"} title={editingProduct ? "Editar producto" : "Nuevo producto"} subtitle={editingProduct ? "Actualizá la información global y los valores de este negocio." : "Creá uno nuevo o reutilizá el catálogo compartido."} onClose={() => setDrawer(null)} footer={<div className="flex justify-end gap-3"><button className="btn btn-ghost" onClick={() => setDrawer(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveProductForm}>{editingProduct ? "Guardar cambios" : "Agregar producto"}</button></div>}>
        <div className="space-y-6">
          {!editingProduct && <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1"><button className={`rounded-lg px-3 py-2 text-sm font-bold ${productForm.mode === "new" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setProductForm((form) => ({ ...form, mode: "new", productId: "" }))}>Producto nuevo</button><button className={`rounded-lg px-3 py-2 text-sm font-bold ${productForm.mode === "catalog" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setProductForm((form) => ({ ...form, mode: "catalog" }))}>Usar catálogo</button></div>}
          {productForm.mode === "catalog" && !editingProduct ? <Field label="Producto del catálogo"><select className="admin-input" value={productForm.productId} onChange={(event) => setProductForm((form) => ({ ...form, productId: event.target.value }))}><option value="">Seleccionar producto...</option>{catalog.filter((item) => !products.some((product) => product.productId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</select></Field> : <div className="space-y-4"><div className="form-section-title">Información general</div><Field label="Nombre"><input className="admin-input" autoFocus value={productForm.name} onChange={(event) => setProductForm((form) => ({ ...form, name: event.target.value }))} placeholder="Nombre del producto"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Código interno"><input className="admin-input" value={productForm.code} onChange={(event) => setProductForm((form) => ({ ...form, code: event.target.value }))} placeholder="prod-001"/></Field><Field label="Código de barras"><input className="admin-input" value={productForm.barcode} onChange={(event) => setProductForm((form) => ({ ...form, barcode: event.target.value }))} placeholder="Opcional"/></Field></div></div>}
          <div className="space-y-4"><div className="form-section-title">Valores de {activeBusiness?.name}</div><div className="grid grid-cols-2 gap-3"><Field label="Precio de venta"><input className="admin-input" type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((form) => ({ ...form, price: event.target.value }))}/></Field><Field label="Costo"><input className="admin-input" type="number" min="0" value={productForm.costPrice} onChange={(event) => setProductForm((form) => ({ ...form, costPrice: event.target.value }))}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Stock actual"><input className="admin-input" type="number" value={productForm.stock} onChange={(event) => setProductForm((form) => ({ ...form, stock: event.target.value }))}/></Field><Field label="Stock crítico" hint="Te avisaremos cuando el stock llegue a este valor."><input className="admin-input" type="number" min="0" step="1" value={productForm.criticalStock} onChange={(event) => setProductForm((form) => ({ ...form, criticalStock: event.target.value }))}/></Field></div>{Number.isFinite(Number(productForm.price)) && Number.isFinite(Number(productForm.costPrice)) && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Margen estimado: <b>$ {money(Number(productForm.price) - Number(productForm.costPrice))}</b></div>}</div>
        </div>
      </Drawer>

      <Drawer open={drawer === "user"} title={editingUser ? "Editar empleado" : "Nuevo empleado"} subtitle="Configurá su acceso y el negocio donde trabajará." onClose={() => setDrawer(null)} footer={<div className="flex justify-end gap-3"><button className="btn btn-ghost" onClick={() => setDrawer(null)}>Cancelar</button><button className="btn btn-primary" onClick={saveUserForm}>Guardar empleado</button></div>}>
        <div className="space-y-5"><Field label="Nombre completo"><input className="admin-input" autoFocus value={userForm.name} onChange={(event) => setUserForm((form) => ({ ...form, name: event.target.value }))} placeholder="Nombre y apellido"/></Field><Field label="Usuario"><input className="admin-input" disabled={Boolean(editingUser)} value={userForm.username} onChange={(event) => setUserForm((form) => ({ ...form, username: event.target.value }))} placeholder="Ej. caja1"/></Field><Field label={editingUser ? "Nueva contraseña" : "Contraseña"} hint={editingUser ? "Dejala vacía para conservar la actual." : "Mínimo 6 caracteres."}><input className="admin-input" type="password" value={userForm.password} onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))}/></Field><Field label="Negocio asignado"><select className="admin-input" value={userForm.businessId} onChange={(event) => setUserForm((form) => ({ ...form, businessId: event.target.value }))}>{businesses.filter((business) => business.active).map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></Field></div>
      </Drawer>

      <Modal open={Boolean(stockDialog)} title={`Ajustar stock · ${stockDialog?.product?.name || ""}`} onClose={() => setStockDialog(null)} actions={<><button className="btn btn-ghost" onClick={() => setStockDialog(null)}>Cancelar</button><button className="btn btn-primary" onClick={submitStockAdjustment}>Confirmar ajuste</button></>}><div className="space-y-4"><div className="rounded-xl bg-slate-50 p-3 text-sm">Stock actual: <b>{stockDialog?.product?.stock} unidades</b>{Number(stockDialog?.delta) !== 0 && Number.isFinite(Number(stockDialog?.delta)) && <div className="mt-1 text-blue-700">Nuevo stock: <b>{Number(stockDialog.product.stock) + Number(stockDialog.delta)} unidades</b></div>}</div><Field label="Cantidad a sumar o restar"><input className="admin-input" autoFocus type="number" value={stockDialog?.delta || ""} onChange={(event) => setStockDialog((dialog) => ({ ...dialog, delta: event.target.value }))} placeholder="Ej. 10 o -3"/></Field><Field label="Motivo"><input className="admin-input" value={stockDialog?.reason || ""} onChange={(event) => setStockDialog((dialog) => ({ ...dialog, reason: event.target.value }))} placeholder="Compra, rotura, recuento..."/></Field></div></Modal>

      <Modal open={Boolean(voidSaleDialog)} title="Anular venta" onClose={() => setVoidSaleDialog(null)} actions={<><button className="btn btn-ghost" onClick={() => setVoidSaleDialog(null)}>Cancelar</button><button className="btn btn-danger" onClick={confirmVoidSale}>Anular venta</button></>}><Field label="Motivo" hint="Quedará registrado junto a la venta."><textarea className="admin-input min-h-24 resize-none" value={voidSaleDialog?.reason || ""} onChange={(event) => setVoidSaleDialog((dialog) => ({ ...dialog, reason: event.target.value }))} placeholder="Ej. cobro duplicado"/></Field></Modal>

      <Modal open={Boolean(confirmAction)} title={confirmAction?.title || "Confirmar acción"} onClose={() => setConfirmAction(null)} actions={<><button className="btn btn-ghost" onClick={() => setConfirmAction(null)}>Cancelar</button><button className={`btn ${confirmAction?.destructive ? "btn-danger" : "btn-primary"}`} onClick={confirmAction?.run}>Confirmar</button></>}><p className="text-sm leading-6 text-slate-600">{confirmAction?.message}</p></Modal>

      {toast && <div className={`admin-toast ${toast.type === "error" ? "error" : "success"}`} role="status"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/20">{toast.type === "error" ? "!" : "✓"}</span>{toast.message}<button onClick={() => setToast(null)}><Icon name="close" size={16}/></button></div>}
    </div>
  );
}
