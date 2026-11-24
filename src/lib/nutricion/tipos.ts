/**
 * Los datos de la evaluación de pacientes (rubro NUTRICION, feature
 * `nutricion`), tal como los manda el backend
 * (CONTRATO-nutricion-evaluacion-22nov §3). Los decimales viajan como número
 * y las fechas de calendario como "AAAA-MM-DD".
 *
 * Dato sensible de salud: nada de esto va a la consola ni a la telemetría.
 */

export type Sexo = "F" | "M";

/** El color del grado: bajo (azul), bien (verde), alerta (ámbar), alto (rojo). */
export type TonoGrado = "bajo" | "bien" | "alerta" | "alto";

/** Un renglón de una tabla de grados: el valor cae si `desde <= valor < hasta` (null = sin tope). */
export interface Rango {
  grado: string;
  nombre: string;
  desde: number | null;
  hasta: number | null;
  /** Lo que se lee en la tabla: «menos de 18,5», «18,5 – 24,9», «40,0 o más». */
  texto: string;
  tono: TonoGrado;
}

/** Una tabla: vale para ese sexo (null = los dos) y esas edades (inclusive; null = sin tope). */
export interface TablaGrados {
  sexo: Sexo | null;
  edadDesde: number | null;
  edadHasta: number | null;
  rangos: Rango[];
}

/** Las cuatro medidas que tienen tabla de grados. */
export type MedidaConTabla = "imc" | "grasa" | "musculo" | "visceral";

export interface Catalogo {
  enfermedades: { codigo: string; nombre: string }[];
  tablas: Record<MedidaConTabla, TablaGrados[]>;
}

/** Una enfermedad de base contestada. La que no figura no se preguntó. */
export interface Enfermedad {
  tiene: boolean;
  nota: string | null;
}

export interface Control {
  id: number;
  fecha: string;
  /** Sólo el primero (por fecha, después id). */
  inicial: boolean;
  pesoKg: number | null;
  imc: number | null;
  imcGrado: string | null;
  cinturaCm: number | null;
  caderaCm: number | null;
  pechoCm: number | null;
  grasaPct: number | null;
  grasaGrado: string | null;
  musculoPct: number | null;
  musculoGrado: string | null;
  edadCorporal: number | null;
  grasaVisceral: number | null;
  visceralGrado: string | null;
  nota: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

/** El paciente con su ficha y sus controles: lo devuelven el detalle y todas las escrituras. */
export interface Paciente {
  id: number;
  clienteId: number;
  nombre: string;
  ci: string | null;
  ciExpedido: string | null;
  telefono: string | null;
  fechaNacimiento: string | null;
  /** La de hoy (de la fecha de nacimiento o de la edad que se anotó). */
  edad: number | null;
  /** Lo que se escribió, si no hay fecha de nacimiento. */
  edadDeclarada: number | null;
  /** El día en que se anotó esa edad ("AAAA-MM-DD"). Una respuesta vieja no lo trae. */
  edadDeclaradaEn?: string | null;
  sexo: Sexo | null;
  hijos: number | null;
  tallaCm: number | null;
  observaciones: string | null;
  ultimosAnalisis: string | null;
  enfermedades: Record<string, Enfermedad>;
  otrasEnfermedades: string | null;
  cirugias: string | null;
  conductaAlimentaria: string | null;
  conductaSueno: string | null;
  actividadFisica: string | null;
  consumoAgua: string | null;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  /** Por fecha ascendente (después id). */
  controles: Control[];
  /**
   * La serie de pesos al día (CONTRATO-nutricion-seguimiento-23nov §4.4): los
   * de los controles y los de cada semana del seguimiento, por fecha. Una
   * respuesta sin el seguimiento no la trae, y todo se lee de los controles.
   */
  pesos?: PesoDelPaciente[];
}

/** Un peso de la serie: de un control de la evaluación o de una semana del seguimiento. */
export interface PesoDelPaciente {
  fecha: string;
  pesoKg: number;
  imc: number | null;
  imcGrado: string | null;
  origen: "CONTROL" | "SEGUIMIENTO";
  controlId: number | null;
  registroId: number | null;
  semana: number | null;
}

/** Un renglón de la lista de pacientes. */
export interface PacienteFila {
  id: number;
  nombre: string;
  ci: string | null;
  telefono: string | null;
  sexo: Sexo | null;
  edad: number | null;
  controles: number;
  ultimoControl: string | null;
  /** Primer y último control CON peso. */
  pesoInicial: number | null;
  pesoActual: number | null;
  /** Del último control con peso. */
  imc: number | null;
  imcGrado: string | null;
  activo: boolean;
  actualizadoEn: string;
}

export interface ListaPacientes {
  total: number;
  pagina: number;
  porPagina: number;
  items: PacienteFila[];
}

/** Lo que se manda de un control (alta o corrección). `imc` no: lo calcula el servidor. */
export interface ControlInput {
  fecha?: string;
  pesoKg?: number | null;
  cinturaCm?: number | null;
  caderaCm?: number | null;
  pechoCm?: number | null;
  grasaPct?: number | null;
  grasaGrado?: string | null;
  musculoPct?: number | null;
  musculoGrado?: string | null;
  edadCorporal?: number | null;
  grasaVisceral?: number | null;
  visceralGrado?: string | null;
  imcGrado?: string | null;
  nota?: string | null;
}

/** Los datos de la ficha que se mandan en el alta y en la edición. */
export interface FichaInput {
  nombre?: string;
  ci?: string | null;
  ciExpedido?: string | null;
  telefono?: string | null;
  fechaNacimiento?: string | null;
  edad?: number | null;
  sexo?: Sexo | null;
  hijos?: number | null;
  tallaCm?: number | null;
  observaciones?: string | null;
  ultimosAnalisis?: string | null;
  enfermedades?: Record<string, Enfermedad>;
  otrasEnfermedades?: string | null;
  cirugias?: string | null;
  conductaAlimentaria?: string | null;
  conductaSueno?: string | null;
  actividadFisica?: string | null;
  consumoAgua?: string | null;
}

/** `POST /nutricion/pacientes`: la ficha y, si hay algo medido, el primer control. */
export interface AltaPacienteInput extends FichaInput {
  nombre: string;
  control?: ControlInput;
}

/** `PATCH /nutricion/pacientes/:id`: lo que cambió, más `activo` para archivar o devolver. */
export interface EdicionPacienteInput extends FichaInput {
  activo?: boolean;
}
