/**
 * El RUBRO del negocio: la tercera dimensión, después del rol y del plan.
 *
 *   • Rol   → qué puede hacer la persona   (`usuario.permisos`)
 *   • Plan  → qué compró el negocio        (`negocio.features`)
 *   • Rubro → **a qué se dedica**          (`negocio.tipoNegocio`)
 *
 * El rubro no se compra ni se asigna a una persona: se elige al dar de alta el
 * negocio y no cambia. Decide dos cosas y sólo dos: **qué secciones ni siquiera
 * existen** para ese tipo de negocio (una farmacia no tiene mesas de salón) y
 * **cómo se llaman las cosas** (lo que en una pollería es un "artículo", en una
 * farmacia es un "medicamento").
 *
 * Lo que NO decide: permisos ni precios. Si algo se vende aparte —los lotes, por
 * ejemplo— eso sigue siendo una feature del plan, no del rubro. Ver `permisos.ts`.
 *
 * El color también sale del rubro, pero vive aparte en `temas.ts` porque se
 * aplica de otra forma (variables CSS al iniciar sesión).
 *
 * Desde la fase 0 de belleza el backend manda además el PERFIL del rubro
 * (`negocio.perfil`): el vocabulario y las etiquetas de rol salen de ahí. Lo de
 * este archivo queda de respaldo, para un backend que todavía no lo manda.
 */

import type { Rol } from "../types";

/** Los rubros del backend (enum `TipoNegocio`). */
export type Rubro =
  | "FARMACIA"
  | "MINIMARKET"
  | "RESTAURANTE"
  | "FERRETERIA"
  | "REPUESTOS"
  | "PELUQUERIA"
  | "BARBERIA"
  | "SPA"
  | "UNAS"
  // Oct-2026: su propia vertical, en negro. Las pantallas del billar son
  // todavía una maqueta (ver pages/billar).
  | "BILLAR"
  // Vertical Educación (PLAN-ACADEMIAS): institutos técnicos y academias.
  | "ACADEMIA";

/**
 * Los de belleza: trabajan con turnos y profesionales, no con mesas ni con
 * materia prima. Aparte porque varias listas los tratan en bloque.
 */
export const RUBROS_BELLEZA: Rubro[] = ["PELUQUERIA", "BARBERIA", "SPA", "UNAS"];

export const RUBROS: Rubro[] = [
  "FARMACIA",
  "MINIMARKET",
  "RESTAURANTE",
  "FERRETERIA",
  "REPUESTOS",
  ...RUBROS_BELLEZA,
  "BILLAR",
  "ACADEMIA",
];

export function esRubro(valor: string | null | undefined): valor is Rubro {
  return !!valor && (RUBROS as string[]).includes(valor);
}

/** Atajo, porque farmacia es el rubro con más piezas propias. */
export function esFarmacia(rubro: string | null | undefined): boolean {
  return rubro === "FARMACIA";
}

export function esBelleza(rubro: string | null | undefined): boolean {
  return !!rubro && (RUBROS_BELLEZA as string[]).includes(rubro);
}

export function esBillar(rubro: string | null | undefined): boolean {
  return rubro === "BILLAR";
}

/**
 * ¿Las líneas de la venta dicen si son para la mesa o para llevar? Es cosa de
 * la comanda de un restaurante: una farmacia no tiene mesas, y un corte de
 * pelo no se sirve en mesa (QA M-09: el ticket de una peluquería decía "M" en
 * cada línea). En un billar la "mesa" es la de pool y la cobra el tablero: una
 * "M" en el ticket del POS se leería como esa. Sin rubro (sesión vieja) se
 * muestra, como siempre.
 */
export function marcaConsumo(rubro: string | null | undefined): boolean {
  // Una cuota o una polera de un instituto tampoco se sirven en mesa.
  return !esFarmacia(rubro) && !esBelleza(rubro) && !esBillar(rubro) && rubro !== "ACADEMIA";
}

