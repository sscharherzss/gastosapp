import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  PlusCircle, Trash2, TrendingUp, TrendingDown, PiggyBank,
  LayoutDashboard, ShoppingCart, DollarSign, ChevronLeft, ChevronRight, Target, Brain, Receipt
} from "lucide-react";

// ── Paleta de colores para gráficos ──────────────────────────────────────────
const COLORS = ["#6366f1","#22d3ee","#f59e0b","#10b981","#f43f5e","#a855f7","#fb923c","#84cc16"];

const CATEGORIAS = ["Alimentación","Transporte","Vivienda","Salud","Educación","Entretenimiento","Ropa","Otros"];

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// ── Utilidades ────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n);

function hoy() {
  const d = new Date();
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
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

  async function guardar() {
    if (!desc.trim() || !monto || isNaN(parseFloat(monto))) return;
    setCargando(true);
    try {
      await invoke("agregar_gasto", { descripcion: desc, monto: parseFloat(monto), categoria: cat });
      setDesc(""); setMonto(""); setOk(true);
      setTimeout(() => setOk(false), 1500);
      onGuardado();
    } catch (e) { console.error(e); }
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
    </div>
  );
}

// ── Formulario de ingreso ─────────────────────────────────────────────────────
function FormIngreso({ onGuardado }) {
  const [desc, setDesc] = useState("");
  const [monto, setMonto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(false);

  async function guardar() {
    if (!desc.trim() || !monto || isNaN(parseFloat(monto))) return;
    setCargando(true);
    try {
      await invoke("agregar_ingreso", { descripcion: desc, monto: parseFloat(monto) });
      setDesc(""); setMonto(""); setOk(true);
      setTimeout(() => setOk(false), 1500);
      onGuardado();
    } catch (e) { console.error(e); }
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
    </div>
  );
}

// ── Lista de transacciones ────────────────────────────────────────────────────
function ListaGastos({ gastos, onEliminar }) {
  if (!gastos.length) return <p className="empty">No hay gastos este mes</p>;
  return (
    <div className="lista">
      {gastos.map(g => (
        <div key={g.id} className="lista-item">
          <div className="lista-item-info">
            <span className="lista-item-cat">{g.categoria}</span>
            <span className="lista-item-desc">{g.descripcion}</span>
            <span className="lista-item-fecha">{g.fecha}</span>
          </div>
          <div className="lista-item-right">
            <span className="lista-item-monto">{fmt(g.monto)}</span>
            <button className="btn-icon" onClick={() => onEliminar(g.id)}><Trash2 size={14}/></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListaIngresos({ ingresos }) {
  if (!ingresos.length) return <p className="empty">No hay ingresos este mes</p>;
  return (
    <div className="lista">
      {ingresos.map(i => (
        <div key={i.id} className="lista-item">
          <div className="lista-item-info">
            <span className="lista-item-cat" style={{background:"#10b98120",color:"#10b981"}}>Ingreso</span>
            <span className="lista-item-desc">{i.descripcion}</span>
            <span className="lista-item-fecha">{i.fecha}</span>
          </div>
          <span className="lista-item-monto" style={{color:"#10b981"}}>{fmt(i.monto)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Gráficos ──────────────────────────────────────────────────────────────────
function Graficos({ resumen, gastos, ingresos, dispensador, prediccion, compromisos }) {
  const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n||0);

  // Datos gráfica 1: Resumen del mes
  const dataResumen = [
    { name: "Ingresos", value: resumen.total_ingresos },
    { name: "Gastos",   value: resumen.total_gastos },
    { name: "Ahorro",   value: resumen.total_ahorrado },
  ];

  // Datos gráfica 2: Dispensador del día
  const limiteHoy = dispensador?.limite_hoy || 0;
  const gastadoHoy = dispensador?.gastado_hoy || 0;
  const disponibleHoy = Math.max(0, limiteHoy - gastadoHoy);
  const dataDispensador = [
    { name: "Gastado hoy", valor: gastadoHoy },
    { name: "Disponible",  valor: disponibleHoy },
  ];

  // Datos gráfica 3: Predicción ML
  const presupuestoMes = dispensador?.presupuesto_mes || 0;
  const proyeccion = prediccion?.proyeccion_mes || 0;
  const gastadoMes = resumen.total_gastos || 0;
  const dataML = [
    { name: "Gastado", valor: gastadoMes },
    { name: "Proyectado", valor: Math.max(0, proyeccion - gastadoMes) },
    { name: "Presupuesto", valor: presupuestoMes },
  ];

  // Datos gráfica 4: Compromisos futuros vs disponible
  const totalCompromisos = compromisos.reduce((s, c) => s + c.monto, 0);
  const saldoLibre = Math.max(0, (presupuestoMes - gastadoMes) - totalCompromisos);
  const dataCompromisos = [
    { name: "Compromisos", value: totalCompromisos, fill: "#f43f5e" },
    { name: "Libre",       value: saldoLibre,       fill: "#10b981" },
  ];

  // Datos gráfica 5: Gastos por categoría (ya existente, mejorada)
  const colores = ["#6366f1","#10b981","#f59e0b","#f43f5e","#a855f7","#22d3ee","#84cc16"];
  const dataCateg = resumen.gastos_por_categoria.map((g, i) => ({
    name: g.categoria, value: g.total, fill: colores[i % colores.length]
  }));

  const cardStyle = { background:"#1a2332", borderRadius:14, padding:"1.25rem", border:"1px solid #1e293b" };
  const titleStyle = { fontSize:12, fontWeight:600, color:"#64748b", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"0.05em" };

  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:16}}>

      {/* 1. Resumen del mes */}
      <div style={cardStyle}>
        <div style={titleStyle}>Resumen del mes</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataResumen} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10"/>
            <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#94a3b8",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+Math.round(v/1000000)+"M"}/>
            <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8}}/>
            <Bar dataKey="value" radius={[4,4,0,0]}>
              {dataResumen.map((_, i) => <Cell key={i} fill={["#10b981","#f43f5e","#6366f1"][i]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 2. Dispensador del día */}
      <div style={cardStyle}>
        <div style={titleStyle}>💰 Dispensador del día</div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <ResponsiveContainer width="50%" height={180}>
            <PieChart>
              <Pie data={dataDispensador} dataKey="valor" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                <Cell fill="#ef4444"/>
                <Cell fill="#22d3ee"/>
              </Pie>
              <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{flex:1}}>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#64748b"}}>Límite hoy</div>
              <div style={{fontSize:20,fontWeight:700,color:"#22d3ee"}}>{fmt(limiteHoy)}</div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#64748b"}}>Gastado hoy</div>
              <div style={{fontSize:20,fontWeight:700,color:"#ef4444"}}>{fmt(gastadoHoy)}</div>
            </div>
            <div>
              <div style={{fontSize:11,color:"#64748b"}}>Disponible</div>
              <div style={{fontSize:20,fontWeight:700,color:"#10b981"}}>{fmt(disponibleHoy)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Predicción ML */}
      <div style={cardStyle}>
        <div style={titleStyle}>🧠 Predicción ML del mes</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dataML} barSize={35}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10"/>
            <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#94a3b8",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+Math.round(v/1000000)+"M"}/>
            <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8}}/>
            <Bar dataKey="valor" radius={[4,4,0,0]}>
              <Cell fill="#10b981"/>
              <Cell fill="#f59e0b"/>
              <Cell fill="#6366f1"/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:12,color:"#64748b"}}>
          <span>Confianza: <strong style={{color:"#a78bfa"}}>{Math.round(prediccion?.confianza||0)}%</strong></span>
          <span style={{color: proyeccion > presupuestoMes ? "#ef4444" : "#10b981"}}>
            {proyeccion > presupuestoMes ? "⚠ Superará presupuesto" : "✓ Dentro del presupuesto"}
          </span>
        </div>
      </div>

      {/* 4. Compromisos futuros vs disponible */}
      <div style={cardStyle}>
        <div style={titleStyle}>📋 Compromisos vs Disponible</div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <ResponsiveContainer width="50%" height={180}>
            <PieChart>
              <Pie data={dataCompromisos} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {dataCompromisos.map((d,i) => <Cell key={i} fill={d.fill}/>)}
              </Pie>
              <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{flex:1}}>
            {compromisos.slice(0,3).map(c=>(
              <div key={c.id} style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #1e293b"}}>
                <div style={{fontSize:12,color:"#e2e8f0"}}>{c.tipo==="cumple"?"🎂":c.tipo==="impuesto"?"🧾":"🔄"} {c.nombre}</div>
                <div style={{fontSize:13,fontWeight:600,color:"#f43f5e"}}>{fmt(c.monto)}</div>
              </div>
            ))}
            {compromisos.length === 0 && <div style={{fontSize:12,color:"#64748b"}}>Sin compromisos</div>}
            <div style={{marginTop:8,fontSize:12,color:"#10b981",fontWeight:600}}>Libre: {fmt(saldoLibre)}</div>
          </div>
        </div>
      </div>

      {/* 5. Gastos por categoría */}
      <div style={{...cardStyle, gridColumn:"1/-1"}}>
        <div style={titleStyle}>Gastos por categoría</div>
        <div style={{display:"flex",alignItems:"center",gap:24}}>
          <ResponsiveContainer width="30%" height={200}>
            <PieChart>
              <Pie data={dataCateg} dataKey="value" cx="50%" cy="50%" outerRadius={90} paddingAngle={3}>
                {dataCateg.map((d,i) => <Cell key={i} fill={d.fill}/>)}
              </Pie>
              <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"#1e293b",border:"1px solid #334155",borderRadius:8}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {dataCateg.map(d=>(
              <div key={d.name} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#0f172a",borderRadius:8}}>
                <span style={{width:10,height:10,borderRadius:2,background:d.fill,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{d.name}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{fmt(d.value)}</div>
                </div>
              </div>
            ))}
            {dataCateg.length === 0 && <div style={{color:"#64748b",fontSize:13}}>Sin gastos este mes</div>}
          </div>
        </div>
      </div>

    </div>
  );
}

function BuenasDias({ data, visible }) {
  const [cerrado, setCerrado] = useState(false);
  if (!visible || !data || cerrado) return null;
  return (
    <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:16,padding:"1.25rem 1.5rem",marginBottom:"1.5rem",border:"1px solid #10b98133",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:15,fontWeight:600,color:"#34d399",marginBottom:6}}>☀️ Buenos días, {data.nombre_usuario}</div>
        <p style={{margin:0,fontSize:14,color:"#a7f3d0",lineHeight:1.5}}>
          Hoy puedes gastar máximo <strong style={{color:"#fff"}}>{new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(data.limite_hoy)}</strong>.
          {data.gastado_ayer > 0 && ` Ayer gastaste ${new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(data.gastado_ayer)}.`}
        </p>
      </div>
      <button onClick={() => setCerrado(true)} style={{background:"none",border:"none",cursor:"pointer",color:"#6ee7b7",fontSize:18,padding:4}}>✕</button>
    </div>
  );
}

