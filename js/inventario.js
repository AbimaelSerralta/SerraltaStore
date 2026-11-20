import { getAll, addRecord, updateRecord } from "./database.js";
const newest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);
export async function init(root) {
    let products = await getAll("products"); const select = root.querySelector("#movement-product"), body = root.querySelector("#movement-list");
    select.innerHTML = products.slice().sort(newest).map(p => `<option value="${p.id}">${esc(p.name)} (stock ${p.stock})</option>`).join("");
    async function load() { const rows = (await getAll("inventoryMovements")).sort(newest); body.innerHTML = rows.map(x => `<tr><td>${esc(x.productName)}</td><td>${esc(x.type)}</td><td>${x.quantity}</td><td>${esc(x.note || "—")}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Sin movimientos</td></tr>'; }
    root.querySelector("#movement-form").onsubmit = async e => { e.preventDefault(); const d = new FormData(e.target), product = products.find(x => x.id === Number(d.get("productId"))), qty = Number(d.get("quantity")), type = d.get("type"); if (!product) { alert("Selecciona un producto."); return; } if (!Number.isInteger(qty) || qty <= 0) { alert("Ingresa una cantidad válida."); return; } const delta = type === "entrada" ? qty : -qty; if (type !== "entrada" && product.stock < qty) { alert("Stock insuficiente"); return; } await updateRecord("products", { ...product, stock: Number(product.stock) + delta }); await addRecord("inventoryMovements", { productId: product.id, productName: product.name, type, quantity: qty, delta, note: d.get("note") }); e.target.reset(); products = await getAll("products"); await load(); };
    await load();
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
