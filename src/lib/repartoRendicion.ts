import { aCentavos } from "./dinero";
import { fmtCantidad, fmtHora } from "./format";

/**
 * El cuadre con los repartidores del delivery propio (18-nov,
 * CONTRATO-delivery-full §5): qué llevó cada uno, cuánto cobró y cuánta plata
 * le falta entregar a la caja. Lo arma el backend (`GET /reparto/rendicion`);
 * acá están los tipos tal cual vienen y las cuentas que hace la pantalla
 * (lo tildado, los textos). Las mismas en la caja y en la vista del repartidor.
 *
 * Regla de la plata: lo que el repartidor tiene que entregar es SÓLO el
 * efectivo, sin el envío (es suyo) ni lo cobrado por QR (ya entró a la cuenta
 * del negocio). Con «Controlar la plata de los repartidores» prendido, cada
 * entrega en efectivo queda como una fila PENDIENTE hasta que la caja la
 * recibe; apagado, la pantalla sólo informa.
 */

export type EstadoEntregaRepartidor = "PENDIENTE" | "RECIBIDA";

/** Un pedido del repartidor en la jornada (o una plata vieja sin recibir). */
export interface EntregaDeRendicion {
  /** La fila de la plata (`EntregaRepartidor`); null si ese pedido no la tiene (QR, prepagado, en camino, control apagado). */
  id: number | null;
  ventaId: number;
  comprobante: string | null;
  cliente: string | null;
  /** null = todavía en camino. */
  entregadoEn: string | null;
  /** Lo del negocio, sin el envío. */
  total: number;
  efectivo: number;
  qr: number;
  /** La tarifa de envío: es del repartidor. */
  envio: number;
  estado: EstadoEntregaRepartidor | null;
  recibidaEn: string | null;
  recibidaPorNombre: string | null;
  /**
   * ¿La puede recibir quien mira? Sólo la caja dueña de esa plata (la que la
   * cuenta en su arqueo) o quien ve todas las cajas. Un backend anterior no lo
   * manda: cuenta como que sí, como siempre.
   */
  puedeRecibir: boolean;
  /** Quién abrió la caja dueña de esa plata (para «La recibe la caja de …»). */
  cajaDe: string | null;
  /**
   * El pedido lo cobró la cajera con «Cobrar y entregar» (el repartidor volvió
   * con la plata y ella lo cerró): no es plata del repartidor. Su `efectivo` y
   * su `qr` vienen en 0 y no cuenta en `cobradoEfectivo`. Nunca se tilda. Un
   * backend anterior no lo manda: false.
   */
  cobroLaCaja: boolean;
}

export interface ItemLlevado {
  nombre: string;
  cantidad: number;
}

export interface CategoriaLlevada {
  nombre: string;
  unidades: number;
  items: ItemLlevado[];
}

/** Lo que llevó: entregado en la jornada más lo que sigue en camino, sin los toppings incluidos. */
export interface ProductosLlevados {
  unidades: number;
  categorias: CategoriaLlevada[];
}

export interface RepartidorDeRendicion {
  repartidorId: number;
  nombre: string;
  /** Pedidos entregados en la jornada. */
  entregados: number;
  /** Asignados y sin entregar. */
  enCamino: number;
  /** Efectivo de lo entregado en la jornada, sin el envío. */
  cobradoEfectivo: number;
  /** Informativo: ya está en la cuenta del negocio. */
  cobradoQr: number;
  /** Las tarifas de envío de lo entregado: son del repartidor. */
  envios: number;
  /** Plata sin recibir (filas PENDIENTE). Con el control apagado, 0. */
  pendiente: number;
  /** Plata que la caja ya recibió en la jornada. Con el control apagado, 0. */
  recibido: number;
  /**
   * El efectivo que cobró ÉL y la caja todavía no tiene (lo calcula el
   * backend): con el control prendido es igual a `pendiente`; apagado, lo que
   * cobró en la jornada sin lo que cobró la caja ni lo ya recibido. null = un
   * backend anterior que no lo manda (ver `aEntregar`).
   */
  aEntregar: number | null;
  entregas: EntregaDeRendicion[];
  productos: ProductosLlevados;
}

