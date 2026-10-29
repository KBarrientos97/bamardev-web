import { aCentavos, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora, fmtMoney } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { Telefono } from "../../../lib/telefono";
import type { PagoVenta, Venta } from "../../../types";

/**
 * Las cuentas del recibo de una venta abierto desde Reportes › Ventas
 * (REP-02, 28-oct), aparte del componente para poder probarlas.
 *
 * En la app cada venta del historial se toca y abre su recibo real
 * (`ReciboVentaDialog`, que pide `GET /ventas/:id`): qué se vendió y a qué
 * precio, cómo se cobró, lo recibido y el cambio, y los datos del pedido si
 * fue a domicilio o para recoger. En la web del restaurante la fila no se
 * tocaba, y una venta de otro día no se podía ver en ningún lado: el
 * historial del POS es sólo el del turno.
 */

/**
 * ¿Tocar una venta de Reportes › Ventas abre su recibo? En el restaurante y
 * con el permiso del historial de ventas, que es el que pide el backend para
 * leer una venta. El billar abre su propio detalle (el de Supervisión, con el
 * tiempo de mesa) y los demás rubros siguen como siempre.
 */
export function abreRecibo(rubro: string | null | undefined, usuario: Parameters<typeof tienePermiso>[0]): boolean {
  return rubro === "RESTAURANTE" && tienePermiso(usuario, "ventas.historial");
}

/** Lo que entró por un medio. */
export interface CobroPorMedio {
  medio: string;
  monto: number;
}

/**
 * Lo cobrado por cada medio, en el orden en que se cobró y sumando lo que
 * entró dos veces por el mismo (un adelanto y el saldo, los dos por QR, son un
 * solo "QR"). Sin pagos, vacío: es un pedido que todavía no se cobró.
 */
export function cobradoPorMedio(pagos: PagoVenta[] | undefined): CobroPorMedio[] {
  const porMedio = new Map<string, number>();
  for (const p of pagos ?? []) {
    const medio = p.formaPago?.trim() || "Otro";
    porMedio.set(medio, (porMedio.get(medio) ?? 0) + p.monto);
  }
  return [...porMedio].map(([medio, monto]) => ({ medio, monto: aCentavos(monto) }));
}

/**
 * Cómo se cobró: "Efectivo"; en un mixto, cada medio con su monto ("Efectivo
 * Bs 50,00 · QR Bs 30,00"), que es lo que no decía el reporte —la fila dice
 * "Mixto" y no cuánto buscar en el banco—; y "Sin cobrar" si no entró nada.
 */
export function textoFormaPago(pagos: PagoVenta[] | undefined): string {
  const medios = cobradoPorMedio(pagos);
  if (medios.length === 0) return "Sin cobrar";
  if (medios.length === 1) return medios[0].medio;
  return medios.map((m) => `${m.medio} ${fmtMoney(m.monto)}`).join(" · ");
}

const ES_EFECTIVO = /efectivo/i;

/**
 * Lo que entregó el cliente en efectivo y su cambio, o null si no pagó nada
 * en efectivo. Sólo los pagos en efectivo: el backend guarda como "recibido"
 * de un QR su mismo monto, y sumarlo todo hacía decir "Efectivo recibido
 * Bs 30" en una venta pagada entera por QR.
 */
export function efectivoDelRecibo(pagos: PagoVenta[] | undefined): { recibido: number; cambio: number } | null {
  const efectivo = (pagos ?? []).filter((p) => ES_EFECTIVO.test(p.formaPago ?? ""));
  if (efectivo.length === 0) return null;
  return {
    recibido: aCentavos(efectivo.reduce((s, p) => s + (p.recibido ?? p.monto), 0)),
    cambio: aCentavos(efectivo.reduce((s, p) => s + (p.entregado ?? 0), 0)),
  };
}

/** Un renglón etiquetado del bloque del pedido. */
export interface DatoPedido {
  etiqueta: string;
  valor: string;
}

/**
 * El bloque de un pedido a domicilio o para recoger, o null en una venta de
 * mostrador (ahí no hay nada que decir). Lo que no se cargó no se escribe: un
 * "Teléfono: —" en el papel del cliente no le sirve a nadie.
 *
 * El envío va aparte del total a propósito: lo cobra y se lo queda el
 * repartidor, nunca entra a la caja del negocio. Sumado al TOTAL, el recibo
 * no coincidiría con lo que dice la venta.
 */
export function datosPedido(
  v: Pick<
    Venta,
    | "tipoPedido"
    | "clienteNombre"
    | "clienteTelefono"
    | "clienteDireccion"
    | "repartidor"
    | "tarifaEnvio"
    | "notaPedido"
    | "estadoEntrega"
    | "entregadoEn"
  >,
): { titulo: string; datos: DatoPedido[] } | null {
  if (v.tipoPedido !== "DELIVERY" && v.tipoPedido !== "RECOGER") return null;
  const domicilio = v.tipoPedido === "DELIVERY";
  const datos: DatoPedido[] = [];
  const poner = (etiqueta: string, valor: string | null | undefined) => {
    const t = valor?.trim();
    if (t) datos.push({ etiqueta, valor: t });
  };
  poner("Cliente", v.clienteNombre);
  poner("Teléfono", v.clienteTelefono ? Telefono.paraMostrar(v.clienteTelefono) : null);
  if (domicilio) poner("Dirección", v.clienteDireccion);
  if (domicilio) poner("Repartidor", v.repartidor?.nombre);
  if (esPositivo(v.tarifaEnvio ?? 0)) {
    poner("Envío", `${fmtMoney(v.tarifaEnvio)} (lo cobra el repartidor, va aparte del total)`);
  }
  if (v.estadoEntrega === "ENTREGADO") poner("Entregado", v.entregadoEn ? fmtFechaHora(v.entregadoEn) : "Sí");
  else if (v.estadoEntrega === "PENDIENTE") poner("Entrega", "Todavía no se entregó");
  else if (v.estadoEntrega === "CANCELADO") poner("Entrega", "Cancelado");
  poner("Nota", v.notaPedido);
  return { titulo: domicilio ? "Pedido a domicilio" : "Pedido para recoger", datos };
}
