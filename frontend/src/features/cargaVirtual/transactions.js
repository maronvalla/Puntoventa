import { CARGA_VIRTUAL_SURCHARGE } from "../../components/CargaVirtual.jsx";

/**
 * Local state shape usable in a React POS screen.
 */
export const initialCargaVirtualState = {
  transactions: [],
  isSubmitting: false,
  error: null,
};

/**
 * Normalizes one transaction in the same shape used for REST and local state.
 */
export function buildCargaVirtualTransaction({ phoneNumber, denomination, createdAt }) {
  const normalizedDenomination = Number(denomination);

  return {
    phoneNumber: String(phoneNumber || "").trim(),
    denomination: normalizedDenomination,
    totalPrice: normalizedDenomination + CARGA_VIRTUAL_SURCHARGE,
    profit: CARGA_VIRTUAL_SURCHARGE,
    createdAt: createdAt || new Date().toISOString(),
  };
}

/**
 * Persists a completed transaction to REST and/or local state.
 *
 * @param {object} transaction - Transaction from the CargaVirtual form.
 * @param {object} options
 * @param {(payload: object) => Promise<any>} [options.postCarga] - Example: payload => api.post('/api/cargas', payload)
 * @param {(updater: (prev: object[]) => object[]) => void} [options.setTransactions] - React setState for local fallback.
 */
export async function persistCargaVirtualTransaction(
  transaction,
  { postCarga, setTransactions } = {}
) {
  if (postCarga) {
    await postCarga(transaction);
  }

  if (setTransactions) {
    setTransactions((prev) => [transaction, ...prev]);
  }

  return transaction;
}
