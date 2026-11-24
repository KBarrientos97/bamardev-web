import type {
  CatalogoSeguimiento,
  DosisAnotada,
  FilaSeguimiento,
  HojaPaciente,
  MesTratamiento,
  Pagado,
  PagosPendientes,
  Registro,
  Tratamiento,
  TratamientoAnterior,
  UnidadDosis,
} from "../lib/nutricion/seguimiento/tipos";

/**
 * Respuestas simuladas del seguimiento (CONTRATO-nutricion-seguimiento-23nov
 * §3), sólo para los tests y para mirar las pantallas sin el backend. Los
 * campos que calcula el servidor (meses, avisos, kilos, equivalencias) se arman
 * acá con las reglas del §2, a partir de las semanas «crudas». En la app los
 * calcula el servidor y la web no los conoce.
 *
 * Sin dependencias de la app (sólo tipos): también lo importa el guion que
 * mira las pantallas con Chrome.
 */

export const CATALOGO_SEGUIMIENTO: CatalogoSeguimiento = {
  ajustes: { pagoCadaSemanas: 5, avisarPagos: true, puedeCambiarlos: true },
  unidades: ["mg", "UI", "ml"],
  uiPorMl: 100,
  tratamientos: [
    {
      nombre: "Tirzepatida",
      pasosMg: [2.5, 5, 7.5, 10, 12.5, 15],
      presentaciones: [
        { mg: 15, ml: 0.5 },
        { mg: 10, ml: 0.5 },
        { mg: 5, ml: 0.5 },
      ],
    },
    { nombre: "Retatrutida", pasosMg: [], presentaciones: [] },
  ],
};

/** Redondea con el medio para arriba, como el servidor. */
function red(n: number, d: number): number {
  const r = Number(`${Math.round(Number(`${Math.abs(n)}e${d}`))}e-${d}`);
  return (n < 0 ? -r : r) || 0;
}

/** "AAAA-MM-DD" de `dias` antes (o después, con negativo) de `hoy`. */
export function diasAntes(hoy: string, dias: number): string {
  const [a, m, d] = hoy.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d - dias));
  return f.toISOString().slice(0, 10);
}

export interface SemanaCruda {
  id?: number;
  semana: number;
  fecha: string;
  pesoKg?: number | null;
  dosis?: number | null;
  /** La unidad con que se anotó (si no, la del tratamiento). */
  unidadDosis?: UnidadDosis;
  /** La concentración con que se anotó (si no, la del vial del tratamiento). */
  mgPorMl?: number | null;
  sinDosis?: boolean;
  motivoSinDosis?: string | null;
  observaciones?: string | null;
  pagoMedicamento?: number | null;
  pagoControl?: number | null;
  pagoOtro?: number | null;
  pagoNota?: string | null;
  registradoPor?: string | null;
  actualizadoPor?: string | null;
  creadoEn?: string;
  actualizadoEn?: string;
  /** La marca «desde esta semana usa X» (§7.1). Con alguna, el tratamiento trae `productoInicial` y `cambiosDeProducto`. */
  producto?: { nombre: string; vialMg?: number; vialMl?: number };
}

export interface TratamientoCrudo {
  id: number;
  pacienteId: number;
  nombre: string;
  unidadDosis: UnidadDosis;
  vial?: { mg: number; ml: number } | null;
  estado?: "ACTIVO" | "TERMINADO";
  terminadoEn?: string | null;
  nota?: string | null;
  semanas: SemanaCruda[];
}

