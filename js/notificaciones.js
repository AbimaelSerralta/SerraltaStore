import { getAll } from "./database.js";

const money = value => `$${Number(value || 0).toFixed(2)}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) throw new Error("El navegador no permitió copiar el texto.");
}

export async function init(root) {
    const [customers, sales] = await Promise.all([getAll("customers"), getAll("sales")]);
    const groupsContainer = root.querySelector("#notification-groups");
    const empty = root.querySelector("#notification-empty");
    const status = root.querySelector("#notification-status");
    const copyAllButton = root.querySelector("#notifications-copy-all");

    const grouped = new Map();
    const debtByCustomer = new Map();
    for (const sale of sales) {
        if (sale.customerId === null || sale.customerId === undefined) continue;
        const key = String(sale.customerId);
        debtByCustomer.set(key, Number(((debtByCustomer.get(key) || 0) + Number(sale.balance || 0)).toFixed(2)));
    }

    for (const customer of customers.filter(item => item.active !== false)) {
        const department = String(customer.department || "").trim() || "Sin departamento";
        const debt = Number((debtByCustomer.get(String(customer.id)) || 0).toFixed(2));
        const credit = Number(customer.creditBalance || 0);
        const balance = Number((debt - credit).toFixed(2));
        if (balance <= 0) continue;
        if (!grouped.has(department)) grouped.set(department, []);
        grouped.get(department).push({ name: customer.name || "Cliente", balance });
    }

    const groups = [...grouped.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "es-MX"))
        .map(([department, people]) => ({
            department,
            people: people.sort((a, b) => a.name.localeCompare(b.name, "es-MX")),
            message: `Cuentas Store:\n${people.sort((a, b) => a.name.localeCompare(b.name, "es-MX")).map(person => `${person.name}: ${money(person.balance)}`).join("\n")}`
        }));

    const customerCount = groups.reduce((total, group) => total + group.people.length, 0);
    const grandTotal = groups.reduce((total, group) => total + group.people.reduce((sum, person) => sum + person.balance, 0), 0);
    root.querySelector("#notification-customer-count").textContent = String(customerCount);
    root.querySelector("#notification-total").textContent = money(grandTotal);
    empty.hidden = groups.length > 0;
    copyAllButton.disabled = groups.length === 0;

    groupsContainer.innerHTML = groups.map((group, index) => `
        <section class="card notification-group">
            <div class="notification-group-heading">
                <div><h3>${esc(group.department)}</h3><span class="muted">${group.people.length} ${group.people.length === 1 ? "cliente" : "clientes"} · ${money(group.people.reduce((sum, person) => sum + person.balance, 0))}</span></div>
                <button type="button" class="btn btn-light" data-copy-department="${index}">Copiar lista</button>
            </div>
            <pre class="notification-message">${esc(group.message)}</pre>
        </section>`).join("");

    groupsContainer.addEventListener("click", async event => {
        const button = event.target.closest("[data-copy-department]");
        if (!button) return;
        const group = groups[Number(button.dataset.copyDepartment)];
        if (!group) return;
        try {
            await copyText(group.message);
            status.textContent = `Lista de ${group.department} copiada.`;
        } catch (error) {
            status.textContent = error.message || "No se pudo copiar la lista.";
        }
    });

    copyAllButton.addEventListener("click", async () => {
        const text = groups.map(group => `${group.department}:\n${group.message}`).join("\n\n");
        try {
            await copyText(text);
            status.textContent = "Todas las listas fueron copiadas.";
        } catch (error) {
            status.textContent = error.message || "No se pudieron copiar las listas.";
        }
    });
}
