export function stockAdjustmentError({ role, costPrice, delta }) {
  if (!Number.isInteger(delta) || delta === 0) return "Delta inválido";

  if (role === "CASHIER") {
    if (delta < 1) return "Los empleados sólo pueden sumar stock";
    if (Number(costPrice) !== 0) {
      return "Los empleados sólo pueden cargar stock en productos de costo cero";
    }
  }

  return null;
}
