export function settlementMetrics(input) {
  const prizesDelivered = Number(input.prizesDelivered || 0);
  const cashAmount = Number(input.cashAmount || 0);
  const qrAmount = Number(input.qrAmount || 0);
  const cpp = Number(input.cppSnapshot || 0);
  const locatorPercent = input.consignmentSnapshot ? Number(input.locatorPercentSnapshot || 0) : 0;
  const grossIncome = cashAmount + qrAmount;
  const prizeCost = prizesDelivered * cpp;
  const locatorAmount = grossIncome * locatorPercent / 100;
  const netProfit = grossIncome - prizeCost - locatorAmount;
  return {
    grossIncome,
    prizeCost,
    locatorAmount,
    netProfit,
    ipp: prizesDelivered ? grossIncome / prizesDelivered : null,
    gpp: prizesDelivered ? grossIncome / prizesDelivered - cpp : null,
    netProfitPerPlush: prizesDelivered ? netProfit / prizesDelivered : null,
  };
}

export function periodBounds(period, year, month) {
  const safePeriod = period === "year" ? "year" : "month";
  const safeYear = Number(year);
  const safeMonth = Number(month);
  if (!Number.isInteger(safeYear) || safeYear < 2000 || safeYear > 2100) throw new Error("Año inválido");
  if (safePeriod === "month" && (!Number.isInteger(safeMonth) || safeMonth < 1 || safeMonth > 12)) throw new Error("Mes inválido");
  if (safePeriod === "year") return { period: safePeriod, from: `${safeYear}-01-01`, to: `${safeYear}-12-31` };
  const padded = String(safeMonth).padStart(2, "0");
  const lastDay = new Date(Date.UTC(safeYear, safeMonth, 0)).getUTCDate();
  return { period: safePeriod, from: `${safeYear}-${padded}-01`, to: `${safeYear}-${padded}-${String(lastDay).padStart(2, "0")}` };
}

export function summarizeSettlements(settlements, machines = []) {
  let grossIncome = 0, cashAmount = 0, qrAmount = 0, prizesDelivered = 0;
  let prizeCost = 0, locatorAmount = 0, netProfit = 0;
  const machineMap = new Map(machines.map((machine) => [machine.id, machine]));
  const ranking = new Map();
  for (const settlement of settlements) {
    const metrics = settlementMetrics(settlement);
    const prizes = Number(settlement.prizesDelivered || 0);
    grossIncome += metrics.grossIncome;
    cashAmount += Number(settlement.cashAmount || 0);
    qrAmount += Number(settlement.qrAmount || 0);
    prizesDelivered += prizes;
    prizeCost += metrics.prizeCost;
    locatorAmount += metrics.locatorAmount;
    netProfit += metrics.netProfit;
    const machine = machineMap.get(settlement.machineId);
    const current = ranking.get(settlement.machineId) || {
      machineId: settlement.machineId,
      machineName: machine?.name || "Máquina",
      grossIncome: 0, prizesDelivered: 0, netProfit: 0,
    };
    current.grossIncome += metrics.grossIncome;
    current.prizesDelivered += prizes;
    current.netProfit += metrics.netProfit;
    ranking.set(settlement.machineId, current);
  }
  const weightedCpp = prizesDelivered ? prizeCost / prizesDelivered : null;
  const ipp = prizesDelivered ? grossIncome / prizesDelivered : null;
  return {
    grossIncome, cashAmount, qrAmount, prizesDelivered, prizeCost, locatorAmount, netProfit,
    weightedCpp, ipp, gpp: prizesDelivered ? ipp - weightedCpp : null,
    netProfitPerPlush: prizesDelivered ? netProfit / prizesDelivered : null,
    ranking: [...ranking.values()].sort((a, b) => b.netProfit - a.netProfit || b.grossIncome - a.grossIncome),
  };
}
