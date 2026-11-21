export const DB_NAME = "SerraltaStoreDB";
export const DB_VERSION = 1;

const STORES = {
    products: { keyPath: "id", autoIncrement: true },
    customers: { keyPath: "id", autoIncrement: true },
    inventoryMovements: { keyPath: "id", autoIncrement: true },
    sales: { keyPath: "id", autoIncrement: true },
    payments: { keyPath: "id", autoIncrement: true },
    accountEntries: { keyPath: "id", autoIncrement: true }
};

let dbPromise;

export function clearAllData() {
    return openDatabase().then(db => new Promise((resolve, reject) => {
        const names = Array.from(db.objectStoreNames);
        if (!names.length) return resolve();
        const tx = db.transaction(names, "readwrite");
        for (const name of names) tx.objectStore(name).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("No se pudo limpiar la base de datos."));
        tx.onabort = () => reject(tx.error || new Error("La limpieza de la base de datos fue cancelada."));
    }));
}

export function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const [name, options] of Object.entries(STORES)) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => { dbPromise = null; reject(request.error); };
    });
    return dbPromise;
}

export async function getAll(store) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function addRecord(store, record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const request = tx.objectStore(store).add({ ...record, createdAt: record.createdAt || new Date().toISOString() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error || request.error);
    });
}

export async function updateRecord(store, record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const request = tx.objectStore(store).put(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error || request.error);
    });
}

