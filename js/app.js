import { openDatabase } from "./database.js";

const titles = {
  inicio: "Inicio", productos: "Productos", inventario: "Inventario",
  clientes: "Clientes", ventas: "Nueva venta", cuentas: "Cuentas",
  historial: "Historial", reportes: "Reportes", respaldos: "Respaldos", notificaciones: "Notificaciones"
};
const view = document.querySelector("#app-view");
const modules = {
  inicio: "inicio", productos: "productos", inventario: "inventario",
  clientes: "clientes", ventas: "ventas", cuentas: "cuentas",
  historial: "historial", reportes: "reportes", respaldos: "respaldos", notificaciones: "notificaciones"
};
const menuViews = ["inventario", "clientes", "historial", "reportes", "respaldos", "notificaciones"];
const mobileMenu = document.querySelector("#mobile-menu");
const menuToggle = document.querySelector("[data-menu-toggle]");
const reminder = document.querySelector("#backup-reminder");
const INSTALL_DATE_KEY = "serraltastore_install_date";
const LAST_BACKUP_KEY = "serraltastore_last_backup_at";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function closeMobileMenu() {
  if (mobileMenu) mobileMenu.hidden = true;
  if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
}

function refreshBackupReminder() {
  if (!reminder) return;
  const now = Date.now();
  let installedAt = Number(localStorage.getItem(INSTALL_DATE_KEY));
  if (!Number.isFinite(installedAt) || installedAt <= 0) {
    installedAt = now;
    localStorage.setItem(INSTALL_DATE_KEY, String(installedAt));
  }
  const lastBackup = Number(localStorage.getItem(LAST_BACKUP_KEY));
  const referenceDate = Number.isFinite(lastBackup) && lastBackup > 0 ? lastBackup : installedAt;
  reminder.hidden = now - referenceDate < WEEK_MS;
}

export async function navigate(name) {
  document.querySelector("#page-title").textContent = titles[name] || "SerraltaStore";
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === name);
  });
  if (menuToggle) menuToggle.classList.toggle("active", menuViews.includes(name));
  closeMobileMenu();
  try {
    const response = await fetch(`views/${name}.html`);
    if (!response.ok) throw new Error(`No se pudo cargar views/${name}.html`);
    view.innerHTML = await response.text();
    if (modules[name]) {
      const module = await import(`./${modules[name]}.js`);
      await module.init(view);
    }
  } catch (error) {
    view.innerHTML = `<div class="card"><h2>Error al abrir módulo</h2><p>${error.message}</p></div>`;
    console.error(error);
  }
}

document.addEventListener("click", event => {
  const toggle = event.target.closest("[data-menu-toggle]");
  if (toggle) {
    const opening = mobileMenu.hidden;
    mobileMenu.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    return;
  }
  if (!event.target.closest("#mobile-menu") && !event.target.closest("[data-menu-toggle]") && !mobileMenu.hidden) closeMobileMenu();
  const button = event.target.closest("[data-view]");
  if (button) navigate(button.dataset.view);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMobileMenu();
});
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date());
document.addEventListener("serraltastore:backup-created", refreshBackupReminder);

try {
  await openDatabase();
  refreshBackupReminder();
  await navigate("inicio");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(error => console.warn("No se pudo registrar el Service Worker:", error));
  }
} catch (error) {
  view.innerHTML = `<div class="card"><h2>No se pudo iniciar SerraltaStore</h2><p>${error.message}</p></div>`;
  console.error(error);
}
