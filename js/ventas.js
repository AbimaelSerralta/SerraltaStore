import { getAll, registerSale } from "./database.js";

const money = value => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || Number(b.id || 0) - Number(a.id || 0);
const normalize = value => String(value ?? "").trim().toLocaleLowerCase("es-MX");

export async function init(root) {
    let products = (await getAll("products")).sort(byNewest);
    let customers = (await getAll("customers")).sort(byNewest);
    let sales = await getAll("sales");

    const productId = root.querySelector("#sale-product");
    const customerId = root.querySelector("#sale-customer");
    const productSearch = root.querySelector("#sale-product-search");
    const customerSearch = root.querySelector("#sale-customer-search");
    const productOptions = root.querySelector("#sale-product-options");
    const customerOptions = root.querySelector("#sale-customer-options");
    const paymentType = root.querySelector("#payment-type");
    const cashInput = root.querySelector("#paid-amount");
    const lines = root.querySelector("#sale-lines");
    const totalElement = root.querySelector("#sale-total");
    const preview = root.querySelector("#sale-payment-preview");
    const cart = [];

    function closeOptions(input, options) {
        options.hidden = true;
        input.setAttribute("aria-expanded", "false");
    }

    function renderCustomerOptions() {
        const query = normalize(customerSearch.value);
        const matches = customers
            .filter(c => c.active !== false)
            .filter(c => !query || normalize(`${c.name || ""} ${c.department || ""}`).includes(query))
            .slice(0, 10);
        customerOptions.innerHTML = matches.length
            ? matches.map(c => {
                const label = `${c.name || "Cliente"}${c.department ? ` | ${c.department}` : ""}`;
                return `<button type="button" class="autocomplete-option" role="option" data-customer-option="${c.id}"><span>${esc(label)}</span>${Number(c.creditBalance) > 0 ? `<small>Saldo a favor ${money(c.creditBalance)}</small>` : ""}</button>`;
            }).join("")
            : '<div class="autocomplete-empty">No se encontraron clientes</div>';
        customerOptions.hidden = false;
        customerSearch.setAttribute("aria-expanded", "true");
    }

    function renderProductOptions() {
        const query = normalize(productSearch.value);
        const matches = products
            .filter(p => p.active !== false && Number(p.stock) > 0)
            .filter(p => !query || normalize(p.name).includes(query))
            .slice(0, 10);
        productOptions.innerHTML = matches.length
            ? matches.map(p => `<button type="button" class="autocomplete-option" role="option" data-product-option="${p.id}"><span>${esc(p.name)}</span><small>${money(p.salePrice)} · Stock ${Number(p.stock)}</small></button>`).join("")
            : '<div class="autocomplete-empty">No hay productos disponibles que coincidan</div>';
        productOptions.hidden = false;
        productSearch.setAttribute("aria-expanded", "true");
    }

    function getSaleTotal() {
        return Number(cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
    }

    function getCustomer() {
        return customers.find(c => Number(c.id) === Number(customerId.value)) || null;
    }

    function calculatePayment() {
        const total = getSaleTotal();
        const customer = getCustomer();
        const cash = Math.max(0, Number(cashInput.value) || 0);
        const credit = Number(customer?.creditBalance || 0);
        const available = Number((cash + credit).toFixed(2));
        const customerSales = customer
            ? sales.filter(s => Number(s.customerId) === Number(customer.id) && Number(s.balance) > 0)
                .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || Number(a.id) - Number(b.id))
            : [];
        const previousDebt = Number(customerSales.reduce((sum, sale) => sum + Number(sale.balance || 0), 0).toFixed(2));
        const appliedToOldDebt = Math.min(available, previousDebt);
        const afterOldDebt = Number((available - appliedToOldDebt).toFixed(2));
        const appliedToCurrent = Math.min(afterOldDebt, total);
        const currentBalance = Number((total - appliedToCurrent).toFixed(2));
        const remainingFavor = Number((afterOldDebt - appliedToCurrent).toFixed(2));
        const type = currentBalance === 0 ? "paid" : appliedToCurrent > 0 ? "partial" : "credit";
        paymentType.value = type;
        paymentType.setAttribute("aria-label", `Tipo de pago calculado: ${{ paid: "Pago completo", partial: "Pago parcial", credit: "Fiado" }[type]}`);
        if (preview) {
            const parts = [];
            if (customer && appliedToOldDebt > 0) parts.push(`Deuda anterior cubierta: ${money(appliedToOldDebt)}`);
            parts.push(`Aplicado a esta venta: ${money(appliedToCurrent)}`, `Pendiente de esta venta: ${money(currentBalance)}`);
            if (remainingFavor > 0) parts.push(`Saldo a favor restante: ${money(remainingFavor)}`);
            preview.textContent = total > 0 ? parts.join(" · ") : "Agrega productos para calcular el pago.";
        }
        return { total, cash, customer, currentBalance };
    }

    function draw() {
        lines.innerHTML = cart.length
            ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Importe</th><th></th></tr></thead><tbody>${cart.map((item, index) => `<tr><td>${esc(item.name)}</td><td><div class="quantity-control"><button type="button" class="quantity-btn" data-minus="${index}" aria-label="Disminuir cantidad">−</button><span class="quantity-value">${item.quantity}</span><button type="button" class="quantity-btn" data-plus="${index}" aria-label="Aumentar cantidad" ${item.quantity >= item.stock ? "disabled" : ""}>+</button></div></td><td>${money(item.price)}</td><td>${money(item.price * item.quantity)}</td><td><button type="button" class="link-btn" data-remove="${index}">Quitar</button></td></tr>`).join("")}</tbody></table></div>`
            : '<p class="empty">Agrega productos a la venta</p>';
        totalElement.textContent = money(getSaleTotal());
        calculatePayment();
    }

    customerSearch.addEventListener("focus", renderCustomerOptions);
    customerSearch.addEventListener("input", () => {
        customerId.value = "";
        renderCustomerOptions();
        calculatePayment();
    });
    productSearch.addEventListener("focus", renderProductOptions);
    productSearch.addEventListener("input", () => {
        productId.value = "";
        renderProductOptions();
    });

    customerOptions.addEventListener("click", event => {
        const option = event.target.closest("[data-customer-option]");
        if (!option) return;
        const customer = customers.find(c => Number(c.id) === Number(option.dataset.customerOption));
        if (!customer) return;
        customerId.value = customer.id;
        customerSearch.value = `${customer.name || "Cliente"}${customer.department ? ` | ${customer.department}` : ""}`;
        closeOptions(customerSearch, customerOptions);
        calculatePayment();
    });

    productOptions.addEventListener("click", event => {
        const option = event.target.closest("[data-product-option]");
        if (!option) return;
        const product = products.find(p => Number(p.id) === Number(option.dataset.productOption));
        if (!product) return;
        productId.value = product.id;
        productSearch.value = product.name;
        closeOptions(productSearch, productOptions);
    });

    root.addEventListener("click", event => {
        if (!event.target.closest("[data-autocomplete='customer']")) closeOptions(customerSearch, customerOptions);
        if (!event.target.closest("[data-autocomplete='product']")) closeOptions(productSearch, productOptions);
    });

    root.querySelector("#add-line").onclick = () => {
        const product = products.find(p => Number(p.id) === Number(productId.value));
        if (!product || product.active === false || Number(product.stock) <= 0) {
            alert("Busca y selecciona un producto disponible.");
            productSearch.focus();
            return;
        }
        const existing = cart.find(item => Number(item.id) === Number(product.id));
        if (existing) {
            if (existing.quantity >= Number(product.stock)) { alert("No hay más existencia disponible."); return; }
            existing.quantity++;
        } else {
            cart.push({ id: product.id, name: product.name, price: Number(product.salePrice) || 0, stock: Number(product.stock), quantity: 1 });
        }
        productId.value = "";
        productSearch.value = "";
        closeOptions(productSearch, productOptions);
        draw();
    };

    lines.onclick = event => {
        const remove = event.target.closest("[data-remove]");
        const plus = event.target.closest("[data-plus]");
        const minus = event.target.closest("[data-minus]");
        if (remove) { cart.splice(Number(remove.dataset.remove), 1); draw(); return; }
        if (plus) {
            const item = cart[Number(plus.dataset.plus)];
            if (item && item.quantity < item.stock) item.quantity++;
            draw();
            return;
        }
        if (minus) {
            const item = cart[Number(minus.dataset.minus)];
            if (item) {
                if (item.quantity > 1) item.quantity--;
                else cart.splice(Number(minus.dataset.minus), 1);
            }
            draw();
        }
    };

    cashInput.addEventListener("input", calculatePayment);

    root.querySelector("#sale-form").onsubmit = async event => {
        event.preventDefault();
        if (!cart.length) { alert("Agrega al menos un producto."); return; }
        const payment = calculatePayment();
        if (!payment.customer && payment.currentBalance > 0) { alert("Selecciona un cliente para registrar una venta parcial o fiada."); return; }
        const button = root.querySelector('#sale-form button[type="submit"]');
        button.disabled = true;
        button.textContent = "Registrando...";
        try {
            const result = await registerSale({ customerId: payment.customer?.id ?? null, items: cart.map(item => ({ ...item })), cashReceived: payment.cash });
            alert(`Venta #${result.saleId} registrada.\n${result.previousDebtPaid > 0 ? `Deuda anterior cubierta: ${money(result.previousDebtPaid)}\n` : ""}Aplicado a esta venta: ${money(result.paidAmount)}\nPendiente: ${money(result.balance)}`);
            cart.length = 0;
            cashInput.value = "0";
            customerId.value = "";
            customerSearch.value = "";
            productId.value = "";
            productSearch.value = "";
            products = (await getAll("products")).sort(byNewest);
            customers = (await getAll("customers")).sort(byNewest);
            sales = await getAll("sales");
            closeOptions(customerSearch, customerOptions);
            closeOptions(productSearch, productOptions);
            draw();
        } catch (error) {
            console.error(error);
            alert(error.message || "No se pudo registrar la venta.");
        } finally {
            button.disabled = false;
            button.textContent = "Registrar venta";
        }
    };

    draw();
}
