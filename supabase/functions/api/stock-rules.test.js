import test from "node:test";
import assert from "node:assert/strict";

import { stockAdjustmentError } from "./stock-rules.js";

test("el dueño puede sumar o restar stock sin depender del costo", () => {
  assert.equal(stockAdjustmentError({ role: "OWNER", costPrice: 100, delta: 3 }), null);
  assert.equal(stockAdjustmentError({ role: "OWNER", costPrice: 100, delta: -2 }), null);
});

test("el empleado sólo suma enteros positivos a productos de costo cero", () => {
  assert.equal(stockAdjustmentError({ role: "CASHIER", costPrice: 0, delta: 5 }), null);
  assert.equal(
    stockAdjustmentError({ role: "CASHIER", costPrice: 1, delta: 5 }),
    "Los empleados sólo pueden cargar stock en productos de costo cero",
  );
  assert.equal(
    stockAdjustmentError({ role: "CASHIER", costPrice: 0, delta: -1 }),
    "Los empleados sólo pueden sumar stock",
  );
  assert.equal(stockAdjustmentError({ role: "CASHIER", costPrice: 0, delta: 1.5 }), "Delta inválido");
});
