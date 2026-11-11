import { qs, request } from "../../../lib/api";
import type { DetalleMovimientoInput } from "../../../types";

/**
 * La cuenta de la Toma de inventario, aparte de la pantalla.
 *
 * Qué mide: lo que la persona contó en el estante de UNA sucursal contra lo
 * que el sistema dice que hay, lote por lote, y qué renglones de AJUSTE salen
 * de eso. Qué NO mide: plata. La toma corrige cantidades; la merma en Bs la
 * saca después el reporte de Vencimientos y mermas desde el movimiento.
 *
 * Las reglas del backend (`movimiento.service.ts`, `ajustarPorLote`) que acá
 * se respetan, porque si no el ajuste entero vuelve con 400 o, peor, aplica
 * mal:
 *
 *  - Un artículo que maneja lote se cuenta POR LOTE: cada renglón lleva
 *    `loteCodigo` y fija el saldo de ESA partida. Mandarle además un renglón
 *    sin lote mezclaría dos formas de fijar el mismo stock.
 *  - Un artículo que NO maneja lote lleva un solo renglón con el total. Un
 *    `loteCodigo` ahí es 400.
 *  - Sólo viaja lo que CAMBIA algo. Lo contado igual al sistema no se manda,
 *    y lo que no se contó tampoco: un artículo sin contar no es "0", es "no
 *    sé", y fijarlo en 0 borraría stock que nadie miró.
 *  - Un lote que apareció en el estante y el sistema no conocía viaja con su
 *    vencimiento (`AAAA-MM-DD`, un día real): el backend lo crea al aprobar.
 */

/** Un lote con saldo en la sucursal, como lo dice el sistema. */
export interface LoteToma {
  codigo: string;
  /** AAAA-MM-DD, o null si el lote no tiene fecha. */
  vencimiento: string | null;
  cantidad: number;
}

/** Un artículo del estante, como lo devuelve `GET /farmacia/toma`. */
export interface ItemToma {
  productoId: number;
  nombre: string;
  concentracion: string | null;
  laboratorio: string | null;
  codBarra: string | null;
  /** "Unidad", "Caja"… */
  unidad: string | null;
  /** El estante, si se cargó. */
  ubicacion: string | null;
  manejaLote: boolean;
  /** Lo que el sistema dice que hay en esa sucursal. */
  stock: number;
  /** Sólo con saldo > 0, en orden FEFO. */
  lotes: LoteToma[];
}

export interface PaginaToma {
  items: ItemToma[];
  total: number;
  limite: number;
  offset: number;
}

/**
 * `GET /farmacia/toma` (backend del 11-nov): el estante de UNA sucursal para
 * contarlo. Los artículos habilitados con stock (o con lotes con saldo) ahí,
 * ordenados por ubicación y nombre, cada uno con sus lotes en orden FEFO.
 * `q` busca como el mostrador (nombre, droga, laboratorio, código de barras);
 * `limite` por defecto 50, tope 200. Permiso `inventario.mover`.
 *
 * Vive acá y no en `lib/api.ts` como las rutas del billar y de Supervisión:
 * `lib/` no importa nada de `pages/`, y el tipo de la respuesta es de esta
 * pantalla sola.
 */
export function pedirToma(p: {
  almacenId: number;
  q?: string;
  categoriaId?: number;
  limite?: number;
  offset?: number;
}): Promise<PaginaToma> {
  return request<PaginaToma>(`/farmacia/toma${qs(p)}`);
}

/** Una partida que apareció en el estante y el sistema no conocía. */
export interface LoteNuevo {
  codigo: string;
  /** AAAA-MM-DD. */
  vencimiento: string | null;
  /** Texto tal cual se tecleó (ver `ConteoArticulo`). */
  cantidad: string;
}

/**
 * Lo contado de un artículo. Los números van como TEXTO a propósito, igual que
 * en el ingreso de mercadería: con `number` el campo no deja borrar el último
 * dígito ni escribir "1," a medio camino. Vacío = no se contó.
 *
 * `articulo` es el artículo como lo dijo el sistema cuando se contó. Se
 * guarda con el conteo para que el borrador sobreviva a un F5 y a un filtro:
 * sin eso, contar treinta remedios, filtrar por una categoría y tocar
 * "Aplicar" mandaba sólo los que estaban a la vista.
 */