function DispensadorDia({ data, onRefresh }) {
  const [editando, setEditando] = useState(false);
  const [nuevoPres, setNuevoPres] = useState("");
  const guardarPres = async () => {
    if (!nuevoPres) return;
    const { anio, mes } = hoy();
    await invoke("guardar_presupuesto", { anio, mes, monto: parseFloat(nuevoPres) });
    setEditando(false);
    setNuevoPres("");
    onRefresh();
  };
  if (!data) return <div style={{color:"#64748b",padding:"2rem",textAlign:"center"}}>Cargando...</div>;
  const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  const pct = Math.min(100, data.porcentaje_hoy);
  const color = data.alerta === "ok" ? "#22d3ee" : data.alerta === "advertencia" ? "#f59e0b" : "#ef4444";
  return (
    <div style={{background:"#1e2a3a",borderRadius:16,padding:"1.5rem",border:`2px solid ${color}22`,marginBottom:"1.5rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"#94a3b8"}}>💰 Dispensador del día</h3>
        <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:700,background:color+"22",color,textTransform:"uppercase"}}>
          {data.alerta === "ok" ? "En control" : data.alerta === "advertencia" ? "Cuidado" : "¡Excedido!"}
        </span>
      </div>
      <div style={{textAlign:"center",marginBottom:"1rem"}}>
        <div style={{fontSize:13,color:"#64748b",marginBottom:4}}>Puedes gastar hoy máximo</div>
        <div style={{fontSize:42,fontWeight:700,color}}>{fmt(data.limite_hoy)}</div>
      </div>
      <div style={{background:"#0f172a",borderRadius:8,height:10,marginBottom:8,overflow:"hidden"}}>
        <div style={{width:pct+"%",height:"100%",background:color,borderRadius:8,transition:"width 0.5s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748b",marginBottom:"1rem"}}>
        <span>Gastado hoy: {fmt(data.gastado_hoy)}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:"1rem"}}>
        {[["Presupuesto mes",fmt(data.presupuesto_mes)],["Gastado mes",fmt(data.gastado_mes)],["Días restantes",data.dias_restantes]].map(([label,value])=>(
          <div key={label} style={{background:"#0f172a",borderRadius:10,padding:"0.75rem",textAlign:"center"}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{label}</div>
            <div style={{fontSize:15,fontWeight:600,color:"#e2e8f0"}}>{value}</div>
          </div>
        ))}
      </div>
      {editando ? (
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input type="number" placeholder="Presupuesto del mes" value={nuevoPres}
            onChange={e=>setNuevoPres(e.target.value)}
            style={{flex:1,background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,padding:"0.625rem",color:"#e2e8f0",fontSize:14}}/>
          <button onClick={guardarPres} style={{padding:"0 1rem",background:"#6366f1",border:"none",borderRadius:8,color:"#fff",fontWeight:600,cursor:"pointer"}}>Guardar</button>
          <button onClick={()=>setEditando(false)} style={{padding:"0 1rem",background:"#1e293b",border:"none",borderRadius:8,color:"#94a3b8",cursor:"pointer"}}>Cancelar</button>
        </div>
      ) : (
        <button onClick={()=>setEditando(true)} style={{width:"100%",marginTop:8,padding:"0.625rem",background:"#1e293b",border:"1px solid #334155",borderRadius:8,color:"#94a3b8",cursor:"pointer",fontSize:13}}>
          ⚙️ {data.presupuesto_mes > 0 ? "Cambiar presupuesto" : "Configurar presupuesto del mes"}
        </button>
      )}
    </div>
  );
}

