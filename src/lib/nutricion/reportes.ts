import { qs, request } from "../api";

/**
 * Los reportes del módulo de nutrición (25-nov-2026), tal como los manda
 * `GET /nutricion/reportes?desde&hasta` (días del negocio, los dos incluidos).
 * Las cuentas las hace el backend (`reportes-calculo.ts`): la web sólo las
 * muestra. Dato sensible de salud: nada de esto va a la consola ni a la
 * telemetría.
 */

export interface ResumenReporte {
  /** Hoy, sin los archivados. */
  pacientesActivos: number;
  /** Registrados en el período (archivados incluidos). */
  pacientesNuevos: number;
  /** Con al menos un control o una semana del seguimiento en el período. */
  pacientesAtendidos: number;
  controles: number;
  semanasAnotadas: number;
  /** Hoy: pacientes con un tratamiento activo. */
  enTratamiento: number;
}

export interface ResultadoPaciente {
  pacienteId: number;
  nombre: string;
  pesoInicial: number;
  pesoActual: number;
  /** Positivo = bajó. */
  kgBajados: number;
  pctBajado: number;
  kgEnPeriodo: number;
  desde: string;
  hasta: string;
  gradoInicial: string | null;
  gradoActual: string | null;
}

export interface ResultadosReporte {
  /** Se pesaron en el período y tienen al menos dos pesos. */
  pacientes: number;
  bajaron: number;
  subieron: number;
  mantuvieron: number;
  kgBajadosTotal: number;
  kgBajadosEnPeriodo: number;
  kgPromedio: number | null;
  pctPromedio: number | null;
  grados: { mejoraron: number; igual: number; empeoraron: number; sinDato: number };
  ranking: ResultadoPaciente[];
}

export interface TratamientoReporte {
  nombre: string;
  activos: number;
  iniciados: number;
  terminados: number;
  pacientes: number;
  semanasPromedio: number | null;
  kgPromedio: number | null;
  dosisAplicadas: number;
  semanasSinDosis: number;
  adherenciaPct: number | null;
}

export interface MesPagos {
  /** «2026-11». */
  mes: string;
  medicamento: number;
  control: number;
  otro: number;
  total: number;
  pacientes: number;
}

/** Un paciente en la lista de un día (por nombre, sin distinguir mayúsculas ni acentos). */
export interface PacienteDelDia {
  pacienteId: number;
  nombre: string;
}

/**
 * Los pacientes por día de la semana en que vienen (CONTRATO-nutricion-seguimiento-23nov
 * §11): una foto de HOY, no depende del período; los mismos de `resumen.enTratamiento`
 * (no archivados, con un tratamiento ACTIVO).
 */
export interface PorDiaReporte {
  enTratamiento: number;
  /** La suma de los seis días. */
  conDia: number;
  sinDia: { pacientes: number; lista: PacienteDelDia[] };
  /** Siempre los seis, del 1 (lunes) al 6 (sábado), aunque tengan 0. */
  dias: { dia: number; pacientes: number; lista: PacienteDelDia[] }[];
}

export interface ReporteNutricion {
  periodo: { desde: string; hasta: string };
  resumen: ResumenReporte;
  resultados: ResultadosReporte;
  imc: { grados: { grado: string; pacientes: number }[]; sinDato: number };
  tratamientos: TratamientoReporte[];
  pagos: { meses: MesPagos[]; total: Omit<MesPagos, "mes" | "pacientes"> };
  /** §11. Un backend anterior no lo manda (= la tarjeta no se dibuja). */
  porDia?: PorDiaReporte;
}

export const apiReportesNutricion = {
  reporte: (p: { desde: string; hasta: string }) =>
    request<ReporteNutricion>(`/nutricion/reportes${qs({ desde: p.desde, hasta: p.hasta })}`),
};