export interface ConteoArticulo {
  articulo: ItemToma;
  /** Artículo sin lote (o con lote pero sin partidas registradas): el total. */
  total?: string;
  /** Artículo con lote: lo contado por código de lote. */
  lotes?: Record<string, string>;
  nuevos?: LoteNuevo[];
}

/** Por `productoId` (como texto: es la clave de un objeto JSON). */
export type Conteo = Record<string, ConteoArticulo>;

export const MOTIVOS_TOMA = [
  "Conteo mensual",
  "Vencidos tirados",
  "Rotura",
  "Robo / pérdida",
  "Otro",
] as const;

export type MotivoToma = (typeof MOTIVOS_TOMA)[number];

/** Medio milésimo: por debajo de eso dos cantidades son la misma. */
const TOLERANCIA = 0.0005;

function iguales(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCIA;
}

/**
 * Lo tecleado en un "Contado", como número. `null` si no se contó (vacío) o
 * si lo tecleado no es una cantidad: un negativo no existe en un estante.
 * La coma vale como punto, porque el teclado numérico del celular la ofrece.
 */
export function cantidadContada(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** `true` si el día existe: "2027-02-30" no. */
export function vencimientoValido(iso: string | null | undefined): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split("-").map(Number);
  // Mediodía para que el huso no corra el día.
  const fecha = new Date(`${iso}T12:00:00`);
  return fecha.getFullYear() === a && fecha.getMonth() + 1 === m && fecha.getDate() === d;
}

/** Un renglón de lo que va a cambiar, para revisarlo antes de mandarlo. */
export interface Diferencia {
  productoId: number;
  nombre: string;
  /** "500 mg · BAGÓ": lo que separa dos que se llaman igual. */
  detalle: string;
  /** null en un artículo sin lote. */
  lote: string | null;
  vencimiento: string | null;
  /** El sistema no conocía el lote: se crea al aprobar. */
  nuevo: boolean;
  sistema: number;
  contado: number;
  /** contado − sistema: positivo sobra, negativo falta. */
  diferencia: number;
}

/** "500 mg · BAGÓ", o vacío si el artículo no tiene con qué distinguirse. */
export function detalleDe(item: Pick<ItemToma, "concentracion" | "laboratorio">): string {
  return [item.concentracion, item.laboratorio].filter(Boolean).join(" · ");
}

/** Códigos que ya existen en el artículo (sin distinguir mayúsculas). */
function codigosConocidos(item: ItemToma): Set<string> {
  return new Set(item.lotes.map((l) => l.codigo.trim().toLowerCase()));
}

/**
 * Los lotes nuevos que cuentan: con código, con cantidad y que el sistema NO
 * conozca. Uno que repite el código de una partida registrada se descarta
 * (se cuenta en la partida, no acá): mandarlo aparte fijaría el mismo lote
 * dos veces y ganaría el último.
 */
function nuevosQueCuentan(item: ItemToma, c: ConteoArticulo): { lote: LoteNuevo; contado: number }[] {
  const conocidos = codigosConocidos(item);
  const vistos = new Set<string>();
  const salida: { lote: LoteNuevo; contado: number }[] = [];
  for (const n of c.nuevos ?? []) {
    const codigo = n.codigo.trim();
    const clave = codigo.toLowerCase();
    if (!codigo || conocidos.has(clave) || vistos.has(clave)) continue;
    vistos.add(clave);
    const contado = cantidadContada(n.cantidad);
    // Un lote nuevo con 0 no cambia nada: el sistema ya tenía 0 de él.
    if (contado === null || contado <= 0) continue;
    salida.push({ lote: { ...n, codigo }, contado });
  }
  return salida;
}

/**
 * Qué cambia: lo contado que no cuadra con el sistema, renglón por renglón.
 * En el orden de `items`, que es el del estante.
 */