export async function deleteRecord(store, id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(Number(id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

// Registra una venta, aplica saldo a favor y efectivo a las deudas anteriores
// y después a la venta actual. Toda la operación se confirma en una transacción.
export async function registerSale({ customerId = null, items, cashReceived = 0 }) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const storeNames = ["products", "customers", "sales", "payments", "accountEntries", "inventoryMovements"];
        const tx = db.transaction(storeNames, "readwrite");
        const productsStore = tx.objectStore("products");
        const customersStore = tx.objectStore("customers");
        const salesStore = tx.objectStore("sales");
        const productsRequest = productsStore.getAll();
        const salesRequest = salesStore.getAll();
        const hasCustomer = customerId !== null && customerId !== undefined && String(customerId).trim() !== "";
        const customerRequest = hasCustomer ? customersStore.get(Number(customerId)) : null;
        let productsReady = false, salesReady = false, customerReady = !hasCustomer;
        let customer = null, result = null, settled = false;

        const fail = message => {
            if (settled) return;
            settled = true;
            try { tx.abort(); } catch (_) { }
            reject(new Error(message));
        };

        const apply = () => {
            if (!productsReady || !salesReady || !customerReady || settled) return;
            try {
                const cash = Number(cashReceived);
                if (!Number.isFinite(cash) || cash < 0) return fail("El importe recibido no es válido.");
                if (!Array.isArray(items) || !items.length) return fail("Agrega al menos un producto a la venta.");
                if (hasCustomer && !customer) return fail("No se encontró el cliente seleccionado.");

                const products = productsRequest.result;
                const sales = salesRequest.result;
                const normalizedItems = items.map(item => {
                    const product = products.find(p => Number(p.id) === Number(item.id));
                    const quantity = Number(item.quantity);
                    if (!product || product.active === false) throw new Error(`No se encontró el producto ${item.name || item.id}.`);
                    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`La cantidad de ${product.name} no es válida.`);
                    if (Number(product.stock) < quantity) throw new Error(`Existencia insuficiente: ${product.name}.`);
                    const price = Number(product.salePrice);
                    const purchasePrice = Number(product.purchasePrice);
                    if (!Number.isFinite(price) || price < 0) throw new Error(`El precio de ${product.name} no es válido.`);
                    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error(`El precio de compra de ${product.name} no es válido.`);
                    return { id: product.id, name: product.name, price, purchasePrice, quantity, stock: Number(product.stock) };
                });
                const total = Number(normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
                const costTotal = Number(normalizedItems.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0).toFixed(2));
                const grossProfit = Number((total - costTotal).toFixed(2));
                const now = new Date().toISOString();
                const previousSales = hasCustomer
                    ? sales.filter(s => Number(s.customerId) === Number(customerId) && Number(s.balance) > 0)
                        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || Number(a.id) - Number(b.id))
                    : [];

                // El saldo a favor se utiliza primero; después se aplica el efectivo recibido.
                let creditRemaining = Number(customer?.creditBalance || 0);
                let cashRemaining = cash;
                const useFunds = requested => {
                    const fromCredit = Math.min(creditRemaining, requested);
                    creditRemaining = Number((creditRemaining - fromCredit).toFixed(2));
                    const fromCash = Math.min(cashRemaining, Number((requested - fromCredit).toFixed(2)));
                    cashRemaining = Number((cashRemaining - fromCash).toFixed(2));
                    return Number((fromCredit + fromCash).toFixed(2));
                };
                const applications = [];

                // Primero se cubren las ventas pendientes anteriores, de la más antigua a la más nueva.
                for (const oldSale of previousSales) {
                    const balance = Number(oldSale.balance) || 0;
                    const applied = useFunds(balance);
                    if (applied <= 0) break;
                    const nextBalance = Number((balance - applied).toFixed(2));
                    salesStore.put({
                        ...oldSale,
                        paidAmount: Number((Number(oldSale.paidAmount || 0) + applied).toFixed(2)),
                        balance: nextBalance,
                        status: nextBalance === 0 ? "pagada" : "parcial"
                    });
                    applications.push({ saleId: oldSale.id, amount: applied, kind: "deuda-anterior" });
                }

                const appliedToCurrentSale = useFunds(total);
                const currentBalance = Number((total - appliedToCurrentSale).toFixed(2));
                if (!hasCustomer && currentBalance > 0) return fail("Selecciona un cliente para registrar una venta parcial o fiada.");

                const sale = {
                    customerId: hasCustomer ? Number(customerId) : null,
                    items: normalizedItems,
                    total,
                    costTotal,
                    grossProfit,
                    paidAmount: appliedToCurrentSale,
                    balance: currentBalance,
                    status: currentBalance === 0 ? "pagada" : appliedToCurrentSale > 0 ? "parcial" : "pendiente",
                    createdAt: now
                };
                const saleId = salesStore.add(sale);
                // El ID de la venta nueva se incorpora a la aplicación de fondos.
                saleId.onsuccess = () => {
                    const newSaleId = saleId.result;
                    if (appliedToCurrentSale > 0) applications.push({ saleId: newSaleId, amount: appliedToCurrentSale, kind: "venta-actual" });
                    if (hasCustomer) {
                        const remainingCredit = Number((creditRemaining + cashRemaining).toFixed(2));
                        customersStore.put({ ...customer, creditBalance: remainingCredit });
                    }
                    for (const item of normalizedItems) {
                        const product = products.find(p => Number(p.id) === Number(item.id));
                        productsStore.put({ ...product, stock: Number(product.stock) - item.quantity });
                        tx.objectStore("inventoryMovements").add({
                            productId: product.id, productName: product.name, type: "salida",
                            quantity: item.quantity, delta: -item.quantity, note: `Venta #${newSaleId}`, createdAt: now
                        });
                    }
                    tx.objectStore("accountEntries").add({
                        customerId: sale.customerId, saleId: newSaleId, type: "venta", amount: total,
                        paidAmount: appliedToCurrentSale, balance: currentBalance, items: normalizedItems, createdAt: now
                    });
                    const creditUsed = Number((Number(customer?.creditBalance || 0) - creditRemaining).toFixed(2));
                    if (cash > 0 || creditUsed > 0) {
                        tx.objectStore("payments").add({
                            customerId: sale.customerId, saleId: newSaleId, amount: cash,
                            creditApplied: creditUsed, applications, type: "venta", method: "Pago en nueva venta", createdAt: now
                        });
                        if (hasCustomer) tx.objectStore("accountEntries").add({
                            customerId: sale.customerId, saleId: newSaleId, type: "pago", amount: cash,
                            creditApplied: creditUsed, applications, createdAt: now
                        });
                    }
                    result = {
                        saleId: newSaleId, total, paidAmount: appliedToCurrentSale, balance: currentBalance,
                        previousDebtPaid: Number(applications.filter(x => x.kind === "deuda-anterior").reduce((n, x) => n + x.amount, 0).toFixed(2)),
                        creditRemaining: hasCustomer ? Number((creditRemaining + cashRemaining).toFixed(2)) : 0
                    };
                };
                saleId.onerror = () => fail("No se pudo registrar la venta.");
            } catch (error) {
                fail(error.message || "No se pudo procesar la venta.");
            }
        };

        productsRequest.onsuccess = () => { productsReady = true; apply(); };
        salesRequest.onsuccess = () => { salesReady = true; apply(); };
        productsRequest.onerror = () => fail("No se pudieron consultar los productos.");
        salesRequest.onerror = () => fail("No se pudieron consultar las ventas pendientes.");
        if (customerRequest) {
            customerRequest.onsuccess = () => { customer = customerRequest.result; customerReady = true; apply(); };
            customerRequest.onerror = () => fail("No se pudo consultar el cliente seleccionado.");
        }
        tx.oncomplete = () => { if (!settled) { settled = true; resolve(result); } };
        tx.onerror = () => { if (!settled) { settled = true; reject(tx.error || new Error("No se pudo guardar la venta.")); } };
        tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error("La operación de venta fue cancelada.")); } };
    });
}

