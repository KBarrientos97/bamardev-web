import { ApiError } from "../api";
import type {
  ClienteCredito,
  Credito,
  FormaPago,
  Producto,
  Venta,
  VentaInput,
} from "../../types";
import { encolar, hayRespuesta, marcarSinSenal, sinSenal, type CuerpoEncolado } from "./cola";
import { leerCopia } from "./copias";
import { ventaSinInternet } from "./modo";

/**
 * Cobrar con o sin señal (PLAN-IOS F3). Port de `VentaRepositoryImpl.registrar`
 * de Android:
 *
 *  - fuera de la app instalada del iPhone, es el `crearVenta` de siempre;
 *  - con señal, va al servidor; si la red falla (status 0: sin internet o sin
 *    respuesta), la venta se encola con el MISMO `clienteRequestId` y el
 *    cajero recibe su ticket. Si el POST sí había llegado, subirla después
 *    devuelve esa misma venta: no hay duplicado;
 *  - cualquier respuesta del servidor (un 400, un 403 de cupo, un 500) NO se
 *    encola: es un "no" o un problema que el cajero tiene que ver ahora, como
 *    en Android;
 *  - con el corte reciente ("pegajoso", 3 min) va directo a la cola, sin
 *    esperar otro timeout con el cliente adelante.
 */
export interface Cobro {
  venta: Venta;
  /** true = no llegó al servidor: el ticket es local y la venta espera subir. */
  encolada: boolean;
}

export async function venderOEncolar(
  cuerpo: VentaInput & { clienteRequestId: string },
  enviar: (c: VentaInput) => Promise<Venta>,
  datos: { productos: Producto[]; formasPago: FormaPago[]; cajero?: string | null },
): Promise<Cobro> {
  if (!ventaSinInternet()) return { venta: await enviar(cuerpo), encolada: false };
  if (!sinSenal()) {
    try {
      const venta = await enviar(cuerpo);
      hayRespuesta();
      return { venta, encolada: false };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) {
        if (e instanceof ApiError) hayRespuesta();
        throw e;
      }
      marcarSinSenal();
    }
  }
  const paraLaCola = cuerpoEncolado(cuerpo);
  const clientes = paraLaCola.credito?.clienteId
    ? ((await leerCopia<ClienteCredito[]>("clientes_credito")) ?? [])
    : [];
  const recibo = reciboLocal(paraLaCola, { ...datos, clientes });
  await encolar(paraLaCola, recibo);
  return { venta: recibo, encolada: true };
}

/**
 * La venta como sube desde la cola (`paraLaCola` de Android): con la hora del
 * cobro y la marca `encolada`. El fiado va `encolado` y SIN la firma del
 * encargado: ya se fió con el cliente adelante, y el PIN no se guarda en el
 * teléfono; el servidor lo acepta aunque pase el techo.
 */
