const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const commitmentKinds = new Set(["recurrente", "impuesto", "cumple"]);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...headers } });
const cents = (value) => Math.round(Number(value) * 100);
const money = (value) => Number(value) / 100;
const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

function cors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((item) => item.trim());
  if (!origin || allowed.includes(origin)) return { "access-control-allow-origin": origin || "*", "access-control-allow-headers": "content-type,x-user-id", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS", vary: "Origin" };
  return null;
}
function actor(request, env) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || (env.ENVIRONMENT === "development" ? request.headers.get("x-user-id") || env.DEV_AUTH_USER_ID : null);
  if (!email) throw new HttpError(401, "Se requiere Cloudflare Access para sincronizar tus finanzas.");
  return email.toLowerCase();
}
async function body(request) { try { return await request.json(); } catch { throw new HttpError(400, "El cuerpo debe ser JSON válido."); } }
function validAmount(label, value) { if (!String(label || "").trim() || !Number.isFinite(Number(value)) || Number(value) <= 0) throw new HttpError(422, "Ingresa una descripción y un monto válido."); }
function profileOf(input) { const profile = String(input.profile || "personal").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64); if (!profile) throw new HttpError(422, "Perfil inválido."); return profile; }
async function ensureProfile(db, owner, profile) { await db.prepare("INSERT OR IGNORE INTO profiles (id, owner_email, name) VALUES (?, ?, ?)").bind(profile, owner, profile).run(); }
function datePrefix(year, month) { return `${year}-${String(month).padStart(2, "0")}`; }
function movement(row) { return { id: row.id, descripcion: row.description, monto: money(row.amount_cents), categoria: row.category, fecha: row.movement_date }; }
function commitment(row) { return { id: row.id, nombre: row.name, monto: money(row.amount_cents), tipo: row.kind, dia_mes: row.day_of_month, fecha: row.due_date, activo: Boolean(row.active) }; }

