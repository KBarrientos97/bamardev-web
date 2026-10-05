import type { TipoMovimiento, TramoVencimiento } from "../../types";

/**
 * Lo que una farmacia entiende por mover stock.
 *
 * El motor es el mismo `MovimientoInventario` de siempre —el que usa la
 * pollería de Omar— pero el mostrador lo lee de otra forma:
 *
 *   • una **entrada** es *recibir del proveedor*: viene con factura, con
 *     droguería y con lote y vencimiento por renglón;
 *   • una **salida** es *dar de baja*: se tira lo vencido, lo que se rompió o
 *     lo que se robaron, y lo que importa es **por qué**.
 *
 * El backend no tiene columnas para "proveedor" ni para "motivo": tiene
 * `comprobante` y `descripcion`, que son campos de texto libre. Este archivo es
 * el traductor entre los dos vocabularios, y está aparte del componente para
 * que la conversión se pueda probar sin montar una pantalla.
 */

// ── Motivo de una salida ────────────────────────────────────────────────────

/**
 * Por qué se da de baja mercadería. Son cinco y no un campo libre a propósito:
 * escritos a mano, el mismo motivo entra veinte veces distinto ("vencido",
 * "vencimiento", "x vto") y después no se puede contar cuánta plata se pierde
 * por cada causa, que es justo el número que le sirve al dueño.
 *
 * "Devolución a proveedor" está en la lista aunque no sea una pérdida: sale del
 * almacén igual, y separarla es lo que evita que infle las mermas.
 */
/**
 * Lo que Vencimientos le pasa a la pantalla de Salida al mandar a dar de baja
 * un lote: el formulario abre con el almacén puesto, el motivo elegido y el
 * renglón cargado.
 *
 * Viaja por el `state` de la navegación y no por la URL a propósito: no es una
 * dirección que alguien quiera compartir ni volver a abrir con un refresh —
 * sería cargar dos veces la misma baja.
 */
export interface PrecargaSalida {
  productoId: number;
  almacenId: number;
  cantidad: number;
  motivo: string;
  /**
   * El lote que se eligió en Vencimientos. Sin él el servidor descontaba por
   * FEFO —vencidos primero—: "devolver las 10 del lote X" se llevaba antes
   * las 5 del lote Y ya vencido, que seguían en el estante y desaparecían del
   * semáforo. Opcional: una salida cargada a mano sigue saliendo por FEFO.
   */
  loteCodigo?: string;
}

/** `location.state` es `any`: acá se confirma que es lo que decimos que es. */
export function esPrecargaSalida(x: unknown): x is PrecargaSalida {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.productoId === "number" &&
    typeof p.almacenId === "number" &&
    typeof p.cantidad === "number" &&
    typeof p.motivo === "string" &&
    (p.loteCodigo === undefined || typeof p.loteCodigo === "string")
  );
}

export const MOTIVOS_SALIDA = [
  "Vencimiento",
  "Producto dañado",
  "Robo / pérdida",
  "Cargado de más",
  "Devolución a proveedor",
] as const;

export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

/** Lo que separa el motivo de la nota dentro de `descripcion`. */
const SEPARADOR = " · ";

/** Arma la `descripcion` de una salida: "Vencimiento · caja mojada". */
export function juntarMotivo(motivo: string, nota: string): string {
  const n = nota.trim();
  if (!motivo) return n;
  return n ? `${motivo}${SEPARADOR}${n}` : motivo;
}

/**
 * La vuelta: de la `descripcion` guardada al motivo y la nota.
 *
 * Un movimiento viejo —o uno cargado desde la app Android, que no conoce esta
 * lista— cae entero en la nota y con el motivo vacío. Es lo correcto: inventarle
 * un motivo a algo que nadie eligió sería peor que dejarlo sin clasificar.
 */
export function partirMotivo(descripcion: string | null | undefined): {
  motivo: MotivoSalida | "";
  nota: string;
} {
  const texto = (descripcion ?? "").trim();
  if (!texto) return { motivo: "", nota: "" };

  for (const m of MOTIVOS_SALIDA) {
    if (texto === m) return { motivo: m, nota: "" };
    if (texto.startsWith(m + SEPARADOR)) {
      return { motivo: m, nota: texto.slice(m.length + SEPARADOR.length).trim() };
    }
  }
  return { motivo: "", nota: texto };
}

// ── Vencimiento: MM/AAAA ────────────────────────────────────────────────────

/**
 * El vencimiento se escribe **MM/AAAA**, no con un calendario.
 *
 * Es lo que dice el envase: un blíster trae "VENC. 04/2028", no un día. Pedir
 * una fecha exacta obliga a inventar un número —¿el 1 o el 30?— y, peor, obliga
 * a navegar un selector de calendario con la caja en la mano y el proveedor
 * esperando la firma. Se teclea `04/2028` y listo.
 *
 * Se guarda el ÚLTIMO día del mes porque eso es lo que significa: un producto
 * que vence en abril de 2028 se puede vender todo abril.
 */
export function mesAIso(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})$/);
  if (!m) return null;

  const mes = Number(m[1]);
  if (mes < 1 || mes > 12) return null;

  // "28" es 2028: nadie carga un lote que venció en 1928, y el envase trae los
  // dos dígitos tan seguido como los cuatro.
  const anio = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);

  // Día 0 del mes SIGUIENTE es el último de éste, y de paso resuelve febrero.
  const ultimo = new Date(anio, mes, 0).getDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

/**
 * La barra se escribe sola: se teclean los números y listo.
 *
 * Quien carga una recepción tiene la caja en una mano y el teclado numérico en
 * la otra: `042028` sale de un tirón, `04/2028` obliga a saltar al `/` en cada
 * renglón. Con quince líneas eso son quince saltos.
 *
 * Respeta la barra que la persona SÍ escriba —`4/2028` es abril, no el mes 42—
 * y no la vuelve a poner cuando se está borrando, o el campo no se podría
 * vaciar nunca.
 */