export interface RendicionReparto {
  /** = `pos.rendirRepartidores`: la caja registra cada entrega de plata. */
  activa: boolean;
  /** Desde cuándo cuenta la jornada (las 6:00 del día de entregas). */
  desde: string | null;
  pendiente: number;
  recibido: number;
  /** La suma de `aEntregar` de todos; null con un backend anterior. */
  aEntregar: number | null;
  repartidores: RepartidorDeRendicion[];
}

/** Lo que contesta `POST /reparto/rendicion/recibir`: lo que de verdad cambió. */
export interface RecibidoDeRendicion {
  recibidas: number;
  monto: number;
}

// ── Lectura defensiva ───────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? aCentavos(n) : 0;
};
/** Un número que puede no venir (un backend anterior): ausente o ilegible, null; nunca un 0 inventado. */
const numONull = (v: unknown): number | null => {
  if (typeof v !== "number" && !(typeof v === "string" && v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? aCentavos(n) : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * La respuesta del servidor, con cada campo en su tipo: un número que viaja
 * como texto ("130.00", un Decimal), un arreglo que falta o un nombre vacío no
 * rompen la pantalla de la plata. Algo que no es una rendición (un backend
 * anterior que contesta otra cosa) da null: la pantalla hace como si no
 * existiera.
 */
export function normalizarRendicion(raw: unknown): RendicionReparto | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { repartidores?: unknown }).repartidores)) return null;
  const r = raw as Record<string, unknown>;
  return {
    activa: r.activa === true,
    desde: texto(r.desde),
    pendiente: num(r.pendiente),
    recibido: num(r.recibido),
    aEntregar: numONull(r.aEntregar),
    repartidores: lista(r.repartidores).map((x) => {
      const rep = obj(x);
      const productos = obj(rep.productos);
      return {
        repartidorId: Number(rep.repartidorId) || 0,
        nombre: texto(rep.nombre) ?? "Repartidor",
        entregados: Math.max(0, Math.trunc(Number(rep.entregados) || 0)),
        enCamino: Math.max(0, Math.trunc(Number(rep.enCamino) || 0)),
        cobradoEfectivo: num(rep.cobradoEfectivo),
        cobradoQr: num(rep.cobradoQr),
        envios: num(rep.envios),
        pendiente: num(rep.pendiente),
        recibido: num(rep.recibido),
        aEntregar: numONull(rep.aEntregar),
        entregas: lista(rep.entregas).map((y) => {
          const e = obj(y);
          const id = Number(e.id);
          return {
            id: e.id == null || !Number.isFinite(id) ? null : id,
            ventaId: Number(e.ventaId) || 0,
            comprobante: texto(e.comprobante),
            cliente: texto(e.cliente),
            entregadoEn: texto(e.entregadoEn),
            total: num(e.total),
            efectivo: num(e.efectivo),
            qr: num(e.qr),
            envio: num(e.envio),
            estado: e.estado === "PENDIENTE" || e.estado === "RECIBIDA" ? e.estado : null,
            recibidaEn: texto(e.recibidaEn),
            recibidaPorNombre: texto(e.recibidaPorNombre),
            // Sólo un `false` explícito la saca de lo que se tilda.
            puedeRecibir: e.puedeRecibir !== false,
            cajaDe: texto(e.cajaDe),
            cobroLaCaja: e.cobroLaCaja === true,
          };
        }),
        productos: {
          unidades: Number(productos.unidades) || 0,
          categorias: lista(productos.categorias).map((y) => {
            const c = obj(y);
            return {
              nombre: texto(c.nombre) ?? "Sin categoría",
              unidades: Number(c.unidades) || 0,
              items: lista(c.items).map((z) => {
                const i = obj(z);
                return { nombre: texto(i.nombre) ?? "Producto", cantidad: Number(i.cantidad) || 0 };
              }),
            };
          }),
        },
      };
    }),
  };
}

