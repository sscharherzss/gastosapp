const STORAGE_PREFIX = "mis-finanzas-pwa:";
import { firestoreEnabled, readProfile, writeProfile } from "./firestore";

const today = () => new Date().toISOString().slice(0, 10);
const key = (profile) => `${STORAGE_PREFIX}${profile}`;
const activeProfile = () => localStorage.getItem("perfil_activo") || "personal";
const emptyData = () => ({ gastos: [], ingresos: [], compromisos: [], ahorros: [], presupuestos: {} });

function read(profile = activeProfile()) {
  try { return { ...emptyData(), ...JSON.parse(localStorage.getItem(key(profile)) || "{}") }; }
  catch { return emptyData(); }
}
function write(data, profile = activeProfile()) { localStorage.setItem(key(profile), JSON.stringify(data)); }
function id() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function monthRows(rows, anio, mes) {
  const prefix = `${anio}-${String(mes).padStart(2, "0")}`;
  return rows.filter((row) => row.fecha?.startsWith(prefix));
}
function validAmount(description, amount) {
  if (!String(description || "").trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Ingresa una descripción y un monto válido.");
}
function validateCommitment({ nombre, monto, tipo, diaMes, fecha }) {
  validAmount(nombre, monto);
  if (tipo === "recurrente" && Number.isInteger(Number(diaMes)) && Number(diaMes) >= 1 && Number(diaMes) <= 31) return;
  if (["impuesto", "cumple"].includes(tipo) && /^\d{2}-\d{2}$/.test(fecha || "")) return;
  throw new Error("Indica un día del 1 al 31 o una fecha MM-DD válida.");
}

async function syncFromFirestore(profile = activeProfile()) {
  if (!firestoreEnabled()) return;
  try {
    const cloud = await readProfile(profile);
    if (cloud) write({ ...emptyData(), ...cloud }, profile);
  } catch (error) {
    console.warn("Firestore no disponible; se conserva el almacenamiento local.", error);
  }
}

async function syncToFirestore(profile = activeProfile()) {
  if (!firestoreEnabled()) return;
  try { await writeProfile(profile, read(profile)); }
  catch (error) { console.warn("No se pudo sincronizar Firestore; los datos locales siguen disponibles.", error); }
}

async function localInvoke(command, args = {}) {
  if (command === "cambiar_perfil") {
    localStorage.setItem("perfil_activo", args.nombrePerfil);
    await syncFromFirestore(args.nombrePerfil);
    return null;
  }
  await syncFromFirestore();
  const data = read();
  const save = async () => { write(data); await syncToFirestore(); };
  const rowById = (rows, recordId) => rows.find((row) => row.id === recordId);

  switch (command) {
    case "listar_gastos": return monthRows(data.gastos, args.anio, args.mes).sort((a, b) => b.fecha.localeCompare(a.fecha));
    case "agregar_gasto": validAmount(args.descripcion, args.monto); data.gastos.unshift({ id: id(), descripcion: args.descripcion.trim(), monto: Number(args.monto), categoria: args.categoria, fecha: today() }); await save(); return null;
    case "actualizar_gasto": { validAmount(args.descripcion, args.monto); const row = rowById(data.gastos, args.id); if (!row) throw new Error("Gasto no encontrado."); Object.assign(row, { descripcion: args.descripcion.trim(), monto: Number(args.monto), categoria: args.categoria, fecha: args.fecha }); await save(); return null; }
    case "eliminar_gasto": data.gastos = data.gastos.filter((row) => row.id !== args.id); await save(); return null;
    case "listar_ingresos": return monthRows(data.ingresos, args.anio, args.mes).sort((a, b) => b.fecha.localeCompare(a.fecha));
    case "agregar_ingreso": validAmount(args.descripcion, args.monto); data.ingresos.unshift({ id: id(), descripcion: args.descripcion.trim(), monto: Number(args.monto), fecha: today() }); await save(); return null;
    case "actualizar_ingreso": { validAmount(args.descripcion, args.monto); const row = rowById(data.ingresos, args.id); if (!row) throw new Error("Ingreso no encontrado."); Object.assign(row, { descripcion: args.descripcion.trim(), monto: Number(args.monto), fecha: args.fecha }); await save(); return null; }
    case "eliminar_ingreso": data.ingresos = data.ingresos.filter((row) => row.id !== args.id); await save(); return null;
    case "listar_compromisos": return [...data.compromisos];
    case "agregar_compromiso": validateCommitment(args); data.compromisos.unshift({ id: id(), nombre: args.nombre.trim(), monto: Number(args.monto), tipo: args.tipo, dia_mes: args.diaMes || null, fecha: args.fecha || null, activo: true }); await save(); return null;
    case "actualizar_compromiso": { validateCommitment(args); const row = rowById(data.compromisos, args.id); if (!row) throw new Error("Compromiso no encontrado."); Object.assign(row, { nombre: args.nombre.trim(), monto: Number(args.monto), tipo: args.tipo, dia_mes: args.diaMes || null, fecha: args.fecha || null }); await save(); return null; }
    case "eliminar_compromiso": data.compromisos = data.compromisos.filter((row) => row.id !== args.id); await save(); return null;
    case "listar_ahorros": return [...data.ahorros];
    case "agregar_ahorro": validAmount(args.nombre, args.monto); data.ahorros.unshift({ id: id(), nombre: args.nombre.trim(), monto: Number(args.monto), fecha_registro: today(), tipo: "Ahorro", rendimiento: 0, descripcion: null }); await save(); return null;
    case "eliminar_ahorro": data.ahorros = data.ahorros.filter((row) => row.id !== args.id); await save(); return null;
    case "guardar_presupuesto": validAmount("Presupuesto", args.monto); data.presupuestos[`${args.anio}-${args.mes}`] = Number(args.monto); await save(); return null;
    case "obtener_presupuesto": { const monto = data.presupuestos[`${args.anio}-${args.mes}`]; return monto ? { anio: args.anio, mes: args.mes, monto } : null; }
    case "obtener_resumen_mes": {
      const gastos = monthRows(data.gastos, args.anio, args.mes); const ingresos = monthRows(data.ingresos, args.anio, args.mes);
      const total_gastos = gastos.reduce((sum, row) => sum + row.monto, 0); const total_ingresos = ingresos.reduce((sum, row) => sum + row.monto, 0);
      const grouped = gastos.reduce((all, row) => ({ ...all, [row.categoria]: (all[row.categoria] || 0) + row.monto }), {});
      return { total_gastos, total_ingresos, total_ahorrado: total_ingresos - total_gastos, gastos_por_categoria: Object.entries(grouped).map(([categoria, total]) => ({ categoria, total })) };
    }
    case "obtener_dispensador_dia": {
      const gastos = monthRows(data.gastos, args.anio, args.mes); const gastado_mes = gastos.reduce((sum, row) => sum + row.monto, 0);
      const presupuesto_mes = data.presupuestos[`${args.anio}-${args.mes}`] || 0; const now = new Date();
      const daysInMonth = new Date(args.anio, args.mes, 0).getDate(); const day = args.anio === now.getFullYear() && args.mes === now.getMonth() + 1 ? now.getDate() : 1;
      const dias_restantes = Math.max(1, daysInMonth - day + 1); const limite_hoy = Math.max(0, presupuesto_mes - gastado_mes) / dias_restantes;
      const gastado_hoy = gastos.filter((row) => row.fecha === today()).reduce((sum, row) => sum + row.monto, 0); const porcentaje_hoy = limite_hoy ? gastado_hoy * 100 / limite_hoy : 0;
      return { presupuesto_mes, gastado_mes, dias_restantes, limite_hoy, gastado_hoy, porcentaje_hoy, alerta: !presupuesto_mes ? "sin_presupuesto" : gastado_mes > presupuesto_mes || gastado_hoy > limite_hoy ? "advertencia" : "ok" };
    }
    case "obtener_prediccion_ml": {
      const gastos = monthRows(data.gastos, args.anio, args.mes); const total = gastos.reduce((sum, row) => sum + row.monto, 0); const budget = data.presupuestos[`${args.anio}-${args.mes}`];
      return { presupuesto_definido: Boolean(budget), proyeccion_mes: total, diferencia_vs_presupuesto: (budget || 0) - total, confianza: gastos.length ? 25 : 0, promedio_diario: total / Math.max(1, new Date().getDate()), compromisos_pendientes: [], desglose_proyectado: [] };
    }
    case "obtener_mensaje_manana": return null;
    default: throw new Error(`Acción local no implementada: ${command}`);
  }
}

async function remoteInvoke(command, args) {
  const base = import.meta.env.VITE_GASTOS_API_URL.replace(/\/$/, "");
  const response = await fetch(`${base}/v1/commands/${encodeURIComponent(command)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ args, profile: activeProfile() }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `La API respondió ${response.status}.`);
  return payload.result;
}

export async function invoke(command, args) {
  if (import.meta.env.VITE_GASTOS_API_URL) return remoteInvoke(command, args);
  return localInvoke(command, args);
}