export function diferenciasDe(items: ItemToma[], conteo: Conteo): Diferencia[] {
  const salida: Diferencia[] = [];
  for (const item of items) {
    const c = conteo[String(item.productoId)];
    if (!c) continue;
    const base = { productoId: item.productoId, nombre: item.nombre, detalle: detalleDe(item) };

    if (!item.manejaLote) {
      const contado = cantidadContada(c.total);
      if (contado !== null && !iguales(contado, item.stock)) {
        salida.push({
          ...base,
          lote: null,
          vencimiento: null,
          nuevo: false,
          sistema: item.stock,
          contado,
          diferencia: contado - item.stock,
        });
      }
      continue;
    }

    for (const lote of item.lotes) {
      const contado = cantidadContada(c.lotes?.[lote.codigo]);
      if (contado === null || iguales(contado, lote.cantidad)) continue;
      salida.push({
        ...base,
        lote: lote.codigo,
        vencimiento: lote.vencimiento,
        nuevo: false,
        sistema: lote.cantidad,
        contado,
        diferencia: contado - lote.cantidad,
      });
    }

    const nuevos = nuevosQueCuentan(item, c);
    for (const { lote, contado } of nuevos) {
      salida.push({
        ...base,
        lote: lote.codigo,
        vencimiento: lote.vencimiento,
        nuevo: true,
        sistema: 0,
        contado,
        diferencia: contado,
      });
    }

    // Maneja lote pero el sistema no tiene NINGUNA partida registrada (stock
    // cargado antes de prender "Maneja lote", o un descuadre): la única forma
    // de contarlo es por el total, y el backend lo acepta porque no hay lotes
    // con los que mezclarse. Si la persona le agregó un lote nuevo, el total
    // ya no viaja: lo contado quedó en ese lote.
    if (item.lotes.length === 0 && nuevos.length === 0) {
      const contado = cantidadContada(c.total);
      if (contado !== null && !iguales(contado, item.stock)) {
        salida.push({
          ...base,
          lote: null,
          vencimiento: null,
          nuevo: false,
          sistema: item.stock,
          contado,
          diferencia: contado - item.stock,
        });
      }
    }
  }
  return salida;
}

/**
 * Los renglones del AJUSTE: uno por diferencia. El vencimiento viaja sólo en
 * un lote nuevo y sólo si es un día real; uno roto se omite antes de que el
 * backend rechace el ajuste entero por él (la pantalla ya lo validó al
 * agregarlo, esto es el cinturón).
 */
export function detallesDelAjuste(items: ItemToma[], conteo: Conteo): DetalleMovimientoInput[] {
  return diferenciasDe(items, conteo).map((d) => ({
    productoId: d.productoId,
    cantidad: d.contado,
    ...(d.lote !== null ? { loteCodigo: d.lote } : {}),
    ...(d.nuevo && vencimientoValido(d.vencimiento) ? { loteVencimiento: d.vencimiento! } : {}),
  }));
}

/** `true` si de este artículo se tecleó al menos un "Contado" válido. */
export function estaContado(item: ItemToma, c: ConteoArticulo | undefined): boolean {
  if (!c) return false;
  if (!item.manejaLote) return cantidadContada(c.total) !== null;
  if (item.lotes.some((l) => cantidadContada(c.lotes?.[l.codigo]) !== null)) return true;
  if (nuevosQueCuentan(item, c).length > 0) return true;
  return item.lotes.length === 0 && cantidadContada(c.total) !== null;
}

/** Lo que dice la barra de abajo: "N artículos contados · M diferencias". */
export function resumenDelConteo(
  items: ItemToma[],
  conteo: Conteo,
): { contados: number; diferencias: number; articulosConDiferencia: number } {
  const contados = items.filter((i) => estaContado(i, conteo[String(i.productoId)])).length;
  const difs = diferenciasDe(items, conteo);
  return {
    contados,
    diferencias: difs.length,
    articulosConDiferencia: new Set(difs.map((d) => d.productoId)).size,
  };
}

/**
 * Los artículos del conteo para revisar y armar el ajuste: la foto guardada
 * con cada uno, reemplazada por la fresca si la pantalla la tiene cargada.
 * Entre contar y aplicar pudo venderse algo, y la diferencia que se muestra
 * tiene que ser contra lo último que se sabe.
 */
export function articulosDelConteo(conteo: Conteo, frescos: Map<number, ItemToma>): ItemToma[] {
  return Object.values(conteo).map((c) => frescos.get(c.articulo.productoId) ?? c.articulo);
}

export function tipoDiferencia(diferencia: number): "cuadra" | "sobra" | "falta" {
  if (iguales(diferencia, 0)) return "cuadra";
  return diferencia > 0 ? "sobra" : "falta";
}

