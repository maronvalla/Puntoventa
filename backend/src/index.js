import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import productsRoutes from "./routes/products.js";
import salesRoutes from "./routes/sales.js";
import usersRoutes from "./routes/users.js";
import purchasesRoutes from "./routes/purchases.js";
import reportsRoutes from "./routes/reports.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "POS Pagofácil API" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/purchases", purchasesRoutes);
app.use("/api/reports", reportsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Error interno del servidor",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on", PORT);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
});
