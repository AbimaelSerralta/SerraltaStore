import { getAll, openDatabase, clearAllData } from "./database.js";

const STORE_NAMES = ["products", "customers", "inventoryMovements", "sales", "payments", "accountEntries"];
const BACKUP_FORMAT = "serraltastore-backup";
const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = "serraltastore_last_backup_at";

function setStatus(root, message, isError = false) {
  const status = root.querySelector("#backup-status");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

async function exportBackup(root) {
  const data = {};
  for (const store of STORE_NAMES) data[store] = await getAll(store);
  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    application: "SerraltaStore",
    exportedAt: new Date().toISOString(),
    stores: data
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `serraltastore-respaldo-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const confirmButton = root.querySelector("#backup-confirm");
  if (confirmButton) confirmButton.disabled = false;
  setStatus(root, "Archivo generado. Guárdalo en Archivos o iCloud Drive y después confirma que quedó guardado.");
}

function validateBackup(data) {
  if (!data || typeof data !== "object") throw new Error("El archivo no contiene un respaldo válido.");
  // Compatibilidad con el formato JSON sencillo de la versión anterior.
  const stores = data.stores && typeof data.stores === "object" ? data.stores : data;
  if (data.format && data.format !== BACKUP_FORMAT) throw new Error("El archivo no pertenece a un respaldo de SerraltaStore.");
  if (data.version && Number(data.version) > BACKUP_VERSION) throw new Error("Este respaldo fue creado con una versión más reciente de SerraltaStore.");
  for (const name of STORE_NAMES) {
    if (!Array.isArray(stores[name])) throw new Error(`El respaldo no contiene una lista válida de ${name}.`);
    for (const record of stores[name]) {
      if (!record || typeof record !== "object" || Array.isArray(record) || !Number.isFinite(Number(record.id))) {
        throw new Error(`Se encontró un registro inválido en ${name}.`);
      }
    }
  }
  return stores;
}

async function importBackup(root, file) {
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("No se pudo leer el JSON. Verifica que el archivo no esté dañado.");
  }
  const stores = validateBackup(parsed);
  const totalRecords = STORE_NAMES.reduce((sum, name) => sum + stores[name].length, 0);
  const confirmed = window.confirm(
    `Vas a reemplazar toda la información actual por la del respaldo.\n\n` +
    `Registros que se importarán: ${totalRecords}.\n` +
    `Esta acción no se puede deshacer.\n\n¿Deseas continuar?`
  );
  if (!confirmed) {
    setStatus(root, "Importación cancelada. Tus datos actuales no fueron modificados.");
    return;
  }

  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const name of STORE_NAMES) {
      const store = tx.objectStore(name);
      store.clear();
      for (const record of stores[name]) store.put(record);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("No se pudo importar el respaldo."));
    tx.onabort = () => reject(tx.error || new Error("La importación fue cancelada."));
  });
  setStatus(root, `Respaldo importado correctamente. Se restauraron ${totalRecords} registros. Recarga la aplicación para actualizar los módulos.`);
  root.querySelector("#backup-file").value = "";
}

function updateLastBackupLabel(root) {
  const label = root.querySelector("#backup-last-date");
  if (!label) return;
  const timestamp = Number(localStorage.getItem(LAST_BACKUP_KEY));
  label.textContent = Number.isFinite(timestamp) && timestamp > 0
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" }).format(new Date(timestamp))
    : "Aún no se ha generado un respaldo en este dispositivo.";
}

function confirmBackupSaved(root, button) {
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  updateLastBackupLabel(root);
  document.dispatchEvent(new CustomEvent("serraltastore:backup-created"));
  button.disabled = true;
  setStatus(root, "Respaldo confirmado. Te recordaremos generar otro dentro de 7 días.");
}

async function clearDatabase(root, button) {
  const confirmed = window.confirm(
    "ATENCIÓN: esta acción eliminará TODOS los productos, clientes, ventas, pagos, movimientos y cuentas guardados en este iPhone.\n\n" +
    "No se puede deshacer. Antes de continuar, genera y guarda un respaldo.\n\n¿Estás seguro de que deseas continuar?"
  );
  if (!confirmed) {
    setStatus(root, "Limpieza cancelada. No se modificó la información.");
    return;
  }
  const phrase = window.prompt('Para confirmar definitivamente, escribe BORRAR (en mayúsculas):');
  if (phrase !== "BORRAR") {
    setStatus(root, "Limpieza cancelada. La frase de confirmación no coincide.");
    return;
  }
  button.disabled = true;
  try {
    await clearAllData();
    setStatus(root, "La base de datos quedó vacía. La aplicación se actualizará.");
    window.setTimeout(() => window.location.reload(), 700);
  } catch (error) {
    button.disabled = false;
    throw error;
  }
}

export async function init(root) {
  updateLastBackupLabel(root);
  const exportButton = root.querySelector("#backup-export");
  const importButton = root.querySelector("#backup-import");
  const fileInput = root.querySelector("#backup-file");
  const clearButton = root.querySelector("#backup-clear");
  const confirmButton = root.querySelector("#backup-confirm");

  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    try {
      await exportBackup(root);
    } catch (error) {
      setStatus(root, error.message || "No se pudo exportar el respaldo.", true);
    } finally {
      exportButton.disabled = false;
    }
  });

  importButton.addEventListener("click", () => fileInput.click());
  confirmButton.addEventListener("click", () => confirmBackupSaved(root, confirmButton));
  clearButton.addEventListener("click", async () => {
    try {
      await clearDatabase(root, clearButton);
    } catch (error) {
      setStatus(root, error.message || "No se pudo limpiar la base de datos.", true);
    }
  });
  fileInput.addEventListener("change", async () => {
    importButton.disabled = true;
    try {
      await importBackup(root, fileInput.files[0]);
    } catch (error) {
      setStatus(root, error.message || "No se pudo importar el respaldo.", true);
    } finally {
      importButton.disabled = false;
    }
  });
}
