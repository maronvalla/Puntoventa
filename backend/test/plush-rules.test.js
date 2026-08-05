import test from "node:test";
import assert from "node:assert/strict";
import { periodBounds, settlementMetrics, summarizeSettlements } from "../src/plush-rules.js";

test("calcula efectivo, QR, CPP, consignación y ganancias", () => {
  const result = settlementMetrics({
    prizesDelivered: 10, cashAmount: 7000, qrAmount: 3000, cppSnapshot: 250,
    consignmentSnapshot: true, locatorPercentSnapshot: 20,
  });
  assert.deepEqual(result, {
    grossIncome: 10000, prizeCost: 2500, locatorAmount: 2000, netProfit: 5500,
    ipp: 1000, gpp: 750, netProfitPerPlush: 550,
  });
});

test("sin premios conserva totales y no divide por cero", () => {
  const result = settlementMetrics({
    prizesDelivered: 0, cashAmount: 1000, qrAmount: 0, cppSnapshot: 300,
    consignmentSnapshot: true, locatorPercentSnapshot: 10,
  });
  assert.equal(result.netProfit, 900);
  assert.equal(result.ipp, null);
  assert.equal(result.gpp, null);
  assert.equal(result.netProfitPerPlush, null);
});

test("resume con CPP ponderado y ranking por máquina", () => {
  const settlements = [
    { machineId: "a", prizesDelivered: 2, cashAmount: 2000, qrAmount: 0, cppSnapshot: 100, consignmentSnapshot: false, locatorPercentSnapshot: 0 },
    { machineId: "b", prizesDelivered: 3, cashAmount: 0, qrAmount: 4500, cppSnapshot: 200, consignmentSnapshot: false, locatorPercentSnapshot: 0 },
  ];
  const result = summarizeSettlements(settlements, [{ id: "a", name: "A" }, { id: "b", name: "B" }]);
  assert.equal(result.prizesDelivered, 5);
  assert.equal(result.grossIncome, 6500);
  assert.equal(result.weightedCpp, 160);
  assert.equal(result.ranking[0].machineName, "B");
});

test("genera límites mensuales y anuales inclusivos", () => {
  assert.deepEqual(periodBounds("month", 2028, 2), { period: "month", from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(periodBounds("year", 2026, 1), { period: "year", from: "2026-01-01", to: "2026-12-31" });
});