// ── Lo que muestra la pantalla ──────────────────────────────────────────────

/** ¿Hay alguien con pedidos hoy? Sin eso, el botón «Repartidores» del cierre no aparece. */
export function hayRepartidores(r: RendicionReparto | null | undefined): boolean {
  return (r?.repartidores.length ?? 0) > 0;
}

/** «Pollos 5 · Bebidas 3 · Porciones 1», en el orden del servidor (más unidades primero). Sin nada, vacío. */
export function textoLlevo(p: ProductosLlevados | null | undefined): string {
  return (p?.categorias ?? [])
    .filter((c) => c.unidades > 0)
    .map((c) => `${c.nombre} ${fmtCantidad(c.unidades)}`)
    .join(" · ");
}

/** «3 entregados · 1 en camino»; sin pedidos en la jornada (sólo plata vieja), lo dice. */
export function textoPedidos(rep: Pick<RepartidorDeRendicion, "entregados" | "enCamino">): string {
  const partes: string[] = [];
  if (rep.entregados > 0) partes.push(rep.entregados === 1 ? "1 entregado" : `${rep.entregados} entregados`);
  if (rep.enCamino > 0) partes.push(`${rep.enCamino} en camino`);
  return partes.length ? partes.join(" · ") : "Sin pedidos hoy";
}

/**
 * Las entregas de plata sin recibir que ESTA caja puede recibir: las únicas
 * que se tildan y suman en «Recibí Bs X». La plata de otra caja (la cuenta su
 * arqueo, no éste) queda afuera: el servidor la rechazaría con un 403.
 */
export function entregasPorRecibir(rep: Pick<RepartidorDeRendicion, "entregas">): (EntregaDeRendicion & { id: number })[] {
  return rep.entregas.filter(
    (e): e is EntregaDeRendicion & { id: number } =>
      e.estado === "PENDIENTE" && e.id != null && e.puedeRecibir !== false && !e.cobroLaCaja,
  );
}

/** Lo pendiente que recibe otra caja: se lista sin casilla, para saber dónde está esa plata. */
export function pendientesDeOtraCaja(rep: Pick<RepartidorDeRendicion, "entregas">): EntregaDeRendicion[] {
  return rep.entregas.filter((e) => e.estado === "PENDIENTE" && e.puedeRecibir === false && !e.cobroLaCaja);
}

/**
 * Los pedidos que cobró la caja («Cobrar y entregar»): se listan sin casilla,
 * con «Cobró la caja», para que se entienda por qué no están en lo que cobró
 * el repartidor ni en lo que tiene que entregar.
 */
export function cobradosPorLaCaja(rep: Pick<RepartidorDeRendicion, "entregas">): EntregaDeRendicion[] {
  return rep.entregas.filter((e) => e.cobroLaCaja);
}

/** «La recibe la caja de Ana Quispe»; sin el nombre, «La recibe otra caja». */
export function textoOtraCaja(e: Pick<EntregaDeRendicion, "cajaDe">): string {
  return e.cajaDe ? `La recibe la caja de ${e.cajaDe}` : "La recibe otra caja";
}

/**
 * Las tildadas: todas las por recibir menos las que la cajera destildó. Se
 * guarda lo DESTILDADO y no lo tildado a propósito: una entrega que aparece
 * al refrescar llega tildada, como pide la pantalla («todas tildadas de
 * entrada»), y lo que ella destildó sigue destildado.
 */
export function idsTildados(rep: Pick<RepartidorDeRendicion, "entregas">, destildadas: ReadonlySet<number>): number[] {
  return entregasPorRecibir(rep)
    .map((e) => e.id)
    .filter((id) => !destildadas.has(id));
}

