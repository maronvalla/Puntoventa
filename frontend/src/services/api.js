const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

class ApiService {
  constructor() {
    this.token = localStorage.getItem("token");
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }

  getToken() {
    return this.token;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error en la solicitud");
    }

    return data;
  }

  // Auth
  async login(username, password) {
    const data = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } catch (e) {
      // Ignore errors on logout
    }
    this.setToken(null);
  }

  async getMe() {
    return this.request("/auth/me");
  }

  // Products
  async getProducts() {
    return this.request("/products");
  }

  async createProduct(data) {
    return this.request("/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id, data) {
    return this.request(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async adjustStock(id, delta, reason) {
    return this.request(`/products/${id}/adjust-stock`, {
      method: "POST",
      body: JSON.stringify({ delta, reason }),
    });
  }

  async deleteProduct(id) {
    return this.request(`/products/${id}`, { method: "DELETE" });
  }

  // Sales
  async getSales(params = {}) {
    const query = new URLSearchParams();
    if (params.dayKey) query.set("dayKey", params.dayKey);
    if (params.sellerId) query.set("sellerId", params.sellerId);
    const queryString = query.toString();
    return this.request(`/sales${queryString ? `?${queryString}` : ""}`);
  }

  async createSale(items, paymentMethod, cashAmount, transferAmount) {
    return this.request("/sales", {
      method: "POST",
      body: JSON.stringify({
        items: items.map((i) => ({ id: i.id, qty: i.qty, price: i.price })),
        paymentMethod: paymentMethod.toUpperCase(),
        cashAmount,
        transferAmount,
      }),
    });
  }

  async quickSale(code) {
    return this.request("/sales/quick", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  async updateSalePayment(id, paymentMethod, cashAmount, transferAmount) {
    return this.request(`/sales/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        paymentMethod: paymentMethod.toUpperCase(),
        cashAmount,
        transferAmount,
      }),
    });
  }

  async voidSale(id, reason) {
    return this.request(`/sales/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async deleteSale(id) {
    return this.request(`/sales/${id}`, { method: "DELETE" });
  }

  // Users
  async getUsers() {
    return this.request("/users");
  }

  async createUser(data) {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resetAdmin(data) {
    return this.request("/users/reset-admin", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, { method: "DELETE" });
  }

  // Purchases
  async getPurchases(dayKey) {
    const query = dayKey ? `?dayKey=${dayKey}` : "";
    return this.request(`/purchases${query}`);
  }

  async createPurchase(dayKey, items) {
    return this.request("/purchases", {
      method: "POST",
      body: JSON.stringify({ dayKey, items }),
    });
  }

  // Reports
  async getDailyReport(dayKey) {
    const query = dayKey ? `?dayKey=${dayKey}` : "";
    return this.request(`/reports/daily${query}`);
  }
}

export const api = new ApiService();
export default api;