/** "+2", "−3" (con el signo menos de verdad, no el guión) o "0". */
export function etiquetaDiferencia(diferencia: number): string {
  const tipo = tipoDiferencia(diferencia);
  const n = Math.round(Math.abs(diferencia) * 1000) / 1000;
  if (tipo === "cuadra") return "0";
  return tipo === "sobra" ? `+${n}` : `−${n}`;
}

/**
 * La `descripcion` del movimiento: "Toma de inventario · Conteo mensual",
 * con la nota detrás si la hay. Con "Otro" el motivo es la nota misma: un
 * "Toma de inventario · Otro" no le dice nada a quien lo lea en Movimientos.
 */
export function descripcionDelAjuste(motivo: string, nota: string): string {
  const n = nota.trim();
  const partes = ["Toma de inventario", motivo && motivo !== "Otro" ? motivo : "", n];
  return partes.filter(Boolean).join(" · ");
}

// ── Borrador ─────────────────────────────────────────────────────────────────

/** Una clave por sucursal: contar el depósito no pisa el conteo del mostrador. */
export function claveBorrador(almacenId: number): string {
  return `bamar.farmacia.toma.${almacenId}`;
}

export interface Borrador {
  conteo: Conteo;
  /** Cuándo se guardó por última vez (ISO), o null si no hay borrador. */
  guardado: string | null;
}

function esItemToma(x: unknown): x is ItemToma {
  if (!x || typeof x !== "object") return false;
  const i = x as Partial<ItemToma>;
  return typeof i.productoId === "number" && typeof i.nombre === "string" && Array.isArray(i.lotes);
}

/**
 * Lee el borrador de la sucursal. Todo en try/catch: un `localStorage`
 * bloqueado (modo privado, cuota llena) o un JSON roto no pueden dejar la
 * pantalla sin cargar; sin borrador se empieza de cero. Las entradas sin su
 * artículo se descartan: sin la foto del sistema no hay contra qué comparar.
 */
export function leerBorrador(almacenId: number): Borrador {
  const vacio: Borrador = { conteo: {}, guardado: null };
  try {
    const crudo = localStorage.getItem(claveBorrador(almacenId));
    if (!crudo) return vacio;
    const dato: unknown = JSON.parse(crudo);
    if (!dato || typeof dato !== "object") return vacio;
    const { conteo, guardado } = dato as { conteo?: unknown; guardado?: unknown };
    if (!conteo || typeof conteo !== "object") return vacio;
    const limpio: Conteo = {};
    for (const [id, c] of Object.entries(conteo as Record<string, unknown>)) {
      if (!c || typeof c !== "object") continue;
      const entrada = c as Partial<ConteoArticulo>;
      if (!esItemToma(entrada.articulo)) continue;
      limpio[id] = {
        articulo: entrada.articulo,
        ...(typeof entrada.total === "string" ? { total: entrada.total } : {}),
        ...(entrada.lotes && typeof entrada.lotes === "object" ? { lotes: entrada.lotes } : {}),
        ...(Array.isArray(entrada.nuevos) ? { nuevos: entrada.nuevos } : {}),
      };
    }
    return { conteo: limpio, guardado: typeof guardado === "string" ? guardado : null };
  } catch {
    return vacio;
  }
}

/**
 * Guarda el conteo tal cual está. Un conteo vacío BORRA la clave: así
 * "Descartar" y "quedó todo en blanco" dejan lo mismo, y no se acumulan
 * borradores vacíos de sucursales que ya se contaron.
 */
export function guardarBorrador(almacenId: number, conteo: Conteo, ahora = new Date()): void {
  try {
    if (Object.keys(conteo).length === 0) {
      localStorage.removeItem(claveBorrador(almacenId));
      return;
    }
    const borrador: Borrador = { conteo, guardado: ahora.toISOString() };
    localStorage.setItem(claveBorrador(almacenId), JSON.stringify(borrador));
  } catch {
    // Sin lugar o sin permiso: el conteo sigue en pantalla, sólo no sobrevive
    // al F5. Avisarlo acá sería interrumpir a quien está contando.
  }
}

export function borrarBorrador(almacenId: number): void {
  try {
    localStorage.removeItem(claveBorrador(almacenId));
  } catch {
    // Igual que al guardar: no hay nada que hacer con el error.
  }
}
