import { fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import type { CondicionVenta, Producto, TramoVencimiento } from "../../types";

/**
 * Lo que un medicamento significa para las pantallas del rubro: cómo se
 * anuncia su condición de venta, cuándo hay que frenar antes de venderlo y qué
 * texto lo identifica cuando el nombre no alcanza.
 *
 * Está en un solo lugar para que todas las pantallas digan lo mismo: si
 * "receta valorada" fuera rojo en una y ámbar en otra, el color dejaría de
 * significar algo. Las piezas visuales que lo usan están en `piezas.tsx`.
 */

export const CONDICION: Record<
  CondicionVenta,
  { texto: string; largo: string; tono: "azul" | "amarillo" | "rojo" } | null
> = {
  // La venta libre no lleva señal: lo que tiene que saltar a la vista es lo
  // que exige receta. Marcarlo todo es no marcar nada.
  LIBRE: null,
  RECETA_MEDICA: { texto: "Receta", largo: "Receta médica", tono: "azul" },
  RECETA_ARCHIVADA: {
    texto: "Receta archivada",
    largo: "Receta archivada (psicotrópico)",
    tono: "amarillo",
  },
  RECETA_VALORADA: {
    texto: "Receta valorada",
    largo: "Receta valorada (estupefaciente)",
    tono: "rojo",
  },
};

/**
 * Si hay que detenerse a pedir algo antes de venderlo.
 *
 * Un controlado y una receta valorada o archivada **no se despachan y ya**: la
 * farmacia se queda con el papel y lo asienta en el libro. Por eso el punto de
 * venta para y pregunta, en vez de sumarlo al carrito como una gaseosa. Una
 * receta médica común se muestra pero no frena: alcanza con que quien atiende
 * la vea.
 */
export function pideConfirmacion(p: Producto): boolean {
  return (
    p.controlado ||
    p.condicionVenta === "RECETA_VALORADA" ||
    p.condicionVenta === "RECETA_ARCHIVADA"
  );
}

/**
 * La línea que distingue dos artículos que se llaman casi igual: la droga, el
 * laboratorio y la forma. Es lo que separa "Paracetamol BAGÓ" de "Paracetamol
 * IFA" cuando los dos se llaman "Paracetamol 500 mg".
 */
export function detalleDe(p: Producto): string {
  return [p.principioActivo, p.laboratorio, p.formaFarmaceutica]
    .filter(Boolean)
    .join(" · ");
}

/**
 * La concentración, sólo si el nombre no la trae ya. Casi todos los nombres
 * comerciales la incluyen ("Paracetamol 500 mg") y repetirla al lado quedaba
 * como un error de dedo.
 */
export function concentracionAparte(p: Producto): string | null {
  if (!p.concentracion || contiene(p.nombre, p.concentracion)) return null;
  return p.concentracion;
}

/**
 * El color de cada tramo del semáforo de vencimientos.
 *
 * Vive acá y no en la pantalla de Vencimientos porque lo usan las dos —la lista
 * grande y la pestaña de lotes de la ficha— y un lote que es rojo en una y
 * ámbar en la otra deja de significar algo. El color dice qué tan urgente es,
 * no qué tan lindo queda.
 */
export const COLOR_TRAMO: Record<
  TramoVencimiento,
  { texto: string; fondo: string; barra: string }
> = {
  VENCIDO: { texto: "text-danger-text", fondo: "bg-danger-bg", barra: "bg-danger" },
  HASTA_30: {
    texto: "text-danger-text",
    fondo: "bg-danger-bg/60",
    barra: "bg-danger/70",
  },
  HASTA_60: { texto: "text-warning-text", fondo: "bg-warning-bg", barra: "bg-warning" },
  HASTA_90: {
    texto: "text-warning-text",
    fondo: "bg-warning-bg/60",
    barra: "bg-warning/70",
  },
  // Lo que falta mucho no necesita señal: marcarlo todo es no marcar nada.
  LEJOS: { texto: "text-texto-3", fondo: "bg-muted", barra: "bg-primary" },
};

/**
 * Los cuatro tramos del semáforo, en el orden en que hay que actuar. Los usan
 * Vencimientos y el Dashboard: el mismo tramo se llama y se pinta igual en los
 * dos.
 */
export const TRAMOS: {
  clave: TramoVencimiento;
  campo: "vencidos" | "hasta30" | "hasta60" | "hasta90";
  titulo: string;
  ayuda: string;
  /** El color dice qué tan urgente es, no qué tan lindo queda. */
  texto: string;
  fondo: string;
  barra: string;
}[] = [
  {
    clave: "VENCIDO",
    campo: "vencidos",
    titulo: "Vencidos",
    ayuda: "Sacar del estante",
    ...COLOR_TRAMO.VENCIDO,
  },
  {
    clave: "HASTA_30",
    campo: "hasta30",
    titulo: "≤ 30 días",
    ayuda: "Rematar o devolver",
    ...COLOR_TRAMO.HASTA_30,
  },
  {
    clave: "HASTA_60",
    campo: "hasta60",
    titulo: "31 – 60 días",
    ayuda: "Mover con promoción",
    ...COLOR_TRAMO.HASTA_60,
  },
  {
    clave: "HASTA_90",
    campo: "hasta90",
    titulo: "61 – 90 días",
    ayuda: "Tener en el radar",
    ...COLOR_TRAMO.HASTA_90,
  },
];

/**
 * El Dashboard manda a Vencimientos al tocar un tramo del semáforo, y la lista
 * tiene que abrir ya filtrada en ese tramo. Viaja por el `state` de la navegación y se
 * valida al llegar: cualquier otra cosa abre la lista completa.
 */
export interface FiltroVencimientos {
  tramo: TramoVencimiento;
}

/** Cuánto le queda, dicho como lo diría alguien: "venció hace 3 d", "12 días". */
export function textoVida(dias: number | null): string {
  if (dias === null) return "Sin fecha";
  if (dias < 0) return `Venció hace ${Math.abs(dias)} d`;
  if (dias === 0) return "Vence hoy";
  return `${dias} días`;
}

/**
 * Un stock con su unidad: "240 u.", "12 frascos", "8 cajas".
 *
 * La unidad **es del artículo**, no un "u." fijo. En una farmacia eso importa
 * más que en cualquier otro rubro: el jarabe se cuenta por frasco, la crema por
 * tubo y el comprimido por unidad o por blíster. Un "12 u." al lado de
 * "Amoxicilina jarabe" no dice si son doce frascos o doce cucharadas, y esa
 * duda se paga al recibir la compra.
 *
 * "Unidad" se abrevia porque es la que más se repite y ocupa lugar en una
 * tabla; las demás van enteras, que se leen mejor que una abreviatura inventada.
 */
export function conUnidad(cantidad: number, unidad?: string | null): string {
  const n = fmtNum(cantidad);
  const u = (unidad ?? "").trim().toLowerCase();
  if (!u || u === "unidad" || u === "unidades") return `${n} u.`;
  if (cantidad === 1) return `${n} ${u}`;
  // Plural de andar por casa, que es todo lo que hace falta para frasco, caja,
  // tubo, blíster y sobre.
  return `${n} ${/[aeiouáéíóú]$/.test(u) ? `${u}s` : `${u}es`}`;
}
