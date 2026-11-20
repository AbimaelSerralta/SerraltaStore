import { getAll } from "./database.js";

const localDate = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const newest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);

export async function init(root) {
    const [sales, payments, products, customers] = await Promise.all([
        getAll("sales"), getAll("payments"), getAll("products"), getAll("customers")
    ]);
    const from = root.querySelector("#report-from");
    const to = root.querySelector("#report-to");
    const today = new Date();
    from.value = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
    to.value = localDate(today);

    function render() {
        const start = new Date(`${from.value || "2000-01-01"}T00:00:00`);
        const end = new Date(`${to.value || "2999-12-31"}T23:59:59.999`);
        const inRange = record => {
            const date = new Date(record.createdAt || 0);
            return date >= start && date <= end;
        };
        const periodSales = sales.filter(inRange).sort(newest);
        const periodPayments = payments.filter(inRange);
        const knownCostSales = periodSales.filter(sale =>
            Number.isFinite(Number(sale.costTotal)) && Number.isFinite(Number(sale.grossProfit)) &&
            (sale.items || []).length > 0 && (sale.items || []).every(item => item.purchasePrice !== undefined && item.purchasePrice !== null && item.purchasePrice !== "" && Number.isFinite(Number(item.purchasePrice)))
        );
        const unknownCostSales = periodSales.length - knownCostSales.length;
        const total = periodSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const cost = knownCostSales.reduce((sum, sale) => sum + Number(sale.costTotal || 0), 0);
        const profit = knownCostSales.reduce((sum, sale) => sum + Number(sale.grossProfit || 0), 0);
        const paid = periodSales.reduce((sum, sale) => sum + Number(sale.paidAmount || 0), 0);
        const collected = periodPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const receivable = sales.reduce((sum, sale) => sum + Number(sale.balance || 0), 0);
        const credit = customers.reduce((sum, customer) => sum + Number(customer.creditBalance || 0), 0);
        const margin = knownCostSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0) > 0
            ? profit / knownCostSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0) * 100 : 0;

        root.querySelector("#report-sales").textContent = money(total);
        root.querySelector("#report-sales-count").textContent = `${periodSales.length} ventas`;
        root.querySelector("#report-cost").textContent = money(cost);
        root.querySelector("#report-profit").textContent = money(profit);
        root.querySelector("#report-margin").textContent = `Margen bruto: ${margin.toFixed(1)}%`;
        root.querySelector("#report-paid").textContent = money(paid);
        root.querySelector("#report-payments").textContent = money(collected);
        root.querySelector("#report-receivable").textContent = money(receivable);
        root.querySelector("#report-credit").textContent = money(credit);

        const note = root.querySelector("#report-profit-note");
        note.hidden = unknownCostSales === 0;
        note.textContent = unknownCostSales
            ? `${unknownCostSales} venta(s) de este periodo no tienen costo histórico guardado. Se excluyeron del cálculo de ganancia para no mostrar cifras estimadas o incorrectas. Las ventas nuevas ya guardarán su costo automáticamente.`
            : "Todas las ventas de este periodo cuentan con costo histórico para calcular la ganancia bruta.";

        root.querySelector("#report-sales-profit").innerHTML = knownCostSales.map(sale => {
            const date = new Date(sale.createdAt).toLocaleString("es-MX");
            return `<tr><td>#${sale.id}</td><td>${esc(date)}</td><td>${money(sale.total)}</td><td>${money(sale.costTotal)}</td><td class="amount-positive">${money(sale.grossProfit)}</td></tr>`;
        }).join("") || '<tr><td colspan="5" class="empty">No hay ventas con costo histórico en este periodo</td></tr>';

        const byProduct = {};
        for (const sale of knownCostSales) {
            for (const item of sale.items || []) {
                const key = String(item.id);
                if (!byProduct[key]) byProduct[key] = { name: item.name || `Producto ${key}`, quantity: 0, total: 0, cost: 0 };
                const quantity = Number(item.quantity) || 0;
                byProduct[key].quantity += quantity;
                byProduct[key].total += (Number(item.price) || 0) * quantity;
                byProduct[key].cost += (Number(item.purchasePrice) || 0) * quantity;
            }
        }
        const productRows = Object.values(byProduct).map(item => ({ ...item, profit: item.total - item.cost })).sort((a, b) => b.profit - a.profit);
        root.querySelector("#report-products").innerHTML = productRows.map(item =>
            `<tr><td>${esc(item.name)}</td><td>${item.quantity}</td><td>${money(item.total)}</td><td>${money(item.cost)}</td><td class="amount-positive">${money(item.profit)}</td></tr>`
        ).join("") || '<tr><td colspan="5" class="empty">No hay productos con costo histórico en este periodo</td></tr>';

        root.querySelector("#report-stock").innerHTML = products.slice().sort(newest).map(product =>
            `<tr><td>${esc(product.name)}</td><td>${Number(product.stock) || 0}</td><td>${Number(product.minimumStock) || 0}</td><td>${Number(product.stock) <= Number(product.minimumStock) ? '<span class="status-low">Stock bajo</span>' : "Normal"}</td></tr>`
        ).join("") || '<tr><td colspan="4" class="empty">No hay productos registrados</td></tr>';
    }

    from.addEventListener("change", render);
    to.addEventListener("change", render);
    root.querySelector("#report-current-month").onclick = () => {
        const date = new Date();
        from.value = localDate(new Date(date.getFullYear(), date.getMonth(), 1));
        to.value = localDate(date);
        render();
    };
    render();
}