export interface AjustesDePrueba {
  pagoCadaSemanas?: number;
  avisarPagos?: boolean;
  uiPorMl?: number;
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

function equivalencias(dosis: number, unidad: UnidadDosis, mgPorMl: number | null, uiPorMl: number) {
  const ml = unidad === "ml" ? dosis : unidad === "UI" ? dosis / uiPorMl : mgPorMl ? dosis / mgPorMl : null;
  const mg = unidad === "mg" ? dosis : ml != null && mgPorMl ? ml * mgPorMl : null;
  const ui = ml != null ? ml * uiPorMl : null;
  return { dosisMg: mg == null ? null : red(mg, 2), dosisUi: ui == null ? null : red(ui, 1), dosisMl: ml == null ? null : red(ml, 3) };
}

const cero = (): Pagado => ({ medicamento: 0, control: 0, otro: 0, total: 0 });
function sumar(p: Pagado, r: SemanaCruda) {
  p.medicamento = red(p.medicamento + (r.pagoMedicamento ?? 0), 2);
  p.control = red(p.control + (r.pagoControl ?? 0), 2);
  p.otro = red(p.otro + (r.pagoOtro ?? 0), 2);
  p.total = red(p.medicamento + p.control + p.otro, 2);
}

let siguienteId = 5000;

/** El `Tratamiento` que devolvería el servidor (§3.2), con sus cuentas del §2. */
export function armarTratamiento(t: TratamientoCrudo, ajustes: AjustesDePrueba = {}): Tratamiento {
  const N = ajustes.pagoCadaSemanas ?? 5;
  const avisar = ajustes.avisarPagos ?? true;
  const uiPorMl = ajustes.uiPorMl ?? 100;
  const activo = (t.estado ?? "ACTIVO") === "ACTIVO";
  const semanas = [...t.semanas].sort((a, b) => a.semana - b.semana);
  for (const s of semanas) s.id ??= siguienteId++;
  const mesDe = (s: number) => Math.floor(s / N) + 1;
  const tocaPago = (s: number) => avisar && s > 0 && s % N === 0;
  // §7.1: el producto vigente en cada semana (la marca más alta ≤ W, o el del inicio).
  const inicialP = { nombre: t.nombre, vialMg: t.vial?.mg ?? null, vialMl: t.vial?.ml ?? null };
  const vigenteEn = (w: number) => {
    let p = inicialP;
    for (const s of semanas) if (s.producto && s.semana <= w) p = { nombre: s.producto.nombre, vialMg: s.producto.vialMg ?? null, vialMl: s.producto.vialMl ?? null };
    return p;
  };
  const concDe = (p: { vialMg: number | null; vialMl: number | null }) => (p.vialMg != null && p.vialMl != null ? p.vialMg / p.vialMl : null);
  const marcas = semanas.filter((s) => s.producto).length;
  const actualP = vigenteEn(Number.MAX_SAFE_INTEGER);
  const vialConc = concDe(actualP);

  const conPeso = semanas.filter((s) => s.pesoKg != null);
  const primeroConPeso = conPeso[0];
  const registros: Registro[] = semanas.map((s) => {
    const unidad = s.dosis != null && !s.sinDosis ? (s.unidadDosis ?? t.unidadDosis) : null;
    const conc = s.mgPorMl !== undefined ? s.mgPorMl : concDe(vigenteEn(s.semana));
    const eq = unidad && s.dosis != null ? equivalencias(s.dosis, unidad, conc, uiPorMl) : { dosisMg: null, dosisUi: null, dosisMl: null };
    const anterior = [...conPeso].reverse().find((x) => x.semana < s.semana);
    return {
      id: s.id!,
      semana: s.semana,
      mes: mesDe(s.semana),
      tocaPago: tocaPago(s.semana),
      fecha: s.fecha,
      pesoKg: s.pesoKg ?? null,
      kgBajados: s.pesoKg == null || !primeroConPeso || primeroConPeso === s ? null : red(primeroConPeso.pesoKg! - s.pesoKg, 2),
      kgSemana: s.pesoKg == null || !anterior ? null : red(anterior.pesoKg! - s.pesoKg, 2),
      dosis: s.sinDosis ? null : (s.dosis ?? null),
      unidadDosis: unidad,
      ...eq,
      sinDosis: !!s.sinDosis,
      motivoSinDosis: s.sinDosis ? (s.motivoSinDosis ?? null) : null,
      observaciones: s.observaciones ?? null,
      pagoMedicamento: s.pagoMedicamento || null,
      pagoControl: s.pagoControl || null,
      pagoOtro: s.pagoOtro || null,
      pagoNota: s.pagoNota ?? null,
      registradoPor: s.registradoPor === undefined ? "Dra. Prueba" : s.registradoPor,
      actualizadoPor: s.actualizadoPor ?? null,
      creadoEn: s.creadoEn ?? `${s.fecha}T14:32:00.000Z`,
      actualizadoEn: s.actualizadoEn ?? `${s.fecha}T14:32:00.000Z`,
      ...(marcas
        ? {
            producto: s.producto
              ? { nombre: s.producto.nombre, vialMg: s.producto.vialMg ?? null, vialMl: s.producto.vialMl ?? null, anterior: vigenteEn(s.semana - 1).nombre }
              : null,
          }
        : {}),
    };
  });

  const maxSemana = registros.length ? registros[registros.length - 1].semana : 0;
  const siguiente = maxSemana + 1;
  const meses: MesTratamiento[] = [];
  for (let k = 1; k <= mesDe(siguiente); k++) {
    const desde = (k - 1) * N;
    const hasta = k * N - 1;
    const pagado = cero();
    for (const s of semanas) if (s.semana >= desde && s.semana <= hasta) sumar(pagado, s);
    const empezo = semanas.some((s) => s.semana >= desde);
    meses.push({
      mes: k,
      desdeSemana: desde,
      hastaSemana: hasta,
      semanaDePago: avisar ? desde : null,
      debe: avisar && empezo && pagado.medicamento + pagado.control === 0,
      pagado,
    });
  }
  const pagosPendientes = meses
    .filter((m) => m.debe)
    .map((m) => ({ mes: m.mes, semana: m.semanaDePago!, desde: semanas.find((s) => s.semana >= m.desdeSemana)!.fecha }));

  const conDosis = registros.filter((r) => r.dosis != null && !r.sinDosis);
  const ultimaDosis = conDosis[conDosis.length - 1];
  const misma = (a: Registro, b: Registro) =>
    a.dosisMg != null && b.dosisMg != null ? Math.abs(a.dosisMg - b.dosisMg) < 1e-9 : a.dosis === b.dosis && a.unidadDosis === b.unidadDosis;
  let enDosis = 0;
  for (let i = conDosis.length - 1; i >= 0; i--) {
    if (!misma(conDosis[i], ultimaDosis)) break;
    enDosis++;
  }
  const pagado = cero();
  for (const s of semanas) sumar(pagado, s);
  const pesoInicial = primeroConPeso?.pesoKg ?? null;
  const pesoActual = conPeso[conPeso.length - 1]?.pesoKg ?? null;
  const dosisActual: DosisAnotada | null = ultimaDosis
    ? { dosis: ultimaDosis.dosis!, unidadDosis: ultimaDosis.unidadDosis!, dosisMg: ultimaDosis.dosisMg, dosisUi: ultimaDosis.dosisUi, dosisMl: ultimaDosis.dosisMl }
    : null;
  // Con marcas, `nombre`, `presentacion` y `pasos` son los del producto ACTUAL (§7.1).
  const delCatalogo = CATALOGO_SEGUIMIENTO.tratamientos.find((c) => normalizar(c.nombre) === normalizar(actualP.nombre));
  return {
    id: t.id,
    pacienteId: t.pacienteId,
    nombre: actualP.nombre,
    unidadDosis: t.unidadDosis,
    presentacion: vialConc ? { mg: actualP.vialMg!, ml: actualP.vialMl!, mgPorMl: red(vialConc, 4), mgPorUi: red(vialConc / uiPorMl, 4) } : null,
    ...(marcas ? { productoInicial: inicialP, cambiosDeProducto: marcas } : {}),
    pasos: (delCatalogo?.pasosMg ?? []).map((mg) => {
      const eq = equivalencias(mg, "mg", vialConc, uiPorMl);
      return { mg, ui: vialConc ? eq.dosisUi : null, ml: vialConc ? eq.dosisMl : null };
    }),
    estado: activo ? "ACTIVO" : "TERMINADO",
    inicio: semanas[0]?.fecha ?? "",
    terminadoEn: activo ? null : (t.terminadoEn ?? null),
    nota: t.nota ?? null,
    resumen: {
      semana: maxSemana,
      registros: registros.length,
      ultimaFecha: registros[registros.length - 1]?.fecha ?? null,
      pesoInicial,
      pesoActual,
      kgBajados: pesoInicial != null && pesoActual != null && conPeso.length > 1 ? red(pesoInicial - pesoActual, 2) : null,
      dosisActual,
      semanasEnDosis: enDosis,
      semanasSinDosis: registros.filter((r) => r.sinDosis).length,
      pagado,
      pagosPendientes,
      proximoPago: activo && tocaPago(siguiente) ? { mes: mesDe(siguiente), semana: siguiente } : null,
    },
    meses,
    registros,
    creadoEn: `${semanas[0]?.fecha ?? "2026-11-01"}T14:00:00.000Z`,
    actualizadoEn: `${registros[registros.length - 1]?.fecha ?? "2026-11-01"}T14:32:00.000Z`,
  };
}

/** El resumen de un tratamiento terminado, como va en `anteriores`. */
export function anteriorDe(t: Tratamiento): TratamientoAnterior {
  return {
    id: t.id,
    nombre: t.nombre,
    inicio: t.inicio,
    terminadoEn: t.terminadoEn,
    semana: t.resumen.semana,
    pesoInicial: t.resumen.pesoInicial,
    pesoActual: t.resumen.pesoActual,
    kgBajados: t.resumen.kgBajados,
  };
}

// ── Los pacientes de prueba (inventados) ────────────────────────────────────

export interface PacienteDePrueba {
  paciente: HojaPaciente["paciente"];
  ultimoControl: HojaPaciente["ultimoControl"];
  tratamientos: TratamientoCrudo[];
}

const datos = (id: number, nombre: string, ci: string, sexo: "F" | "M", edad: number, tallaCm: number): HojaPaciente["paciente"] => ({
  id,
  nombre,
  ci,
  ciExpedido: "SC",
  telefono: `7${String(id).padStart(7, "0")}`,
  sexo,
  edad,
  tallaCm,
  activo: true,
});

/** Semanas parejas de 7 días desde `inicio`, con lo que se pase para cada una. */
function cadaSemana(inicio: string, hasta: number, cada: (s: number) => Omit<SemanaCruda, "semana" | "fecha">): SemanaCruda[] {
  return Array.from({ length: hasta + 1 }, (_, s) => ({ semana: s, fecha: diasAntes(inicio, -7 * s), ...cada(s) }));
}

const PAGO_MES = { pagoMedicamento: 480, pagoControl: 150 };

/**
 * Los pacientes del contrato (§0: nombres inventados): uno sin tratamiento; uno
 * en la semana 3 sin avisos (y que subió de peso); uno en la semana 4 (le toca
 * pagar la próxima); uno en la semana 7 que debe la semana 5, con una semana
 * «No se aplicó», observaciones largas, un peso que subió y la dosis en UI con
 * el vial de 15 mg en 0,5 ml; uno en la semana 12 con todo pagado; uno con un
 * tratamiento terminado y otro anterior; y otros más para los pagos.
 */
export function pacientesDePrueba(hoy: string): PacienteDePrueba[] {
  const lucia0 = diasAntes(hoy, 52);
  return [
    {
      paciente: datos(20, "Rosa Vaca Gutiérrez", "5566778", "F", 52, 160),
      ultimoControl: { fecha: diasAntes(hoy, 2), pesoKg: 92.4 },
      tratamientos: [],
    },
    {
      paciente: datos(21, "Daniel Rojas Mendoza", "6677889", "M", 41, 176),
      ultimoControl: null,
      tratamientos: [
        {
          id: 6,
          pacienteId: 21,
          nombre: "Tirzepatida",
          unidadDosis: "mg",
          semanas: cadaSemana(diasAntes(hoy, 23), 3, (s) => ({
            pesoKg: [101.2, 100.4, 100.9, 101.6][s],
            dosis: 2.5,
            ...(s === 0 ? PAGO_MES : {}),
            observaciones: s === 2 ? "Comió fuera toda la semana." : null,
          })),
        },
      ],
    },
    {
      paciente: datos(22, "Carla Méndez Ruiz", "7788990", "F", 33, 162),
      ultimoControl: null,
      tratamientos: [
        {
          id: 7,
          pacienteId: 22,
          nombre: "Tirzepatida",
          unidadDosis: "UI",
          vial: { mg: 10, ml: 0.5 },
          semanas: cadaSemana(diasAntes(hoy, 34), 4, (s) => ({
            pesoKg: [88, 87.1, 86.5, 85.8, 85.2][s],
            dosis: s < 4 ? 13 : 25,
            ...(s === 0 ? PAGO_MES : {}),
          })),
        },
      ],
    },
    {
      paciente: datos(12, "Lucía Paredes Soria", "1234567", "F", 36, 158),
      ultimoControl: { fecha: diasAntes(lucia0, -49), pesoKg: 124.5 },
      tratamientos: [
        {
          id: 5,
          pacienteId: 12,
          nombre: "Tirzepatida",
          unidadDosis: "UI",
          vial: { mg: 15, ml: 0.5 },
          nota: "Viene derivada por su médico. Controlar la presión cada mes y avisar si aparecen náuseas fuertes.",
          semanas: [
            {
              semana: 0,
              fecha: lucia0,
              pesoKg: 129,
              dosis: 8,
              ...PAGO_MES,
              observaciones: "Primera aplicación. Se le explicó cómo guardar el vial en la heladera.",
            },
            { semana: 1, fecha: diasAntes(lucia0, -7), pesoKg: 127.6, dosis: 8, observaciones: "Náuseas leves el segundo día." },
            { semana: 2, fecha: diasAntes(lucia0, -14), pesoKg: 126.2, dosis: 8 },
            { semana: 3, fecha: diasAntes(lucia0, -21), pesoKg: 125.1, dosis: 17, observaciones: "Sube a 5 mg." },
            { semana: 4, fecha: diasAntes(lucia0, -28), pesoKg: 124, dosis: 17, pagoOtro: 50, pagoNota: "Jeringas" },
            {
              semana: 5,
              fecha: diasAntes(lucia0, -35),
              pesoKg: 123.4,
              dosis: 17,
              observaciones: "No trajo para el pago del mes: queda para la próxima visita.",
              actualizadoPor: "Administración",
              actualizadoEn: `${diasAntes(lucia0, -36)}T09:10:00.000Z`,
            },
            {
              semana: 6,
              fecha: diasAntes(lucia0, -42),
              pesoKg: 123.9,
              sinDosis: true,
              motivoSinDosis: "Viaje",
              observaciones:
                "Viajó a ver a su familia y no se aplicó la dosis. Comió más de lo habitual en las fiestas; se le recordó tomar agua y caminar todos los días. Retoma la semana que viene con la misma dosis, sin subir.",
            },
            {
              semana: 7,
              fecha: diasAntes(lucia0, -49),
              pesoKg: 124.7,
              dosis: 17,
              observaciones: "Cambio de laboratorio: de TG a Tirzec. Sin náuseas. Subió 0,8 kg: retomó la alimentación de siempre.",
            },
          ],
        },
      ],
    },
    {
      paciente: datos(23, "Jorge Antelo Suárez", "8899001", "M", 47, 171),
      ultimoControl: null,
      tratamientos: [
        {
          id: 8,
          pacienteId: 23,
          nombre: "Tirzepatida",
          unidadDosis: "ml",
          vial: { mg: 15, ml: 0.5 },
          semanas: cadaSemana(diasAntes(hoy, 87), 12, (s) => ({
            pesoKg: red(112 - s * 0.85, 2),
            dosis: s < 4 ? 0.08 : s < 8 ? 0.17 : 0.25,
            ...(s % 5 === 0 ? PAGO_MES : {}),
            ...(s === 8 ? { pagoOtro: 50, pagoNota: "Jeringas y algodón" } : {}),
          })),
        },
      ],
    },
    {
      paciente: datos(24, "Mónica Salvatierra Flores", "9900112", "F", 58, 155),
      ultimoControl: { fecha: "2026-10-30", pesoKg: 86 },
      tratamientos: [
        {
          id: 3,
          pacienteId: 24,
          nombre: "Tirzepatida",
          unidadDosis: "UI",
          vial: { mg: 15, ml: 0.5 },
          estado: "TERMINADO",
          terminadoEn: "2026-06-22",
          semanas: cadaSemana("2026-03-02", 16, (s) => ({
            pesoKg: red(96 - s * 0.72, 2),
            dosis: s < 4 ? 8 : s < 8 ? 17 : 25,
            ...(s % 5 === 0 ? PAGO_MES : {}),
          })),
        },
        {
          id: 2,
          pacienteId: 24,
          nombre: "Retatrutida",
          unidadDosis: "mg",
          estado: "TERMINADO",
          terminadoEn: "2025-11-10",
          semanas: cadaSemana("2025-09-01", 10, (s) => ({ pesoKg: red(99 - s * 0.4, 2), dosis: 2, ...(s % 5 === 0 ? PAGO_MES : {}) })),
        },
      ],
    },
    // Para la pantalla de pagos: varios en cada lista.
    {
      paciente: datos(30, "Pedro Gutiérrez Cuéllar", "1122334", "M", 39, 180),
      ultimoControl: null,
      tratamientos: [
        { id: 10, pacienteId: 30, nombre: "Tirzepatida", unidadDosis: "UI", vial: { mg: 15, ml: 0.5 }, semanas: cadaSemana(diasAntes(hoy, 16), 2, (s) => ({ pesoKg: 118 - s, dosis: 8 })) },
      ],
    },
    {
      paciente: datos(31, "Ana Lucía Torrez Vaca", "2233445", "F", 44, 157),
      ultimoControl: null,
      tratamientos: [
        {
          id: 11,
          pacienteId: 31,
          nombre: "Tirzepatida",
          unidadDosis: "UI",
          vial: { mg: 15, ml: 0.5 },
          semanas: cadaSemana(diasAntes(hoy, 81), 11, (s) => ({ pesoKg: red(97 - s * 0.6, 2), dosis: s < 4 ? 8 : 17, ...(s === 0 ? PAGO_MES : {}) })),
        },
      ],
    },
    {
      paciente: datos(32, "Martín Céspedes Rivero", "3344556", "M", 50, 169),
      ultimoControl: null,
      tratamientos: [
        {
          id: 12,
          pacienteId: 32,
          nombre: "Tirzepatida",
          unidadDosis: "UI",
          vial: { mg: 15, ml: 0.5 },
          semanas: cadaSemana(diasAntes(hoy, 69), 9, (s) => ({ pesoKg: red(105 - s * 0.7, 2), dosis: 17, ...(s % 5 === 0 ? PAGO_MES : {}) })),
        },
      ],
    },
    {
      paciente: datos(33, "Sofía Arteaga Paz", "4455667", "F", 29, 165),
      ultimoControl: null,
      tratamientos: [
        {
          id: 13,
          pacienteId: 33,
          nombre: "Tirzepatida",
          unidadDosis: "UI",
          vial: { mg: 15, ml: 0.5 },
          semanas: cadaSemana(diasAntes(hoy, 101), 14, (s) => ({ pesoKg: red(84 - s * 0.4, 2), dosis: s < 4 ? 8 : 17, ...(s % 5 === 0 ? PAGO_MES : {}) })),
        },
      ],
    },
  ];
}

/** La hoja del paciente (`GET …/pacientes/:id`). */
export function hojaDe(p: PacienteDePrueba, ajustes: AjustesDePrueba = {}): HojaPaciente {
  const armados = p.tratamientos.map((t) => armarTratamiento(t, ajustes));
  return {
    paciente: p.paciente,
    ultimoControl: p.ultimoControl,
    tratamiento: armados.find((t) => t.estado === "ACTIVO") ?? null,
    anteriores: armados
      .filter((t) => t.estado === "TERMINADO")
      .sort((a, b) => (b.terminadoEn ?? "").localeCompare(a.terminadoEn ?? ""))
      .map(anteriorDe),
  };
}

/** Un renglón de la lista (`GET …/pacientes`). */
export function filaDe(p: PacienteDePrueba, ajustes: AjustesDePrueba = {}): FilaSeguimiento {
  const h = hojaDe(p, ajustes);
  const t = h.tratamiento;
  return {
    id: p.paciente.id,
    nombre: p.paciente.nombre,
    ci: p.paciente.ci,
    telefono: p.paciente.telefono,
    sexo: p.paciente.sexo,
    edad: p.paciente.edad,
    tratamiento: t
      ? {
          id: t.id,
          nombre: t.nombre,
          unidadDosis: t.unidadDosis,
          semana: t.resumen.semana,
          ultimaFecha: t.resumen.ultimaFecha,
          dosisActual: t.resumen.dosisActual,
          pesoInicial: t.resumen.pesoInicial,
          pesoActual: t.resumen.pesoActual,
          kgBajados: t.resumen.kgBajados,
          pagosPendientes: t.resumen.pagosPendientes.length,
          proximoPago: t.resumen.proximoPago != null,
        }
      : null,
    anteriores: h.anteriores.length,
  };
}

/** `GET …/pagos-pendientes`, con las reglas del §3.3. */
export function pagosDe(lista: PacienteDePrueba[], ajustes: AjustesDePrueba = {}): PagosPendientes {
  const avisar = ajustes.avisarPagos ?? true;
  const deben: PagosPendientes["deben"] = [];
  const proximos: PagosPendientes["proximos"] = [];
  if (!avisar) return { avisarPagos: false, deben, proximos };
  for (const p of lista) {
    const t = hojaDe(p, ajustes).tratamiento;
    if (!t) continue;
    const conPago = t.registros.filter((r) => (r.pagoMedicamento ?? 0) + (r.pagoControl ?? 0) > 0);
    const u = conPago[conPago.length - 1];
    const ultimoPago = u ? { fecha: u.fecha, total: red((u.pagoMedicamento ?? 0) + (u.pagoControl ?? 0) + (u.pagoOtro ?? 0), 2) } : null;
    const paciente = { id: p.paciente.id, nombre: p.paciente.nombre, ci: p.paciente.ci, telefono: p.paciente.telefono };
    const tratamiento = { id: t.id, nombre: t.nombre, semana: t.resumen.semana, ultimaFecha: t.resumen.ultimaFecha };
    if (t.resumen.pagosPendientes.length) deben.push({ paciente, tratamiento, pendientes: t.resumen.pagosPendientes, ultimoPago });
    else if (t.resumen.proximoPago) proximos.push({ paciente, tratamiento, proximoPago: t.resumen.proximoPago, ultimoPago });
  }
  deben.sort((a, b) => a.pendientes[0].desde.localeCompare(b.pendientes[0].desde));
  proximos.sort((a, b) => (a.tratamiento.ultimaFecha ?? "").localeCompare(b.tratamiento.ultimaFecha ?? ""));
  return { avisarPagos: true, deben, proximos };
}
