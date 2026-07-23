import React, { useMemo, useState } from "react";

export const CARGA_VIRTUAL_SURCHARGE = 400;

const DEFAULT_DENOMINATIONS = [50, 100, 200, 300, 500, 1000];

const styles = {
  container: {
    display: "grid",
    gap: "0.75rem",
    padding: "1rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    maxWidth: "420px",
    backgroundColor: "#ffffff",
  },
  field: {
    display: "grid",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.875rem",
    color: "#374151",
  },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: "0.5rem",
    padding: "0.55rem 0.7rem",
    fontSize: "0.95rem",
  },
  readOnly: {
    backgroundColor: "#f9fafb",
  },
  helper: {
    fontSize: "0.75rem",
    color: "#6b7280",
  },
  button: {
    marginTop: "0.35rem",
    border: 0,
    borderRadius: "0.5rem",
    padding: "0.65rem 0.9rem",
    fontWeight: 600,
    color: "white",
    backgroundColor: "#2563eb",
    cursor: "pointer",
  },
};

function formatARS(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CargaVirtual({
  onSubmit,
  denominations = DEFAULT_DENOMINATIONS,
  defaultDenomination,
}) {
  const fallbackDenomination = defaultDenomination ?? denominations[0] ?? 0;

  const [phoneNumber, setPhoneNumber] = useState("");
  const [denomination, setDenomination] = useState(Number(fallbackDenomination));

  const totalPrice = useMemo(
    () => Number(denomination) + CARGA_VIRTUAL_SURCHARGE,
    [denomination]
  );

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      phoneNumber: phoneNumber.trim(),
      denomination: Number(denomination),
      totalPrice,
      profit: CARGA_VIRTUAL_SURCHARGE,
      createdAt: new Date().toISOString(),
    };

    onSubmit?.(payload);

    setPhoneNumber("");
    setDenomination(Number(fallbackDenomination));
  }

  return (
    <form onSubmit={handleSubmit} style={styles.container}>
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Carga Virtual</h2>

      <div style={styles.field}>
        <label htmlFor="denomination" style={styles.label}>
          Denominación
        </label>
        <select
          id="denomination"
          value={denomination}
          onChange={(event) => setDenomination(Number(event.target.value))}
          style={styles.input}
        >
          {denominations.map((value) => (
            <option key={value} value={value}>
              {formatARS(value)}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.field}>
        <label htmlFor="phone" style={styles.label}>
          Número de teléfono
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          placeholder="Ej: 3815551234"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          required
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label htmlFor="totalPrice" style={styles.label}>
          Precio total
        </label>
        <input
          id="totalPrice"
          type="text"
          readOnly
          value={formatARS(totalPrice)}
          style={{ ...styles.input, ...styles.readOnly }}
        />
        <span style={styles.helper}>
          Comisión fija por carga virtual: {formatARS(CARGA_VIRTUAL_SURCHARGE)}
        </span>
      </div>

      <button type="submit" style={styles.button}>
        Registrar carga
      </button>
    </form>
  );
}
