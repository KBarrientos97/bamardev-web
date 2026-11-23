import type { Catalogo, Control, Paciente, Rango, TablaGrados } from "../lib/nutricion/tipos";

/**
 * El catálogo del contrato (CONTRATO-nutricion-evaluacion-22nov §3.1, las
 * tablas de las hojas de la doctora), sólo para los tests: en la app llega de
 * `GET /nutricion/catalogo` y la web no lo copia.
 */

const r = (grado: string, nombre: string, desde: number | null, hasta: number | null, tono: Rango["tono"]): Rango => ({
  grado,
  nombre,
  desde,
  hasta,
  texto: desde == null ? `menos de ${hasta}` : hasta == null ? `${desde} o más` : `${desde} – ${hasta}`,
  tono,
});

const cuatro = (
  sexo: "F" | "M",
  edadDesde: number | null,
  edadHasta: number | null,
  cortes: [number, number, number],
  tonos: [Rango["tono"], Rango["tono"], Rango["tono"], Rango["tono"]],
): TablaGrados => ({
  sexo,
  edadDesde,
  edadHasta,
  rangos: [
    r("BAJO", "Bajo", null, cortes[0], tonos[0]),
    r("NORMAL", "Normal", cortes[0], cortes[1], tonos[1]),
    r("ALTO", "Alto", cortes[1], cortes[2], tonos[2]),
    r("MUY_ALTO", "Muy alto", cortes[2], null, tonos[3]),
  ],
});

const TONOS_MUSCULO: [Rango["tono"], Rango["tono"], Rango["tono"], Rango["tono"]] = ["alerta", "bien", "bien", "bien"];

/** Las 9 franjas de edad de la tabla de % grasa de la hoja (inclusive). */
const FRANJAS: [number | null, number | null][] = [
  [null, 20],
  [21, 25],
  [26, 30],
  [31, 35],
  [36, 40],
  [41, 45],
  [46, 50],
  [51, 55],
  [56, null],
];
/** «Ideal desde», «Promedio desde» y «Sobre desde», por franja (§3.1). */
const GRASA_HOMBRE: [number, number, number][] = [
  [6.2, 14.3, 20.2],
  [7.3, 15.4, 22.3],
  [10.6, 18.1, 23.4],
  [11.7, 19.2, 24.5],
  [12.7, 20.2, 25.6],
  [15.9, 22.8, 27.6],
  [16.9, 23.9, 28.7],
  [18, 25, 29.7],
  [19.1, 26, 31.6],
];
const GRASA_MUJER: [number, number, number][] = [
  [17.7, 23.2, 30.2],
  [20.3, 25.5, 30.8],
  [20.9, 26.1, 31.5],
  [21.5, 26.7, 32.1],
  [22.2, 27.3, 32.7],
  [22.8, 27.9, 34.4],
  [23.4, 28.6, 35],
  [24, 29.2, 35.6],
  [24.6, 29.8, 37.2],
];

const grasa = (sexo: "F" | "M", cortes: [number, number, number][]): TablaGrados[] =>
  FRANJAS.map(([edadDesde, edadHasta], i) => ({
    sexo,
    edadDesde,
    edadHasta,
    rangos: [
      r("DELGADO", "Delgado", null, cortes[i][0], "bajo"),
      r("IDEAL", "Ideal", cortes[i][0], cortes[i][1], "bien"),
      r("PROMEDIO", "Promedio", cortes[i][1], cortes[i][2], "alerta"),
      r("SOBRE_PROMEDIO", "Sobre el promedio", cortes[i][2], null, "alto"),
    ],
  }));

