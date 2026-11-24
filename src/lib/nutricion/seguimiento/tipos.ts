/**
 * El seguimiento del tratamiento semana a semana (rubro NUTRICION, etapa 2),
 * tal como lo manda el backend (CONTRATO-nutricion-seguimiento-23nov §3). Los
 * decimales viajan como número y las fechas de calendario como "AAAA-MM-DD".
 *
 * Las cuentas de los meses, los pagos y las equivalencias de la dosis las hace
 * el servidor (§2): la web usa `mes`, `meses`, `tocaPago`, `pagosPendientes` y
 * `proximoPago` tal cual llegan, sin conocer cada cuántas semanas se paga.
 *
 * Dato sensible de salud: nada de esto va a la consola ni a la telemetría.
 */

/** En qué anota la dosis la doctora. */
export type UnidadDosis = "mg" | "UI" | "ml";

export interface AjustesSeguimiento {
  /** El paciente paga al iniciar y después cada N semanas (2 a 12). */
  pagoCadaSemanas: number;
  /** Los avisos de «toca pago» y «falta pagar». */
  avisarPagos: boolean;
}

/** `GET /nutricion/seguimiento/catalogo`: sugerencias para escribir menos y los ajustes del negocio. */
export interface CatalogoSeguimiento {
  /** `puedeCambiarlos`: si ESTA persona puede cambiarlos (`negocio.configurar`). */
  ajustes: AjustesSeguimiento & { puedeCambiarlos: boolean };
  unidades: UnidadDosis[];
  /** La jeringa de insulina: 100 UI por ml. */
  uiPorMl: number;
  tratamientos: TratamientoDelCatalogo[];
}

export interface TratamientoDelCatalogo {
  nombre: string;
  /** Los escalones de la dosis semanal, en mg (vacío = sin botones de escalón). */
  pasosMg: number[];
  presentaciones: { mg: number; ml: number }[];
}

/** El vial: cuántos mg trae y en cuántos ml (15 mg en 0,5 ml), con su concentración. */
export interface Presentacion {
  mg: number;
  ml: number;
  mgPorMl: number;
  mgPorUi: number;
}

/** Un escalón de la dosis con sus equivalencias (`ui`/`ml` en null sin presentación). */
export interface Paso {
  mg: number;
  ui: number | null;
  ml: number | null;
}

/** Las equivalencias de una dosis: lo que no se puede saber va en null. */
export interface Equivalencias {
  dosisMg: number | null;
  dosisUi: number | null;
  dosisMl: number | null;
}

/** Una dosis tal como se anotó, con sus equivalencias. */
export interface DosisAnotada extends Equivalencias {
  dosis: number;
  unidadDosis: UnidadDosis;
}

/** Lo pagado (sumas). Para el «mes», sólo cuentan medicamento y control. */
export interface Pagado {
  medicamento: number;
  control: number;
  otro: number;
  total: number;
}

/** Un mes que debe: su número, la semana en que se paga (0 = el pago inicial) y desde cuándo debe. */
export interface PagoPendiente {
  mes: number;
  semana: number;
  desde: string;
}

/** «Ya viene su pago»: en la semana que sigue le toca pagar. */
export interface ProximoPago {
  mes: number;
  semana: number;
}

export interface ResumenTratamiento {
  /** La semana más alta cargada (0 = sólo el inicial). */
  semana: number;
  registros: number;
  ultimaFecha: string | null;
  pesoInicial: number | null;
  pesoActual: number | null;
  /** Positivo = bajó; negativo = subió. */
  kgBajados: number | null;
  dosisActual: DosisAnotada | null;
  /** Cuántas semanas seguidas lleva con la dosis actual. */
  semanasEnDosis: number;
  /** Cuántas semanas se marcaron «No se aplicó» (§2; una respuesta vieja no lo trae). */
  semanasSinDosis?: number;
  pagado: Pagado;
  pagosPendientes: PagoPendiente[];
  proximoPago: ProximoPago | null;
}