export function cuerpoEncolado(
  cuerpo: VentaInput & { clienteRequestId: string },
  ahora = new Date(),
): CuerpoEncolado {
  const { credito, ...resto } = cuerpo;
  return {
    ...resto,
    ...(credito
      ? {
          credito: {
            ...credito,
            autorizadorUsername: undefined,
            autorizadorPin: undefined,
            encolado: true,
          },
        }
      : {}),
    fechaCliente: ahora.toISOString(),
    encolada: true,
  };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * El ticket de una venta que todavía no subió (`reciboLocalDe` de Android).
 * Sin número: el correlativo lo pone el servidor al recibirla. Los nombres y
 * precios salen del catálogo que se estaba usando; el total es el del carrito
 * (el servidor lo recalcula al subir y manda el suyo).
 */
export function reciboLocal(
  c: CuerpoEncolado,
  d: {
    productos: Producto[];
    formasPago: FormaPago[];
    clientes?: ClienteCredito[];
    cajero?: string | null;
  },
): Venta {
  const porId = new Map(d.productos.map((p) => [p.id, p]));
  const detalles = c.detalles.map((x) => {
    const p = porId.get(x.productoId);
    const precio = x.usarPaquete ? 0 : (x.precio ?? p?.precio ?? 0);
    return {
      productoId: x.productoId,
      producto: p?.nombre ?? `Artículo ${x.productoId}`,
      cantidad: x.cantidad,
      precio,
      subtotal: redondear(precio * x.cantidad),
      nota: x.nota ?? null,
      consumo: x.consumo ?? "LLEVAR",
    };
  });
  const descuento = redondear((c.descuentosEsperados ?? []).reduce((s, x) => s + x.monto, 0));
  // Sin el envío, como el `total` del servidor: la tarifa va aparte
  // (`tarifaEnvio`) y el ticket la suma al pintar el TOTAL. Sumada acá, el
  // ticket sin internet decía Bs 110 y el de la misma venta ya subida Bs 100
  // (BUG-cobro-5), y "Vendido" del turno contaba el envío del repartidor
  // mientras la venta esperaba subir.
  const total = redondear(detalles.reduce((s, x) => s + x.subtotal, 0) - descuento);
  const prepagado = c.prepagado ?? true;
  const tarifa = c.tarifaEnvio ?? 0;
  const nombreForma = new Map(d.formasPago.map((f) => [f.id, f.nombre]));
  const pagos = (c.pagos ?? []).map((p) => {
    const recibido = Math.max(p.recibido ?? p.monto, p.monto);
    return {
      formaPagoId: p.formaPagoId,
      formaPago: nombreForma.get(p.formaPagoId),
      monto: p.monto,
      recibido,
      entregado: redondear(recibido - p.monto),
    };
  });
  const pagado = redondear(pagos.reduce((s, p) => s + p.monto, 0));
  const credito = c.credito
    ? ({
        id: 0,
        codigo: "PENDIENTE",
        ventaId: 0,
        clienteId: c.credito.clienteId ?? 0,
        clienteNombre:
          c.credito.clienteNombre ??
          d.clientes?.find((x) => x.id === c.credito?.clienteId)?.nombre ??
          "Cliente",
        clienteTelefono: c.credito.clienteTelefono ?? null,
        montoTotal: total,
        adelanto: pagado,
        saldo: redondear(Math.max(0, total - pagado)),
        fechaCompromiso: c.credito.fechaCompromiso,
        estado: "PENDIENTE",
        vencido: false,
      } satisfies Credito)
    : null;
  return {
    id: 0,
    comprobante: "PENDIENTE",
    estado: "APROBADO",
    fecha: c.fechaCliente,
    cajero: d.cajero ?? null,
    total,
    cambio: redondear(pagos.reduce((s, p) => s + p.entregado, 0)),
    detalles,
    pagos,
    tipoPedido: c.tipoPedido ?? "LOCAL",
    estadoEntrega: null,
    prepagado,
    clienteNombre: c.clienteNombre ?? null,
    clienteDireccion: c.clienteDireccion ?? null,
    clienteTelefono: c.clienteTelefono ?? null,
    tarifaEnvio: tarifa,
    minutosEstimados: c.minutosEstimados ?? null,
    notaPedido: c.notaPedido ?? null,
    entregadoEn: null,
    // Lo que se cobra al entregar y lo que rinde el repartidor, con la regla
    // del servidor (`datosEntrega`) y de `reciboLocalDe` en Android. Faltaban,
    // y con el envío ya fuera de `total` el "A cobrar al entregar" de un
    // pedido contra entrega cargado sin señal decía Bs 50 justo debajo de
    // "Envío Bs 8": la cajera leía un cobro sin la tarifa (BUG-cobro-5).
    totalACobrar: prepagado ? tarifa : redondear(total + tarifa),
    montoRendicion: prepagado ? 0 : total,
    credito,
    ...(descuento > 0 ? { subtotal: redondear(total + descuento), descuentoTotal: descuento } : {}),
    ...(c.citaId != null ? { citaId: c.citaId } : {}),
    pendienteSync: true,
  };
}