export const CATALOGO: Catalogo = {
  enfermedades: [
    { codigo: "DIABETES", nombre: "Diabetes" },
    { codigo: "PRE_DIABETES", nombre: "Pre-diabetes" },
    { codigo: "RESISTENCIA_INSULINA", nombre: "Resistencia a la insulina" },
    { codigo: "HIGADO_GRASO", nombre: "Hígado graso" },
    { codigo: "TRIGLICERIDOS", nombre: "Triglicéridos" },
    { codigo: "COLESTEROL", nombre: "Colesterol" },
    { codigo: "LITIASIS_VESICULAR", nombre: "Litiasis vesicular" },
    { codigo: "PROBLEMAS_HORMONALES", nombre: "Problemas hormonales" },
    { codigo: "GASTROINTESTINALES", nombre: "Gastrointestinales" },
    { codigo: "GASTRITIS", nombre: "Gastritis" },
  ],
  tablas: {
    imc: [
      {
        sexo: null,
        edadDesde: null,
        edadHasta: null,
        rangos: [
          r("BAJO_PESO", "Bajo peso", null, 18.5, "bajo"),
          r("NORMAL", "Peso normal", 18.5, 25, "bien"),
          r("SOBREPESO", "Sobrepeso", 25, 30, "alerta"),
          r("OBESIDAD_1", "Obesidad grado 1", 30, 35, "alto"),
          r("OBESIDAD_2", "Obesidad grado 2", 35, 40, "alto"),
          r("OBESIDAD_3", "Obesidad grado 3", 40, null, "alto"),
        ],
      },
    ],
    grasa: [...grasa("M", GRASA_HOMBRE), ...grasa("F", GRASA_MUJER)],
    musculo: [
      cuatro("F", null, 39, [24.3, 30.4, 35.4], TONOS_MUSCULO),
      cuatro("F", 40, 59, [24.1, 30.2, 35.2], TONOS_MUSCULO),
      cuatro("F", 60, null, [23.9, 30, 35], TONOS_MUSCULO),
      cuatro("M", null, 39, [33.3, 39.4, 44.1], TONOS_MUSCULO),
      cuatro("M", 40, 59, [33.1, 39.2, 43.9], TONOS_MUSCULO),
      cuatro("M", 60, null, [32.9, 39, 43.7], TONOS_MUSCULO),
    ],
    visceral: [
      {
        sexo: null,
        edadDesde: null,
        edadHasta: null,
        rangos: [
          r("NORMAL", "Normal", 1, 10, "bien"),
          r("ALTO", "Alto", 10, 15, "alerta"),
          r("MUY_ALTO", "Muy alto", 15, null, "alto"),
        ],
      },
    ],
  },
};

/** Un control con todo vacío salvo lo que se pase. */
export function control(datos: Partial<Control> & { id: number; fecha: string }): Control {
  return {
    inicial: false,
    pesoKg: null,
    imc: null,
    imcGrado: null,
    cinturaCm: null,
    caderaCm: null,
    pechoCm: null,
    grasaPct: null,
    grasaGrado: null,
    musculoPct: null,
    musculoGrado: null,
    edadCorporal: null,
    grasaVisceral: null,
    visceralGrado: null,
    nota: null,
    creadoEn: "2026-11-22T15:04:05.000Z",
    actualizadoEn: "2026-11-22T15:04:05.000Z",
    ...datos,
  };
}

/** Una paciente inventada, con lo mínimo y lo que se pase. */
export function paciente(datos: Partial<Paciente> = {}): Paciente {
  return {
    id: 12,
    clienteId: 345,
    nombre: "Lucía Paredes Soria",
    ci: "1234567",
    ciExpedido: "SC",
    telefono: "70000000",
    fechaNacimiento: "1990-05-14",
    edad: 36,
    edadDeclarada: null,
    sexo: "F",
    hijos: 2,
    tallaCm: 158,
    observaciones: null,
    ultimosAnalisis: null,
    enfermedades: {},
    otrasEnfermedades: null,
    cirugias: null,
    conductaAlimentaria: null,
    conductaSueno: null,
    actividadFisica: null,
    consumoAgua: null,
    activo: true,
    creadoEn: "2026-11-22T15:04:05.000Z",
    actualizadoEn: "2026-11-22T15:04:05.000Z",
    controles: [],
    ...datos,
  };
}