/** La plata de lo tildado, en centavos exactos: es el número de «Recibí Bs X». */
export function sumaTildada(rep: Pick<RepartidorDeRendicion, "entregas">, destildadas: ReadonlySet<number>): number {
  const ids = new Set(idsTildados(rep, destildadas));
  const centavos = entregasPorRecibir(rep)
    .filter((e) => ids.has(e.id))
    .reduce((s, e) => s + Math.round(e.efectivo * 100), 0);
  return centavos / 100;
}

/** «Marcar todas» (`true`) o «ninguna» (`false`) de un repartidor, sin tocar lo de los demás. */
export function marcarTodas(
  rep: Pick<RepartidorDeRendicion, "entregas">,
  destildadas: ReadonlySet<number>,
  marcar: boolean,
): Set<number> {
  const copia = new Set(destildadas);
  for (const e of entregasPorRecibir(rep)) {
    if (marcar) copia.delete(e.id);
    else copia.add(e.id);
  }
  return copia;
}

/**
 * La hora sin cortes: «03:13 a. m.» lleva espacios duros, así en 390 px no
 * queda «03:13 a.» en un renglón y «m.» en el otro.
 */
export function horaSinCortes(iso: string): string {
  return fmtHora(iso).replace(/\s/g, " ");
}

/** «V-000900 · Carla Mamani · 21:15»: el renglón de la casilla (el monto va aparte, a la derecha). */
export function textoEntrega(e: Pick<EntregaDeRendicion, "comprobante" | "ventaId" | "cliente" | "entregadoEn">): string {
  return [e.comprobante ?? `#${e.ventaId}`, e.cliente, e.entregadoEn ? horaSinCortes(e.entregadoEn) : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Lo que tiene que entregar el repartidor. Si el backend lo manda
 * (`aEntregar`), es ESE número, con el control prendido o apagado: sólo él
 * sabe qué cobró la caja y qué ya se recibió. Un backend anterior no lo manda:
 * prendido, lo que la caja todavía no recibió; apagado, el efectivo que cobró
 * en la jornada (lo de antes).
 */
export function aEntregar(
  rep: Pick<RepartidorDeRendicion, "pendiente" | "cobradoEfectivo"> & { aEntregar?: number | null },
  activa: boolean,
): number {
  if (typeof rep.aEntregar === "number") return rep.aEntregar;
  return activa ? rep.pendiente : rep.cobradoEfectivo;
}

/**
 * Lo que el repartidor que mira tiene que entregar, según la rendición del
 * backend: el número del cartel «A entregar al negocio», del indicador «A
 * rendir» y de «Te falta entregar», que así nunca se contradicen.
 *
 * null = no hay de dónde sacarlo (la rendición no cargó, no es suya, o un
 * backend anterior con el control apagado): la pantalla sigue con su cuenta de
 * siempre, la de «Mis entregas».
 */
export function aEntregarDelRepartidor(r: RendicionReparto | null | undefined, usuarioId: number | null | undefined): number | null {
  const mio = delRepartidor(r, usuarioId);
  if (!r || !mio) return null;
  if (typeof mio.aEntregar === "number") return mio.aEntregar;
  // Backend anterior: prendido, «Te falta entregar» es lo pendiente; el cartel dice lo mismo.
  return r.activa ? mio.pendiente : null;
}

/**
 * Lo del repartidor que mira su propia rendición. El servidor ya le manda sólo
 * lo suyo, pero a quien además opera la caja le manda todos: se busca por id y
 * nunca se cae a «el único que vino», que podría ser otro.
 */
export function delRepartidor(r: RendicionReparto | null | undefined, usuarioId: number | null | undefined): RepartidorDeRendicion | null {
  if (!r || usuarioId == null) return null;
  return r.repartidores.find((x) => x.repartidorId === usuarioId) ?? null;
}
