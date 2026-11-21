import { getAll, registerSale } from "./database.js";

const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);

export async function init(root) {
    let products = (await getAll("products")).sort(byNewest);
    let customers = (await getAll("customers")).sort(byNewest);
    let sales = await getAll("sales");
    const productSelect = root.querySelector("#sale-product"), customerSelect = root.querySelector("#sale-customer");
    const productSearch = root.querySelector("#sale-product-search"), customerSearch = root.querySelector("#sale-customer-search");
    const paymentType = root.querySelector("#payment-type"), cashInput = root.querySelector("#paid-amount");
    const lines = root.querySelector("#sale-lines"), totalElement = root.querySelector("#sale-total"), preview = root.querySelector("#sale-payment-preview");
    const cart = [];

    function fillCustomers(keep = true) {
        const selected = keep ? customerSelect.value : "", q = customerSearch.value.trim().toLocaleLowerCase("es-MX");
        const options = customers.filter(c => c.active !== false && `${c.name || ""} ${c.department || ""}`.toLocaleLowerCase("es-MX").includes(q));
        customerSelect.innerHTML = '<option value="">Venta mostrador</option>' + options.map(c => `<option value="${c.id}">${esc(c.name)}${c.department ? ` | ${esc(c.department)}` : ""}${Number(c.creditBalance) > 0 ? ` · Saldo a favor ${money(c.creditBalance)}` : ""}</option>`).join("");
        if (options.some(c => String(c.id) === selected)) customerSelect.value = selected;
    }
    function fillProducts(keep = true) {
        const selected = keep ? productSelect.value : "", q = productSearch.value.trim().toLocaleLowerCase("es-MX");
        const options = products.filter(p => p.active !== false && Number(p.stock) > 0 && String(p.name || "").toLocaleLowerCase("es-MX").includes(q));
        productSelect.innerHTML = '<option value="">Selecciona un producto</option>' + options.map(p => `<option value="${p.id}">${esc(p.name)} · ${money(p.salePrice)} · Stock ${p.stock}</option>`).join("");
        if (options.some(p => String(p.id) === selected)) productSelect.value = selected;
    }
    fillCustomers(false); fillProducts(false);

    function getSaleTotal() { return Number(cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)); }
    function getCustomer() { return customers.find(c => Number(c.id) === Number(customerSelect.value)) || null; }
    function calculatePayment() {
        const total = getSaleTotal(), customer = getCustomer(), cash = Math.max(0, Number(cashInput.value) || 0), credit = Number(customer?.creditBalance || 0);
        const available = Number((cash + credit).toFixed(2));
        const customerSales = customer ? sales.filter(s => Number(s.customerId) === Number(customer.id) && Number(s.balance) > 0).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || Number(a.id) - Number(b.id)) : [];
        const previousDebt = Number(customerSales.reduce((sum, sale) => sum + Number(sale.balance || 0), 0).toFixed(2));
        const appliedToOldDebt = Math.min(available, previousDebt), afterOldDebt = Number((available - appliedToOldDebt).toFixed(2));
        const appliedToCurrent = Math.min(afterOldDebt, total), currentBalance = Number((total - appliedToCurrent).toFixed(2));
        const remainingFavor = Number((afterOldDebt - appliedToCurrent).toFixed(2));
        const type = currentBalance === 0 ? "paid" : appliedToCurrent > 0 ? "partial" : "credit";
        paymentType.value = type;
        paymentType.setAttribute("aria-label", `Tipo de pago calculado: ${{ paid: "Pago completo", partial: "Pago parcial", credit: "Fiado" }[type]}`);
        if (preview) { const parts = []; if (customer && appliedToOldDebt > 0) parts.push(`Deuda anterior cubierta: ${money(appliedToOldDebt)}`); parts.push(`Aplicado a esta venta: ${money(appliedToCurrent)}`, `Pendiente de esta venta: ${money(currentBalance)}`); if (remainingFavor > 0) parts.push(`Saldo a favor restante: ${money(remainingFavor)}`); preview.textContent = total > 0 ? parts.join(" · ") : "Agrega productos para calcular el pago."; }
        return { total, cash, customer, currentBalance };
    }
    function draw() {
        lines.innerHTML = cart.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Importe</th><th></th></tr></thead><tbody>${cart.map((item, index) => `<tr><td>${esc(item.name)}</td><td><div class="quantity-control"><button type="button" class="quantity-btn" data-minus="${index}" aria-label="Disminuir cantidad">−</button><span class="quantity-value">${item.quantity}</span><button type="button" class="quantity-btn" data-plus="${index}" aria-label="Aumentar cantidad" ${item.quantity >= item.stock ? "disabled" : ""}>+</button></div></td><td>${money(item.price)}</td><td>${money(item.price * item.quantity)}</td><td><button type="button" class="link-btn" data-remove="${index}">Quitar</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">Agrega productos a la venta</p>';
        totalElement.textContent = money(getSaleTotal()); calculatePayment();
    }
    root.querySelector("#add-line").onclick = () => { const product = products.find(p => Number(p.id) === Number(productSelect.value)); if (!product) { alert("Selecciona un producto disponible."); return; } const existing = cart.find(i => Number(i.id) === Number(product.id)); if (existing) { if (existing.quantity >= Number(product.stock)) { alert("No hay más existencia disponible."); return; } existing.quantity++; } else cart.push({ id: product.id, name: product.name, price: Number(product.salePrice) || 0, stock: Number(product.stock), quantity: 1 }); draw(); };
    lines.onclick = event => { const remove = event.target.closest("[data-remove]"), plus = event.target.closest("[data-plus]"), minus = event.target.closest("[data-minus]"); if (remove) { cart.splice(Number(remove.dataset.remove), 1); draw(); return; } if (plus) { const item = cart[Number(plus.dataset.plus)]; if (item && item.quantity < item.stock) item.quantity++; draw(); return; } if (minus) { const item = cart[Number(minus.dataset.minus)]; if (item) { if (item.quantity > 1) item.quantity--; else cart.splice(Number(minus.dataset.minus), 1); } draw(); } };
    productSearch.addEventListener("input", () => fillProducts(false)); customerSearch.addEventListener("input", () => fillCustomers(false));
    cashInput.addEventListener("input", calculatePayment); customerSelect.addEventListener("change", calculatePayment);
    root.querySelector("#sale-form").onsubmit = async event => { event.preventDefault(); if (!cart.length) { alert("Agrega al menos un producto."); return; } const payment = calculatePayment(); if (!payment.customer && payment.currentBalance > 0) { alert("Selecciona un cliente para registrar una venta parcial o fiada."); return; } const button = root.querySelector('#sale-form button[type="submit"]'); button.disabled = true; button.textContent = "Registrando..."; try { const result = await registerSale({ customerId: payment.customer?.id ?? null, items: cart.map(item => ({ ...item })), cashReceived: payment.cash }); alert(`Venta #${result.saleId} registrada.\n${result.previousDebtPaid > 0 ? `Deuda anterior cubierta: ${money(result.previousDebtPaid)}\n` : ""}Aplicado a esta venta: ${money(result.paidAmount)}\nPendiente: ${money(result.balance)}`); cart.length = 0; cashInput.value = "0"; productSearch.value = ""; customerSearch.value = ""; productSelect.value = ""; products = (await getAll("products")).sort(byNewest); customers = (await getAll("customers")).sort(byNewest); sales = await getAll("sales"); fillCustomers(false); fillProducts(false); draw(); } catch (error) { console.error(error); alert(error.message || "No se pudo registrar la venta."); } finally { button.disabled = false; button.textContent = "Registrar venta"; } };
    draw();
}