export function tecleoMes(texto: string): string {
  const barra = texto.indexOf("/");
  if (barra >= 0) {
    const mes = texto.slice(0, barra).replace(/\D/g, "").slice(0, 2);
    const anio = texto.slice(barra + 1).replace(/\D/g, "").slice(0, 4);
    // Con la barra ya puesta, "4" sólo puede ser abril: se completa el cero.
    return `${mes.length === 1 ? `0${mes}` : mes}/${anio}`;
  }

  const digitos = texto.replace(/\D/g, "").slice(0, 6);
  return digitos.length > 2
    ? `${digitos.slice(0, 2)}/${digitos.slice(2)}`
    : digitos;
}

/** De "2028-04-30" a "04/2028", para volver a mostrarlo en el campo. */
export function isoAMes(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : "";
}

/** Un día de vida útil, en milisegundos. */
const DIA = 24 * 60 * 60 * 1000;

/**
 * Cuántos días de vida le quedan a un vencimiento. Mediodía y no medianoche:
 * así el cambio de huso no corre el resultado un día entero.
 */
export function diasHasta(iso: string | null | undefined, hoy = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.round((t - hoy) / DIA);
}

/**
 * Aviso cuando un lote entra con poca vida útil.
 *
 * Los 90 días son el corte del rubro: por debajo de eso ya no hay tiempo de
 * venderlo con tranquilidad ni de devolverlo al proveedor. **No bloquea** el
 * ingreso —a veces se compra barato justamente por eso— pero tiene que decirse
 * ANTES de firmar la recepción, no cuando aparezca en rojo en Vencimientos.
 */
export function avisoVidaUtil(iso: string | null | undefined, hoy = Date.now()): string | null {
  const dias = diasHasta(iso, hoy);
  if (dias === null) return null;
  if (dias < 0) return "Ojo: ese lote ya está vencido.";
  if (dias <= 90) return `Ojo: entra con ${dias} días de vida útil (menos de 90).`;
  return null;
}

// ── Vocabulario de la pantalla ──────────────────────────────────────────────

/**
 * Cómo se llama cada tipo en el mostrador de una farmacia. Se cargan entrada,
 * salida y transferencia; el ajuste existe en el motor y se sigue viendo en el
 * registro, pero no se carga desde acá.
 */
export function etiquetaTipo(tipo: TipoMovimiento): string {
  const m: Record<TipoMovimiento, string> = {
    ENTRADA: "Entrada",
    SALIDA: "Salida",
    AJUSTE: "Ajuste",
    TRANSFERENCIA: "Transferencia",
  };
  return m[tipo] ?? tipo;
}

/**
 * Qué se movió, en una línea: "Amoxicilina 500 mg y 2 más".
 *
 * Los nombres vienen del servidor en `productos`, ya sin repetir. Un servidor
 * que todavía no los manda —o un movimiento sin renglones— cae en el conteo de
 * siempre, "3 artículos": dice menos, pero no miente.
 */
export function resumenArticulos(productos: string[] | undefined, items: number): string {
  const [primero, ...resto] = productos ?? [];
  if (!primero) return `${items} ${items === 1 ? "artículo" : "artículos"}`;
  return resto.length > 0 ? `${primero} y ${resto.length} más` : primero;
}

/**
 * Si el movimiento SUMA stock. Sólo la entrada: la transferencia cambia de
 * almacén pero no de dueño, y el ajuste puede ir para cualquier lado — los dos
 * se leen como "no es una entrada" y se pintan como una salida.
 */
export function esEntrada(tipo: TipoMovimiento): boolean {
  return tipo === "ENTRADA";
}

/**
 * Dónde se edita un movimiento pendiente. La transferencia tiene su pantalla:
 * abierta en la de ingreso y salida, se guardaba como una entrada.
 */
export function rutaDeEdicion(m: { id: number; tipo: TipoMovimiento }): string {
  return m.tipo === "TRANSFERENCIA"
    ? `/inventario/movimientos/transferencia/${m.id}/editar`
    : `/inventario/movimientos/${m.id}/editar`;
}

/**
 * Cuántas unidades VENCIDAS se van al mandar `cantidad` de un producto.
 *
 * El servidor saca los lotes por FEFO —primero el que vence antes— y eso
 * incluye lo ya vencido: si en el origen quedó un lote vencido sin dar de baja,
 * viaja primero. Decirlo antes de guardar evita mandarle a otra sucursal
 * mercadería que ahí tampoco se puede vender.
 *
 * `lotes` viene como lo manda `/lotes/producto`: con saldo y ya en orden FEFO.
 */
export function vencidasQueSalen(
  lotes: { cantidad: number; tramo: TramoVencimiento | null }[],
  cantidad: number,
): number {
  let falta = cantidad;
  let vencidas = 0;
  for (const l of lotes) {
    if (falta <= 0) break;
    const toma = Math.min(l.cantidad, falta);
    if (l.tramo === "VENCIDO") vencidas += toma;
    falta -= toma;
  }
  return Math.round(vencidas * 1000) / 1000;
}

/**
 * La principal primero, después las otras sucursales y al final los depósitos:
 * se carga casi siempre en el local donde se vende, y el depósito central es la
 * excepción. Por nombre venía "Depósito" arriba de todo.
 */
export function ordenarSucursales<T extends { nombre: string; tipo?: string; esPrincipal?: boolean }>(
  lista: T[],
): T[] {
  const peso = (a: T) => (a.esPrincipal ? 0 : a.tipo === "DEPOSITO" ? 2 : 1);
  return [...lista].sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
}