function PrediccionML({ data }) {
  if (!data) return <div style={{color:"#64748b",padding:"2rem",textAlign:"center"}}>Cargando predicción...</div>;
  const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  const excede = data.diferencia_vs_presupuesto > 0;
  const colorDiff = excede ? "#ef4444" : "#22c55e";
  return (
    <div style={{background:"#1e2a3a",borderRadius:16,padding:"1.5rem",marginBottom:"1.5rem",border:"1px solid #1e293b"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1.25rem"}}>
        <span style={{fontSize:18}}>🧠</span>
        <h3 style={{margin:0,fontSize:16,fontWeight:600,color:"#94a3b8"}}>Predicción ML del mes</h3>
        <span style={{marginLeft:"auto",fontSize:11,color:"#64748b"}}>Confianza: {Math.round(data.confianza)}%</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.25rem"}}>
        <div style={{background:"#0f172a",borderRadius:12,padding:"1rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Proyección del mes</div>
          <div style={{fontSize:22,fontWeight:700,color:"#e2e8f0"}}>{fmt(data.proyeccion_mes)}</div>
        </div>
        <div style={{background:"#0f172a",borderRadius:12,padding:"1rem",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{excede?"Superarás el presupuesto en":"Te sobrará"}</div>
          <div style={{fontSize:22,fontWeight:700,color:colorDiff}}>{fmt(Math.abs(data.diferencia_vs_presupuesto))}</div>
        </div>
      </div>
      <div style={{fontSize:12,color:"#64748b",marginBottom:8,fontWeight:600}}>DESGLOSE PROYECTADO</div>
      {data.desglose_proyectado.map(({categoria,total})=>(
        <div key={categoria} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1e293b",fontSize:13,color:"#94a3b8"}}>
          <span>{categoria}</span><span style={{fontWeight:600,color:"#e2e8f0"}}>{fmt(total)}</span>
        </div>
      ))}
      {data.compromisos_pendientes.length > 0 && <>
        <div style={{fontSize:12,color:"#64748b",margin:"1rem 0 8px",fontWeight:600}}>FALTA POR PAGAR</div>
        {data.compromisos_pendientes.map((c,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:8,marginBottom:4,background:c.dias_para_vencer<=3?"#ef444411":"#0f172a"}}>
            <div>
              <span style={{fontSize:13,color:"#e2e8f0"}}>{c.tipo==="cumple"?"🎂":c.tipo==="impuesto"?"🧾":"🔄"} {c.nombre}</span>
              <span style={{fontSize:11,color:"#64748b",marginLeft:8}}>en {c.dias_para_vencer} días</span>
            </div>
            <span style={{fontSize:13,fontWeight:600,color:"#f87171"}}>{fmt(c.monto)}</span>
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
  const inp = {background:"#0f172a",border:"1px solid #1e293b",borderRadius:8,padding:"0.625rem 0.875rem",color:"#e2e8f0",fontSize:14,width:"100%"};
  const guardar = async () => {
    if (!nombre || !monto) return;
    await invoke("agregar_compromiso",{nombre,monto:parseFloat(monto),tipo,diaMes:tipo==="recurrente"?parseInt(diaMes)||null:null,fecha:tipo!=="recurrente"?fecha||null:null});
    setNombre("");setMonto("");setDiaMes("");setFecha("");
    onActualizar();
  };
  const eliminar = async (id) => { await invoke("eliminar_compromiso",{id}); onActualizar(); };
  const emoji = {recurrente:"🔄",impuesto:"🧾",cumple:"🎂"};
  const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0}).format(n);
  return (
    <div style={{padding:"0.5rem"}}>
      <h2 style={{color:"#94a3b8",fontSize:18,marginBottom:"1.25rem"}}>Compromisos futuros</h2>
      {compromisos.length === 0
        ? <p style={{color:"#64748b",fontSize:14}}>No hay compromisos registrados.</p>
        : compromisos.map(c=>(
          <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#1e2a3a",borderRadius:10,padding:"0.875rem 1rem",marginBottom:8}}>
            <div>
              <div style={{fontSize:14,color:"#e2e8f0"}}>{emoji[c.tipo]} {c.nombre}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{c.tipo==="recurrente"?`Día ${c.dia_mes} de cada mes`:`Fecha: ${c.fecha}`}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:15,fontWeight:600,color:"#e2e8f0"}}>{fmt(c.monto)}</span>
              <button onClick={()=>eliminar(c.id)} style={{background:"#ef444411",border:"1px solid #ef444433",borderRadius:6,padding:"4px 8px",cursor:"pointer",color:"#f87171",fontSize:12}}>Eliminar</button>
            </div>
          </div>
        ))
      }
      <div style={{background:"#1e2a3a",borderRadius:14,padding:"1.25rem",marginTop:"1.5rem"}}>
        <h4 style={{color:"#94a3b8",marginBottom:"1rem",fontSize:14}}>+ Agregar compromiso</h4>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
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
        <button onClick={guardar} style={{marginTop:12,width:"100%",padding:"0.75rem",background:"#6366f1",border:"none",borderRadius:10,color:"#fff",fontWeight:600,cursor:"pointer",fontSize:14}}>
          Guardar compromiso
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [dispensador, setDispensador] = useState(null);
  const [prediccion, setPrediccion] = useState(null);
  const [compromisos, setCompromisos] = useState([]);
  const [presupuesto, setPresupuesto] = useState(0);
  const [mensajeManana, setMensajeManana] = useState(null);
  const [mostrarManana, setMostrarManana] = useState(false);
  const cargarDatosNuevos = useCallback(async () => {
    try {
      const { anio, mes } = hoy();
      const [disp, pred, comps, pres, msg] = await Promise.all([
        invoke("obtener_dispensador_dia", { anio, mes }),
        invoke("obtener_prediccion_ml", { anio, mes }),
        invoke("listar_compromisos"),
        invoke("obtener_presupuesto", { anio, mes }),
        invoke("obtener_mensaje_manana", { anio, mes }),
      ]);
      setDispensador(disp);
      setPrediccion(pred);
      setCompromisos(comps);
      setPresupuesto(pres);
      setMensajeManana(msg);
    } catch (e) {
      console.error("Error datos nuevos:", e);
    }
  }, []);
  useEffect(() => { cargarDatosNuevos(); }, [cargarDatosNuevos]);
  useEffect(() => { setMostrarManana(new Date().getHours()>=5 && new Date().getHours()<=10); }, []);
  const { anio: anioInicial, mes: mesInicial } = hoy();
  const [anio, setAnio] = useState(anioInicial);
  const [mes, setMes]   = useState(mesInicial);

  const [resumen,  setResumen]  = useState({ total_gastos:0, total_ingresos:0, total_ahorrado:0, gastos_por_categoria:[] });
  const [gastos,   setGastos]   = useState([]);
  const [ingresos, setIngresos] = useState([]);

  const cargar = useCallback(async () => {
    try {
      const [r, g, i] = await Promise.all([
        invoke("obtener_resumen_mes",  { anio, mes }),
        invoke("listar_gastos",        { anio, mes }),
        invoke("listar_ingresos",      { anio, mes }),
      ]);
      setResumen(r); setGastos(g); setIngresos(i);
    } catch (e) { console.error(e); }
  }, [anio, mes]);

  useEffect(() => { cargar(); }, [cargar]);

  async function eliminarGasto(id) {
    await invoke("eliminar_gasto", { id });
    cargar();
  }

  function cambiarMes(delta) {
    let nm = mes + delta, na = anio;
    if (nm < 1)  { nm = 12; na--; }
    if (nm > 12) { nm = 1;  na++; }
    setMes(nm); setAnio(na);
  }

  const tabs = [
    { id:"dashboard", label:"Dashboard",   icon: LayoutDashboard },
    { id:"gastos",    label:"Gastos",      icon: ShoppingCart },
    { id:"ingresos",  label:"Ingresos",    icon: DollarSign },
    { id:"dispensador", label:"Dispensador", icon: Target },
    { id:"prediccion",  label:"Predicción",  icon: Brain },
    { id:"compromisos", label:"Compromisos", icon: Receipt },
  ];

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <PiggyBank size={28} color="#6366f1"/>
          <span>MisFinanzas</span>
        </div>
        <nav className="sidebar-nav">
          {tabs.map(t => (
            <button key={t.id} className={`nav-item ${tab===t.id?"active":""}`} onClick={() => setTab(t.id)}>
              <t.icon size={18}/><span>{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Contenido */}
      <main className="main">
        {/* Header de mes */}
        <header className="mes-header">
          <button className="btn-mes" onClick={() => cambiarMes(-1)}><ChevronLeft size={18}/></button>
          <h2 className="mes-label">{MESES[mes-1]} {anio}</h2>
          <button className="btn-mes" onClick={() => cambiarMes(1)}><ChevronRight size={18}/></button>
        </header>

        {/* Stats */}
        <div className="stats-row">
          <StatCard icon={TrendingUp}   label="Ingresos"  value={resumen.total_ingresos} color="#10b981"/>
          <StatCard icon={TrendingDown} label="Gastos"    value={resumen.total_gastos}   color="#f43f5e"/>
          <StatCard icon={PiggyBank}    label="Ahorrado"  value={resumen.total_ahorrado} color={resumen.total_ahorrado>=0?"#6366f1":"#f59e0b"}
            sub={resumen.total_ahorrado < 0 ? "⚠ Gastos superan ingresos" : undefined}/>
        </div>

        {/* Contenido por tab */}
        {tab === "dashboard" && (
          <Graficos resumen={resumen} gastos={gastos} ingresos={ingresos} dispensador={dispensador} prediccion={prediccion} compromisos={compromisos}/>
        )}

        {tab === "gastos" && (
          <div className="tab-content">
            <FormGasto onGuardado={cargar}/>
            <h3 className="section-title">Gastos de {MESES[mes-1]}</h3>
            <ListaGastos gastos={gastos} onEliminar={eliminarGasto}/>
          </div>
        )}

        {tab === "dispensador" && dispensador && (
          <DispensadorDia data={dispensador} onRefresh={cargarDatosNuevos} />
        )}
        {tab === "prediccion" && prediccion && (
          <PrediccionML data={prediccion} />
        )}
        {tab === "compromisos" && (
          <Compromisos compromisos={compromisos} onActualizar={cargarDatosNuevos} />
        )}
        {tab === "ingresos" && (
          <div className="tab-content">
            <FormIngreso onGuardado={cargar}/>
            <h3 className="section-title">Ingresos de {MESES[mes-1]}</h3>
            <ListaIngresos ingresos={ingresos}/>
          </div>
        )}
      </main>
    </div>
  );
}
