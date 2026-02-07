import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  runTransaction,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getFunctions } from "firebase/functions";

/**
 * ✅ Firebase config (edet-be4ec)
 * IMPORTANTE: mantenelo igual al snippet oficial
 */
const firebaseConfig = {
  apiKey: "AIzaSyBgwHTAGWlWGUJAV0zLxsa48Zw-xVkjaI8",
  authDomain: "edet-be4ec.firebaseapp.com",
  databaseURL: "https://edet-be4ec-default-rtdb.firebaseio.com",
  projectId: "edet-be4ec",
  storageBucket: "edet-be4ec.firebasestorage.app",
  messagingSenderId: "811388526827",
  appId: "1:811388526827:web:53e8683650699fb2fcdeae",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Si en el futuro usás functions (Blaze), poné región explícita
getFunctions(app, "us-central1");

/**
 * ✅ App data namespace
 */
const appId = "pos-pagofacil";

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

function timeFromTimestamp(ts) {
  if (!ts || typeof ts.toDate !== "function") return "-";
  const d = ts.toDate();
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Tucuman",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function App() {
  // Auth
  const [fbUser, setFbUser] = useState(null);

  // Data
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [profiles, setProfiles] = useState([]); // users/{uid}

  // Role from Firestore profile
  const myProfile = useMemo(
    () => profiles.find((p) => p.uid === fbUser?.uid),
    [profiles, fbUser]
  );
  const isAdmin = myProfile?.role === "admin";

  // UI
  const [view, setView] = useState("pos"); // pos | inventory | reports | users | purchases | sales
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
  const [paymentMethod, setPaymentMethod] = useState("cash"); // cash | transfer | mixed
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
  const [stockAdjust, setStockAdjust] = useState({}); // { [productId]: { delta, reason } }

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

  // 1) Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setFbUser(u || null));
    return () => unsub();
  }, []);

  // 2) Firestore listeners
  useEffect(() => {
    if (!fbUser) return;

    const productsRef = collection(db, "artifacts", appId, "public", "data", "products");
    const salesRef = collection(db, "artifacts", appId, "public", "data", "sales");
    const usersRef = collection(db, "artifacts", appId, "public", "data", "users");

    const unsubP = onSnapshot(query(productsRef, orderBy("createdAt", "desc")), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Cajero: solo sus ventas; Admin: todas
    const salesQ = isAdmin
      ? query(salesRef, orderBy("createdAt", "desc"))
      : query(salesRef, where("sellerUid", "==", fbUser.uid));

    const unsubS = onSnapshot(salesQ, (snap) => {
      setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubU = onSnapshot(query(usersRef, orderBy("name", "asc")), (snap) => {
      setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubP();
      unsubS();
      unsubU();
    };
  }, [fbUser, isAdmin]);

  // Autofocus buscador cuando entro a POS
  useEffect(() => {
    if (view === "pos") {
      setTimeout(() => searchRef.current?.focus(), 150);
    }
  }, [view]);

  // Global keyboard listener for quick code sales
  useEffect(() => {
    if (view !== "pos") return;

    function handleKeyDown(e) {
      // Ignore if we're in an input/textarea/select
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      // Only numbers
      if (/^[0-9]$/.test(e.key)) {
        setQuickCodeBuffer((prev) => prev + e.key);
      }

      // Enter to process
      if (e.key === "Enter" && quickCodeBuffer) {
        e.preventDefault();
        handleQuickSale(quickCodeBuffer);
        setQuickCodeBuffer("");
      }

      // Escape to clear buffer
      if (e.key === "Escape") {
        setQuickCodeBuffer("");
      }

      // Backspace to delete last digit
      if (e.key === "Backspace") {
        e.preventDefault();
        setQuickCodeBuffer((prev) => prev.slice(0, -1));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [view, quickCodeBuffer, products, isProcessingSale]);

  // Cart total (robusto)
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0);
  }, [cart]);

  // Ajustar montos cuando cambia método (cash/transfer)
  useEffect(() => {
    if (paymentMethod === "cash") {
      setCashAmount(String(cartTotal || 0));
      setTransferAmount("0");
    } else if (paymentMethod === "transfer") {
      setCashAmount("0");
      setTransferAmount(String(cartTotal || 0));
    } // mixed: el usuario decide
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

    const email = username.includes("@")
      ? username.toLowerCase()
      : `${username.toLowerCase()}@pos.local`;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLogin({ username: "", password: "" });
      setLoginErr("");
      setView("pos");
    } catch (e) {
      setLoginErr("Usuario o contraseña incorrectos.");
      console.error("LOGIN ERROR:", e?.code, e?.message);
    }
  }

  async function logout() {
    await signOut(auth);
    setCart([]);
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

  // Quick sale by short code (2-3 digits)
  async function handleQuickSale(code) {
    const c = String(code || "").trim();
    if (!c || isProcessingSale) return;

    // Find product by exact code (case-insensitive)
    const product = products.find(
      (p) => String(p.code || "").toLowerCase() === c.toLowerCase()
    );

    if (!product) {
      alert("Código no encontrado: " + c);
      return;
    }

    // Create temporary cart with 1 unit
    const tempCart = [{
      id: product.id,
      name: product.name,
      price: Number(product.price || 0),
      costPrice: Number(product.costPrice || 0),
      barcode: product.barcode || "",
      code: product.code || "",
      qty: 1,
    }];

    // Process direct sale with cash
    await processQuickSale(tempCart);
  }

  async function processQuickSale(items) {
    if (isProcessingSale || !items.length) return;
    setIsProcessingSale(true);

    const sellerName = myProfile?.name || fbUser.email;
    const dayKey = dayKeyTucuman(new Date());

    const saleItems = items.map((i) => ({
      productId: i.id,
      name: i.name,
      qty: Number(i.qty),
      unitPrice: Number(i.price),
      itemCostPrice: Number(i.costPrice || 0),
      barcode: i.barcode || null,
      code: i.code || null,
      lineTotal: Number(i.price) * Number(i.qty),
    }));
    const total = saleItems.reduce((a, it) => a + it.lineTotal, 0);

    const salesRef = collection(db, "artifacts", appId, "public", "data", "sales");
    const saleKey = `${fbUser.uid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const saleDoc = doc(salesRef, saleKey);

    try {
      await runTransaction(db, async (tx) => {
        // Read product docs
        const reads = [];
        for (const item of saleItems) {
          const productRef = doc(db, "artifacts", appId, "public", "data", "products", item.productId);
          const snap = await tx.get(productRef);
          if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.name}`);
          reads.push({ item, productRef, data: snap.data() });
        }

        // Update stock
        for (const r of reads) {
          const currentStock = Number(r.data.stock || 0);
          tx.update(r.productRef, { stock: currentStock - r.item.qty });
        }

        // Create sale
        tx.set(saleDoc, {
          sellerUid: fbUser.uid,
          sellerName,
          dayKey,
          items: saleItems,
          total,
          paymentMethod: "cash",
          cashAmount: total,
          transferAmount: 0,
          status: "active",
          createdAt: serverTimestamp(),
        });
      });

      alert(`Venta rápida: ${items[0].name} - $${money(total)}`);
    } catch (e) {
      alert(e?.message || "Error en venta rápida");
    } finally {
      setIsProcessingSale(false);
    }
  }

  // ✅ Venta (stock puede quedar negativo) + read-before-write + idempotencia básica
  async function processSale() {
    if (isProcessingSale) return;
    if (!cart.length) return;

    // validar pago mixto
    let payment = {
      paymentMethod: paymentMethod,
      cashAmount: Number(cashAmount || 0),
      transferAmount: Number(transferAmount || 0),
    };

    if (paymentMethod === "cash") {
      payment = { paymentMethod: "cash", cashAmount: cartTotal, transferAmount: 0 };
    } else if (paymentMethod === "transfer") {
      payment = { paymentMethod: "transfer", cashAmount: 0, transferAmount: cartTotal };
    } else {
      const sum = Number(payment.cashAmount) + Number(payment.transferAmount);
      if (Math.abs(sum - cartTotal) > 0.01) {
        alert("El pago mixto no coincide con el total.");
        return;
      }
    }

    setIsProcessingSale(true);

    const sellerName = myProfile?.name || fbUser.email;
    const dayKey = dayKeyTucuman(new Date());

    // Guardar costo al momento de vender para ganancias futuras
    const items = cart.map((i) => ({
      productId: i.id,
      name: i.name,
      qty: Number(i.qty),
      unitPrice: Number(i.price),
      itemCostPrice: Number(i.costPrice || 0),
      barcode: i.barcode || null,
      code: i.code || null,
      lineTotal: Number(i.price) * Number(i.qty),
    }));
    const total = items.reduce((a, it) => a + it.lineTotal, 0);

    const salesRef = collection(db, "artifacts", appId, "public", "data", "sales");
    const saleKey = `${fbUser.uid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const saleDoc = doc(salesRef, saleKey); // docId determinístico evita duplicados si reintenta

    try {
      await runTransaction(db, async (tx) => {
        // Read all product docs first
        const reads = [];
        for (const item of items) {
          const productRef = doc(db, "artifacts", appId, "public", "data", "products", item.productId);
          const snap = await tx.get(productRef);
          if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.name}`);
          reads.push({ item, productRef, data: snap.data() });
        }

        // Then writes: update stock (permitir negativo)
        for (const r of reads) {
          const currentStock = Number(r.data.stock || 0);
          const nextStock = currentStock - Number(r.item.qty || 0);
          tx.update(r.productRef, { stock: nextStock });
        }

        tx.set(saleDoc, {
          sellerUid: fbUser.uid,
          sellerName,
          dayKey,
          items,
          total,
          createdAt: serverTimestamp(),
          status: "active",
          ...payment,
        });
      });

      setCart([]);
      alert("Venta registrada");
    } catch (e) {
      console.error(e);
      alert(e?.message || "No se pudo registrar la venta");
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
    if (price < 0 || costPrice < 0) {
      alert("Precio/costo inválidos.");
      return;
    }

    // code único (case-insensitive)
    const codeLower = code.toLowerCase();
    const codeExists = products.some((p) => String(p.code || "").toLowerCase() === codeLower);
    if (codeExists) {
      alert("El code ya existe.");
      return;
    }

    const ref = collection(db, "artifacts", appId, "public", "data", "products");
    await addDoc(ref, { name, price, costPrice, barcode, code, stock, createdAt: serverTimestamp() });
    setNewProduct({ name: "", price: "", costPrice: "", barcode: "", stock: "", code: "" });
  }

  async function updatePrice(productId, value) {
    if (!isAdmin) return;
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    const ref = doc(db, "artifacts", appId, "public", "data", "products", productId);
    await updateDoc(ref, { price });
  }

  async function updateCostPrice(productId, value) {
    if (!isAdmin) return;
    const costPrice = Number(value);
    if (!Number.isFinite(costPrice) || costPrice < 0) return;
    const ref = doc(db, "artifacts", appId, "public", "data", "products", productId);
    await updateDoc(ref, { costPrice });
  }

  // Ajuste de stock con motivo (admin)
  async function adjustStock(productId, delta, reason) {
    if (!isAdmin) return;
    const change = Number(delta);
    if (!Number.isFinite(change) || change === 0) return;
    const why = String(reason || "").trim();
    if (!why) {
      alert("Escribí un motivo para el ajuste.");
      return;
    }

    const productRef = doc(db, "artifacts", appId, "public", "data", "products", productId);
    const adjRef = collection(db, "artifacts", appId, "public", "data", "stockAdjustments");

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(productRef);
        if (!snap.exists()) throw new Error("Producto no encontrado");
        const current = Number(snap.data().stock || 0);
        const next = current + change; // permitir negativo también
        tx.update(productRef, { stock: next });
        tx.set(doc(adjRef), {
          productId,
          delta: change,
          reason: why,
          createdAt: serverTimestamp(),
          adminUid: fbUser.uid,
          adminName: myProfile?.name || fbUser.email,
        });
      });
    } catch (e) {
      alert(e?.message || "No se pudo ajustar stock");
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
      // merge si ya existe
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
    if (!isAdmin) return;
    if (!purchaseItems.length) return;

    const purchaseRef = collection(db, "artifacts", appId, "public", "data", "purchases");
    const totalCost = purchaseItems.reduce((a, i) => a + Number(i.qty) * Number(i.costPrice), 0);
    const items = purchaseItems.map((i) => ({
      productId: i.productId,
      name: i.name,
      qty: Number(i.qty),
      costPrice: Number(i.costPrice),
    }));
    const purchaseDoc = doc(purchaseRef);

    try {
      await runTransaction(db, async (tx) => {
        const reads = [];
        for (const item of items) {
          const productRef = doc(db, "artifacts", appId, "public", "data", "products", item.productId);
          const snap = await tx.get(productRef);
          if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.name}`);
          reads.push({ item, productRef, data: snap.data() });
        }

        for (const r of reads) {
          const currentStock = Number(r.data.stock || 0);
          const nextStock = currentStock + Number(r.item.qty || 0);
          tx.update(r.productRef, { stock: nextStock });
        }

        tx.set(purchaseDoc, {
          dayKey: purchaseDayKey,
          items,
          totalCost,
          createdAt: serverTimestamp(),
          adminUid: fbUser.uid,
          adminName: myProfile?.name || fbUser.email,
        });
      });

      setPurchaseItems([]);
      alert("Compra registrada");
    } catch (e) {
      alert(e?.message || "No se pudo registrar compra");
    }
  }

  // Sales filters for admin view
  const salesFiltered = useMemo(() => {
    let list = sales;
    // day filter
    list = list.filter((s) => String(s.dayKey || "") === String(selectedDayKey || ""));
    // user filter
    if (salesFilterUser !== "all") {
      list = list.filter((s) => s.sellerUid === salesFilterUser);
    }
    return list;
  }, [sales, selectedDayKey, salesFilterUser]);

  // Reports day
  const daySales = useMemo(() => {
    return sales.filter((s) => String(s.dayKey || "") === String(selectedDayKey || ""));
  }, [sales, selectedDayKey]);

  const daySalesActive = useMemo(() => {
    return daySales.filter((s) => (s.status || "active") === "active");
  }, [daySales]);

  const voidedCount = useMemo(() => {
    return daySales.filter((s) => (s.status || "active") === "voided").length;
  }, [daySales]);

  const totalDay = useMemo(() => {
    return daySalesActive.reduce((a, s) => a + Number(s.total || 0), 0);
  }, [daySalesActive]);

  const totalsByUser = useMemo(() => {
    const acc = {};
    for (const s of daySalesActive) {
      const k = s.sellerName || s.sellerUid || "Sin usuario";
      acc[k] = (acc[k] || 0) + Number(s.total || 0);
    }
    return acc;
  }, [daySalesActive]);

  const totalsByPayment = useMemo(() => {
    const out = { cash: 0, transfer: 0 };
    for (const s of daySalesActive) {
      const method = s.paymentMethod || "cash";
      if (method === "transfer") {
        out.transfer += Number(s.transferAmount ?? s.total ?? 0);
      } else if (method === "mixed") {
        out.cash += Number(s.cashAmount || 0);
        out.transfer += Number(s.transferAmount || 0);
      } else {
        out.cash += Number(s.cashAmount ?? s.total ?? 0);
      }
    }
    return out;
  }, [daySalesActive]);

  const cogsDay = useMemo(() => {
    // cost of goods sold usando itemCostPrice guardado en cada venta
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

  // Admin: void/delete/edit payment only
  async function voidSale(sale) {
    if (!isAdmin) return;
    if ((sale.status || "active") === "voided") return;

    const reason = prompt("Motivo de anulación (opcional):", sale.voidReason || "");
    const saleRef = doc(db, "artifacts", appId, "public", "data", "sales", sale.id);

    try {
      await runTransaction(db, async (tx) => {
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists()) throw new Error("Venta no encontrada");
        const data = saleSnap.data();
        if ((data.status || "active") === "voided") return;

        // Revertir stock (permitimos revertir siempre)
        const items = data.items || [];
        const reads = [];
        for (const item of items) {
          const productRef = doc(db, "artifacts", appId, "public", "data", "products", item.productId);
          const productSnap = await tx.get(productRef);
          if (!productSnap.exists()) throw new Error(`Producto no encontrado: ${item.name}`);
          reads.push({ item, productRef, data: productSnap.data() });
        }

        for (const r of reads) {
          const currentStock = Number(r.data.stock || 0);
          tx.update(r.productRef, { stock: currentStock + Number(r.item.qty || 0) });
        }

        tx.update(saleRef, {
          status: "voided",
          voidedAt: serverTimestamp(),
          voidReason: reason || "",
        });
      });

      alert("Venta anulada");
    } catch (e) {
      alert(e?.message || "No se pudo anular la venta");
    }
  }

  async function deleteSale(sale) {
    if (!isAdmin) return;

    const status = sale.status || "active";
    if (status !== "voided") {
      if (!confirm("Esta venta no está anulada. ¿Querés anularla y borrarla?")) return;
      await voidSale(sale);
    }
    if (!confirm("¿Borrar venta anulada?")) return;

    const saleRef = doc(db, "artifacts", appId, "public", "data", "sales", sale.id);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(saleRef);
        if (!snap.exists()) return;
        tx.delete(saleRef);
      });
      alert("Venta borrada");
    } catch (e) {
      alert(e?.message || "No se pudo borrar la venta");
    }
  }

  async function saveSaleEdit() {
    if (!isAdmin || !saleEdit) return;

    const { saleId } = saleEdit;
    const total = Number(saleEdit.total || 0);
    const pm = saleEdit.paymentMethod;

    let payment = {
      paymentMethod: pm,
      cashAmount: Number(saleEdit.cashAmount || 0),
      transferAmount: Number(saleEdit.transferAmount || 0),
    };

    if (pm === "cash") payment = { paymentMethod: "cash", cashAmount: total, transferAmount: 0 };
    if (pm === "transfer") payment = { paymentMethod: "transfer", cashAmount: 0, transferAmount: total };
    if (pm === "mixed") {
      const sum = payment.cashAmount + payment.transferAmount;
      if (Math.abs(sum - total) > 0.01) {
        alert("El pago mixto no coincide con el total");
        return;
      }
    }

    try {
      const saleRef = doc(db, "artifacts", appId, "public", "data", "sales", saleId);
      await updateDoc(saleRef, payment);
      setSaleEdit(null);
    } catch (e) {
      alert(e?.message || "No se pudo editar la venta");
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

  // ===== LOGIN SCREEN =====
  if (!fbUser) {
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

          <div className="text-xs text-slate-400 mt-4">
            El login usa emails internos: <code>usuario@pos.local</code>
          </div>
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
          Sesión: <b>{fbUser.email}</b> {isAdmin ? "(admin)" : "(caja)"}
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
            <div className="text-sm font-semibold text-slate-800">{myProfile?.name || fbUser.email}</div>
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
                      <option key={p.uid} value={p.uid}>
                        {p.name || p.username || p.uid}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <div className="text-sm text-slate-600">
                    Total ventas (activas): $ {money(salesFiltered.filter((s) => (s.status || "active") === "active").reduce((a, s) => a + Number(s.total || 0), 0))}
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
                    const status = s.status || "active";
                    const method = s.paymentMethod || "cash";
                    const cash = s.cashAmount != null ? Number(s.cashAmount) : Number(s.total || 0);
                    const transfer = s.transferAmount != null ? Number(s.transferAmount) : 0;

                    return (
                      <tr key={s.id} className={"hover:bg-slate-50 even:bg-slate-50/60 " + (status === "voided" ? "opacity-60" : "")}>
                        <td className="p-4">{timeFromTimestamp(s.createdAt)}</td>
                        <td className="p-4">{s.sellerName || s.sellerUid}</td>
                        <td className="p-4 font-semibold">$ {money(s.total)}</td>
                        <td className="p-4 text-slate-600">
                          {method === "cash" && `Efectivo $ ${money(cash)}`}
                          {method === "transfer" && `Transferencia $ ${money(transfer)}`}
                          {method === "mixed" && `Mixto $ ${money(cash)} / $ ${money(transfer)}`}
                        </td>
                        <td className="p-4">
                          <span className={status === "voided" ? "text-rose-600" : "text-emerald-700"}>
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
                              disabled={status === "voided"}
                              onClick={() => setSaleEdit({
                                saleId: s.id,
                                total: s.total,
                                paymentMethod: s.paymentMethod || "cash",
                                cashAmount: cash,
                                transferAmount: transfer,
                              })}
                            >
                              Editar pago
                            </button>
                            <button className="text-amber-600 font-semibold" disabled={status === "voided"} onClick={() => voidSale(s)}>
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
                    {saleDetail.sellerName} • {timeFromTimestamp(saleDetail.createdAt)} • {saleDetail.status || "active"}
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
              <div className="font-bold mb-2">Crear cajero</div>
              <div className="text-sm text-slate-600">
                En el plan gratis, no se pueden crear usuarios de Auth desde la web (requiere Functions/Blaze).
                Crealos en Firebase Console → Authentication → Users, y luego creá su perfil en Firestore con role="cashier".
              </div>
            </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-4">Nombre</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50 even:bg-slate-50/60">
                      <td className="p-4 font-semibold">{u.name}</td>
                      <td className="p-4 text-slate-600">{u.username}</td>
                      <td className="p-4 text-slate-600">{u.role}</td>
                    </tr>
                  ))}
                  {profiles.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-10 text-center text-slate-400">
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














