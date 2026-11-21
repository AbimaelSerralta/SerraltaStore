import { getAll, addRecord, updateRecord } from "./database.js";

const newest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function init(root) {
    let products = await getAll("products");
    let movements = [];
    const select = root.querySelector("#movement-product");
    const body = root.querySelector("#movement-list");
    const productFilter = root.querySelector("#inventory-filter-product");
    const typeFilter = root.querySelector("#inventory-filter-type");

    function fillProductOptions() {
        const sorted = products.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es-MX"));
        select.innerHTML = sorted.map(p => `<option value="${p.id}">${esc(p.name)} (stock ${Number(p.stock || 0)})</option>`).join("");
        productFilter.innerHTML = '<option value="todos">Todos los productos</option>' + sorted.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    }

    function render() {
        const productId = productFilter.value;
        const type = typeFilter.value;
        const filtered = movements.filter(m => (productId === "todos" || String(m.productId) === productId) && (type === "todos" || String(m.type).toLowerCase() === type));
        body.innerHTML = filtered.map(m => `<tr><td>${esc(m.productName || "Producto")}</td><td>${esc(m.type)}</td><td>${Number(m.quantity || 0)}</td><td>${esc(m.note || "—")}</td></tr>`).join("")
            || `<tr><td colspan="4" class="empty">${movements.length ? "No hay movimientos con esos filtros" : "Sin movimientos"}</td></tr>`;
    }

    async function loadMovements() {
        movements = (await getAll("inventoryMovements")).sort(newest);
        render();
    }

    root.querySelector("#movement-form").onsubmit = async event => {
        event.preventDefault();
        const data = new FormData(event.target);
        const product = products.find(item => Number(item.id) === Number(data.get("productId")));
        const quantity = Number(data.get("quantity"));
        const type = data.get("type");
        if (!product) { alert("Selecciona un producto."); return; }
        if (!Number.isInteger(quantity) || quantity <= 0) { alert("Ingresa una cantidad válida."); return; }
        const delta = type === "entrada" ? quantity : -quantity;
        if (type !== "entrada" && Number(product.stock) < quantity) { alert("Stock insuficiente"); return; }
        await updateRecord("products", { ...product, stock: Number(product.stock) + delta });
        await addRecord("inventoryMovements", { productId: product.id, productName: product.name, type, quantity, delta, note: data.get("note") });
        event.target.reset();
        products = await getAll("products");
        fillProductOptions();
        await loadMovements();
    };

    productFilter.addEventListener("change", render);
    typeFilter.addEventListener("change", render);
    fillProductOptions();
    await loadMovements();
}
