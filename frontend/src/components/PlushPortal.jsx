import React, { useCallback, useEffect, useMemo, useState } from "react";

const now = new Date();
const emptyMachine = {
  name: "", code: "", location: "", model: "", serialNumber: "", notes: "",
  initialCounter: "", initialPlushQuantity: "", active: true, consignment: false, locatorName: "", locatorPercent: "",
};

const ars = (value, decimals = 0) => Number(value || 0).toLocaleString("es-AR", {
  style: "currency", currency: "ARS", maximumFractionDigits: decimals,
});
const number = (value, decimals = 0) => value == null ? "—" : Number(value).toLocaleString("es-AR", { maximumFractionDigits: decimals });
const dateTime = (value) => new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
}).format(new Date(value));

function Dialog({ title, open, onClose, children, submitLabel = "Guardar", onSubmit, onBack, wide = false }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center p-4">
    <button aria-label="Cerrar" className="absolute inset-0 bg-slate-950/45" onClick={onClose}/>
    <form role="dialog" aria-modal="true" aria-label={title} className={`relative max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="mb-5 flex items-center justify-between"><h3 className="text-xl font-black">{title}</h3><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      {children}
      <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>{onBack && <button type="button" className="btn btn-soft" onClick={onBack}>Atrás</button>}<button className="btn btn-primary" type="submit">{submitLabel}</button></div>
    </form>
  </div>;
}

function Field({ label, children, hint }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">{label}</span>{children}{hint && <small className="mt-1 block text-xs text-slate-500">{hint}</small>}</label>;
}

function Metric({ label, value, detail, tone = "orange" }) {
  const tones = { orange: "bg-orange-50 text-orange-600", green: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-600" };
  return <article className="metric-card"><div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl text-lg font-black ${tones[tone]}`}>●</div><div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></article>;
}

async function compressPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Elegí una imagen JPEG, PNG o WebP");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/webp";
  const dataUrl = canvas.toDataURL(type, type === "image/png" ? undefined : 0.82);
  const approxBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  if (approxBytes > 1_500_000) throw new Error("La foto sigue siendo demasiado pesada después de comprimirla");
  return dataUrl;
}