/**
 * ¿Los insumos de este negocio se muestran SIN stock? Sólo en el restaurante
 * (decisión de Kevin, 28-oct).
 *
 * El restaurante no tiene recetas: vender un plato no descuenta la harina ni
 * el aceite, así que el stock de un insumo sube con cada compra y no baja
 * nunca. Mostrarlo era mentir dos veces: decía que había 300 kg de pollo en la
 * cámara, y que había que "reponer" lo que nunca se cargó. Ahí la pantalla de
 * Insumos muestra lo INVERTIDO (lo comprado en el mes) en vez del stock. Las
 * compras se siguen registrando igual, como entradas en Movimientos.
 *
 * Belleza NO entra: sus insumos se gastan de verdad con cada servicio
 * (`consumo_servicio`) y su stock sí baja. Los demás rubros, y una sesión vieja
 * sin rubro, siguen viendo el stock como siempre.
 */
export function insumosSinStock(rubro: string | null | undefined): boolean {
  return rubro === "RESTAURANTE";
}

/**
 * Dónde van los descartables, con los insumos del restaurante (los mismos que
 * `insumosSinStock`). Se dice donde se habla de insumos —el alta de uno, el
 * reporte de Insumos— porque es ahí donde se cargaban: un vaso descartable
 * cargado como insumo no resta nunca de la ganancia (no está en el costo de
 * ningún plato), y en Gastos operativos, categoría Descartables (costo
 * variable), sí. Una sola frase para que las pantallas digan lo mismo, igual
 * que la app (`nota_insumo_descartables`).
 */
export const DESCARTABLES_A_GASTOS =
  "Los descartables (platos y vasos desechables, servilletas, bolsas, envases para llevar) no son insumos de un plato: van en Gastos operativos, categoría Descartables, para que resten de la ganancia.";

// ── Vocabulario ─────────────────────────────────────────────────────────────

/**
 * Palabras que cambian según el rubro. La clave es el concepto, no el texto:
 * `articulos` es "lo que el negocio vende", se llame como se llame.
 *
 * Son pocas a propósito. Renombrar media app por rubro termina en un
 * diccionario que nadie mantiene y en pantallas que hablan mitad en un idioma
 * y mitad en otro; acá sólo entran las palabras que de verdad suenan mal en el
 * otro rubro. Un farmacéutico no busca "artículos", busca medicamentos — pero
 * "Categorías" o "Movimientos" son las mismas dos palabras en los dos
 * mostradores.
 *
 * "Almacenes" entró después: para el dueño de una farmacia un almacén es otro
 * LOCAL, una sucursal (octubre de 2026), y el resto de sus pantallas ya decía
 * "sucursal". El restaurante sigue diciendo "almacén", como su app.
 */
export type Termino =
  | "articulos"
  | "articulo"
  | "articuloCap"
  | "almacenes"
  // Las de la vertical Educación (contrato de la ronda 1): en minúscula, como
  // las manda el perfil; la pantalla las pone en mayúscula donde empieza la
  // frase (`conMayuscula`). En los demás rubros no se usan.
  | "cliente"
  | "clientes"
  | "profesional"
  | "sucursal"
  | "sucursales"
  | "carrera"
  | "carreras"
  | "materia"
  | "materias";

const BASE: Record<Termino, string> = {
  articulos: "Artículos",
  articulo: "artículo",
  articuloCap: "Artículo",
  almacenes: "Almacenes",
  cliente: "cliente",
  clientes: "clientes",
  profesional: "profesional",
  sucursal: "sucursal",
  sucursales: "sucursales",
  carrera: "curso",
  carreras: "cursos",
  materia: "módulo",
  materias: "módulos",
};

/**
 * Sólo lo que se aparta de `BASE`. Un rubro que no está acá habla como siempre,
 * que es exactamente lo que tiene que pasar con los negocios que ya trabajan.
 */
const POR_RUBRO: Partial<Record<Rubro, Partial<Record<Termino, string>>>> = {
  FARMACIA: {
    articulos: "Medicamentos",
    articulo: "medicamento",
    articuloCap: "Medicamento",
    almacenes: "Sucursales",
  },
  // Respaldo del perfil ACADEMIA, por si un backend anterior todavía no manda
  // su vocabulario. Desde la ronda 2 (D1) el instituto dice estudiante, curso
  // y módulo. La sede es un almacén SUCURSAL (PLAN-ACADEMIAS §10.1): en
  // pantalla nunca dice "almacén".
  ACADEMIA: {
    almacenes: "Sedes",
    cliente: "estudiante",
    clientes: "estudiantes",
    profesional: "docente",
    sucursal: "sede",
    sucursales: "sedes",
    carrera: "curso",
    carreras: "cursos",
    materia: "módulo",
    materias: "módulos",
  },
};