// Registra un abono y lo distribuye entre las deudas pendientes más antiguas.
export async function registerCustomerPayment({ customerId, amount, method, notes = "" }) {
    const db = await openDatabase();
    if (customerId === undefined || customerId === null || String(customerId).trim() === "") throw new Error("No se recibió el identificador del cliente.");
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error("El importe del abono no es válido.");

    return new Promise((resolve, reject) => {
        const tx = db.transaction(["sales", "customers", "payments", "accountEntries"], "readwrite");
        const salesStore = tx.objectStore("sales"), customersStore = tx.objectStore("customers");
        const salesRequest = salesStore.getAll(), customersRequest = customersStore.getAll(), keysRequest = customersStore.getAllKeys();
        let salesReady = false, customersReady = false, keysReady = false, settled = false, result = null;
        const fail = message => { if (settled) return; settled = true; try { tx.abort(); } catch (_) { } reject(new Error(message)); };
        const apply = () => {
            if (!salesReady || !customersReady || !keysReady || settled) return;
            const index = customersRequest.result.findIndex((c, i) => String(c.id ?? keysRequest.result[i]) === String(customerId) || String(keysRequest.result[i]) === String(customerId));
            if (index < 0) return fail("No se encontró el cliente seleccionado.");
            const customer = { ...customersRequest.result[index], id: customersRequest.result[index].id ?? keysRequest.result[index] };
            let remaining = paymentAmount;
            const ownSales = salesRequest.result
                .filter(s => String(s.customerId) === String(customerId) && Number(s.balance) > 0)
                .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || Number(a.id) - Number(b.id));
            const applications = [];
            for (const sale of ownSales) {
                if (remaining <= 0) break;
                const applied = Math.min(remaining, Number(sale.balance) || 0);
                const balance = Number(((Number(sale.balance) || 0) - applied).toFixed(2));
                salesStore.put({ ...sale, paidAmount: Number((Number(sale.paidAmount || 0) + applied).toFixed(2)), balance, status: balance === 0 ? "pagada" : "parcial" });
                applications.push({ saleId: sale.id, amount: Number(applied.toFixed(2)) });
                remaining = Number((remaining - applied).toFixed(2));
            }
            const creditAmount = Number(remaining.toFixed(2));
            if (creditAmount > 0) customersStore.put({ ...customer, creditBalance: Number((Number(customer.creditBalance || 0) + creditAmount).toFixed(2)) });
            const now = new Date().toISOString();
            const payment = { customerId: customer.id, amount: Number(paymentAmount.toFixed(2)), creditApplied: 0, method: method || "Efectivo", notes, applications, creditAmount, type: "abono", createdAt: now };
            tx.objectStore("payments").add(payment);
            tx.objectStore("accountEntries").add({ ...payment, type: "pago" });
            result = { applications, creditAmount };
        };
        salesRequest.onsuccess = () => { salesReady = true; apply(); };
        customersRequest.onsuccess = () => { customersReady = true; apply(); };
        keysRequest.onsuccess = () => { keysReady = true; apply(); };
        salesRequest.onerror = () => fail("No se pudieron consultar las ventas.");
        customersRequest.onerror = () => fail("No se pudo consultar la lista de clientes.");
        keysRequest.onerror = () => fail("No se pudieron consultar las claves de los clientes.");
        tx.oncomplete = () => { if (!settled) { settled = true; resolve(result); } };
        tx.onerror = () => { if (!settled) { settled = true; reject(tx.error || new Error("No se pudo guardar el abono.")); } };
        tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error("El registro del abono fue cancelado.")); } };
    });
}


// Registra un saldo inicial a favor sin generar una venta ficticia.
export async function registerOpeningCredit({ customerId, amount, notes = "" }) {
    const db = await openDatabase();
    const value = Number(amount);
    if (customerId === undefined || customerId === null || String(customerId).trim() === "") throw new Error("Selecciona un cliente.");
    if (!Number.isFinite(value) || value <= 0) throw new Error("El saldo inicial debe ser mayor que cero.");
    return new Promise((resolve, reject) => {
        const tx = db.transaction(["customers", "payments", "accountEntries"], "readwrite");
        const customers = tx.objectStore("customers");
        const request = customers.get(Number(customerId));
        let result = null, settled = false;
        request.onsuccess = () => {
            const customer = request.result;
            if (!customer) { try { tx.abort(); } catch (_) {} return; }
            const now = new Date().toISOString();
            const nextCredit = Number((Number(customer.creditBalance || 0) + value).toFixed(2));
            customers.put({ ...customer, creditBalance: nextCredit });
            const movement = { customerId: Number(customerId), amount: value, creditAmount: value, creditApplied: 0, method: "Saldo inicial", notes, type: "saldo-inicial", applications: [], createdAt: now };
            tx.objectStore("payments").add(movement);
            tx.objectStore("accountEntries").add(movement);
            result = { creditBalance: nextCredit };
        };
        request.onerror = () => { try { tx.abort(); } catch (_) {} };
        tx.oncomplete = () => { if (!settled) { settled = true; resolve(result); } };
        tx.onerror = tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error("No se pudo registrar el saldo inicial.")); } };
    });
}
