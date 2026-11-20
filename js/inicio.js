import { getAll } from "./database.js";
const money = n => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);
export async function init(root) {
    const [products, customers, sales] = await Promise.all([getAll("products"), getAll("customers"), getAll("sales")]);
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = sales.filter(s => String(s.createdAt || s.date || "").slice(0, 10) === today);
    root.querySelector("#home-products").textContent = products.filter(p => p.active !== false).length;
    root.querySelector("#home-customers").textContent = customers.filter(c => c.active !== false).length;
    root.querySelector("#home-today-sales").textContent = money(todaySales.reduce((a, s) => a + Number(s.total || 0), 0));
    root.querySelector("#home-sales-count").textContent = `${todaySales.length} ${todaySales.length === 1 ? "venta" : "ventas"}`;
    root.querySelector("#home-receivable").textContent = money(sales.reduce((a, s) => a + Number(s.balance || 0), 0));
    root.querySelector("#home-credit").textContent = money(customers.reduce((a, c) => a + Number(c.creditBalance || 0), 0));
}
