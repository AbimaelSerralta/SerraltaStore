import { getAll, addRecord, updateRecord } from "./database.js";
const newest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);
export async function init(root) {
    const body = root.querySelector("#product-list"), form = root.querySelector("#product-form"), screen = root.querySelector("#product-form-screen");
    async function load() { const rows = (await getAll("products")).sort(newest); body.innerHTML = rows.map(p => `<tr><td>${esc(p.name)}</td><td>$${Number(p.purchasePrice).toFixed(2)}</td><td>$${Number(p.salePrice).toFixed(2)}</td><td>${p.stock}</td><td><button class="link-btn" data-edit="${p.id}">Editar</button></td></tr>`).join("") || '<tr><td colspan="5" class="empty">No hay productos</td></tr>'; return rows; }
    let rows = await load();
    root.querySelector("#new-product").onclick = () => { form.reset(); form.elements.id.value = ""; screen.hidden = false; root.querySelector("#product-list-screen").hidden = true; };
    root.querySelector("#product-back").onclick = () => { screen.hidden = true; root.querySelector("#product-list-screen").hidden = false; };
    body.onclick = e => { const b = e.target.closest("[data-edit]"); if (!b) return; const p = rows.find(x => x.id === Number(b.dataset.edit)); if (!p) return; form.elements.id.value = p.id; for (const k of ["name", "purchasePrice", "salePrice", "stock", "minimumStock"]) form.elements[k].value = p[k] ?? 0; screen.hidden = false; root.querySelector("#product-list-screen").hidden = true; };
    form.onsubmit = async e => { e.preventDefault(); const d = new FormData(form), id = d.get("id"), p = { name: d.get("name").trim(), purchasePrice: Number(d.get("purchasePrice")), salePrice: Number(d.get("salePrice")), stock: Number(d.get("stock")), minimumStock: Number(d.get("minimumStock")), active: true }; if (id) await updateRecord("products", { ...p, id: Number(id) }); else await addRecord("products", p); screen.hidden = true; root.querySelector("#product-list-screen").hidden = false; rows = await load(); };
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
