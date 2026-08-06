import { Router } from "express";
import prisma from "../db.js";
import { authenticate, requireOwner } from "../middleware/auth.js";
import { periodBounds, settlementMetrics, summarizeSettlements } from "../plush-rules.js";

const router = Router();
router.use(authenticate, requireOwner);

const dayKeyArgentina = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

const text = (value) => String(value || "").trim();
const integer = (value, label, { min = 0, allowZero = true } = {}) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || (!allowZero && number === 0)) throw new Error(`${label} inválida`);
  return number;
};
const money = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} inválido`);
  return Math.round(number * 100) / 100;
};
const percent = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error("El porcentaje debe estar entre 0 y 100");
  return number;
};
const actor = (req) => ({ createdById: req.user.id, createdByName: req.user.name });
const voidActor = (req, reason) => ({
  status: "VOIDED", voidReason: text(reason), voidedAt: new Date(),
  voidedById: req.user.id, voidedByName: req.user.name,
});

async function inventoryState(db = prisma) {
  const [inventory, purchases, adjustments, loads] = await Promise.all([
    db.plushInventory.findUnique({ where: { id: "main" } }),
    db.plushPurchase.aggregate({ where: { status: "ACTIVE" }, _sum: { quantity: true } }),
    db.plushStockAdjustment.aggregate({ where: { status: "ACTIVE" }, _sum: { delta: true } }),
    db.plushLoad.aggregate({ where: { status: "ACTIVE" }, _sum: { quantity: true } }),
  ]);
  const initialQuantity = Number(inventory?.initialQuantity || 0);
  const purchased = Number(purchases._sum.quantity || 0);
  const adjusted = Number(adjustments._sum.delta || 0);
  const loaded = Number(loads._sum.quantity || 0);
  return {
    initialized: Boolean(inventory), initialQuantity, initialUnitCost: inventory ? Number(inventory.initialUnitCost) : null,
    locked: Boolean(inventory?.locked), purchased, adjusted, loaded,
    remaining: initialQuantity + purchased + adjusted - loaded,
  };
}

function serializePurchase(item) {
  return { ...item, totalCost: Number(item.totalCost), unitCost: Number(item.unitCost) };
}

function serializeMachine(machine, loadQuantity = 0, prizesDelivered = 0) {
  const { _count, ...fields } = machine;
  const theoreticalStock = Number(machine.initialPlushQuantity) + Number(loadQuantity) - Number(prizesDelivered);
  return {
    ...fields, locatorPercent: Number(machine.locatorPercent), theoreticalStock,
    initialValuesLocked: Boolean(_count && (_count.loads + _count.settlements > 0)),
    auditAlert: theoreticalStock < 0,
  };
}

function serializeSettlement(item) {
  const normalized = {
    ...item,
    cashAmount: Number(item.cashAmount), qrAmount: Number(item.qrAmount),
    cppSnapshot: Number(item.cppSnapshot), locatorPercentSnapshot: Number(item.locatorPercentSnapshot),
  };
  return { ...normalized, ...settlementMetrics(normalized) };
}

async function lockInventory(db) {
  const inventory = await db.plushInventory.findUnique({ where: { id: "main" } });
  if (!inventory) throw new Error("Configurá primero el stock inicial");
  if (!inventory.locked) await db.plushInventory.update({ where: { id: "main" }, data: { locked: true } });
  return inventory;
}

router.get("/overview", async (req, res) => {
  try {
    const today = dayKeyArgentina().split("-").map(Number);
    const bounds = periodBounds(req.query.period || "month", req.query.year || today[0], req.query.month || today[1]);
    const [inventory, machinesRaw, purchasesRaw, adjustments, loads, settlements, loadTotals, prizeTotals, periodSettlements] = await Promise.all([
      inventoryState(),
      prisma.plushMachine.findMany({ include: { photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] }, _count: { select: { loads: true, settlements: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      prisma.plushPurchase.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.plushStockAdjustment.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.plushLoad.findMany({ include: { machine: { select: { name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.plushSettlement.findMany({ include: { machine: { select: { name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.plushLoad.groupBy({ by: ["machineId"], where: { status: "ACTIVE" }, _sum: { quantity: true } }),
      prisma.plushSettlement.groupBy({ by: ["machineId"], where: { status: "ACTIVE" }, _sum: { prizesDelivered: true } }),
      prisma.plushSettlement.findMany({ where: { status: "ACTIVE", dayKey: { gte: bounds.from, lte: bounds.to } } }),
    ]);
    const loadByMachine = new Map(loadTotals.map((item) => [item.machineId, Number(item._sum.quantity || 0)]));
    const prizesByMachine = new Map(prizeTotals.map((item) => [item.machineId, Number(item._sum.prizesDelivered || 0)]));
    const machines = machinesRaw.map((machine) => serializeMachine(machine, loadByMachine.get(machine.id), prizesByMachine.get(machine.id)));
    const summary = summarizeSettlements(periodSettlements, machines);
    res.json({
      inventory, machines, purchases: purchasesRaw.map(serializePurchase), adjustments, loads,
      settlements: settlements.map(serializeSettlement),
      dashboard: { ...summary, ...bounds, negativeMachines: machines.filter((item) => item.auditAlert).length },
    });
  } catch (error) {
    console.error("Plush overview error:", error);
    res.status(400).json({ error: error.message || "Error al cargar Pelucheras" });
  }
});

router.post("/inventory/initialize", async (req, res) => {
  try {
    const initialQuantity = integer(req.body.initialQuantity, "Cantidad inicial");
    const initialUnitCost = money(req.body.initialUnitCost, "CPP inicial");
    const existing = await prisma.plushInventory.findUnique({ where: { id: "main" } });
    if (existing?.locked) return res.status(400).json({ error: "El stock inicial ya está bloqueado; usá un ajuste" });
    const inventory = existing
      ? await prisma.plushInventory.update({ where: { id: "main" }, data: { initialQuantity, initialUnitCost } })
      : await prisma.plushInventory.create({ data: { id: "main", initialQuantity, initialUnitCost, ...actor(req) } });
    res.status(existing ? 200 : 201).json({ ...inventory, initialUnitCost: Number(inventory.initialUnitCost) });
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo configurar el inventario" }); }
});

router.post("/inventory/adjustments", async (req, res) => {
  try {
    const delta = integer(Math.abs(Number(req.body.delta)), "Cantidad", { allowZero: false }) * (Number(req.body.delta) < 0 ? -1 : 1);
    const reason = text(req.body.reason);
    if (!reason) throw new Error("El motivo es obligatorio");
    const created = await prisma.$transaction(async (tx) => {
      await lockInventory(tx);
      const state = await inventoryState(tx);
      if (state.remaining + delta < 0) throw new Error("El ajuste dejaría el depósito con stock negativo");
      return tx.plushStockAdjustment.create({ data: { delta, reason, ...actor(req) } });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(created);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo ajustar el stock" }); }
});

router.post("/inventory/adjustments/:id/void", async (req, res) => {
  try {
    const reason = text(req.body.reason);
    if (!reason) throw new Error("El motivo es obligatorio");
    const updated = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.plushStockAdjustment.findUnique({ where: { id: req.params.id } });
      if (!adjustment || adjustment.status !== "ACTIVE") throw new Error("Ajuste inexistente o ya anulado");
      const state = await inventoryState(tx);
      if (state.remaining - adjustment.delta < 0) throw new Error("No se puede anular: dejaría el depósito con stock negativo");
      return tx.plushStockAdjustment.update({ where: { id: adjustment.id }, data: voidActor(req, reason) });
    }, { isolationLevel: "Serializable" });
    res.json(updated);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo anular el ajuste" }); }
});

router.post("/purchases", async (req, res) => {
  try {
    const quantity = integer(req.body.quantity, "Cantidad", { allowZero: false });
    const totalCost = money(req.body.totalCost, "Importe total");
    const created = await prisma.$transaction(async (tx) => {
      await lockInventory(tx);
      return tx.plushPurchase.create({ data: {
        quantity, totalCost, unitCost: totalCost / quantity, supplier: text(req.body.supplier), notes: text(req.body.notes), ...actor(req),
      } });
    });
    res.status(201).json(serializePurchase(created));
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo registrar la compra" }); }
});

router.post("/purchases/:id/void", async (req, res) => {
  try {
    const reason = text(req.body.reason);
    if (!reason) throw new Error("El motivo es obligatorio");
    const updated = await prisma.$transaction(async (tx) => {
      const purchase = await tx.plushPurchase.findUnique({ where: { id: req.params.id } });
      if (!purchase || purchase.status !== "ACTIVE") throw new Error("Compra inexistente o ya anulada");
      const state = await inventoryState(tx);
      if (state.remaining - purchase.quantity < 0) throw new Error("No se puede anular: parte de esta compra ya fue cargada");
      return tx.plushPurchase.update({ where: { id: purchase.id }, data: voidActor(req, reason) });
    }, { isolationLevel: "Serializable" });
    res.json(serializePurchase(updated));
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo anular la compra" }); }
});

router.post("/machines", async (req, res) => {
  try {
    const name = text(req.body.name), code = text(req.body.code), location = text(req.body.location);
    if (!name || !code || !location) throw new Error("Nombre, código y ubicación son obligatorios");
    const consignment = Boolean(req.body.consignment);
    if (consignment && !text(req.body.locatorName)) throw new Error("Ingresá el nombre del locador");
    const created = await prisma.plushMachine.create({ data: {
      name, code, location, model: text(req.body.model), serialNumber: text(req.body.serialNumber), notes: text(req.body.notes),
      active: req.body.active == null ? true : Boolean(req.body.active), consignment,
      locatorName: consignment ? text(req.body.locatorName) : "", locatorPercent: consignment ? percent(req.body.locatorPercent) : 0,
      initialCounter: integer(req.body.initialCounter, "Contador inicial"),
      initialPlushQuantity: integer(req.body.initialPlushQuantity, "Cantidad inicial"), ...actor(req),
    }, include: { photos: true } });
    res.status(201).json(serializeMachine(created));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Ya existe una máquina con ese código" });
    res.status(400).json({ error: error.message || "No se pudo crear la máquina" });
  }
});

router.patch("/machines/:id", async (req, res) => {
  try {
    const machine = await prisma.plushMachine.findUnique({ where: { id: req.params.id }, include: { _count: { select: { loads: true, settlements: true } } } });
    if (!machine) return res.status(404).json({ error: "Máquina no encontrada" });
    const data = {};
    for (const field of ["name", "code", "location", "model", "serialNumber", "notes", "locatorName"]) if (req.body[field] != null) data[field] = text(req.body[field]);
    if (req.body.active != null) data.active = Boolean(req.body.active);
    if (req.body.consignment != null) data.consignment = Boolean(req.body.consignment);
    if (req.body.locatorPercent != null) data.locatorPercent = percent(req.body.locatorPercent);
    if (!((data.name ?? machine.name) && (data.code ?? machine.code) && (data.location ?? machine.location))) throw new Error("Nombre, código y ubicación son obligatorios");
    const nextConsignment = data.consignment ?? machine.consignment;
    if (nextConsignment && !(data.locatorName ?? machine.locatorName)) throw new Error("Ingresá el nombre del locador");
    const hasMovements = machine._count.loads + machine._count.settlements > 0;
    if (req.body.initialCounter != null || req.body.initialPlushQuantity != null) {
      const nextCounter = req.body.initialCounter == null ? machine.initialCounter : integer(req.body.initialCounter, "Contador inicial");
      const nextQuantity = req.body.initialPlushQuantity == null ? machine.initialPlushQuantity : integer(req.body.initialPlushQuantity, "Cantidad inicial");
      if (hasMovements && (nextCounter !== machine.initialCounter || nextQuantity !== machine.initialPlushQuantity)) throw new Error("Los valores iniciales quedan bloqueados después del primer movimiento");
      if (!hasMovements) { data.initialCounter = nextCounter; data.initialPlushQuantity = nextQuantity; }
    }
    if (data.consignment === false) { data.locatorName = ""; data.locatorPercent = 0; }
    const updated = await prisma.plushMachine.update({ where: { id: machine.id }, data, include: { photos: true } });
    res.json(serializeMachine(updated));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Ya existe una máquina con ese código" });
    res.status(400).json({ error: error.message || "No se pudo actualizar la máquina" });
  }
});

router.post("/machines/:id/photos", async (req, res) => {
  try {
    const dataUrl = String(req.body.dataUrl || "");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("La foto debe ser JPEG, PNG o WebP");
    if (Buffer.byteLength(match[2], "base64") > 1_500_000) throw new Error("La foto supera el límite de 1,5 MB");
    const photo = await prisma.$transaction(async (tx) => {
      const machine = await tx.plushMachine.findUnique({ where: { id: req.params.id } });
      if (!machine) throw new Error("Máquina no encontrada");
      const count = await tx.plushMachinePhoto.count({ where: { machineId: machine.id } });
      if (count >= 6) throw new Error("La máquina ya tiene el máximo de seis fotos");
      const isCover = count === 0 || Boolean(req.body.isCover);
      if (isCover) await tx.plushMachinePhoto.updateMany({ where: { machineId: machine.id }, data: { isCover: false } });
      return tx.plushMachinePhoto.create({ data: { machineId: machine.id, dataUrl, mimeType: match[1], isCover, sortOrder: count } });
    });
    res.status(201).json(photo);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo guardar la foto" }); }
});

router.patch("/machines/:machineId/photos/:photoId/cover", async (req, res) => {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const photo = await tx.plushMachinePhoto.findFirst({ where: { id: req.params.photoId, machineId: req.params.machineId } });
      if (!photo) throw new Error("Foto no encontrada");
      await tx.plushMachinePhoto.updateMany({ where: { machineId: photo.machineId }, data: { isCover: false } });
      return tx.plushMachinePhoto.update({ where: { id: photo.id }, data: { isCover: true } });
    });
    res.json(updated);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo cambiar la portada" }); }
});

router.delete("/machines/:machineId/photos/:photoId", async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      const photo = await tx.plushMachinePhoto.findFirst({ where: { id: req.params.photoId, machineId: req.params.machineId } });
      if (!photo) throw new Error("Foto no encontrada");
      await tx.plushMachinePhoto.delete({ where: { id: photo.id } });
      if (photo.isCover) {
        const next = await tx.plushMachinePhoto.findFirst({ where: { machineId: photo.machineId }, orderBy: { sortOrder: "asc" } });
        if (next) await tx.plushMachinePhoto.update({ where: { id: next.id }, data: { isCover: true } });
      }
    });
    res.json({ message: "Foto eliminada" });
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo eliminar la foto" }); }
});

router.post("/loads", async (req, res) => {
  try {
    const quantity = integer(req.body.quantity, "Cantidad", { allowZero: false });
    const created = await prisma.$transaction(async (tx) => {
      await lockInventory(tx);
      const machine = await tx.plushMachine.findUnique({ where: { id: String(req.body.machineId || "") } });
      if (!machine?.active) throw new Error("Seleccioná una máquina activa");
      const state = await inventoryState(tx);
      if (quantity > state.remaining) throw new Error(`Stock insuficiente: quedan ${state.remaining} peluches`);
      return tx.plushLoad.create({ data: { machineId: machine.id, quantity, notes: text(req.body.notes), ...actor(req) } });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(created);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo registrar la carga" }); }
});

router.post("/passes", async (req, res) => {
  try {
    const loadQuantity = req.body.loadQuantity == null || req.body.loadQuantity === ""
      ? 0
      : integer(req.body.loadQuantity, "Cantidad a cargar");
    const created = await prisma.$transaction(async (tx) => {
      const inventory = await lockInventory(tx);
      const machine = await tx.plushMachine.findUnique({ where: { id: String(req.body.machineId || "") } });
      if (!machine?.active) throw new Error("Seleccioná una máquina activa");
      const previous = await tx.plushSettlement.findFirst({ where: { machineId: machine.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
      const initialCounter = previous ? previous.finalCounter : machine.initialCounter;
      const finalCounter = integer(req.body.finalCounter, "Lectura actual");
      if (finalCounter < initialCounter) throw new Error(`La lectura no puede ser menor que ${initialCounter}`);
      const lastPurchase = await tx.plushPurchase.findFirst({ where: { status: "ACTIVE", createdAt: { lte: new Date() } }, orderBy: { createdAt: "desc" } });

      if (loadQuantity > 0) {
        const state = await inventoryState(tx);
        if (loadQuantity > state.remaining) throw new Error(`Stock insuficiente: quedan ${state.remaining} peluches`);
      }

      const settlement = await tx.plushSettlement.create({ data: {
        machineId: machine.id, dayKey: dayKeyArgentina(), initialCounter, finalCounter,
        prizesDelivered: finalCounter - initialCounter,
        cashAmount: money(req.body.cashAmount || 0, "Dinero retirado"), qrAmount: money(req.body.qrAmount || 0, "QR"),
        cppSnapshot: lastPurchase ? lastPurchase.unitCost : inventory.initialUnitCost,
        consignmentSnapshot: machine.consignment, locatorNameSnapshot: machine.consignment ? machine.locatorName : "",
        locatorPercentSnapshot: machine.consignment ? machine.locatorPercent : 0,
        notes: text(req.body.notes), ...actor(req),
      } });
      const load = loadQuantity > 0
        ? await tx.plushLoad.create({ data: { machineId: machine.id, quantity: loadQuantity, notes: "Carga realizada al registrar pasada", ...actor(req) } })
        : null;
      return { settlement, load };
    }, { isolationLevel: "Serializable" });
    res.status(201).json({ settlement: serializeSettlement(created.settlement), load: created.load });
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo registrar la pasada" }); }
});

router.post("/loads/:id/void", async (req, res) => {
  try {
    const reason = text(req.body.reason);
    if (!reason) throw new Error("El motivo es obligatorio");
    const load = await prisma.plushLoad.findUnique({ where: { id: req.params.id } });
    if (!load || load.status !== "ACTIVE") throw new Error("Carga inexistente o ya anulada");
    const updated = await prisma.plushLoad.update({ where: { id: load.id }, data: voidActor(req, reason) });
    res.json(updated);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo anular la carga" }); }
});

router.post("/settlements", async (req, res) => {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const inventory = await lockInventory(tx);
      const machine = await tx.plushMachine.findUnique({ where: { id: String(req.body.machineId || "") } });
      if (!machine?.active) throw new Error("Seleccioná una máquina activa");
      const previous = await tx.plushSettlement.findFirst({ where: { machineId: machine.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
      const initialCounter = previous ? previous.finalCounter : machine.initialCounter;
      const finalCounter = integer(req.body.finalCounter, "Lectura final");
      if (finalCounter < initialCounter) throw new Error(`La lectura no puede ser menor que ${initialCounter}`);
      const lastPurchase = await tx.plushPurchase.findFirst({ where: { status: "ACTIVE", createdAt: { lte: new Date() } }, orderBy: { createdAt: "desc" } });
      return tx.plushSettlement.create({ data: {
        machineId: machine.id, dayKey: dayKeyArgentina(), initialCounter, finalCounter,
        prizesDelivered: finalCounter - initialCounter,
        cashAmount: money(req.body.cashAmount || 0, "Efectivo"), qrAmount: money(req.body.qrAmount || 0, "QR"),
        cppSnapshot: lastPurchase ? lastPurchase.unitCost : inventory.initialUnitCost,
        consignmentSnapshot: machine.consignment, locatorNameSnapshot: machine.consignment ? machine.locatorName : "",
        locatorPercentSnapshot: machine.consignment ? machine.locatorPercent : 0,
        notes: text(req.body.notes), ...actor(req),
      } });
    }, { isolationLevel: "Serializable" });
    res.status(201).json(serializeSettlement(created));
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo registrar la liquidación" }); }
});

router.patch("/settlements/:id", async (req, res) => {
  try {
    const settlement = await prisma.plushSettlement.findUnique({ where: { id: req.params.id } });
    if (!settlement || settlement.status !== "ACTIVE") throw new Error("Liquidación inexistente o anulada");
    const latest = await prisma.plushSettlement.findFirst({ where: { machineId: settlement.machineId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (latest?.id !== settlement.id) throw new Error("Solo se puede corregir la última liquidación");
    const finalCounter = integer(req.body.finalCounter, "Lectura final");
    if (finalCounter < settlement.initialCounter) throw new Error(`La lectura no puede ser menor que ${settlement.initialCounter}`);
    const updated = await prisma.plushSettlement.update({ where: { id: settlement.id }, data: {
      finalCounter, prizesDelivered: finalCounter - settlement.initialCounter,
      cashAmount: money(req.body.cashAmount ?? settlement.cashAmount, "Efectivo"),
      qrAmount: money(req.body.qrAmount ?? settlement.qrAmount, "QR"),
      notes: req.body.notes == null ? settlement.notes : text(req.body.notes),
    } });
    res.json(serializeSettlement(updated));
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo corregir la liquidación" }); }
});

router.post("/settlements/:id/void", async (req, res) => {
  try {
    const reason = text(req.body.reason);
    if (!reason) throw new Error("El motivo es obligatorio");
    const settlement = await prisma.plushSettlement.findUnique({ where: { id: req.params.id } });
    if (!settlement || settlement.status !== "ACTIVE") throw new Error("Liquidación inexistente o anulada");
    const latest = await prisma.plushSettlement.findFirst({ where: { machineId: settlement.machineId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (latest?.id !== settlement.id) throw new Error("Solo se puede anular la última liquidación");
    const updated = await prisma.plushSettlement.update({ where: { id: settlement.id }, data: voidActor(req, reason) });
    res.json(serializeSettlement(updated));
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo anular la liquidación" }); }
});

export default router;
