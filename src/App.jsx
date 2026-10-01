import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { invoke as platformInvoke } from "./platform/invoke";
async function invoke(command, args) {
  try { return await platformInvoke(command, args); }
  catch (error) {
    window.dispatchEvent(new CustomEvent("app-error", { detail: String(error) }));
    throw error;
  }
}
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  PlusCircle, Trash2, TrendingUp, TrendingDown, PiggyBank,
  LayoutDashboard, ShoppingCart, DollarSign, ChevronLeft, ChevronRight,
  Target, Brain, Receipt, Users, Plus, Pencil, Check, X, Download, ChevronRight as Arrow
} from "lucide-react";
// Hook para detectar y cambiar modo oscuro/claro
function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme-mode");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    if (isDark) {
      document.body.classList.remove("light-mode");
    } else {
      document.body.classList.add("light-mode");
    }
    localStorage.setItem("theme-mode", isDark ? "dark" : "light");
  }, [isDark]);

  return { isDark, toggleTheme: () => setIsDark(prev => !prev) };
}
// ── Paleta de colores ─────────────────────────────────────────────────────────
const COLORS = ["#6366f1","#22d3ee","#f59e0b","#10b981","#f43f5e","#a855f7","#fb923c","#84cc16"];
const CATEGORIAS = ["Alimentación","Transporte","Vivienda","Salud","Educación","Entretenimiento","Ropa","Otros"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const fmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n || 0);
function hoy() {
  const d = new Date();
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

// ── PERFILES ──────────────────────────────────────────────────────────────────
// Metadata (nombre/emoji/color) → localStorage.
// Datos reales → cada perfil tiene su propio archivo .db en Rust.
// cambiar_perfil() en Rust abre/crea la DB correcta y la asigna al pool activo.
function usePerfiles() {
  const [perfiles, setPerfiles]         = useState([]);
  const [perfilActivo, setPerfilActivo] = useState(null);
  // iniciando=true durante carga inicial; cambiando=true durante cambio de perfil
  const [cambiando, setCambiando]       = useState(false);
  const [iniciando, setIniciando]       = useState(true);

  useEffect(() => {
    let guardados = [];
    try {
      const datos = JSON.parse(localStorage.getItem("perfiles") || "[]");
      if (Array.isArray(datos)) guardados = datos.filter(p => p && typeof p.id === "string" && typeof p.nombre === "string");
    } catch { /* Mantener el arranque posible si la metadata local está dañada. */ }
    if (guardados.length === 0) {
      const defecto = [{ id: "personal", nombre: "Personal", color: "#6366f1", emoji: "🏠" }];
      localStorage.setItem("perfiles", JSON.stringify(defecto));
      setPerfiles(defecto);
      invoke("cambiar_perfil", { nombrePerfil: "personal" })
        .then(() => { setPerfilActivo(defecto[0]); })
        .catch(e => { console.error("init perfil:", e); })
        .finally(() => { setIniciando(false); });
    } else {
      setPerfiles(guardados);
      const activoId = localStorage.getItem("perfil_activo");
      const encontrado = guardados.find(p => p.id === activoId) || guardados[0];
      invoke("cambiar_perfil", { nombrePerfil: encontrado.id })
        .then(() => { setPerfilActivo(encontrado); })
        .catch(e => { console.error("init perfil:", e); })
        .finally(() => { setIniciando(false); });
    }
  }, []);

  const guardarPerfiles = (nuevos) => {
    localStorage.setItem("perfiles", JSON.stringify(nuevos));
    setPerfiles(nuevos);
  };

  const cambiarPerfil = async (perfil) => {
    if (cambiando) return;
    setCambiando(true);
    try {
      await invoke("cambiar_perfil", { nombrePerfil: perfil.id });
      localStorage.setItem("perfil_activo", perfil.id);
      setPerfilActivo(perfil);
      return true;
    } catch (e) {
      console.error("Error cambiando perfil:", e);
      return false;
    } finally {
      setCambiando(false);
    }
  };


  const agregarPerfil = async (nombre, emoji = "💼", color = "#6366f1") => {
    // El id es el slug del nombre — Rust lo usa como nombre del archivo .db
    const id = nombre.trim().toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || ("perfil_" + Date.now());
    if (perfiles.some(p => p.id === id)) throw new Error("Ya existe un perfil con ese nombre");
    const nuevo = { id, nombre, emoji, color };
    // Crear e inicializar la DB del nuevo perfil, luego activarlo
    setCambiando(true);
    try {
      await invoke("cambiar_perfil", { nombrePerfil: id });
      guardarPerfiles([...perfiles, nuevo]);
      localStorage.setItem("perfil_activo", id);
      setPerfilActivo(nuevo);
    } catch (e) {
      throw e;
    } finally { setCambiando(false); }
    return nuevo;
  };

  const editarPerfil = (id, datos) => {
    // Solo metadata visual — el archivo .db no cambia de nombre
    const nuevos = perfiles.map(p => p.id === id ? { ...p, ...datos } : p);
    guardarPerfiles(nuevos);
    if (perfilActivo?.id === id) setPerfilActivo(prev => ({ ...prev, ...datos }));
  };
  const eliminarPerfil = async (id) => {
    if (perfiles.length <= 1) return;
    const nuevos = perfiles.filter(p => p.id !== id);
    if (perfilActivo?.id === id && !await cambiarPerfil(nuevos[0])) return;
    guardarPerfiles(nuevos);
  };

  return { perfiles, perfilActivo, cambiando, iniciando, cambiarPerfil, agregarPerfil, editarPerfil, eliminarPerfil };
}

// ── MODAL PERFILES ────────────────────────────────────────────────────────────
const EMOJIS = ["🏠","💼","🏢","🚗","🌙","🎯","💡","🏋️","🎓","🛒","✈️","🎮"];
const COLORES_PERFIL = ["#6366f1","#10b981","#f59e0b","#f43f5e","#22d3ee","#a855f7","#fb923c","#84cc16"];

function ModalPerfiles({ perfiles, perfilActivo, onCambiar, onAgregar, onEditar, onEliminar, onCerrar }) {
  const [modo, setModo] = useState("lista"); // lista | nuevo | editar
  const [nombre, setNombre] = useState("");
  const [emoji, setEmoji] = useState("💼");
  const [color, setColor] = useState("#6366f1");
  const [editandoId, setEditandoId] = useState(null);

  const iniciarEdicion = (p) => {
    setEditandoId(p.id);
    setNombre(p.nombre);
    setEmoji(p.emoji);
    setColor(p.color);
    setModo("editar");
  };

  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const guardar = async () => {
    if (!nombre.trim() || guardandoPerfil) return;
    setGuardandoPerfil(true);
    try {
      if (modo === "nuevo") await onAgregar(nombre.trim(), emoji, color);
      else onEditar(editandoId, { nombre:nombre.trim(), emoji, color });
      setNombre(""); setEmoji("💼"); setColor("#6366f1"); setModo("lista");
    } catch (e) { window.dispatchEvent(new CustomEvent("app-error", {detail:String(e)})); }
    finally { setGuardandoPerfil(false); }
  };

  return (
    <div style={{
      position:"fixed",inset:0,background:"#000000aa",zIndex:1000,
      display:"flex",alignItems:"center",justifyContent:"center"
    }} onClick={onCerrar}>
      <div style={{
        background:"var(--bg2)",borderRadius:20,padding:"1.5rem",width:380,maxWidth:"calc(100vw - 24px)",maxHeight:"90dvh",overflowY:"auto",
        border:"1px solid var(--border)",boxShadow:"0 25px 50px #000000aa"
      }} onClick={e=>e.stopPropagation()}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"var(--text)"}}>
            {modo === "lista" ? "Perfiles" : modo === "nuevo" ? "Nuevo perfil" : "Editar perfil"}
          </h2>
          <button onClick={onCerrar} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:18}}>✕</button>
        </div>

        {modo === "lista" && (
          <>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:"1rem"}}>
              {perfiles.map(p => (
                <div key={p.id} style={{
                  display:"flex",alignItems:"center",gap:12,padding:"0.75rem 1rem",
                  borderRadius:12,background: perfilActivo?.id===p.id ? p.color+"22" : "var(--bg)",
                  border:`1px solid ${perfilActivo?.id===p.id ? p.color+"66" : "var(--bg2)"}`,
                  cursor:"pointer",transition:"all 0.15s"
                }} onClick={async () => { await onCambiar(p); onCerrar(); }}>
                  <span style={{fontSize:20}}>{p.emoji}</span>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:"var(--text)"}}>{p.nombre}</span>
                  {perfilActivo?.id===p.id && <span style={{fontSize:11,color:p.color,fontWeight:700}}>Activo</span>}
                  <button onClick={e=>{e.stopPropagation();iniciarEdicion(p);}} style={{
                    background:"none",border:"none",color:"var(--muted)",cursor:"pointer",padding:"2px 4px",borderRadius:6,
                    transition:"color .15s"
                  }} title="Editar"><Pencil size={13}/></button>
                  {perfiles.length > 1 && (
                    <button onClick={e=>{e.stopPropagation();onEliminar(p.id);}} style={{
                      background:"none",border:"none",color:"var(--muted)",cursor:"pointer",padding:"2px 4px",borderRadius:6
                    }} title="Eliminar"><Trash2 size={13}/></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={()=>{setNombre("");setEmoji("💼");setColor("#6366f1");setModo("nuevo");}} style={{
              width:"100%",padding:"0.75rem",background:"#6366f120",border:"1px dashed #6366f144",
              borderRadius:12,color:"#6366f1",fontWeight:600,cursor:"pointer",fontSize:13,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6
            }}>
              <Plus size={15}/> Crear nuevo perfil
            </button>
          </>
        )}

        {(modo === "nuevo" || modo === "editar") && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:12,color:"var(--muted)",marginBottom:6,display:"block"}}>NOMBRE DEL PERFIL</label>
              <input
                autoFocus
                value={nombre}
                onChange={e=>setNombre(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&guardar()}
                placeholder="Ej: Gastos Casa, Oficina, Viaje..."
                style={{width:"100%",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:10,
                  padding:"0.75rem",color:"var(--text)",fontSize:14,outline:"none"}}
              />
            </div>
            <div>
              <label style={{fontSize:12,color:"var(--muted)",marginBottom:6,display:"block"}}>ÍCONO</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {EMOJIS.map(e=>(
                  <button key={e} onClick={()=>setEmoji(e)} style={{
                    width:36,height:36,borderRadius:8,border:`2px solid ${emoji===e?"#6366f1":"transparent"}`,
                    background: emoji===e?"#6366f120":"var(--bg)",cursor:"pointer",fontSize:18,
                    display:"flex",alignItems:"center",justifyContent:"center"
                  }}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{fontSize:12,color:"var(--muted)",marginBottom:6,display:"block"}}>COLOR</label>
              <div style={{display:"flex",gap:8}}>
                {COLORES_PERFIL.map(c=>(
                  <button key={c} onClick={()=>setColor(c)} style={{
                    width:28,height:28,borderRadius:6,background:c,border:`3px solid ${color===c?"#fff":"transparent"}`,
                    cursor:"pointer",outline:"none"
                  }}/>
                ))}
              </div>
            </div>
            {/* Preview */}
            <div style={{
              display:"flex",alignItems:"center",gap:12,padding:"0.75rem 1rem",
              borderRadius:12,background:color+"22",border:`1px solid ${color}66`
            }}>
              <span style={{fontSize:22}}>{emoji}</span>
              <span style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{nombre || "Mi perfil"}</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModo("lista")} style={{
                flex:1,padding:"0.75rem",background:"var(--bg)",border:"1px solid var(--border)",
                borderRadius:10,color:"var(--muted)",cursor:"pointer",fontWeight:600
              }}>Cancelar</button>
              <button onClick={guardar} style={{
                flex:2,padding:"0.75rem",background:color,border:"none",
                borderRadius:10,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14
              }}>
                {modo==="nuevo"?"Crear perfil":"Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SIDEBAR ESTILO BBVA ───────────────────────────────────────────────────────
// Se expande al hacer hover / focus, se contrae al salir
function Sidebar({ tab, setTab, tabs, perfilActivo, onAbrirPerfiles }) {
  const [expandido, setExpandido] = useState(false);
  const sidebarRef = useRef(null);
  const timerRef = useRef(null);

  const entrar = () => {
    clearTimeout(timerRef.current);
    setExpandido(true);
  };
  const salir = () => {
    timerRef.current = setTimeout(() => setExpandido(false), 180);
  };

  const accentColor = perfilActivo?.color || "#6366f1";

  return (
    <aside
      className="sidebar"
      ref={sidebarRef}
      onMouseEnter={entrar}
      onMouseLeave={salir}
      onFocus={entrar}
      onBlur={salir}
      style={{
        position:"fixed",top:0,left:0,bottom:0,
        width: expandido ? 220 : 64,
        background:"var(--bg2)",
        borderRight:"1px solid var(--border)",
        display:"flex",flexDirection:"column",
        transition:"width 0.25s cubic-bezier(0.4,0,0.2,1)",
        overflow:"hidden",
        paddingTop:"var(--safe-top)",
        zIndex:100,
        boxShadow: expandido ? "4px 0 24px #00000044" : "none",
      }}
    >
      {/* Logo / Perfil activo */}
      <div style={{
        display:"flex",alignItems:"center",gap:10,
        padding:"1.25rem 0",paddingLeft:16,
        borderBottom:"1px solid var(--border)",
        minHeight:64,flexShrink:0
      }}>
        <div style={{
          width:32,height:32,borderRadius:10,flexShrink:0,
          background: accentColor + "33",
          border:`2px solid ${accentColor}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:16,transition:"all 0.2s"
        }}>
          {perfilActivo?.emoji || "💰"}
        </div>
        <div style={{
          opacity: expandido ? 1 : 0,
          transform: expandido ? "translateX(0)" : "translateX(-8px)",
          transition:"opacity 0.2s, transform 0.2s",
          whiteSpace:"nowrap",overflow:"hidden"
        }}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--text)",lineHeight:1.2}}>{perfilActivo?.nombre || "MisFinanzas"}</div>
          <div style={{fontSize:10,color:"var(--muted)",marginTop:1}}>Perfil activo</div>
        </div>
      </div>

      {/* Navegación */}
      <nav style={{flex:1,padding:"0.75rem 0",display:"flex",flexDirection:"column",gap:2}}>
        {tabs.map(t => {
          const activo = tab === t.id;
          return (
            <Fragment key={t.id}>
              <button aria-label={t.label} title={t.label} onClick={() => { setTab(t.id); setExpandido(false); }} style={{
                display:"flex",alignItems:"center",gap:12,
                padding:"0 0 0 16px",height:44,
                border:"none",background:"transparent",cursor:"pointer",
                position:"relative",
                color: activo ? accentColor : "var(--muted)",
                transition:"color 0.15s",
                textAlign:"left",width:"100%",
              }}>
                {/* Línea activa lateral */}
                <div style={{
                  position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",
                  width:3,height: activo ? 24 : 0,
                  background:accentColor,borderRadius:"0 3px 3px 0",
                  transition:"height 0.2s cubic-bezier(0.4,0,0.2,1)"
                }}/>
                {/* Ícono con fondo al estar activo */}
                <div style={{
                  width:32,height:32,borderRadius:8,flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  background: activo ? accentColor + "20" : "transparent",
                  transition:"background 0.15s"
                }}>
                  <t.icon size={18}/>
                </div>
                {/* Label */}
                <span style={{
                  fontSize:13,fontWeight: activo ? 700 : 500,
                  opacity: expandido ? 1 : 0,
                  transform: expandido ? "translateX(0)" : "translateX(-8px)",
                  transition:"opacity 0.18s, transform 0.18s",
                  whiteSpace:"nowrap"
                }}>{t.label}</span>
              </button>
              {t.id === "compromisos" && (
                <button onClick={onAbrirPerfiles} style={{
                  display:"flex",alignItems:"center",gap:12,
                  padding:"0 0 0 16px",height:44,
                  border:"none",background:"transparent",cursor:"pointer",
                  color:"var(--muted)",width:"100%",
                  transition:"color 0.15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.color="var(--text)"}
                  onMouseLeave={e=>e.currentTarget.style.color="var(--muted)"}
                >
                  <div style={{
                    width:32,height:32,borderRadius:8,flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center"
                  }}>
                    <Users size={18}/>
                  </div>
                  <span style={{
                    fontSize:13,fontWeight:500,
                    opacity: expandido ? 1 : 0,
                    transform: expandido ? "translateX(0)" : "translateX(-8px)",
                    transition:"opacity 0.18s, transform 0.18s",
                    whiteSpace:"nowrap"
                  }}>Cambiar perfil</span>
                </button>

              )}
            </Fragment>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Tarjeta de resumen ────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="stat-card" style={{ "--accent": color }}>
      <div className="stat-icon"><Icon size={22} /></div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{fmt(value)}</span>
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ── Formulario de gasto ───────────────────────────────────────────────────────
function FormGasto({ onGuardado }) {
  const [desc, setDesc] = useState("");
  const [monto, setMonto] = useState("");
  const [cat, setCat] = useState(CATEGORIAS[0]);
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    if (!desc.trim() || !monto || !Number.isFinite(Number(monto)) || Number(monto) <= 0) {
      setError("Escribe una descripción y un monto mayor que cero.");
      return;
    }
    setCargando(true);
    try {
      await invoke("agregar_gasto", { descripcion: desc, monto: parseFloat(monto), categoria: cat });
      setDesc(""); setMonto(""); setError(""); setOk(true);
      setTimeout(() => setOk(false), 1500);
      onGuardado();
    } catch (e) { console.error(e); setError("No se pudo guardar el gasto. Inténtalo de nuevo."); }
    setCargando(false);
  }

  return (
    <div className="form-card">
      <h3 className="form-title"><ShoppingCart size={16}/> Registrar gasto</h3>
      <div className="form-grid">
        <input className="inp" placeholder="Descripción" value={desc} onChange={e => setDesc(e.target.value)} />
        <input className="inp" placeholder="Monto" type="number" value={monto} onChange={e => setMonto(e.target.value)} />
        <select className="inp" value={cat} onChange={e => setCat(e.target.value)}>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
        <button className={`btn btn-danger ${ok ? "btn-ok" : ""}`} onClick={guardar} disabled={cargando}>
          {ok ? "✓ Guardado" : cargando ? "Guardando…" : "Agregar gasto"}
        </button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  );
}

// ── Formulario de ingreso ─────────────────────────────────────────────────────
function FormIngreso({ onGuardado }) {
  const [desc, setDesc] = useState("");
  const [monto, setMonto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    if (!desc.trim() || !monto || !Number.isFinite(Number(monto)) || Number(monto) <= 0) {
      setError("Escribe una descripción y un monto mayor que cero.");
      return;
    }
    setCargando(true);
    try {
      await invoke("agregar_ingreso", { descripcion: desc, monto: parseFloat(monto) });
      setDesc(""); setMonto(""); setError(""); setOk(true);
      setTimeout(() => setOk(false), 1500);
      onGuardado();
    } catch (e) { console.error(e); setError("No se pudo guardar el ingreso. Inténtalo de nuevo."); }
    setCargando(false);
  }

  return (
    <div className="form-card">
      <h3 className="form-title"><DollarSign size={16}/> Registrar ingreso</h3>
      <div className="form-grid">
        <input className="inp" placeholder="Descripción" value={desc} onChange={e => setDesc(e.target.value)} />
        <input className="inp" placeholder="Monto" type="number" value={monto} onChange={e => setMonto(e.target.value)} />
        <button className={`btn btn-success ${ok ? "btn-ok" : ""}`} onClick={guardar} disabled={cargando} style={{gridColumn:"span 1"}}>
          {ok ? "✓ Guardado" : cargando ? "Guardando…" : "Agregar ingreso"}
        </button>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  );
}

// ── Lista de transacciones ────────────────────────────────────────────────────
function ListaGastos({ gastos, onActualizar }) {
  const [editando, setEditando] = useState(null);
  const iniciarEdicion = gasto => setEditando({...gasto, monto:String(gasto.monto)});
  const cambiar = (campo, valor) => setEditando(actual => ({...actual, [campo]:valor}));
  const guardar = async () => {
    const monto = Number(editando?.monto);
    if (!editando?.descripcion.trim() || !Number.isFinite(monto) || monto <= 0 || !editando.fecha) return;
    await invoke("actualizar_gasto", {id:editando.id, descripcion:editando.descripcion.trim(), monto, categoria:editando.categoria, fecha:editando.fecha});
    setEditando(null);
    await onActualizar();
  };
  const eliminar = async gasto => {
    await invoke("eliminar_gasto", {id:gasto.id});
    if (editando?.id === gasto.id) setEditando(null);
    await onActualizar();
  };
  if (!gastos.length) return <p className="empty">No hay gastos este mes</p>;
  return (
    <div className="lista">
      {gastos.map(g => (
        editando?.id === g.id ? <div key={g.id} className="lista-item lista-item-editing">
          <div className="inline-edit-grid expense-edit">
            <input className="inp" aria-label="Descripción del gasto" value={editando.descripcion} onChange={e=>cambiar("descripcion",e.target.value)}/>
            <input className="inp" aria-label="Monto del gasto" type="number" min="0.01" step="0.01" value={editando.monto} onChange={e=>cambiar("monto",e.target.value)}/>
            <select className="inp" aria-label="Categoría del gasto" value={editando.categoria} onChange={e=>cambiar("categoria",e.target.value)}>
              {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
            </select>
            <input className="inp" aria-label="Fecha del gasto" type="date" value={editando.fecha} onChange={e=>cambiar("fecha",e.target.value)}/>
          </div>
          <div className="edit-actions">
            <button className="btn-icon edit-save" aria-label="Guardar cambios del gasto" onClick={guardar}><Check size={17}/></button>
            <button className="btn-icon" aria-label="Cancelar edición del gasto" onClick={()=>setEditando(null)}><X size={17}/></button>
          </div>
        </div> : <div key={g.id} className="lista-item">
          <div className="lista-item-info">
            <span className="lista-item-cat">{g.categoria}</span>
            <span className="lista-item-desc">{g.descripcion}</span>
            <span className="lista-item-fecha">{g.fecha}</span>
          </div>
          <div className="lista-item-right">
            <span className="lista-item-monto">{fmt(g.monto)}</span>
            <button className="btn-icon edit-button" aria-label={`Editar gasto ${g.descripcion}`} onClick={()=>iniciarEdicion(g)}><Pencil size={14}/></button>
            <button className="btn-icon" aria-label={`Eliminar gasto ${g.descripcion}`} onClick={()=>eliminar(g)}><Trash2 size={14}/></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaIngresos({ ingresos, onActualizar }) {
  const [editando, setEditando] = useState(null);
  const iniciarEdicion = ingreso => setEditando({...ingreso, monto:String(ingreso.monto)});
  const cambiar = (campo, valor) => setEditando(actual => ({...actual, [campo]:valor}));
  const guardar = async () => {
    const monto = Number(editando?.monto);
    if (!editando?.descripcion.trim() || !Number.isFinite(monto) || monto <= 0 || !editando.fecha) return;
    await invoke("actualizar_ingreso", {id:editando.id, descripcion:editando.descripcion.trim(), monto, fecha:editando.fecha});
    setEditando(null);
    await onActualizar();
  };
  const eliminar = async ingreso => {
    await invoke("eliminar_ingreso", {id:ingreso.id});
    if (editando?.id === ingreso.id) setEditando(null);
    await onActualizar();
  };
  if (!ingresos.length) return <p className="empty">No hay ingresos este mes</p>;
  return (
    <div className="lista">
      {ingresos.map(i => (
        editando?.id === i.id ? <div key={i.id} className="lista-item lista-item-editing">
          <div className="inline-edit-grid income-edit">
            <input className="inp" aria-label="Descripción del ingreso" value={editando.descripcion} onChange={e=>cambiar("descripcion",e.target.value)}/>
            <input className="inp" aria-label="Monto del ingreso" type="number" min="0.01" step="0.01" value={editando.monto} onChange={e=>cambiar("monto",e.target.value)}/>
            <input className="inp" aria-label="Fecha del ingreso" type="date" value={editando.fecha} onChange={e=>cambiar("fecha",e.target.value)}/>
          </div>
          <div className="edit-actions">
            <button className="btn-icon edit-save" aria-label="Guardar cambios del ingreso" onClick={guardar}><Check size={17}/></button>
            <button className="btn-icon" aria-label="Cancelar edición del ingreso" onClick={()=>setEditando(null)}><X size={17}/></button>
          </div>
        </div> : <div key={i.id} className="lista-item">
          <div className="lista-item-info">
            <span className="lista-item-cat" style={{background:"#10b98120",color:"#10b981"}}>Ingreso</span>
            <span className="lista-item-desc">{i.descripcion}</span>
            <span className="lista-item-fecha">{i.fecha}</span>
          </div>
          <div className="lista-item-right">
            <span className="lista-item-monto" style={{color:"#10b981"}}>{fmt(i.monto)}</span>
            <button className="btn-icon edit-button" aria-label={`Editar ingreso ${i.descripcion}`} onClick={()=>iniciarEdicion(i)}><Pencil size={14}/></button>
            <button className="btn-icon" aria-label={`Eliminar ingreso ${i.descripcion}`} onClick={()=>eliminar(i)}><Trash2 size={14}/></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Gráficos ──────────────────────────────────────────────────────────────────
// Hook para detectar ancho de pantalla
function useAncho() {
  // Devuelve el ancho ÚTIL (total - sidebar colapsada de 64px)
  const anchoUtil = () => (typeof window !== "undefined" ? window.innerWidth : 1024) - 64;
  const [ancho, setAncho] = useState(anchoUtil);
  useEffect(() => {
    const handler = () => setAncho(anchoUtil());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return ancho;
}

function Graficos({ resumen, gastos, ingresos, dispensador, prediccion, compromisos, onAbrirCompromisos, onAbrirPerfiles }) {
  const fmtLocal = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n||0);
  const ancho = useAncho();
  // El sidebar colapsado mide 64px; en móvil vertical la pantalla útil es ~360-420px
  // esMobil = pantalla útil menor a 520px (cubre todos los teléfonos en vertical)
  const esMobil = ancho < 520;

  const dataResumen = [
    { name: "Ingresos", value: resumen.total_ingresos },
    { name: "Gastos",   value: resumen.total_gastos },
    { name: "Saldo",   value: resumen.total_ahorrado },
  ];

  const limiteHoy = dispensador?.limite_hoy || 0;
  const gastadoHoy = dispensador?.gastado_hoy || 0;
  const disponibleHoy = Math.max(0, limiteHoy - gastadoHoy);
  const dataDispensador = [
    { name: "Gastado hoy", valor: gastadoHoy },
    { name: "Disponible",  valor: disponibleHoy },
  ];

  const presupuestoMes = dispensador?.presupuesto_mes || 0;
  const proyeccion = prediccion?.proyeccion_mes || 0;
  const gastadoMes = resumen.total_gastos || 0;
  const dataML = [
    { name: "Gastado", valor: gastadoMes },
    { name: "Proyectado", valor: Math.max(0, proyeccion - gastadoMes) },
    { name: "Presupuesto", valor: presupuestoMes },
  ];

  const totalCompromisos = (prediccion?.compromisos_pendientes || []).reduce((s, c) => s + c.monto, 0);
  const saldoLibre = Math.max(0, (presupuestoMes - gastadoMes) - totalCompromisos);
  const dataCompromisos = [
    { name: "Compromisos", value: totalCompromisos, fill: "#f43f5e" },
    { name: "Libre",       value: saldoLibre,       fill: "#10b981" },
  ];

  const colores = ["#6366f1","#10b981","#f59e0b","#f43f5e","#a855f7","#22d3ee","#84cc16"];
  const dataCateg = resumen.gastos_por_categoria.map((g, i) => ({
    name: g.categoria, value: g.total, fill: colores[i % colores.length]
  }));

  const card = {
    background:"var(--panel)", borderRadius:14,
    padding: esMobil ? "1rem" : "1.25rem",
    border:"1px solid var(--border)"
  };
  const titulo = {
    fontSize:11, fontWeight:700, color:"var(--muted)",
    marginBottom:"0.875rem", textTransform:"uppercase", letterSpacing:"0.06em"
  };
  // Altura de gráficos: más corta en móvil para que quepan sin scroll excesivo
  const hBar  = esMobil ? 160 : 180;
  const hPie  = esMobil ? 150 : 180;
  // Radio del donut: más pequeño en móvil
  const pieInner  = esMobil ? 38 : 50;
  const pieOuter  = esMobil ? 62 : 80;

  // ── Tarjetas de stats compactas para dispensador y compromisos en móvil ────
  const StatRow = ({ items }) => (
    <div style={{
      display:"grid",
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      gap:8, marginTop:10
    }}>
      {items.map(([label, value, color]) => (
        <div key={label} style={{background:"var(--bg)",borderRadius:10,padding:"0.6rem 0.5rem",textAlign:"center"}}>
          <div style={{fontSize:10,color:"var(--muted)",marginBottom:3}}>{label}</div>
          <div style={{fontSize:esMobil?13:15,fontWeight:700,color: color||"var(--text)",lineHeight:1.2}}>{value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{
      display:"grid",
      gridTemplateColumns: esMobil ? "1fr" : "1fr 1fr",
      gap: esMobil ? 12 : 16,
      marginTop:12
    }}>

      {/* 1. Resumen del mes — barra horizontal */}
      <div style={card}>
        <div style={titulo}>Resumen del mes</div>
        <ResponsiveContainer width="100%" height={hBar}>
          <BarChart data={dataResumen} barSize={esMobil ? 30 : 40} margin={{left:-10,right:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10"/>
            <XAxis dataKey="name" tick={{fill:"var(--muted)",fontSize:esMobil?10:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"var(--muted)",fontSize:9}} axisLine={false} tickLine={false}
              tickFormatter={v=>"$"+Math.round(v/1000000)+"M"} width={36}/>
            <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
            <Bar dataKey="value" radius={[4,4,0,0]}>
              {dataResumen.map((_, i) => <Cell key={i} fill={["#10b981","#f43f5e","#6366f1"][i]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 2. Dispensador del día */}
      <div style={card}>
        <div style={titulo}>💰 Dispensador del día</div>
        {esMobil ? (
          // Móvil: donut centrado + 3 stats abajo
          <>
            <ResponsiveContainer width="100%" height={hPie}>
              <PieChart>
                <Pie data={dataDispensador} dataKey="valor" cx="50%" cy="50%"
                  innerRadius={pieInner} outerRadius={pieOuter} paddingAngle={3}>
                  <Cell fill="#ef4444"/><Cell fill="#22d3ee"/>
                </Pie>
                <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
            <StatRow items={[
              ["Límite hoy",   fmtLocal(limiteHoy),     "#22d3ee"],
              ["Gastado hoy",  fmtLocal(gastadoHoy),    "#ef4444"],
              ["Disponible",   fmtLocal(disponibleHoy), "#10b981"],
            ]}/>
          </>
        ) : (
          // Desktop: donut izquierda + stats derecha
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <ResponsiveContainer width="50%" height={hPie}>
              <PieChart>
                <Pie data={dataDispensador} dataKey="valor" cx="50%" cy="50%"
                  innerRadius={pieInner} outerRadius={pieOuter} paddingAngle={3}>
                  <Cell fill="#ef4444"/><Cell fill="#22d3ee"/>
                </Pie>
                <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8}}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{flex:1}}>
              {[["Límite hoy",fmtLocal(limiteHoy),"#22d3ee"],["Gastado hoy",fmtLocal(gastadoHoy),"#ef4444"],["Disponible",fmtLocal(disponibleHoy),"#10b981"]]
                .map(([label,value,color])=>(
                <div key={label} style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:"var(--muted)"}}>{label}</div>
                  <div style={{fontSize:20,fontWeight:700,color}}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Predicción Machine Learning */}
      <div style={card}>
        <div style={titulo}>🧠 Proyección según tus hábitos</div>
        <ResponsiveContainer width="100%" height={hBar}>
          <BarChart data={dataML} barSize={esMobil ? 28 : 35} margin={{left:-10,right:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10"/>
            <XAxis dataKey="name" tick={{fill:"var(--muted)",fontSize:esMobil?9:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"var(--muted)",fontSize:9}} axisLine={false} tickLine={false}
              tickFormatter={v=>"$"+Math.round(v/1000000)+"M"} width={36}/>
            <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,fontSize:12}}/>
            <Bar dataKey="valor" radius={[4,4,0,0]}>
              <Cell fill="#10b981"/><Cell fill="#f59e0b"/><Cell fill="#6366f1"/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:"var(--muted)",flexWrap:"wrap",gap:4}}>
          <span>Historial disponible: <strong style={{color:"#a78bfa"}}>{Math.round(prediccion?.confianza||0)}%</strong></span>
          <span style={{color: proyeccion > presupuestoMes ? "#ef4444" : "#10b981"}}>
            {!presupuestoMes ? "Define un presupuesto" : proyeccion > presupuestoMes ? "⚠ Riesgo de exceder presupuesto" : "✓ Dentro del presupuesto estimado"}
          </span>
        </div>
      </div>

      {/* 4. Compromisos vs Disponible */}
      <div style={card}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={titulo}>📋 Compromisos vs Disponible</div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
            <button onClick={onAbrirCompromisos} style={{padding:"0.45rem 0.8rem",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--muted)",fontSize:12,cursor:"pointer"}}>
              + Agregar compromiso
            </button>
            <button onClick={onAbrirPerfiles} style={{padding:"0.45rem 0.8rem",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--muted)",fontSize:12,cursor:"pointer"}}>
              Cambiar perfil
            </button>
          </div>
        </div>
        {esMobil ? (
          <>
            <ResponsiveContainer width="100%" height={hPie}>
              <PieChart>
                <Pie data={dataCompromisos} dataKey="value" cx="50%" cy="50%"
                  innerRadius={pieInner} outerRadius={pieOuter} paddingAngle={3}>
                  {dataCompromisos.map((d,i) => <Cell key={i} fill={d.fill}/>)}
                </Pie>
                <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
            {/* Lista compacta de compromisos */}
            <div style={{marginTop:8}}>
              {(prediccion?.compromisos_pendientes || []).slice(0,2).map(c=>(
                <div key={c.nombre} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{fontSize:12,color:"var(--text)"}}>{c.tipo==="cumple"?"🎂":c.tipo==="impuesto"?"🧾":"🔄"} {c.nombre}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"#f43f5e"}}>{fmtLocal(c.monto)}</div>
                </div>
              ))}
              {totalCompromisos === 0 && <div style={{fontSize:12,color:"var(--muted)",textAlign:"center",padding:"4px 0"}}>Sin pagos pendientes</div>}
              <div style={{marginTop:6,fontSize:12,color:"#10b981",fontWeight:700,textAlign:"right"}}>
                Libre: {fmtLocal(saldoLibre)}
              </div>
            </div>
          </>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <ResponsiveContainer width="50%" height={hPie}>
              <PieChart>
                <Pie data={dataCompromisos} dataKey="value" cx="50%" cy="50%"
                  innerRadius={pieInner} outerRadius={pieOuter} paddingAngle={3}>
                  {dataCompromisos.map((d,i) => <Cell key={i} fill={d.fill}/>)}
                </Pie>
                <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8}}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{flex:1}}>
              {(prediccion?.compromisos_pendientes || []).slice(0,3).map(c=>(
                <div key={c.nombre} style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid var(--border)"}}>
                  <div style={{fontSize:12,color:"var(--text)"}}>{c.tipo==="cumple"?"🎂":c.tipo==="impuesto"?"🧾":"🔄"} {c.nombre}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#f43f5e"}}>{fmtLocal(c.monto)}</div>
                </div>
              ))}
              {totalCompromisos === 0 && <div style={{fontSize:12,color:"var(--muted)"}}>Sin pagos pendientes</div>}
              <div style={{marginTop:8,fontSize:12,color:"#10b981",fontWeight:600}}>Libre: {fmtLocal(saldoLibre)}</div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Gastos por categoría — ocupa toda la fila */}
      <div style={{...card, gridColumn:"1 / -1"}}>
        <div style={titulo}>Gastos por categoría</div>
        {esMobil ? (
          // Móvil: pie arriba, leyenda abajo en grid 2 cols
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={dataCateg} dataKey="value" cx="50%" cy="50%" outerRadius={70} paddingAngle={3}>
                  {dataCateg.map((d,i) => <Cell key={i} fill={d.fill}/>)}
                </Pie>
                <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,fontSize:11}}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6,marginTop:10}}>
              {dataCateg.map(d=>(
                <div key={d.name} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",background:"var(--bg)",borderRadius:8}}>
                  <span style={{width:8,height:8,borderRadius:2,background:d.fill,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                    <div style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{fmtLocal(d.value)}</div>
                  </div>
                </div>
              ))}
              {dataCateg.length === 0 && <div style={{color:"var(--muted)",fontSize:12,gridColumn:"1/-1",textAlign:"center",padding:"8px 0"}}>Sin gastos este mes</div>}
            </div>
          </>
        ) : (
          // Desktop: pie izquierda + grid leyenda derecha
          <div style={{display:"flex",alignItems:"center",gap:24}}>
            <ResponsiveContainer width="30%" height={200}>
              <PieChart>
                <Pie data={dataCateg} dataKey="value" cx="50%" cy="50%" outerRadius={90} paddingAngle={3}>
                  {dataCateg.map((d,i) => <Cell key={i} fill={d.fill}/>)}
                </Pie>
                <Tooltip formatter={v=>fmtLocal(v)} contentStyle={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8}}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
              {dataCateg.map(d=>(
                <div key={d.name} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"var(--bg)",borderRadius:8}}>
                  <span style={{width:10,height:10,borderRadius:2,background:d.fill,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:"var(--muted)"}}>{d.name}</div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{fmtLocal(d.value)}</div>
                  </div>
                </div>
              ))}
              {dataCateg.length === 0 && <div style={{color:"var(--muted)",fontSize:13}}>Sin gastos este mes</div>}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

function BuenasDias({ data, visible }) {
  const [cerrado, setCerrado] = useState(false);
  if (!visible || !data || cerrado) return null;
  const fmtLocal = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  return (
    <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:16,padding:"1.25rem 1.5rem",marginBottom:"1.5rem",border:"1px solid #10b98133",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:15,fontWeight:600,color:"#34d399",marginBottom:6}}>☀️ Buenos días, {data.nombre_usuario}</div>
        <p style={{margin:0,fontSize:14,color:"#a7f3d0",lineHeight:1.5}}>
          Límite diario orientativo: <strong style={{color:"#fff"}}>{fmtLocal(data.limite_hoy)}</strong>.
          {data.gastado_ayer > 0 && ` Ayer gastaste ${fmtLocal(data.gastado_ayer)}.`}
        </p>
      </div>
      <button onClick={() => setCerrado(true)} style={{background:"none",border:"none",cursor:"pointer",color:"#6ee7b7",fontSize:18,padding:4}}>✕</button>
    </div>
  );
}

function DispensadorDia({ data, onRefresh, anio, mes }) {
  const [editando, setEditando] = useState(false);
  const [nuevoPres, setNuevoPres] = useState("");
  const guardarPres = async () => {
    const monto = Number(nuevoPres);
    if (!Number.isFinite(monto) || monto <= 0) return;
    await invoke("guardar_presupuesto", { anio, mes, monto });
    setEditando(false);
    setNuevoPres("");
    onRefresh();
  };
  if (!data) return <div style={{color:"var(--muted)",padding:"2rem",textAlign:"center"}}>Cargando...</div>;
  const fmtLocal = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  const pct = Math.min(100, data.porcentaje_hoy);
  const color = data.alerta === "ok" ? "#22d3ee" : data.alerta === "advertencia" ? "#f59e0b" : "#ef4444";
  return (
    <div style={{background:"var(--panel)",borderRadius:16,padding:"1.5rem",border:`2px solid ${color}22`,marginBottom:"1.5rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"var(--muted)"}}>💰 Dispensador del día</h3>
        <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:700,background:color+"22",color,textTransform:"uppercase"}}>
          {data.alerta === "ok" ? "En control" : data.alerta === "advertencia" ? "Cuidado" : "¡Excedido!"}
        </span>
      </div>
      <div style={{textAlign:"center",marginBottom:"1rem"}}>
        <div style={{fontSize:13,color:"var(--muted)",marginBottom:4}}>Puedes gastar hoy máximo</div>
        <div style={{fontSize:42,fontWeight:700,color}}>{fmtLocal(data.limite_hoy)}</div>
      </div>
      <div style={{background:"var(--bg)",borderRadius:8,height:10,marginBottom:8,overflow:"hidden"}}>
        <div style={{width:pct+"%",height:"100%",background:color,borderRadius:8,transition:"width 0.5s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--muted)",marginBottom:"1rem"}}>
        <span>Gastado hoy: {fmtLocal(data.gastado_hoy)}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:"1rem"}}>
        {[["Presupuesto mes",fmtLocal(data.presupuesto_mes)],["Gastado mes",fmtLocal(data.gastado_mes)],["Días restantes",data.dias_restantes]].map(([label,value])=>(
          <div key={label} style={{background:"var(--bg)",borderRadius:10,padding:"0.75rem",textAlign:"center"}}>
            <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>{label}</div>
            <div style={{fontSize:15,fontWeight:600,color:"var(--text)"}}>{value}</div>
          </div>
        ))}
      </div>
      <section className="budget-editor" aria-labelledby="budget-title">
        <div className="budget-editor-heading">
          <span className="budget-editor-icon" aria-hidden="true">🎯</span>
          <div>
            <h4 id="budget-title">Presupuesto mensual</h4>
            <p>Es el máximo que planeas gastar durante este mes.</p>
          </div>
        </div>
        <div className="budget-explanation">
          <strong>¿Para qué se usa?</strong>
          <p>La aplicación compara este valor con tus gastos y pagos pendientes para calcular un límite diario, anticipar si podrías excederte y mostrar alertas.</p>
          <p>Definirlo no registra un gasto, no descuenta dinero de tus ingresos y no modifica tus ahorros.</p>
        </div>
        {editando ? (
          <div className="budget-form">
            <label htmlFor="monthly-budget">¿Cuánto quieres destinar a todos tus gastos del mes?</label>
            <input id="monthly-budget" type="number" min="1" step="1000" inputMode="decimal"
              placeholder="Ejemplo: 1.500.000" value={nuevoPres} autoFocus
              onChange={e=>setNuevoPres(e.target.value)}/>
            <div className="budget-actions">
              <button className="budget-save" disabled={!Number.isFinite(Number(nuevoPres)) || Number(nuevoPres) <= 0} onClick={guardarPres}>Guardar presupuesto</button>
              <button className="budget-cancel" onClick={()=>{setEditando(false);setNuevoPres("");}}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button className="budget-open" onClick={()=>{setNuevoPres(data.presupuesto_mes > 0 ? String(data.presupuesto_mes) : "");setEditando(true);}}>
            {data.presupuesto_mes > 0 ? `Cambiar presupuesto actual: ${fmtLocal(data.presupuesto_mes)}` : "Definir mi presupuesto mensual"}
          </button>
        )}
      </section>
    </div>
  );
}

function PrediccionML({ data }) {
  if (!data) return <div style={{color:"var(--muted)",padding:"2rem",textAlign:"center"}}>Cargando predicción...</div>;
  const fmtLocal = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  const excede = data.presupuesto_definido && data.diferencia_vs_presupuesto < 0;
  const colorDiff = excede ? "#ef4444" : "#22c55e";
  const confidenceColor = "var(--muted)";
  return (
    <div className="intelligence-card" style={{background:"var(--panel)",borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem",border:"1px solid var(--border)"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1.25rem"}}>
        <span style={{fontSize:18}}>🧠</span>
        <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"var(--muted)"}}>Proyección según tus hábitos</h3>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <div style={{fontSize:12,color:"var(--muted)",marginBottom:2}}>Historial disponible</div>
          <div style={{fontSize:18,fontWeight:700,color:confidenceColor}}>{Math.round(data.confianza)}%</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginBottom:"1.25rem"}}>
        <div style={{background:"var(--bg)",borderRadius:12,padding:"1rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>Proyección del mes</div>
          <div style={{fontSize:"clamp(15px,4vw,22px)",fontWeight:700,color:"var(--text)"}}>{fmtLocal(data.proyeccion_mes)}</div>
        </div>
        <div style={{background:"var(--bg)",borderRadius:12,padding:"1rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--muted)",marginBottom:4}}>{excede?"Podrías excederlo en":"Margen estimado"}</div>
          <div style={{fontSize:"clamp(15px,4vw,22px)",fontWeight:700,color:colorDiff}}>{data.presupuesto_definido ? fmtLocal(Math.abs(data.diferencia_vs_presupuesto)) : "Sin presupuesto"}</div>
        </div>
      </div>
      <p className="prediction-note">Estimación local basada en tu historial; no garantiza gastos futuros. Los pagos sugeridos se reconocen por su descripción. Regístralos con el mismo nombre para descontarlos.</p>
      <div style={{fontSize:12,color:"var(--muted)",marginBottom:8,fontWeight:600}}>DESGLOSE PROYECTADO</div>
      {data.desglose_proyectado.map(({categoria,total})=>(
        <div key={categoria} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:13,color:"var(--muted)"}}>
          <span>{categoria}</span><span style={{fontWeight:600,color:"var(--text)"}}>{fmtLocal(total)}</span>
        </div>
      ))}
      {data.compromisos_pendientes.length > 0 && <>
        <div style={{fontSize:12,color:"var(--muted)",margin:"1rem 0 8px",fontWeight:600}}>FALTA POR PAGAR</div>
        {data.compromisos_pendientes.map((c,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,marginBottom:4,background:c.dias_para_vencer<=3?"#ef444411":"var(--bg)"}}>
            <div>
              <span style={{fontSize:13,color:"var(--text)"}}>{c.tipo==="cumple"?"🎂":c.tipo==="impuesto"?"🧾":"🔄"} {c.nombre}</span>
              <span style={{fontSize:11,color:"var(--muted)",marginLeft:8}}>{c.dias_para_vencer < 0 ? `Vencido hace ${-c.dias_para_vencer} días` : c.dias_para_vencer === 0 ? "Hoy" : `en ${c.dias_para_vencer} días`}</span>
            </div>
            <span style={{fontSize:13,fontWeight:600,color:"#f87171"}}>{fmtLocal(c.monto)}</span>
          </div>
        ))}
      </>}
    </div>
  );
}

function Compromisos({ compromisos, onActualizar }) {
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [tipo, setTipo] = useState("recurrente");
  const [diaMes, setDiaMes] = useState("");
  const [fecha, setFecha] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const inp = {background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:"0.625rem 0.875rem",color:"var(--text)",fontSize:14,width:"100%"};
  const guardar = async () => {
    const valor = Number(monto);
    if (!nombre.trim() || !Number.isFinite(valor) || valor <= 0) return;
    const datos={nombre:nombre.trim(),monto:valor,tipo,diaMes:tipo==="recurrente"?parseInt(diaMes)||null:null,fecha:tipo!=="recurrente"?fecha||null:null};
    if (editandoId) await invoke("actualizar_compromiso",{id:editandoId,...datos});
    else await invoke("agregar_compromiso",datos);
    setNombre("");setMonto("");setDiaMes("");setFecha("");
    setTipo("recurrente");setEditandoId(null);
    await onActualizar();
  };
  const editar = c => {
    setEditandoId(c.id);setNombre(c.nombre);setMonto(String(c.monto));setTipo(c.tipo);
    setDiaMes(c.dia_mes == null ? "" : String(c.dia_mes));setFecha(c.fecha || "");
  };
  const cancelar = () => {setEditandoId(null);setNombre("");setMonto("");setTipo("recurrente");setDiaMes("");setFecha("");};
  const eliminar = async (id) => { await invoke("eliminar_compromiso",{id}); if(editandoId===id) cancelar(); await onActualizar(); };
  const emoji = {recurrente:"🔄",impuesto:"🧾",cumple:"🎂"};
  const fmtLocal = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  return (
    <div className="commitments-tab">
      <h2 style={{color:"var(--muted)",fontSize:18,marginBottom:"1.25rem"}}>Compromisos futuros</h2>
      <div className="form-card commitment-form">
        <h4 style={{color:"var(--muted)",marginBottom:"1rem",fontSize:14}}>{editandoId ? "✏️ Modificar compromiso" : "+ Agregar compromiso"}</h4>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
          <input placeholder="Nombre" value={nombre} onChange={e=>setNombre(e.target.value)} style={inp}/>
          <input placeholder="Monto" type="number" value={monto} onChange={e=>setMonto(e.target.value)} style={inp}/>
          <select value={tipo} onChange={e=>setTipo(e.target.value)} style={inp}>
            <option value="recurrente">🔄 Recurrente mensual</option>
            <option value="impuesto">🧾 Impuesto anual</option>
            <option value="cumple">🎂 Cumpleaños / Regalo</option>
          </select>
          {tipo==="recurrente"
            ? <input placeholder="Día del mes (1-31)" type="number" value={diaMes} onChange={e=>setDiaMes(e.target.value)} style={inp}/>
            : <input placeholder="Fecha MM-DD (ej: 03-15)" value={fecha} onChange={e=>setFecha(e.target.value)} style={inp}/>
          }
        </div>
        <div className="commitment-actions">
          <button onClick={guardar} className="btn commitment-save">{editandoId ? "Guardar cambios" : "Guardar compromiso"}</button>
          {editandoId && <button onClick={cancelar} className="btn commitment-cancel">Cancelar edición</button>}
        </div>
      </div>
      <div className="records-scroll commitments-scroll">
        {compromisos.length === 0
          ? <p className="empty">No hay compromisos registrados.</p>
          : compromisos.map(c=>(
            <div key={c.id} className="lista-item commitment-item">
              <div className="lista-item-info">
                <div><div style={{fontSize:14,color:"var(--text)"}}>{emoji[c.tipo]} {c.nombre}</div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{c.tipo==="recurrente"?`Día ${c.dia_mes} de cada mes`:`Fecha: ${c.fecha}`}</div></div>
              </div>
              <div className="lista-item-right">
                <span style={{fontSize:15,fontWeight:600,color:"var(--text)"}}>{fmtLocal(c.monto)}</span>
                <button className="btn-icon edit-button" aria-label={`Editar compromiso ${c.nombre}`} onClick={()=>editar(c)}><Pencil size={14}/></button>
                <button className="btn-icon" aria-label={`Eliminar compromiso ${c.nombre}`} onClick={()=>eliminar(c.id)}><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Ahorros() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(async () => { setLista(await invoke("listar_ahorros")); }, []);
  useEffect(() => { cargar().catch(console.error); }, [cargar]);
  const guardar = async () => {
    if (guardando || !nombre.trim() || !Number.isFinite(Number(monto)) || Number(monto) <= 0) return;
    setGuardando(true);
    try {
      await invoke("agregar_ahorro", { nombre, monto:Number(monto) });
      setNombre(""); setMonto(""); await cargar();
    } catch (e) { console.error(e); }
    finally { setGuardando(false); }
  };
  const eliminar = async id => {
    try { await invoke("eliminar_ahorro", { id }); await cargar(); }
    catch(e) { console.error(e); }
  };
  return <div className="tab-content">
    <StatCard icon={PiggyBank} label="Ahorros registrados" value={lista.reduce((s,a)=>s+a.monto,0)} color="#10b981"/>
    <div className="form-card">
      <h3 className="form-title">Registrar ahorro</h3>
      <p className="prediction-note">Registro independiente del presupuesto. No descuenta dinero de tus ingresos ni registra un gasto automáticamente.</p>
      <div className="form-grid">
        <input className="inp" placeholder="Nombre del ahorro" value={nombre} onChange={e=>setNombre(e.target.value)}/>
        <input className="inp" type="number" min="0.01" step="0.01" placeholder="Monto ahorrado" value={monto} onChange={e=>setMonto(e.target.value)}/>
        <button className="btn btn-success" disabled={guardando} onClick={guardar}>Guardar ahorro</button>
      </div>
    </div>
    {lista.map(a=><div className="lista-item" key={a.id}>
      <div className="lista-item-info"><span>{a.nombre}</span><span className="lista-item-fecha">{a.fecha_registro}</span></div>
      <div className="lista-item-right"><strong>{fmt(a.monto)}</strong><button className="btn-icon" aria-label={`Eliminar ahorro ${a.nombre}`} onClick={()=>eliminar(a.id)}><Trash2 size={14}/></button></div>
    </div>)}
    {!lista.length && <p className="empty">Aún no tienes ahorros registrados en este perfil.</p>}
  </div>;
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [error, setError] = useState("");
  useEffect(() => {
    const report = event => setError(event.detail);
    window.addEventListener("app-error", report);
    return () => window.removeEventListener("app-error", report);
  }, []);
  const { perfiles, perfilActivo, cambiando, iniciando, cambiarPerfil, agregarPerfil, editarPerfil, eliminarPerfil } = usePerfiles();
  const [modalPerfiles, setModalPerfiles] = useState(false);

  const [tab, setTab] = useState("dashboard");
  const [dispensador, setDispensador] = useState(null);
  const [prediccion, setPrediccion] = useState(null);
  const [compromisos, setCompromisos] = useState([]);
  const [presupuesto, setPresupuesto] = useState(0);
  const [mensajeManana, setMensajeManana] = useState(null);
  const [mostrarManana, setMostrarManana] = useState(false);



  const { anio: anioInicial, mes: mesInicial } = hoy();
  const [anio, setAnio] = useState(anioInicial);
  const [mes, setMes] = useState(mesInicial);

  const vistaActual = useRef("");
  const vista = `${perfilActivo?.id}:${anio}:${mes}:${iniciando}:${cambiando}`;
  vistaActual.current = vista;
  const cargarDatosNuevos = useCallback(async () => {
    if (!perfilActivo || iniciando || cambiando) return;
    const [dispResult, predResult, compsResult, presResult, msgResult] = await Promise.allSettled([
      invoke("obtener_dispensador_dia", { anio, mes }),
      invoke("obtener_prediccion_ml", { anio, mes }),
      invoke("listar_compromisos"),
      invoke("obtener_presupuesto", { anio, mes }),
      invoke("obtener_mensaje_manana", { anio, mes }),
    ]);

    if (vistaActual.current !== vista) return;
    if (dispResult.status === "fulfilled") setDispensador(dispResult.value);
    else {
      console.error("Error cargando dispensador:", dispResult.reason);
      setDispensador(null);
    }

    if (predResult.status === "fulfilled") setPrediccion(predResult.value);
    else {
      console.error("Error cargando predicción ML:", predResult.reason);
      setPrediccion(null);
    }

    if (compsResult.status === "fulfilled") setCompromisos(compsResult.value);
    else {
      console.error("Error cargando compromisos:", compsResult.reason);
      setCompromisos([]);
    }

    if (presResult.status === "fulfilled") setPresupuesto(presResult.value?.monto || 0);
    else {
      console.error("Error cargando presupuesto:", presResult.reason);
      setPresupuesto(0);
    }

    if (msgResult.status === "fulfilled") setMensajeManana(msgResult.value);
    else {
      console.error("Error cargando mensaje de mañana:", msgResult.reason);
      setMensajeManana(null);
    }
  }, [perfilActivo, anio, mes, iniciando, cambiando, vista]);

  useEffect(() => { setMostrarManana(new Date().getHours()>=5 && new Date().getHours()<=10); }, []);

  const [resumen,  setResumen]  = useState({ total_gastos:0, total_ingresos:0, total_ahorrado:0, gastos_por_categoria:[] });
  const [gastos,   setGastos]   = useState([]);
  const [ingresos, setIngresos] = useState([]);

  const cargar = useCallback(async () => {
    if (!perfilActivo || iniciando || cambiando) return;
    try {
      const [r, g, i] = await Promise.all([
        invoke("obtener_resumen_mes",  { anio, mes }),
        invoke("listar_gastos",        { anio, mes }),
        invoke("listar_ingresos",      { anio, mes }),
      ]);
      if (vistaActual.current !== vista) return;
      setResumen(r); setGastos(g); setIngresos(i);
      await cargarDatosNuevos();
    } catch (e) { console.error(e); }
  }, [anio, mes, perfilActivo, iniciando, cambiando, cargarDatosNuevos, vista]);

  useEffect(() => { cargar(); }, [cargar]);

  function cambiarMes(delta) {
    let nm = mes + delta, na = anio;
    if (nm < 1)  { nm = 12; na--; }
    if (nm > 12) { nm = 1;  na++; }
    setMes(nm); setAnio(na);
  }

  function exportarCsv() {
    // Protege las celdas de Excel/Sheets que podrían interpretarse como fórmulas.
    const celda = value => {
      const texto = String(value ?? "");
      const seguro = /^\s*[=+@-]/.test(texto) ? `'${texto}` : texto;
      return `"${seguro.replace(/"/g, '""')}"`;
    };
    const filas = [
      ...gastos.map(gasto => ({ tipo:"Gasto", fecha:gasto.fecha, descripcion:gasto.descripcion, categoria:gasto.categoria, monto:gasto.monto })),
      ...ingresos.map(ingreso => ({ tipo:"Ingreso", fecha:ingreso.fecha, descripcion:ingreso.descripcion, categoria:"Ingreso", monto:ingreso.monto })),
    ].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const encabezado = ["tipo", "fecha", "descripcion", "categoria", "monto_cop", "perfil"];
    const contenido = [
      encabezado,
      ...filas.map(fila => [fila.tipo, fila.fecha, fila.descripcion, fila.categoria, fila.monto, perfilActivo?.nombre || "Sin perfil"]),
    ].map(fila => fila.map(celda).join(",")).join("\r\n");
    const archivo = new Blob(["\uFEFF", contenido], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `mis-finanzas-${anio}-${String(mes).padStart(2, "0")}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  }

  const tabs = [
    { id:"dashboard",   label:"Dashboard",    icon: LayoutDashboard },
    { id:"gastos",      label:"Gastos",       icon: ShoppingCart },
    { id:"ingresos",    label:"Ingresos",     icon: DollarSign },
    { id:"ahorros", label:"Ahorros", icon:PiggyBank },
    { id:"dispensador", label:"Dispensador",  icon: Target },
    { id:"prediccion",  label:"Predicción",   icon: Brain },
    { id:"compromisos", label:"Compromisos",  icon: Receipt },
  ];

  const accentColor = perfilActivo?.color || "#6366f1";

  return (
    <div className="app">
      {/* Pantalla de carga inicial — cubre todo hasta que el pool de Rust esté listo */}
      {iniciando && (
        <div style={{
          position:"fixed",inset:0,background:"var(--bg)",zIndex:3000,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16
        }}>
          <div style={{fontSize:36,marginBottom:4}}>💰</div>
          <div style={{
            width:36,height:36,border:"3px solid var(--border)",borderTopColor:"#6366f1",
            borderRadius:"50%",animation:"spin 0.7s linear infinite"
          }}/>
          <span style={{fontSize:13,color:"var(--muted)",marginTop:4}}>Iniciando…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {/* Overlay semi-transparente solo al CAMBIAR de perfil (no en carga inicial) */}
      {cambiando && !iniciando && (
        <div style={{
          position:"fixed",inset:0,background:"#0f172acc",zIndex:2000,
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16
        }}>
          <div style={{
            width:44,height:44,border:"3px solid var(--border)",borderTopColor:"#6366f1",
            borderRadius:"50%",animation:"spin 0.7s linear infinite"
          }}/>
          <span style={{fontSize:14,color:"var(--muted)"}}>Cambiando perfil…</span>
        </div>
      )}
      {/* Sidebar BBVA-style */}
      <Sidebar
        tab={tab}
        setTab={setTab}
        tabs={tabs}
        perfilActivo={perfilActivo}
        onAbrirPerfiles={() => setModalPerfiles(true)}
      />
      <button className="theme-toggle" aria-label={isDark ? "Activar tema claro" : "Activar tema oscuro"} onClick={toggleTheme} style={{
        background: "none",
        border: "none",
        color: "var(--text)",
        cursor: "pointer",
        fontSize: 18
      }}>
        {isDark ? "☀️" : "🌙"}
      </button>

      {/* Modal de perfiles */}
      {modalPerfiles && (
        <ModalPerfiles
          perfiles={perfiles}
          perfilActivo={perfilActivo}
          onCambiar={cambiarPerfil}
          onAgregar={agregarPerfil}
          onEditar={editarPerfil}
          onEliminar={eliminarPerfil}
          onCerrar={() => setModalPerfiles(false)}
        />
      )}

      {/* Contenido principal */}
      <main className="main">
        {error && <div role="alert" className="error-banner">{error}<button onClick={() => setError("")} aria-label="Cerrar error">×</button></div>}
        {/* Banner de perfil activo */}
        <div style={{
          display:"flex",alignItems:"center",gap:10,marginBottom:"0.25rem",
          padding:"0.5rem 0.75rem",borderRadius:10,
          background:accentColor+"11",border:`1px solid ${accentColor}22`,
          width:"fit-content"
        }}>
          <span style={{fontSize:16}}>{perfilActivo?.emoji}</span>
          <span style={{fontSize:13,fontWeight:600,color:accentColor}}>{perfilActivo?.nombre}</span>
          <button onClick={() => setModalPerfiles(true)} style={{
            background:"none",border:"none",color:accentColor+"99",cursor:"pointer",
            fontSize:11,padding:"0 4px",display:"flex",alignItems:"center",gap:3
          }}>
            <Pencil size={10}/> cambiar
          </button>
        </div>

        {/* Header de mes */}
        <header className="mes-header">
          <button className="btn-mes" onClick={() => cambiarMes(-1)}><ChevronLeft size={18}/></button>
          <h2 className="mes-label">{MESES[mes-1]} {anio}</h2>
          <button className="btn-mes" onClick={() => cambiarMes(1)}><ChevronRight size={18}/></button>
          <button className="btn-exportar" onClick={exportarCsv} title="Exportar gastos e ingresos del mes a CSV">
            <Download size={16}/> Exportar CSV
          </button>
        </header>

        {/* Buenos días */}
        <BuenasDias data={mensajeManana} visible={mostrarManana && anio === hoy().anio && mes === hoy().mes}/>

        {/* Stats */}
        <div className="stats-row">
          <StatCard icon={TrendingUp}   label="Ingresos"    value={resumen.total_ingresos} color="#10b981"/>
          <StatCard icon={TrendingDown} label="Gastos"      value={resumen.total_gastos}   color="#f43f5e"/>
          <StatCard icon={DollarSign}   label="Presupuesto" value={presupuesto}         color="#f59e0b"/>
          <StatCard icon={PiggyBank}    label="Saldo"    value={resumen.total_ahorrado} color={resumen.total_ahorrado>=0?accentColor:"#f59e0b"}
            sub={resumen.total_ahorrado < 0 ? "⚠ Gastos superan ingresos" : undefined}/>
        </div>

        {prediccion && resumen.total_ingresos - resumen.total_gastos < prediccion.compromisos_pendientes.reduce((total,c)=>total+c.monto,0) && (
          <div role="status" className="error-banner">
            Con los ingresos registrados, faltan {fmt(prediccion.compromisos_pendientes.reduce((total,c)=>total+c.monto,0) - (resumen.total_ingresos - resumen.total_gastos))} para cubrir los gastos y pagos pendientes de este mes.
          </div>
        )}

        {/* Contenido por tab */}
        {tab === "dashboard" && (
          <Graficos resumen={resumen} gastos={gastos} ingresos={ingresos} dispensador={dispensador} prediccion={prediccion} compromisos={compromisos} onAbrirCompromisos={() => setTab("compromisos")} onAbrirPerfiles={() => setModalPerfiles(true)}/>
        )}

        {tab === "ahorros" && perfilActivo && !cambiando && <Ahorros key={perfilActivo.id}/>}

        {tab === "gastos" && (
          <div className="tab-content records-tab">
            <FormGasto onGuardado={cargar}/>
            <div className="records-scroll">
              <h3 className="section-title records-title">Gastos de {MESES[mes-1]}</h3>
              <ListaGastos gastos={gastos} onActualizar={cargar}/>
            </div>
          </div>
        )}

        {tab === "dispensador" && dispensador && (
          <DispensadorDia data={dispensador} onRefresh={cargarDatosNuevos} anio={anio} mes={mes}/>
        )}
        {tab === "prediccion" && prediccion && (
          <PrediccionML data={prediccion} />
        )}
        {tab === "compromisos" && (
          <Compromisos compromisos={compromisos} onActualizar={cargarDatosNuevos}/>
        )}
        {tab === "ingresos" && (
          <div className="tab-content records-tab">
            <FormIngreso onGuardado={cargar}/>
            <div className="records-scroll">
              <h3 className="section-title records-title">Ingresos de {MESES[mes-1]}</h3>
              <ListaIngresos ingresos={ingresos} onActualizar={cargar}/>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