/** El vocabulario que manda el backend en `negocio.perfil.vocabulario`. */
export type Vocabulario = Partial<Record<Termino, string>>;

/** Un texto que se puede mostrar: el JSON del perfil lo edita una persona. */
function conTexto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor : undefined;
}

/**
 * La palabra que corresponde al rubro. Primero la del perfil del negocio, si
 * vino; después la de `POR_RUBRO`; y si no, la de siempre: ante la duda, el
 * producto habla como hoy.
 */
export function termino(
  rubro: string | null | undefined,
  clave: Termino,
  vocabulario?: Vocabulario | null,
): string {
  const delPerfil = conTexto(vocabulario?.[clave]) ?? pluralDelPerfil(clave, vocabulario);
  if (delPerfil) return delPerfil;
  const propio = esRubro(rubro) ? POR_RUBRO[rubro]?.[clave] : undefined;
  return propio ?? BASE[clave];
}

/**
 * El contrato del perfil ACADEMIA manda el singular de carrera y materia, no
 * el plural: "carreras" sale de "carrera" (un instituto que diga "curso" ve
 * "cursos"). Sólo para esas dos, que son regulares en castellano.
 */
function pluralDelPerfil(clave: Termino, vocabulario?: Vocabulario | null): string | undefined {
  if (clave !== "carreras" && clave !== "materias") return undefined;
  const singular = conTexto(vocabulario?.[clave === "carreras" ? "carrera" : "materia"]);
  if (!singular) return undefined;
  return /[aeiouáéó]$/i.test(singular) ? `${singular}s` : `${singular}es`;
}

/** La palabra con la primera letra en mayúscula: "alumnos" → "Alumnos". */
export function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1) : texto;
}

// ── Etiquetas de rol ────────────────────────────────────────────────────────

/**
 * Cómo se llama cada rol en cada rubro, de respaldo. El código del rol no
 * cambia (el backend sigue diciendo CAJERO); cambia lo que lee el dueño: en
 * un salón el que cobra y agenda es "Recepción", y el profesional tiene el
 * nombre de su oficio.
 *
 * Lo normal es que llegue en `perfil.etiquetasRol`; esto cubre al backend que
 * todavía no lo manda, para que una barbería no vea "Cajero" mientras tanto.
 */
// El ADMIN es "Administrador" en todos los rubros (PLAN-ROLES-NEGOCIO §7;
// antes era "Dueño" en un salón): no hace falta respaldo. Restaurante y
// farmacia no están en la tabla: siguen igual.
const ROL_POR_RUBRO: Partial<Record<Rubro, Partial<Record<Rol, string>>>> = {
  PELUQUERIA: { CAJERO: "Recepción", PROFESIONAL: "Estilista" },
  BARBERIA: { CAJERO: "Recepción", PROFESIONAL: "Barbero" },
  SPA: { CAJERO: "Recepción", PROFESIONAL: "Terapeuta" },
  UNAS: { CAJERO: "Recepción", PROFESIONAL: "Manicurista" },
  // Las plantillas del rubro (PLAN-ACADEMIAS-TECNICO §5.3; la ronda 2, D8,
  // llama "Recepción" a la del mostrador).
  ACADEMIA: { SUPERVISOR: "Coordinación", CAJERO: "Recepción", PROFESIONAL: "Docente" },
};

/**
 * La etiqueta propia del rol en este negocio, o `undefined` si habla como
 * siempre. Primero el perfil, después el respaldo por rubro.
 */
export function etiquetaRolDelRubro(
  rol: Rol,
  rubro: string | null | undefined,
  etiquetas?: Partial<Record<string, string>> | null,
): string | undefined {
  return (
    conTexto(etiquetas?.[rol]) ?? (esRubro(rubro) ? ROL_POR_RUBRO[rubro]?.[rol] : undefined)
  );
}