async function movements(db, owner, profile, kind, args) {
  const rows = await db.prepare("SELECT * FROM movements WHERE owner_email=? AND profile_id=? AND kind=? AND movement_date LIKE ? ORDER BY movement_date DESC, created_at DESC").bind(owner, profile, kind, `${datePrefix(args.anio, args.mes)}%`).all();
  return rows.results.map(movement);
}
async function summary(db, owner, profile, args) {
  const rows = await db.prepare("SELECT kind, category, SUM(amount_cents) total FROM movements WHERE owner_email=? AND profile_id=? AND movement_date LIKE ? GROUP BY kind, category").bind(owner, profile, `${datePrefix(args.anio, args.mes)}%`).all();
  let total_gastos = 0; let total_ingresos = 0; const categories = [];
  for (const row of rows.results) { if (row.kind === "gasto") { total_gastos += money(row.total); categories.push({ categoria: row.category || "Otros", total: money(row.total) }); } else total_ingresos += money(row.total); }
  return { total_gastos, total_ingresos, total_ahorrado: total_ingresos - total_gastos, gastos_por_categoria: categories };
}
async function command(request, env, owner, name) {
  const input = await body(request); const args = input.args || {}; const profile = profileOf(input); const db = env.DB;
  await ensureProfile(db, owner, profile);
  if (name === "cambiar_perfil") return null;
  if (name === "listar_gastos") return movements(db, owner, profile, "gasto", args);
  if (name === "listar_ingresos") return movements(db, owner, profile, "ingreso", args);
  if (name === "agregar_gasto" || name === "agregar_ingreso") {
    validAmount(args.descripcion, args.monto); const kind = name.endsWith("gasto") ? "gasto" : "ingreso";
    await db.prepare("INSERT INTO movements (id,owner_email,profile_id,kind,description,amount_cents,category,movement_date) VALUES (?,?,?,?,?,?,?,?)").bind(uid(), owner, profile, kind, args.descripcion.trim(), cents(args.monto), kind === "gasto" ? args.categoria : null, today()).run(); return null;
  }
  if (name === "actualizar_gasto" || name === "actualizar_ingreso") {
    validAmount(args.descripcion, args.monto); const kind = name.endsWith("gasto") ? "gasto" : "ingreso";
    const result = await db.prepare("UPDATE movements SET description=?,amount_cents=?,category=?,movement_date=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner_email=? AND profile_id=? AND kind=?").bind(args.descripcion.trim(), cents(args.monto), kind === "gasto" ? args.categoria : null, args.fecha, args.id, owner, profile, kind).run(); if (!result.meta.changes) throw new HttpError(404, "Movimiento no encontrado."); return null;
  }
  if (name === "eliminar_gasto" || name === "eliminar_ingreso") { const kind = name.endsWith("gasto") ? "gasto" : "ingreso"; await db.prepare("DELETE FROM movements WHERE id=? AND owner_email=? AND profile_id=? AND kind=?").bind(args.id, owner, profile, kind).run(); return null; }
  if (name === "listar_compromisos") { const rows = await db.prepare("SELECT * FROM commitments WHERE owner_email=? AND profile_id=? ORDER BY created_at DESC").bind(owner, profile).all(); return rows.results.map(commitment); }
  if (["agregar_compromiso", "actualizar_compromiso"].includes(name)) {
    validAmount(args.nombre, args.monto); if (!commitmentKinds.has(args.tipo)) throw new HttpError(422, "Tipo de compromiso inválido.");
    const recurring = args.tipo === "recurrente"; if (recurring && (!Number.isInteger(Number(args.diaMes)) || Number(args.diaMes) < 1 || Number(args.diaMes) > 31)) throw new HttpError(422, "Indica un día del 1 al 31.");
    if (!recurring && !/^\d{2}-\d{2}$/.test(args.fecha || "")) throw new HttpError(422, "Indica una fecha MM-DD válida.");
    if (name === "agregar_compromiso") await db.prepare("INSERT INTO commitments (id,owner_email,profile_id,name,amount_cents,kind,day_of_month,due_date) VALUES (?,?,?,?,?,?,?,?)").bind(uid(), owner, profile, args.nombre.trim(), cents(args.monto), args.tipo, recurring ? Number(args.diaMes) : null, recurring ? null : args.fecha).run();
    else { const result = await db.prepare("UPDATE commitments SET name=?,amount_cents=?,kind=?,day_of_month=?,due_date=? WHERE id=? AND owner_email=? AND profile_id=?").bind(args.nombre.trim(), cents(args.monto), args.tipo, recurring ? Number(args.diaMes) : null, recurring ? null : args.fecha, args.id, owner, profile).run(); if (!result.meta.changes) throw new HttpError(404, "Compromiso no encontrado."); }
    return null;
  }
  if (name === "eliminar_compromiso") { await db.prepare("DELETE FROM commitments WHERE id=? AND owner_email=? AND profile_id=?").bind(args.id, owner, profile).run(); return null; }
  if (name === "listar_ahorros") { const rows = await db.prepare("SELECT * FROM savings WHERE owner_email=? AND profile_id=? ORDER BY saved_on DESC").bind(owner, profile).all(); return rows.results.map((row) => ({ id: row.id, nombre: row.name, monto: money(row.amount_cents), tipo: "Ahorro", rendimiento: 0, fecha_registro: row.saved_on, descripcion: null })); }
  if (name === "agregar_ahorro") { validAmount(args.nombre, args.monto); await db.prepare("INSERT INTO savings (id,owner_email,profile_id,name,amount_cents,saved_on) VALUES (?,?,?,?,?,?)").bind(uid(), owner, profile, args.nombre.trim(), cents(args.monto), today()).run(); return null; }
  if (name === "eliminar_ahorro") { await db.prepare("DELETE FROM savings WHERE id=? AND owner_email=? AND profile_id=?").bind(args.id, owner, profile).run(); return null; }
  if (name === "guardar_presupuesto") { validAmount("Presupuesto", args.monto); await db.prepare("INSERT INTO budgets (owner_email,profile_id,year,month,amount_cents) VALUES (?,?,?,?,?) ON CONFLICT(owner_email,profile_id,year,month) DO UPDATE SET amount_cents=excluded.amount_cents,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(owner, profile, args.anio, args.mes, cents(args.monto)).run(); return null; }
  if (name === "obtener_presupuesto") { const row = await db.prepare("SELECT amount_cents FROM budgets WHERE owner_email=? AND profile_id=? AND year=? AND month=?").bind(owner, profile, args.anio, args.mes).first(); return row ? { anio: args.anio, mes: args.mes, monto: money(row.amount_cents) } : null; }
  if (name === "obtener_resumen_mes") return summary(db, owner, profile, args);
  if (name === "obtener_dispensador_dia") { const result = await summary(db, owner, profile, args); const row = await db.prepare("SELECT amount_cents FROM budgets WHERE owner_email=? AND profile_id=? AND year=? AND month=?").bind(owner, profile, args.anio, args.mes).first(); const presupuesto_mes = row ? money(row.amount_cents) : 0; const todaySpent = (await movements(db, owner, profile, "gasto", args)).filter((item) => item.fecha === today()).reduce((sum, item) => sum + item.monto, 0); const days = Math.max(1, new Date(args.anio, args.mes, 0).getDate() - new Date().getDate() + 1); const limite_hoy = Math.max(0, presupuesto_mes - result.total_gastos) / days; return { presupuesto_mes, gastado_mes: result.total_gastos, dias_restantes: days, limite_hoy, gastado_hoy: todaySpent, porcentaje_hoy: limite_hoy ? todaySpent * 100 / limite_hoy : 0, alerta: !presupuesto_mes ? "sin_presupuesto" : result.total_gastos > presupuesto_mes ? "advertencia" : "ok" }; }
  if (name === "obtener_prediccion_ml") { const result = await summary(db, owner, profile, args); const budget = await db.prepare("SELECT amount_cents FROM budgets WHERE owner_email=? AND profile_id=? AND year=? AND month=?").bind(owner, profile, args.anio, args.mes).first(); const monto = budget ? money(budget.amount_cents) : 0; return { presupuesto_definido: Boolean(budget), proyeccion_mes: result.total_gastos, diferencia_vs_presupuesto: monto - result.total_gastos, confianza: 0, promedio_diario: 0, compromisos_pendientes: [], desglose_proyectado: result.gastos_por_categoria }; }
  if (name === "obtener_mensaje_manana") return null;
  throw new HttpError(404, "Acción no disponible.");
}

async function receipt(request, env, owner, movementId) {
  const contentType = request.headers.get("content-type")?.split(";")[0]; const size = Number(request.headers.get("content-length") || 0); const name = request.headers.get("x-file-name") || "comprobante";
  if (!MIME_TYPES.has(contentType)) throw new HttpError(415, "Solo se aceptan PDF, JPG, PNG y WebP.");
  if (!size || size > Number(env.MAX_RECEIPT_BYTES || 10485760)) throw new HttpError(413, "El comprobante no puede superar 10 MB.");
  const exists = await env.DB.prepare("SELECT id FROM movements WHERE id=? AND owner_email=?").bind(movementId, owner).first(); if (!exists) throw new HttpError(404, "Movimiento no encontrado.");
  const receiptId = uid(); const objectKey = `${owner}/${movementId}/${receiptId}`;
  await env.RECEIPTS.put(objectKey, request.body, { httpMetadata: { contentType }, customMetadata: { originalName: name } });
  await env.DB.prepare("INSERT INTO receipts (id,movement_id,owner_email,object_key,original_name,content_type,byte_size) VALUES (?,?,?,?,?,?,?)").bind(receiptId, movementId, owner, objectKey, name, contentType, size).run();
  return { id: receiptId, name };
}

export default { async fetch(request, env) {
  const headers = cors(request, env); if (!headers) return json({ error: "Origen no autorizado." }, 403); if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try { const url = new URL(request.url); if (request.method === "GET" && url.pathname === "/v1/health") return json({ status: "ok", service: "mis-finanzas-api" }, 200, headers); const owner = actor(request, env); const commandMatch = url.pathname.match(/^\/v1\/commands\/([a-z_]+)$/); const receiptMatch = url.pathname.match(/^\/v1\/movements\/([\w-]+)\/receipt$/); let result; if (commandMatch && request.method === "POST") result = await command(request, env, owner, commandMatch[1]); else if (receiptMatch && request.method === "POST") result = await receipt(request, env, owner, receiptMatch[1]); else throw new HttpError(404, "Ruta no encontrada."); return json({ result }, 200, headers); }
  catch (error) { return json({ error: error instanceof HttpError ? error.message : "Error interno del servicio." }, error instanceof HttpError ? error.status : 500, headers); }
} };
