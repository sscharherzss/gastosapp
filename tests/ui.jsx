// Harness exclusivo del servidor de desarrollo. No se incluye en dist/.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import App from '../src/App';
import '../src/styles.css';
const gastos = [{ id: 1, descripcion: 'Mercado', monto: 180000, categoria: 'Alimentación', fecha: '2026-09-10' }];
const ingresos = [{ id: 1, descripcion: 'Salario', monto: 2500000, fecha: '2026-09-01' }];
const compromisos = Array.from({length:18},(_,i)=>({ id:i+1, nombre:i===0?'Internet':`Pago recurrente ${i+1}`, monto:90000+i*5000, tipo:'recurrente', dia_mes:(i%28)+1, fecha:null, activo:true }));
let presupuesto = 2000000;
mockIPC((cmd, args) => {
  switch (cmd) {
    case 'cambiar_perfil': return null;
    case 'obtener_resumen_mes': return { total_gastos: gastos.reduce((s,g)=>s+g.monto,0), total_ingresos:2500000, total_ahorrado:2320000, gastos_por_categoria:[{categoria:'Alimentación',total:180000}] };
    case 'listar_gastos': return [...gastos];
    case 'listar_ingresos': return [...ingresos];
    case 'listar_ahorros': return [];
    case 'listar_compromisos': return [...compromisos];
    case 'obtener_presupuesto': return { monto: presupuesto };
    case 'guardar_presupuesto': presupuesto=args.monto;return null;
    case 'obtener_dispensador_dia': return { presupuesto_mes:presupuesto, gastado_mes:180000, dias_restantes:14, limite_hoy:60000, gastado_hoy:20000, porcentaje_hoy:33, alerta:'ok' };
    case 'obtener_prediccion_ml': return { presupuesto_definido:true, proyeccion_mes:2100000, diferencia_vs_presupuesto:presupuesto-2100000, confianza:50, promedio_diario:30000, compromisos_pendientes:[{nombre:'Internet',monto:90000,dias_para_vencer:-2,tipo:'aprendido'}], desglose_proyectado:[{categoria:'Vivienda',total:90000},{categoria:'Otros',total:2010000}] };
    case 'obtener_mensaje_manana': return null;
    case 'agregar_gasto': gastos.push({...args,id:Date.now(),fecha:'2026-09-17'});return null;
    case 'agregar_ingreso': ingresos.push({...args,id:Date.now(),fecha:'2026-09-17'});return null;
    case 'eliminar_gasto': gastos.splice(gastos.findIndex(g=>g.id===args.id),1);return null;
    case 'eliminar_ingreso': ingresos.splice(ingresos.findIndex(g=>g.id===args.id),1);return null;
    case 'actualizar_gasto': Object.assign(gastos.find(g=>g.id===args.id),args);return null;
    case 'actualizar_ingreso': Object.assign(ingresos.find(i=>i.id===args.id),args);return null;
    case 'actualizar_compromiso': Object.assign(compromisos.find(c=>c.id===args.id),args,{dia_mes:args.diaMes});return null;
    case 'eliminar_compromiso': compromisos.splice(compromisos.findIndex(c=>c.id===args.id),1);return null;
    case 'agregar_compromiso': compromisos.push({...args,id:Date.now(),dia_mes:args.diaMes,activo:true});return null;
    default: throw new Error(`Comando no simulado: ${cmd}`);
  }
});
createRoot(document.getElementById('root')).render(<App/>);
