#[derive(Debug, Serialize, Deserialize)]
pub struct Gasto {
    pub id: i64,
    pub descripcion: String,
    pub monto: f64,
    pub categoria: String,
    pub fecha: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Ingreso {
    pub id: i64,
    pub descripcion: String,
    pub monto: f64,
    pub fecha: String,
}
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct GastoCategoria {
    pub categoria: String,
    pub total: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ResumenMes {
    pub total_gastos: f64,
    pub total_ingresos: f64,
    pub total_ahorrado: f64,
    pub gastos_por_categoria: Vec<GastoCategoria>,
}

// ── NUEVOS ────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct Presupuesto {
    pub anio: i32,
    pub mes: i32,
    pub monto: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Compromiso {
    pub id: i64,
    pub nombre: String,
    pub monto: f64,
    pub tipo: String,
    pub dia_mes: Option<i32>,
    pub fecha: Option<String>,
    pub activo: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DispensadorDia {
    pub presupuesto_mes: f64,
    pub gastado_mes: f64,
    pub dias_restantes: i32,
    pub limite_hoy: f64,
    pub gastado_hoy: f64,
    pub porcentaje_hoy: f64,
    pub alerta: String,         // "ok" | "advertencia" | "excedido"
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PrediccionML {
    pub proyeccion_mes: f64,
    pub diferencia_vs_presupuesto: f64,
    pub confianza: f64,
    pub promedio_diario: f64,
    pub compromisos_pendientes: Vec<CompromisoPendiente>,
    pub desglose_proyectado: Vec<GastoCategoria>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CompromisoPendiente {
    pub nombre: String,
    pub monto: f64,
    pub dias_para_vencer: i32,
    pub tipo: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct MensajeManana {
    pub nombre_usuario: String,
    pub limite_hoy: f64,
    pub gastado_ayer: f64,
    pub compromisos_esta_semana: Vec<CompromisoPendiente>,
    pub mensaje: String,
}