/** Un «mes» de la hoja: un bloque de semanas que se paga una vez. */
export interface MesTratamiento {
  mes: number;
  desdeSemana: number;
  hastaSemana: number;
  /** La semana en que se paga ese mes (0 en el mes 1; null con los avisos apagados). */
  semanaDePago: number | null;
  debe: boolean;
  pagado: Pagado;
}

/** Un renglón de la hoja: el inicial (semana 0) o una semana. */
export interface Registro {
  id: number;
  semana: number;
  mes: number;
  /** El casillero amarillo del papel: la semana de pago de su mes (no el inicial). */
  tocaPago: boolean;
  fecha: string;
  pesoKg: number | null;
  /** Desde el peso inicial: positivo = bajó (null si no tiene peso o es el del inicio). */
  kgBajados: number | null;
  /** Desde el registro anterior con peso. */
  kgSemana: number | null;
  /** Lo que se anotó y en qué unidad… */
  dosis: number | null;
  unidadDosis: UnidadDosis | null;
  /** …y sus equivalencias con la concentración guardada en ESTE registro. */
  dosisMg: number | null;
  dosisUi: number | null;
  dosisMl: number | null;
  /** «No se aplicó» esa semana (salud, viaje…). */
  sinDosis: boolean;
  motivoSinDosis: string | null;
  observaciones: string | null;
  pagoMedicamento: number | null;
  pagoControl: number | null;
  pagoOtro: number | null;
  pagoNota: string | null;
  /** El nombre de quien lo cargó y de quien lo corrigió por última vez. */
  registradoPor?: string | null;
  actualizadoPor?: string | null;
  /**
   * La marca «desde esta semana usa X» (§7.1): sólo en la semana en que el
   * producto CAMBIA. Un backend anterior no la manda (= sin marca).
   */
  producto?: ProductoDeLaSemana | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** Un producto: su nombre y, si se cargó, la presentación del vial (las dos o ninguna). */
export interface Producto {
  nombre: string;
  vialMg: number | null;
  vialMl: number | null;
}

/** La marca del cambio de producto en una semana; `anterior`, el que se usaba justo antes. */
export interface ProductoDeLaSemana extends Producto {
  anterior: string | null;
}

export type EstadoTratamiento = "ACTIVO" | "TERMINADO";

/** El tratamiento con su hoja: lo devuelven todas las escrituras y los GET de detalle (§3.2). */
export interface Tratamiento {
  id: number;
  pacienteId: number;
  nombre: string;
  unidadDosis: UnidadDosis;
  presentacion: Presentacion | null;
  pasos: Paso[];
  estado: EstadoTratamiento;
  /** La fecha del registro inicial. */
  inicio: string;
  terminadoEn: string | null;
  nota: string | null;
  resumen: ResumenTratamiento;
  /** Del mes 1 hasta el de la semana que sigue, sin saltear. */
  meses: MesTratamiento[];
  /** Por semana ascendente. */
  registros: Registro[];
  /**
   * Con cambios de producto (§7.1), `nombre` y `presentacion` son los del
   * producto ACTUAL; éste es el de cuando empezó. Un backend anterior no los
   * manda (= nunca cambió de producto).
   */
  productoInicial?: Producto | null;
  /** Cuántas semanas tienen la marca de cambio de producto. */
  cambiosDeProducto?: number;
  creadoEn: string;
  actualizadoEn: string;
}

/** El tratamiento ACTIVO resumido, en la lista. */
export interface TratamientoDeLaLista {
  id: number;
  nombre: string;
  unidadDosis: UnidadDosis;
  semana: number;
  ultimaFecha: string | null;
  dosisActual: DosisAnotada | null;
  pesoInicial: number | null;
  pesoActual: number | null;
  kgBajados: number | null;
  /** Cuántos meses debe. */
  pagosPendientes: number;
  /** Si en su próxima semana le toca pagar. */
  proximoPago: boolean;
}

export interface FilaSeguimiento {
  id: number;
  nombre: string;
  ci: string | null;
  telefono: string | null;
  sexo: "F" | "M" | null;
  edad: number | null;
  /** El ACTIVO, o null. */
  tratamiento: TratamientoDeLaLista | null;
  /** Cuántos TERMINADOS tiene. */
  anteriores: number;
}

export interface ListaSeguimiento {
  total: number;
  pagina: number;
  porPagina: number;
  items: FilaSeguimiento[];
}

/** Un tratamiento TERMINADO, en la lista de anteriores. */
export interface TratamientoAnterior {
  id: number;
  nombre: string;
  inicio: string;
  terminadoEn: string | null;
  semana: number;
  pesoInicial: number | null;
  pesoActual: number | null;
  kgBajados: number | null;
}

/** `GET /nutricion/seguimiento/pacientes/:id`: la hoja del paciente. */
export interface HojaPaciente {
  paciente: {
    id: number;
    nombre: string;
    ci: string | null;
    ciExpedido: string | null;
    telefono: string | null;
    sexo: "F" | "M" | null;
    edad: number | null;
    tallaCm: number | null;
    activo: boolean;
  };
  /** El último control de la Evaluación con peso: se ofrece con «Usar», nunca se precarga. */
  ultimoControl: { fecha: string; pesoKg: number } | null;
  /** El ACTIVO, o null. */
  tratamiento: Tratamiento | null;
  /** Los TERMINADOS, del más nuevo al más viejo. */
  anteriores: TratamientoAnterior[];
}

export interface PacienteDeLosPagos {
  id: number;
  nombre: string;
  ci: string | null;
  telefono: string | null;
}

export interface TratamientoDeLosPagos {
  id: number;
  nombre: string;
  semana: number;
  ultimaFecha: string | null;
}

/** El último registro con pago de medicamento o control, y lo que sumó. */
export interface UltimoPago {
  fecha: string;
  total: number;
}

/** `GET /nutricion/seguimiento/pagos-pendientes`. */
export interface PagosPendientes {
  avisarPagos: boolean;
  /** Los que deben algún mes: primero el que debe desde hace más. */
  deben: {
    paciente: PacienteDeLosPagos;
    tratamiento: TratamientoDeLosPagos;
    pendientes: PagoPendiente[];
    ultimoPago: UltimoPago | null;
  }[];
  /** Los que no deben y en su próxima visita les toca pagar: primero el que hace más que no viene. */
  proximos: {
    paciente: PacienteDeLosPagos;
    tratamiento: TratamientoDeLosPagos;
    proximoPago: ProximoPago;
    ultimoPago: UltimoPago | null;
  }[];
}

// ── Lo que se manda ─────────────────────────────────────────────────────────

/** Una semana: la del alta (`POST …/registros`) o la corrección (`PATCH /nutricion/registros/:id`). */
export interface RegistroInput {
  /** Sin enviar en el alta = la más alta cargada + 1. El inicial no cambia de número. */
  semana?: number;
  fecha?: string;
  pesoKg?: number | null;
  /** En la unidad del tratamiento: el servidor guarda con ella la unidad y la concentración. */
  dosis?: number | null;
  sinDosis?: boolean;
  motivoSinDosis?: string | null;
  observaciones?: string | null;
  pagoMedicamento?: number | null;
  pagoControl?: number | null;
  pagoOtro?: number | null;
  pagoNota?: string | null;
  /**
   * La marca del cambio de producto (§7.1): el producto desde esta semana, o
   * `null` (en la corrección, quita la marca). Sin enviar = no se toca: la web
   * la manda SÓLO si hay un cambio que guardar (un backend anterior la rechaza).
   */
  producto?: { nombre: string; vialMg?: number; vialMl?: number } | null;
}

/** `POST /nutricion/seguimiento/pacientes/:id/tratamientos`. */
export interface IniciarTratamientoInput {
  nombre: string;
  unidadDosis: UnidadDosis;
  /** Las dos o ninguna. */
  vialMg?: number;
  vialMl?: number;
  inicial?: Omit<RegistroInput, "semana" | "sinDosis" | "motivoSinDosis" | "producto">;
}

/** `PATCH /nutricion/tratamientos/:id`. */
export interface CambiosTratamiento {
  nombre?: string;
  unidadDosis?: UnidadDosis;
  /** `null` las dos quita la presentación. */
  vialMg?: number | null;
  vialMl?: number | null;
  nota?: string | null;
  estado?: EstadoTratamiento;
  terminadoEn?: string;
}
