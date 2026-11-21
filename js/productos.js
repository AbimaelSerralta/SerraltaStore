import { getAll, addRecord, updateRecord } from "./database.js";

const newest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function init(root) {
    const body = root.querySelector("#product-list");
    const form = root.querySelector("#product-form");
    const screen = root.querySelector("#product-form-screen");
    const listScreen = root.querySelector("#product-list-screen");
    const search = root.querySelector("#product-search");
    let rows = [];

    function render() {
        const query = search.value.trim().toLocaleLowerCase("es-MX");
        const filtered = rows.filter(product => String(product.name || "").toLocaleLowerCase("es-MX").includes(query));
        body.innerHTML = filtered.map(p => `<tr><td>${esc(p.name)}</td><td>$${Number(p.purchasePrice || 0).toFixed(2)}</td><td>$${Number(p.salePrice || 0).toFixed(2)}</td><td>${Number(p.stock || 0)}</td><td><button class="link-btn" data-edit="${p.id}">Editar</button></td></tr>`).join("")
            || `<tr><td colspan="5" class="empty">${query ? "No hay productos que coincidan con la búsqueda" : "No hay productos"}</td></tr>`;
    }

    async function load() {
        rows = (await getAll("products")).sort(newest);
        render();
    }

    root.querySelector("#new-product").onclick = () => {
        form.reset();
        form.elements.id.value = "";
        screen.hidden = false;
        listScreen.hidden = true;
    };
    root.querySelector("#product-back").onclick = () => {
        screen.hidden = true;
        listScreen.hidden = false;
        render();
    };
    body.onclick = event => {
        const button = event.target.closest("[data-edit]");
        if (!button) return;
        const product = rows.find(item => Number(item.id) === Number(button.dataset.edit));
        if (!product) return;
        form.elements.id.value = product.id;
        for (const key of ["name", "purchasePrice", "salePrice", "stock", "minimumStock"]) form.elements[key].value = product[key] ?? 0;
        screen.hidden = false;
        listScreen.hidden = true;
    };
    search.addEventListener("input", render);
    form.onsubmit = async event => {
        event.preventDefault();
        const data = new FormData(form);
        const id = data.get("id");
        const product = {
            name: data.get("name").trim(),
            purchasePrice: Number(data.get("purchasePrice")),
            salePrice: Number(data.get("salePrice")),
            stock: Number(data.get("stock")),
            minimumStock: Number(data.get("minimumStock")),
            active: true
        };
        if (id) await updateRecord("products", { ...product, id: Number(id) });
        else await addRecord("products", product);
        screen.hidden = true;
        listScreen.hidden = false;
        await load();
    };

    await load();
}
