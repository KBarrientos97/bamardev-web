import { horaDe } from "../../../billar/calculo";
import type { BillarReporteApi } from "../../api";

/**
 * Pausas y ajustes: lo que se tocó de una mesa después de abrirla —quién la
 * pausó, la anuló, le corrigió la hora o le pasó la cuenta a otra— y por qué.
 *
 * Es el control del dueño sobre el tiempo, que es lo que el billar vende: una
 * mesa anulada o una hora de inicio corrida son plata que no entró. Venía en
 * la pestaña Billar de los reportes viejos y el diseño nuevo no lo traía;
 * sacarlo dejaba al dueño sin ver quién anuló.
 */

export type Ajuste = BillarReporteApi["auditoria"][number];

/** Los grupos de la pantalla. Se arman por el código, nunca por el texto: el texto se puede reescribir. */
export type TipoAjuste = "anulaciones" | "pausas" | "cambios" | "horas" | "extensiones";

const TIPO_POR_CODIGO: Record<string, TipoAjuste> = {
  ANULAR_MESA: "anulaciones",
  ANULAR_CONSUMO: "anulaciones",
  // Desde el 16-oct: la venta de una mesa ya jugada que se anuló (la única
  // forma de anularla pasados 5 minutos) y la mesa cobrada sin reanudar (el
  // tiempo en pausa no se cobró). No dejaban rastro en esta pantalla.
  ANULAR_VENTA: "anulaciones",
  COBRADA_EN_PAUSA: "pausas",
  REANUDAR: "pausas",
  CAMBIAR_MESA: "cambios",
  EDITAR_INICIO: "horas",
  EXTENDER: "extensiones",
};

export const NOMBRE_TIPO: Record<TipoAjuste, string> = {
  anulaciones: "Anulaciones",
  pausas: "Pausas",
  cambios: "Cambios de mesa",
  horas: "Hora corregida",
  extensiones: "Extensiones",
};

/** El backend arma como mucho los últimos 200: con exactamente 200 puede haber más. */
export const TOPE_AJUSTES = 200;

/** El grupo de un ajuste, o null si el backend no mandó el código (uno viejo) o es uno que no conocemos. */
export function tipoDe(a: Ajuste): TipoAjuste | null {
  return (a.codigo && TIPO_POR_CODIGO[a.codigo]) || null;
}

export interface ResumenAjustes {
  total: number;
  /**
   * Cuántos hay de cada grupo. Null cuando algún ajuste vino sin código: con
   * la mitad contada, un "0 anulaciones" se leería como un dato.
   */
  porTipo: Record<TipoAjuste, number> | null;
  mesasAnuladas: number | null;
  consumosAnulados: number | null;
}

export function resumenAjustes(lista: readonly Ajuste[]): ResumenAjustes {
  const conCodigo = lista.every((a) => a.codigo);
  if (!conCodigo) return { total: lista.length, porTipo: null, mesasAnuladas: null, consumosAnulados: null };
  const porTipo: Record<TipoAjuste, number> = { anulaciones: 0, pausas: 0, cambios: 0, horas: 0, extensiones: 0 };
  for (const a of lista) {
    const t = tipoDe(a);
    if (t) porTipo[t] += 1;
  }
  return {
    total: lista.length,
    porTipo,
    // Las abiertas por error y las ya jugadas cuya venta se anuló: las dos son
    // tiempo de mesa que no entró.
    mesasAnuladas: lista.filter((a) => a.codigo === "ANULAR_MESA" || a.codigo === "ANULAR_VENTA").length,
    consumosAnulados: lista.filter((a) => a.codigo === "ANULAR_CONSUMO").length,
  };
}

export interface FilaPersona {
  quien: string;
  ajustes: number;
  /** Null si el backend no mandó códigos: no se puede saber cuáles fueron anulaciones. */
  anulaciones: number | null;
}

/**
 * Quién hizo los ajustes, de más a menos. Lo autorizado por un encargado
 * cuenta para quien lo hizo: el que autorizó aparece en el detalle de cada uno.
 */
export function porPersona(lista: readonly Ajuste[]): FilaPersona[] {
  const conCodigo = lista.every((a) => a.codigo);
  const mapa = new Map<string, FilaPersona>();
  for (const a of lista) {
    const fila = mapa.get(a.quien) ?? { quien: a.quien, ajustes: 0, anulaciones: conCodigo ? 0 : null };
    fila.ajustes += 1;
    if (fila.anulaciones != null && tipoDe(a) === "anulaciones") fila.anulaciones += 1;
    mapa.set(a.quien, fila);
  }
  return [...mapa.values()].sort((a, b) => b.ajustes - a.ajustes || a.quien.localeCompare(b.quien, "es"));
}

/** "06/10 · 11:12 p. m.": la hora como la escriben las pantallas del billar. */
export function cuando(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${horaDe(ms)}`;
}
