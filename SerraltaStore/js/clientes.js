import { getAll, addRecord, updateRecord } from "./database.js";
const newest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);
export async function init(root) {
    const list = root.querySelector("#customer-list"), form = root.querySelector("#customer-form"), screen = root.querySelector("#customer-form-screen");
    async function refresh() { const rows = (await getAll("customers")).sort(newest); list.innerHTML = rows.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.department || "—")}</td><td>${esc(c.phone || "—")}</td><td><button class="link-btn" data-edit="${c.id}">Editar</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Aún no hay clientes registrados</td></tr>'; root.querySelector("#customer-count").textContent = rows.length; return rows; }
    let rows = await refresh();
    function renderRows(data) { list.innerHTML = data.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.department || "—")}</td><td>${esc(c.phone || "—")}</td><td><button class="link-btn" data-edit="${c.id}">Editar</button></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Sin resultados</td></tr>'; }
    function showForm(c = null) { screen.hidden = false; root.querySelector("#customer-list-screen").hidden = true; form.reset(); form.elements.id.value = c?.id || ""; form.elements.name.value = c?.name || ""; form.elements.department.value = c?.department || ""; form.elements.phone.value = c?.phone || ""; root.querySelector("#customer-form-title").textContent = c ? "Editar cliente" : "Nuevo cliente"; }
    root.querySelector("#new-customer").onclick = () => showForm(); root.querySelector("#customer-back").onclick = () => { screen.hidden = true; root.querySelector("#customer-list-screen").hidden = false; };
    list.onclick = e => { const b = e.target.closest("[data-edit]"); if (b) showForm(rows.find(x => x.id === Number(b.dataset.edit))); };
    root.querySelector("#customer-search").oninput = e => { const q = e.target.value.toLowerCase(); renderRows(rows.filter(c => [c.name, c.department, c.phone].join(" ").toLowerCase().includes(q))); };
    form.onsubmit = async e => { e.preventDefault(); const d = new FormData(form), id = d.get("id"), data = { name: String(d.get("name")).trim(), department: String(d.get("department")).trim(), phone: String(d.get("phone")).trim(), active: true }; if (id) await updateRecord("customers", { ...data, id: Number(id) }); else await addRecord("customers", data); screen.hidden = true; root.querySelector("#customer-list-screen").hidden = false; rows = await refresh(); };
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