export default function PlushPortal({ api, notify }) {
  const [tab, setTab] = useState("dashboard");
  const [period, setPeriod] = useState("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [machineForm, setMachineForm] = useState(emptyMachine);
  const [inventoryForm, setInventoryForm] = useState({ initialQuantity: "", initialUnitCost: "" });
  const [purchaseForm, setPurchaseForm] = useState({ quantity: "", totalCost: "", supplier: "", notes: "" });
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "" });
  const [loadForm, setLoadForm] = useState({ machineId: "", quantity: "", notes: "" });
  const [settlementForm, setSettlementForm] = useState({ machineId: "", finalCounter: "", cashAmount: "", qrAmount: "", notes: "", loadChoice: "", loadQuantity: "", id: null });
  const [passStep, setPassStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try { setData(await api.getPlushOverview({ period, year, month })); }
    catch (error) { notify(error.message || "No se pudo cargar Pelucheras", "error"); }
    finally { setLoading(false); }
  }, [api, period, year, month, notify]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const selectedMachine = data?.machines?.find((item) => item.id === selectedMachineId) || null;
  const machineLoads = useMemo(() => (data?.loads || []).filter((item) => item.machineId === selectedMachineId), [data, selectedMachineId]);
  const machineSettlements = useMemo(() => (data?.settlements || []).filter((item) => item.machineId === selectedMachineId), [data, selectedMachineId]);
  const latestActiveSettlement = machineSettlements.find((item) => item.status === "ACTIVE");

  async function run(action, success) {
    setBusy(true);
    try { await action(); setDialog(null); notify(success); await loadOverview(); }
    catch (error) { notify(error.message || "No se pudo completar la operación", "error"); }
    finally { setBusy(false); }
  }

  function openMachine(machine = null) {
    setMachineForm(machine ? {
      ...machine, initialCounter: String(machine.initialCounter), initialPlushQuantity: String(machine.initialPlushQuantity),
      locatorPercent: String(machine.locatorPercent || ""),
    } : emptyMachine);
    setDialog(machine ? `machine:${machine.id}` : "machine");
  }

  function openLoad(machineId = "") {
    setLoadForm({ machineId, quantity: "", notes: "" });
    setDialog("load");
  }

  function openPass(machine) {
    const latest = (data?.settlements || []).find((item) => item.machineId === machine.id && item.status === "ACTIVE");
    setSettlementForm({ machineId: machine.id, finalCounter: String(latest?.finalCounter ?? machine.initialCounter), cashAmount: "", qrAmount: "", notes: "", loadChoice: "", loadQuantity: "", id: null });
    setPassStep(1);
    setDialog("settlement");
  }

  function openSettlementEdit(item) {
    setSettlementForm({ machineId: item.machineId, finalCounter: String(item.finalCounter), cashAmount: String(item.cashAmount), qrAmount: String(item.qrAmount), notes: item.notes || "", loadChoice: "", loadQuantity: "", id: item.id });
    setDialog("settlement");
  }

  async function reasonAndRun(label, callback) {
    const reason = window.prompt(`Motivo para anular ${label}:`);
    if (!reason?.trim()) return;
    await run(() => callback(reason.trim()), `${label[0].toUpperCase() + label.slice(1)} anulada.`);
  }

  if (loading && !data) return <div className="empty-state">Cargando portal de pelucheras…</div>;
  const inventory = data?.inventory || {};
  const dashboard = data?.dashboard || {};
  const passInitialCounter = latestActiveSettlement?.finalCounter ?? selectedMachine?.initialCounter ?? 0;
  const passPrizesDelivered = Number(settlementForm.finalCounter) - Number(passInitialCounter);
  const passStockAfter = Number(selectedMachine?.theoreticalStock || 0) - passPrizesDelivered;
  const passLoadQuantity = settlementForm.loadChoice === "yes" ? Number(settlementForm.loadQuantity || 0) : 0;
  const passFinalStock = passStockAfter + passLoadQuantity;
  const passRemainingInventory = Number(inventory.remaining || 0) - passLoadQuantity;

  function advancePass() {
    const finalCounter = Number(settlementForm.finalCounter);
    if (!Number.isSafeInteger(finalCounter) || finalCounter < passInitialCounter) {
      notify(`La lectura no puede ser menor que ${passInitialCounter}`, "error");
      return;
    }
    setPassStep(2);
  }

  function savePass() {
    return run(() => api.createPlushPass({
      machineId: settlementForm.machineId,
      finalCounter: Number(settlementForm.finalCounter),
      cashAmount: Number(settlementForm.cashAmount || 0),
      qrAmount: Number(settlementForm.qrAmount || 0),
      notes: settlementForm.notes,
      loadQuantity: settlementForm.loadChoice === "yes" ? Number(settlementForm.loadQuantity) : 0,
    }), "Pasada registrada.");
  }

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="plush-hero">
      <div><div className="text-xs font-black uppercase tracking-[.2em] text-fuchsia-200">Nueva unidad de negocio</div><h3 className="mt-2 text-3xl font-black">Control de pelucheras</h3><p className="mt-2 max-w-2xl text-sm text-fuchsia-100">Recaudación, premios, inventario y consignaciones con una trazabilidad completa por máquina.</p></div>
      <div className="rounded-2xl bg-white/15 px-5 py-4 text-right backdrop-blur"><div className="text-xs text-fuchsia-100">Disponible para cargar</div><div className="text-3xl font-black">{number(inventory.remaining)} <small className="text-sm">peluches</small></div></div>
    </section>

    <div className="plush-tabs">
      {[['dashboard','Panel'],['machines','Máquinas'],['inventory','Inventario']].map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); if (key !== "machines") setSelectedMachineId(null); }}>{label}</button>)}
    </div>

    {tab === "dashboard" && <>
      <section className="admin-card report-filters">
        <div className="period-switch"><button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mensual</button><button className={period === "year" ? "active" : ""} onClick={() => setPeriod("year")}>Anual</button></div>
        <select className="admin-select max-w-32" value={year} onChange={(e) => setYear(Number(e.target.value))}>{Array.from({ length: 7 }, (_, i) => now.getFullYear() - 5 + i).map((item) => <option key={item}>{item}</option>)}</select>
        {period === "month" && <select className="admin-select max-w-44" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(2026, i, 1))}</option>)}</select>}
      </section>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Ingreso bruto" value={ars(dashboard.grossIncome)} detail={`${number(dashboard.prizesDelivered)} premios entregados`}/>
        <Metric label="Ganancia neta" value={ars(dashboard.netProfit)} detail={`Locadores: ${ars(dashboard.locatorAmount)}`} tone="green"/>
        <Metric label="IPP" value={dashboard.ipp == null ? "—" : ars(dashboard.ipp, 2)} detail={`CPP ponderado: ${dashboard.weightedCpp == null ? "—" : ars(dashboard.weightedCpp, 2)}`} tone="violet"/>
        <Metric label="Saldo depósito" value={number(inventory.remaining)} detail={`${dashboard.negativeMachines || 0} alertas en máquinas`} tone={dashboard.negativeMachines ? "amber" : "slate"}/>
      </section>
      <section className="grid gap-6 lg:grid-cols-5">
        <div className="admin-card lg:col-span-3"><div className="card-heading"><div><h3>Rendimiento por máquina</h3><p>Ordenado por ganancia neta del período</p></div></div>
          <div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Máquina</th><th>Premios</th><th>Ingreso</th><th>Ganancia</th></tr></thead><tbody>{(dashboard.ranking || []).map((item) => <tr key={item.machineId}><td className="font-bold">{item.machineName}</td><td>{item.prizesDelivered}</td><td>{ars(item.grossIncome)}</td><td className={item.netProfit >= 0 ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>{ars(item.netProfit)}</td></tr>)}</tbody></table>{!dashboard.ranking?.length && <div className="empty-state">No hay liquidaciones en el período.</div>}</div>
        </div>
        <div className="admin-card lg:col-span-2"><div className="card-heading"><div><h3>Medios de cobro</h3><p>Total manual registrado</p></div></div><div className="space-y-4"><div className="rounded-xl bg-emerald-50 p-4"><div className="text-xs font-bold text-emerald-700">EFECTIVO</div><div className="mt-1 text-2xl font-black">{ars(dashboard.cashAmount)}</div></div><div className="rounded-xl bg-violet-50 p-4"><div className="text-xs font-bold text-violet-700">QR</div><div className="mt-1 text-2xl font-black">{ars(dashboard.qrAmount)}</div></div><div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Costo de premios</span><b>{ars(dashboard.prizeCost)}</b></div><div className="mt-2 flex justify-between"><span>GPP</span><b>{dashboard.gpp == null ? "—" : ars(dashboard.gpp, 2)}</b></div></div></div></div>
      </section>
    </>}

    {tab === "machines" && !selectedMachine && <>
      <div className="section-toolbar"><div><h3>Máquinas</h3><p>Una ficha operativa y auditable para cada peluchera.</p></div><button className="btn btn-primary" onClick={() => openMachine()}>+ Nueva máquina</button></div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(data?.machines || []).map((machine) => {
        const cover = machine.photos?.find((photo) => photo.isCover) || machine.photos?.[0];
        return <article key={machine.id} className="plush-machine-card"><button className="block w-full text-left" onClick={() => setSelectedMachineId(machine.id)}>{cover ? <img src={cover.dataUrl} alt={machine.name} className="h-44 w-full object-cover"/> : <div className="grid h-44 place-items-center bg-gradient-to-br from-fuchsia-100 to-violet-100 text-6xl">🧸</div>}<div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">{machine.name}</h3><p className="text-sm text-slate-500">{machine.code} · {machine.location}</p></div><span className={`status-badge ${machine.auditAlert ? "danger" : machine.active ? "success" : "neutral"}`}>{machine.auditAlert ? "Auditar" : machine.active ? "Activa" : "Inactiva"}</span></div><div className="mt-4 flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Saldo teórico</span><b className={machine.theoreticalStock < 0 ? "text-rose-600" : ""}>{machine.theoreticalStock} peluches</b></div></div></button></article>;
      })}{!data?.machines?.length && <div className="empty-state sm:col-span-2 xl:col-span-3">Creá la primera máquina para comenzar.</div>}</section>
    </>}

    {tab === "machines" && selectedMachine && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><button className="btn btn-ghost" onClick={() => setSelectedMachineId(null)}>← Todas las máquinas</button><div className="flex flex-wrap gap-2"><button className="btn btn-ghost" onClick={() => openMachine(selectedMachine)}>Editar ficha</button><button className="btn btn-soft" onClick={() => openLoad(selectedMachine.id)}>Cargar peluches</button><button className="btn btn-primary" onClick={() => openPass(selectedMachine)}>Registrar pasada</button></div></div>
      <section className="grid gap-6 lg:grid-cols-3"><div className="admin-card lg:col-span-2"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-wider text-fuchsia-600">{selectedMachine.code}</span><h3 className="mt-1 text-3xl font-black">{selectedMachine.name}</h3><p className="mt-1 text-slate-500">{selectedMachine.location}</p></div><span className={`status-badge ${selectedMachine.auditAlert ? "danger" : "success"}`}>{selectedMachine.auditAlert ? "Diferencia de auditoría" : "Saldo controlado"}</span></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Saldo interno",selectedMachine.theoreticalStock],["Contador inicial",selectedMachine.initialCounter],["Modelo",selectedMachine.model || "—"],["Serie",selectedMachine.serialNumber || "—"]].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-black">{value}</div></div>)}</div><p className="mt-5 text-sm leading-6 text-slate-600">{selectedMachine.notes || "Sin especificaciones adicionales."}</p>{selectedMachine.consignment && <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><b>Consignación:</b> {selectedMachine.locatorName || "Locador"} · {number(selectedMachine.locatorPercent, 2)}% sobre ingreso bruto</div>}</div>
        <div className="admin-card"><div className="card-heading"><div><h3>Fotos</h3><p>{selectedMachine.photos?.length || 0} de 6</p></div></div><div className="grid grid-cols-2 gap-2">{(selectedMachine.photos || []).map((photo) => <div key={photo.id} className="group relative overflow-hidden rounded-xl"><img src={photo.dataUrl} alt="Máquina" className="h-24 w-full object-cover"/><div className="absolute inset-x-0 bottom-0 flex justify-between bg-slate-950/65 p-1 text-[10px] text-white"><button onClick={() => run(() => api.setPlushMachineCover(selectedMachine.id, photo.id), "Portada actualizada.")}>{photo.isCover ? "Portada" : "Usar portada"}</button><button onClick={() => run(() => api.deletePlushMachinePhoto(selectedMachine.id, photo.id), "Foto eliminada.")}>Eliminar</button></div></div>)}</div>{selectedMachine.photos?.length < 6 && <label className="btn btn-ghost mt-3 w-full"><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { try { const file = event.target.files?.[0]; if (!file) return; const dataUrl = await compressPhoto(file); await run(() => api.addPlushMachinePhoto(selectedMachine.id, dataUrl), "Foto agregada."); } catch (error) { notify(error.message, "error"); } event.target.value = ""; }}/>+ Agregar foto</label>}</div>
      </section>
      <section className="grid gap-6 xl:grid-cols-2"><div className="admin-card"><div className="card-heading"><div><h3>Pasadas</h3><p>Contadores y rentabilidad histórica</p></div></div><div className="space-y-3">{machineSettlements.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${item.status === "VOIDED" ? "border-slate-200 bg-slate-50 opacity-65" : "border-slate-200"}`}><div className="flex justify-between gap-3"><div><b>{dateTime(item.createdAt)}</b><div className="mt-1 text-xs text-slate-500">Contador {item.initialCounter} → {item.finalCounter} · {item.prizesDelivered} premios</div></div><div className="text-right"><b>{ars(item.grossIncome)}</b><div className={`text-xs ${item.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>Neto {ars(item.netProfit)}</div></div></div>{item.status === "ACTIVE" && latestActiveSettlement?.id === item.id && <div className="mt-3 flex gap-2 border-t pt-3"><button className="text-button" onClick={() => openSettlementEdit(item)}>Corregir</button><button className="text-button text-rose-600" onClick={() => reasonAndRun("pasada", (reason) => api.voidPlushSettlement(item.id, reason))}>Anular</button></div>}{item.status === "VOIDED" && <div className="mt-2 text-xs text-rose-600">Anulada: {item.voidReason}</div>}</article>)}{!machineSettlements.length && <div className="empty-state">Sin pasadas.</div>}</div></div>
        <div className="admin-card"><div className="card-heading"><div><h3>Cargas</h3><p>Ingresos de peluches a esta máquina</p></div></div><div className="space-y-3">{machineLoads.map((item) => <article key={item.id} className={`flex items-center justify-between rounded-xl border p-4 ${item.status === "VOIDED" ? "bg-slate-50 opacity-60" : ""}`}><div><b>+ {item.quantity} peluches</b><div className="text-xs text-slate-500">{dateTime(item.createdAt)} · {item.createdByName}</div>{item.status === "VOIDED" && <div className="text-xs text-rose-600">Anulada: {item.voidReason}</div>}</div>{item.status === "ACTIVE" && <button className="text-button text-rose-600" onClick={() => reasonAndRun("carga", (reason) => api.voidPlushLoad(item.id, reason))}>Anular</button>}</article>)}{!machineLoads.length && <div className="empty-state">Sin cargas registradas.</div>}</div></div></section>
    </>}

    {tab === "inventory" && <>
      {!inventory.initialized ? <section className="admin-card mx-auto max-w-xl"><h3 className="text-xl font-black">Configurar stock inicial</h3><p className="mt-2 text-sm text-slate-500">Ingresá una sola vez los peluches disponibles hoy y su costo unitario.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Cantidad inicial"><input className="admin-input" type="number" min="0" value={inventoryForm.initialQuantity} onChange={(e) => setInventoryForm({ ...inventoryForm, initialQuantity: e.target.value })}/></Field><Field label="CPP inicial"><input className="admin-input" type="number" min="0" step="0.01" value={inventoryForm.initialUnitCost} onChange={(e) => setInventoryForm({ ...inventoryForm, initialUnitCost: e.target.value })}/></Field></div><button className="btn btn-primary mt-5" onClick={() => run(() => api.initializePlushInventory(inventoryForm), "Inventario inicial configurado.")}>Comenzar control</button></section> : <>
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Restante" value={number(inventory.remaining)} detail="Disponible para máquinas"/><Metric label="Comprado" value={number(inventory.purchased)} detail="Compras activas" tone="green"/><Metric label="Cargado" value={number(inventory.loaded)} detail="Transferido a máquinas" tone="violet"/><Metric label="Ajustes" value={number(inventory.adjusted)} detail={`Inicial: ${inventory.initialQuantity}`} tone="slate"/></section>
        <div className="flex flex-wrap justify-end gap-2">{!inventory.locked && <button className="btn btn-ghost" onClick={() => { setInventoryForm({ initialQuantity: String(inventory.initialQuantity), initialUnitCost: String(inventory.initialUnitCost) }); setDialog("inventory-init"); }}>Editar stock inicial</button>}<button className="btn btn-ghost" onClick={() => { setAdjustForm({ delta: "", reason: "" }); setDialog("adjust"); }}>Ajustar stock</button><button className="btn btn-soft" onClick={() => openLoad()}>Cargar máquina</button><button className="btn btn-primary" onClick={() => { setPurchaseForm({ quantity: "", totalCost: "", supplier: "", notes: "" }); setDialog("purchase"); }}>+ Registrar compra</button></div>
        <section className="grid gap-6 xl:grid-cols-2"><div className="admin-card"><div className="card-heading"><div><h3>Compras</h3><p>El CPP de la última compra se usa en liquidaciones nuevas.</p></div></div><div className="overflow-x-auto"><table className="admin-table"><thead><tr><th>Fecha</th><th>Cantidad</th><th>CPP</th><th></th></tr></thead><tbody>{(data?.purchases || []).map((item) => <tr key={item.id} className={item.status === "VOIDED" ? "opacity-50" : ""}><td>{dateTime(item.createdAt)}<div className="text-xs text-slate-400">{item.supplier || "Sin proveedor"}</div></td><td>{item.quantity}</td><td>{ars(item.unitCost, 2)}</td><td>{item.status === "ACTIVE" ? <button className="text-button text-rose-600" onClick={() => reasonAndRun("compra", (reason) => api.voidPlushPurchase(item.id, reason))}>Anular</button> : <span className="text-xs">Anulada</span>}</td></tr>)}</tbody></table>{!data?.purchases?.length && <div className="empty-state">Sin compras.</div>}</div></div>
          <div className="admin-card"><div className="card-heading"><div><h3>Ajustes de auditoría</h3><p>Diferencias documentadas del depósito.</p></div></div><div className="space-y-3">{(data?.adjustments || []).map((item) => <div key={item.id} className={`flex justify-between gap-3 rounded-xl bg-slate-50 p-4 ${item.status === "VOIDED" ? "opacity-50" : ""}`}><div><b>{item.reason}</b><div className="text-xs text-slate-500">{dateTime(item.createdAt)} · {item.createdByName}</div>{item.status === "VOIDED" && <div className="text-xs text-rose-600">Anulado: {item.voidReason}</div>}</div><div className="text-right"><b className={item.delta > 0 ? "text-emerald-600" : "text-rose-600"}>{item.delta > 0 ? "+" : ""}{item.delta}</b>{item.status === "ACTIVE" && <button className="mt-2 block text-xs font-bold text-rose-600" onClick={() => reasonAndRun("ajuste", (reason) => api.voidPlushAdjustment(item.id, reason))}>Anular</button>}</div></div>)}{!data?.adjustments?.length && <div className="empty-state">Sin ajustes.</div>}</div></div></section>
      </>}
    </>}

    <Dialog open={dialog?.startsWith("machine")} title={dialog === "machine" ? "Nueva máquina" : "Editar máquina"} onClose={() => setDialog(null)} onSubmit={() => run(() => dialog === "machine" ? api.createPlushMachine(machineForm) : api.updatePlushMachine(dialog.split(":")[1], machineForm), "Máquina guardada.")} wide>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre"><input required className="admin-input" value={machineForm.name} onChange={(e) => setMachineForm({ ...machineForm, name: e.target.value })}/></Field><Field label="Código único"><input required className="admin-input" value={machineForm.code} onChange={(e) => setMachineForm({ ...machineForm, code: e.target.value })}/></Field><Field label="Ubicación"><input required className="admin-input" value={machineForm.location} onChange={(e) => setMachineForm({ ...machineForm, location: e.target.value })}/></Field><Field label="Modelo"><input className="admin-input" value={machineForm.model} onChange={(e) => setMachineForm({ ...machineForm, model: e.target.value })}/></Field><Field label="Número de serie"><input className="admin-input" value={machineForm.serialNumber} onChange={(e) => setMachineForm({ ...machineForm, serialNumber: e.target.value })}/></Field><Field label="Contador inicial"><input required disabled={Boolean(machineForm.initialValuesLocked)} type="number" min="0" className="admin-input" value={machineForm.initialCounter} onChange={(e) => setMachineForm({ ...machineForm, initialCounter: e.target.value })}/></Field><Field label="Peluches iniciales"><input required disabled={Boolean(machineForm.initialValuesLocked)} type="number" min="0" className="admin-input" value={machineForm.initialPlushQuantity} onChange={(e) => setMachineForm({ ...machineForm, initialPlushQuantity: e.target.value })}/></Field><label className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-bold"><input type="checkbox" checked={machineForm.active !== false} onChange={(e) => setMachineForm({ ...machineForm, active: e.target.checked })}/>Máquina activa</label><label className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm font-bold"><input type="checkbox" checked={machineForm.consignment} onChange={(e) => setMachineForm({ ...machineForm, consignment: e.target.checked })}/>Está en consignación</label>{machineForm.consignment && <><Field label="Locador"><input required className="admin-input" value={machineForm.locatorName} onChange={(e) => setMachineForm({ ...machineForm, locatorName: e.target.value })}/></Field><Field label="Porcentaje sobre bruto"><input className="admin-input" type="number" min="0" max="100" step="0.01" value={machineForm.locatorPercent} onChange={(e) => setMachineForm({ ...machineForm, locatorPercent: e.target.value })}/></Field></>}</div><Field label="Notas y especificaciones"><textarea className="admin-input mt-4 min-h-24" value={machineForm.notes} onChange={(e) => setMachineForm({ ...machineForm, notes: e.target.value })}/></Field>
    </Dialog>
    <Dialog open={dialog === "inventory-init"} title="Editar stock inicial" onClose={() => setDialog(null)} onSubmit={() => run(() => api.initializePlushInventory(inventoryForm), "Stock inicial actualizado.")}><div className="grid gap-4 sm:grid-cols-2"><Field label="Cantidad inicial"><input required className="admin-input" type="number" min="0" value={inventoryForm.initialQuantity} onChange={(e) => setInventoryForm({ ...inventoryForm, initialQuantity: e.target.value })}/></Field><Field label="CPP inicial"><input required className="admin-input" type="number" min="0" step="0.01" value={inventoryForm.initialUnitCost} onChange={(e) => setInventoryForm({ ...inventoryForm, initialUnitCost: e.target.value })}/></Field></div></Dialog>
    <Dialog open={dialog === "purchase"} title="Registrar compra" onClose={() => setDialog(null)} onSubmit={() => run(() => api.createPlushPurchase(purchaseForm), "Compra registrada.")}><div className="space-y-4"><Field label="Cantidad"><input required className="admin-input" type="number" min="1" value={purchaseForm.quantity} onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}/></Field><Field label="Importe total"><input required className="admin-input" type="number" min="0" step="0.01" value={purchaseForm.totalCost} onChange={(e) => setPurchaseForm({ ...purchaseForm, totalCost: e.target.value })}/></Field>{Number(purchaseForm.quantity) > 0 && <div className="rounded-xl bg-fuchsia-50 p-3 text-sm">CPP calculado: <b>{ars(Number(purchaseForm.totalCost) / Number(purchaseForm.quantity), 2)}</b></div>}<Field label="Proveedor"><input className="admin-input" value={purchaseForm.supplier} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}/></Field><Field label="Notas"><textarea className="admin-input" value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}/></Field></div></Dialog>
    <Dialog open={dialog === "adjust"} title="Ajustar stock" onClose={() => setDialog(null)} onSubmit={() => run(() => api.adjustPlushInventory(adjustForm), "Stock ajustado.")}><div className="space-y-4"><Field label="Cantidad a sumar o restar"><input required className="admin-input" type="number" value={adjustForm.delta} onChange={(e) => setAdjustForm({ ...adjustForm, delta: e.target.value })}/></Field><Field label="Motivo de auditoría"><textarea required className="admin-input" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}/></Field></div></Dialog>
    <Dialog open={dialog === "load"} title="Cargar peluches a una máquina" onClose={() => setDialog(null)} onSubmit={() => run(() => api.createPlushLoad(loadForm), "Carga registrada.")}><div className="space-y-4"><Field label="Máquina"><select required className="admin-select" value={loadForm.machineId} onChange={(e) => setLoadForm({ ...loadForm, machineId: e.target.value })}><option value="">Seleccionar</option>{(data?.machines || []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.location}</option>)}</select></Field><Field label="Cantidad" hint={`Disponibles: ${inventory.remaining || 0}`}><input required className="admin-input" type="number" min="1" max={inventory.remaining} value={loadForm.quantity} onChange={(e) => setLoadForm({ ...loadForm, quantity: e.target.value })}/></Field><Field label="Notas"><textarea className="admin-input" value={loadForm.notes} onChange={(e) => setLoadForm({ ...loadForm, notes: e.target.value })}/></Field></div></Dialog>
    {settlementForm.id ? <Dialog open={dialog === "settlement"} title="Corregir última pasada" onClose={() => setDialog(null)} submitLabel={busy ? "Guardando…" : "Guardar corrección"} onSubmit={() => run(() => api.updatePlushSettlement(settlementForm.id, settlementForm), "Pasada corregida.")}>
      <div className="space-y-4"><div className="rounded-xl bg-fuchsia-50 p-4 text-sm"><div className="text-fuchsia-700">Contador anterior</div><b className="text-xl">{latestActiveSettlement?.initialCounter ?? "—"}</b></div><Field label="Lectura actual"><input autoFocus required className="admin-input" type="number" min={latestActiveSettlement?.initialCounter || 0} step="1" value={settlementForm.finalCounter} onChange={(e) => setSettlementForm({ ...settlementForm, finalCounter: e.target.value })}/></Field><div className="grid grid-cols-2 gap-4"><Field label="Dinero retirado"><input className="admin-input" type="number" min="0" step="0.01" value={settlementForm.cashAmount} onChange={(e) => setSettlementForm({ ...settlementForm, cashAmount: e.target.value })}/></Field><Field label="QR"><input className="admin-input" type="number" min="0" step="0.01" value={settlementForm.qrAmount} onChange={(e) => setSettlementForm({ ...settlementForm, qrAmount: e.target.value })}/></Field></div><Field label="Notas"><textarea className="admin-input" value={settlementForm.notes} onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })}/></Field></div>
    </Dialog> : <Dialog open={dialog === "settlement"} title={`Registrar pasada · Paso ${passStep} de 2`} onClose={() => setDialog(null)} onBack={passStep === 2 ? () => setPassStep(1) : null} submitLabel={passStep === 1 ? "Continuar" : busy ? "Guardando…" : "Registrar pasada"} onSubmit={passStep === 1 ? advancePass : savePass}>
      {passStep === 1 ? <div className="space-y-4">
        <div className="rounded-xl bg-fuchsia-50 p-4 text-sm"><div className="text-fuchsia-700">Contador anterior</div><b className="text-xl">{passInitialCounter}</b></div>
        <Field label="Lectura actual" hint="Ingresá el número tal como aparece en la máquina"><input autoFocus required className="admin-input" type="number" min={passInitialCounter} step="1" value={settlementForm.finalCounter} onChange={(e) => setSettlementForm({ ...settlementForm, finalCounter: e.target.value })}/></Field>
        <div className="grid grid-cols-2 gap-4"><Field label="Dinero retirado"><input required className="admin-input" type="number" min="0" step="0.01" value={settlementForm.cashAmount} onChange={(e) => setSettlementForm({ ...settlementForm, cashAmount: e.target.value })}/></Field><Field label="QR"><input required className="admin-input" type="number" min="0" step="0.01" value={settlementForm.qrAmount} onChange={(e) => setSettlementForm({ ...settlementForm, qrAmount: e.target.value })}/></Field></div>
        <Field label="Notas"><textarea className="admin-input" value={settlementForm.notes} onChange={(e) => setSettlementForm({ ...settlementForm, notes: e.target.value })}/></Field>
      </div> : <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold text-slate-500">PELUCHES ENTREGADOS</div><div className="mt-1 text-2xl font-black">{number(passPrizesDelivered)}</div></div><div className={`rounded-xl p-4 ${passStockAfter < 0 ? "bg-rose-50 text-rose-700" : "bg-fuchsia-50 text-fuchsia-700"}`}><div className="text-xs font-bold">DEBERÍAN QUEDAR</div><div className="mt-1 text-2xl font-black">{number(passStockAfter)}</div></div></div>
        {passStockAfter < 0 && <div className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">El saldo quedará negativo y la máquina se marcará para auditoría.</div>}
        <fieldset><legend className="mb-2 text-sm font-bold text-slate-700">¿Querés cargar peluches ahora?</legend><div className="grid grid-cols-2 gap-3"><label className={`cursor-pointer rounded-xl border p-4 text-center font-bold ${settlementForm.loadChoice === "yes" ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200"}`}><input required className="sr-only" type="radio" name="loadChoice" value="yes" checked={settlementForm.loadChoice === "yes"} onChange={(e) => setSettlementForm({ ...settlementForm, loadChoice: e.target.value })}/>Sí, cargar</label><label className={`cursor-pointer rounded-xl border p-4 text-center font-bold ${settlementForm.loadChoice === "no" ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200"}`}><input required className="sr-only" type="radio" name="loadChoice" value="no" checked={settlementForm.loadChoice === "no"} onChange={(e) => setSettlementForm({ ...settlementForm, loadChoice: e.target.value, loadQuantity: "" })}/>No cargar</label></div></fieldset>
        {settlementForm.loadChoice === "yes" && <Field label="Cantidad a cargar" hint={`Disponibles: ${number(inventory.remaining || 0)}`}><input autoFocus required className="admin-input" type="number" min="1" max={inventory.remaining || 0} step="1" value={settlementForm.loadQuantity} onChange={(e) => setSettlementForm({ ...settlementForm, loadQuantity: e.target.value })}/></Field>}
        {settlementForm.loadChoice && <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Saldo antes de cargar</span><b>{number(passStockAfter)} peluches</b></div><div className="flex justify-between"><span>Saldo final de la máquina</span><b>{number(passFinalStock)} peluches</b></div><div className="flex justify-between border-t border-slate-200 pt-2"><span>Quedarán disponibles</span><b className={passRemainingInventory < 0 ? "text-rose-600" : ""}>{number(passRemainingInventory)} peluches</b></div></div>}
      </div>}
    </Dialog>}
  </div>;
}
