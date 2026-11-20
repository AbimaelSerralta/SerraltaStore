import { getAll, registerSale } from "./database.js";

const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);

export async function init(root) {
    let products = (await getAll("products")).sort(byNewest);
    let customers = (await getAll("customers")).sort(byNewest);
    let sales = await getAll("sales");
    const productSelect = root.querySelector("#sale-product");
    const customerSelect = root.querySelector("#sale-customer");
    const paymentType = root.querySelector("#payment-type");
    const cashInput = root.querySelector("#paid-amount");
    const lines = root.querySelector("#sale-lines");
    const totalElement = root.querySelector("#sale-total");
    const preview = root.querySelector("#sale-payment-preview");
    const cart = [];

    productSelect.innerHTML = '<option value="">Selecciona un producto</option>' + products
        .filter(p => p.active !== false && Number(p.stock) > 0)
        .map(p => `<option value="${p.id}">${esc(p.name)} · ${money(p.salePrice)} · Stock ${p.stock}</option>`).join("");
    customerSelect.innerHTML = '<option value="">Venta mostrador</option>' + customers
        .filter(c => c.active !== false)
        .map(c => `<option value="${c.id}">${esc(c.name)}${Number(c.creditBalance) > 0 ? ` · Saldo a favor ${money(c.creditBalance)}` : ""}</option>`).join("");

    function getSaleTotal() { return Number(cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)); }
    function getCustomer() { return customers.find(c => Number(c.id) === Number(customerSelect.value)) || null; }
    function calculatePayment() {
        const total = getSaleTotal();
        const customer = getCustomer();
        const cash = Math.max(0, Number(cashInput.value) || 0);
        const credit = Number(customer?.creditBalance || 0);
        const available = Number((cash + credit).toFixed(2));
        const customerSales = customer ? sales.filter(s => Number(s.customerId) === Number(customer.id) && Number(s.balance) > 0).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || Number(a.id) - Number(b.id)) : [];
        const previousDebt = Number(customerSales.reduce((sum, sale) => sum + Number(sale.balance || 0), 0).toFixed(2));
        const appliedToOldDebt = Math.min(available, previousDebt);
        const afterOldDebt = Number((available - appliedToOldDebt).toFixed(2));
        const appliedToCurrent = Math.min(afterOldDebt, total);
        const currentBalance = Number((total - appliedToCurrent).toFixed(2));
        const remainingFavor = Number((afterOldDebt - appliedToCurrent).toFixed(2));
        const type = currentBalance === 0 ? "paid" : appliedToCurrent > 0 ? "partial" : "credit";
        paymentType.value = type;
        const labels = { paid: "Pago completo", partial: "Pago parcial", credit: "Fiado" };
        paymentType.setAttribute("aria-label", `Tipo de pago calculado: ${labels[type]}`);
        if (preview) {
            const parts = [];
            if (customer && appliedToOldDebt > 0) parts.push(`Deuda anterior cubierta: ${money(appliedToOldDebt)}`);
            parts.push(`Aplicado a esta venta: ${money(appliedToCurrent)}`);
            parts.push(`Pendiente de esta venta: ${money(currentBalance)}`);
            if (remainingFavor > 0) parts.push(`Saldo a favor restante: ${money(remainingFavor)}`);
            preview.textContent = total > 0 ? parts.join(" · ") : "Agrega productos para calcular el pago.";
        }
        return { total, cash, credit, previousDebt, appliedToOldDebt, appliedToCurrent, currentBalance, remainingFavor, customer };
    }

    function draw() {
        lines.innerHTML = cart.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th><th></th></tr></thead><tbody>${cart.map((item, index) => `<tr><td>${esc(item.name)}</td><td><input data-qty="${index}" type="number" min="1" max="${item.stock}" value="${item.quantity}" style="width:70px"></td><td>${money(item.price)}</td><td>${money(item.price * item.quantity)}</td><td><button type="button" class="link-btn" data-remove="${index}">Quitar</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">Agrega productos a la venta</p>';
        totalElement.textContent = money(getSaleTotal());
        calculatePayment();
    }

    root.querySelector("#add-line").onclick = () => {
        const product = products.find(p => Number(p.id) === Number(productSelect.value));
        if (!product) { alert("Selecciona un producto disponible."); return; }
        const existing = cart.find(item => Number(item.id) === Number(product.id));
        if (existing) {
            if (existing.quantity >= Number(product.stock)) { alert("No hay más existencia disponible."); return; }
            existing.quantity++;
        } else {
            cart.push({ id: product.id, name: product.name, price: Number(product.salePrice) || 0, stock: Number(product.stock), quantity: 1 });
        }
        draw();
    };
    lines.onclick = event => {
        const button = event.target.closest("[data-remove]");
        if (button) { cart.splice(Number(button.dataset.remove), 1); draw(); }
    };
    lines.onchange = event => {
        if (event.target.dataset.qty === undefined) return;
        const item = cart[Number(event.target.dataset.qty)];
        if (!item) return;
        item.quantity = Math.max(1, Math.min(item.stock, Number(event.target.value) || 1));
        draw();
    };
    cashInput.addEventListener("input", calculatePayment);
    customerSelect.addEventListener("change", calculatePayment);

    root.querySelector("#sale-form").onsubmit = async event => {
        event.preventDefault();
        if (!cart.length) { alert("Agrega al menos un producto."); return; }
        const payment = calculatePayment();
        if (!payment.customer && payment.currentBalance > 0) { alert("Selecciona un cliente para registrar una venta parcial o fiada."); return; }
        const button = root.querySelector('#sale-form button[type="submit"], #sale-form button:not([type])');
        if (button) { button.disabled = true; button.textContent = "Registrando..."; }
        try {
            const result = await registerSale({ customerId: payment.customer?.id ?? null, items: cart.map(item => ({ ...item })), cashReceived: payment.cash });
            alert(`Venta #${result.saleId} registrada.\n${result.previousDebtPaid > 0 ? `Deuda anterior cubierta: ${money(result.previousDebtPaid)}\n` : ""}Aplicado a esta venta: ${money(result.paidAmount)}\nPendiente: ${money(result.balance)}`);
            cart.length = 0;
            cashInput.value = "0";
            productSelect.value = "";
            products = (await getAll("products")).sort(byNewest);
            customers = (await getAll("customers")).sort(byNewest);
            const selectedCustomer = customerSelect.value;
            customerSelect.innerHTML = '<option value="">Venta mostrador</option>' + customers.filter(c => c.active !== false).map(c => `<option value="${c.id}">${esc(c.name)}${Number(c.creditBalance) > 0 ? ` · Saldo a favor ${money(c.creditBalance)}` : ""}</option>`).join("");
            if (selectedCustomer && customers.some(c => String(c.id) === selectedCustomer)) customerSelect.value = selectedCustomer;
            productSelect.innerHTML = '<option value="">Selecciona un producto</option>' + products.filter(p => p.active !== false && Number(p.stock) > 0).map(p => `<option value="${p.id}">${esc(p.name)} · ${money(p.salePrice)} · Stock ${p.stock}</option>`).join("");
            sales = await getAll("sales");
            draw();
        } catch (error) {
            console.error(error);
            alert(error.message || "No se pudo registrar la venta.");
        } finally {
            if (button) { button.disabled = false; button.textContent = "Registrar venta"; }
        }
    };

    draw();
}
