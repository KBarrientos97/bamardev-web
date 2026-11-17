import { useCallback, useEffect, useMemo, useState } from "react";
import type { Consumo, DetalleVentaInput, Producto, TipoPedido } from "../../types";
import { agregadosParaEnviar, firmaDeAgregados, vistaDeAgregados, type VistaAgregados } from "../../lib/agregados/calculo";
import type { AgregadoElegido, CatalogoAgregados } from "../../lib/agregados/tipos";

/**
 * Una línea del carrito. El split Mesa/Llevar se guarda como cantidad en mesa:
 * lo que no está en mesa se lleva. Se maneja así (y no como dos líneas) porque
 * la comanda necesita saber que "3 pollos, 2 para mesa y 1 para llevar" es un
 * mismo pedido, y porque el cajero cambia el split sin re-teclear cantidades.
 */
export interface LineaCarrito {
  producto: Producto;
  cantidad: number;
  /** Cuántas unidades de esta línea se consumen en mesa (0..cantidad). */
  enMesa: number;
  nota: string;
  /**
   * Los toppings de CADA unidad del vaso, en el orden en que se tocaron
   * (PLAN-AGREGADOS §7.4). Dos vasos iguales con toppings distintos son líneas
   * distintas, así que esto es parte de la identidad de la línea
   * (`claveDeLinea`). Sin toppings, ausente: la línea de siempre.
   */
  agregados?: AgregadoElegido[];
  /**
   * Lo elegido ya calculado contra el catálogo de agregados (hijas con su
   * precio, extras por unidad). Lo pone `useCarrito`; no se guarda.
   */
  vista?: VistaAgregados;
}

/**
 * Cómo se señala una línea: el id del producto, y con toppings además lo
 * elegido. Los métodos del carrito reciben esto y no el id del producto porque
 * el mismo vaso puede estar dos veces con toppings distintos. Para una línea sin
 * toppings la clave es el id (como número o como texto): las pantallas que
 * nunca supieron de toppings siguen funcionando igual.
 */
export type ClaveLinea = number | string;

export function claveDeLinea(l: Pick<LineaCarrito, "producto" | "agregados">): ClaveLinea {
  const firma = firmaDeAgregados(l.agregados);
  return firma ? `${l.producto.id}|${firma}` : l.producto.id;
}

const mismaClave = (a: ClaveLinea, b: ClaveLinea) => String(a) === String(b);

export interface Carrito {
  lineas: LineaCarrito[];
  unidades: number;
  subtotal: number;
  /**
   * Igual al subtotal. El backend calcula el total desde las líneas y exige
   * que los pagos sumen exactamente eso, así que no hay dónde meter un
   * descuento: se deja el campo para no salpicar las pantallas de cálculos.
   */
  total: number;
  /**
   * Cuánto suman los toppings extra de todas las líneas (ya dentro de
   * `subtotal` y `total`). El motor de promociones sólo ve los vasos: el total
   * con descuentos es el neto del vaso MÁS esto. Ausente = 0.
   */
  totalAgregados?: number;
  /** Con `agregados`, suma a la línea de ese vaso con esos toppings. */
  agregar: (p: Producto, agregados?: AgregadoElegido[]) => void;
  /** Cambia los toppings de una línea (reabrir la hoja): si ya hay otra igual, se juntan. */
  setAgregados: (clave: ClaveLinea, agregados: AgregadoElegido[]) => void;
  setCantidad: (clave: ClaveLinea, cantidad: number) => void;
  setNota: (clave: ClaveLinea, nota: string) => void;
  setEnMesa: (clave: ClaveLinea, enMesa: number) => void;
  /** Marca la línea entera como mesa o llevar. */
  setConsumo: (clave: ClaveLinea, consumo: Consumo) => void;
  /** Marca TODO el carrito como mesa o llevar. */
  setConsumoTodo: (consumo: Consumo) => void;
  quitar: (clave: ClaveLinea) => void;
  vaciar: () => void;
  /** Lo que espera POST /ventas: una línea por cada consumo distinto. */
  aDetalles: () => DetalleVentaInput[];
}

/**
 * Cuánto se puede VENDER de un artículo: el stock menos lo que está en lotes
 * vencidos (sólo farmacia, ver `stockVencido`).
 *
 * Lo vencido sigue en el estante hasta que se da de baja, así que `stockTotal`
 * lo cuenta; pero no se vende, y el servidor rechaza la venta que lo necesite.
 * Sin restarlo, el carrito dejaba cargar cajas que después no se cobraban. Un
 * artículo sin lotes (todo el restaurante) no trae `stockVencido` y da lo de
 * siempre.
 */
export function paraVender(p: Producto): number {
  return Math.max(0, p.stockTotal - (p.stockVencido ?? 0));
}

/**
 * Si el artículo se agota. Sólo el elaborado (SERVICIO) no: se prepara al
 * vender y no lleva stock.
 *
 * El combo (COMPUESTO) SÍ: desde el 25-ago tiene su PROPIO stock —cuántos
 * decidió armar el local— y la venta de mostrador lo descuenta y la rechaza si
 * no alcanza (`venta.service.aplicarStock`). La receta es la descripción de lo
 * que lleva y no descuenta nada. Antes la web lo trataba como un elaborado: el
 * combo nunca decía cuántos quedaban, se cargaban los que se quisieran y el
 * cobro rebotaba al confirmar con "Stock insuficiente de …", con el cliente
 * enfrente. Mismo criterio que `ProductoPuntoVenta.controlaStock` en la app.
 *
 * Y tampoco se agota nada cuando el negocio vende sin stock (Configuración ›
 * Inventario y stock, 09-nov): el local que todavía no contó sus bebidas
 * tenía todo en cero y el POS no le dejaba cobrar ni una gaseosa. El backend
 * lo avisa en cada artículo (`vendeSinStock`) y la venta lo deja pasar. Así
 * el tope, la tarjeta del POS, la carta del salón y el carrito cambian juntos.
 */
export function controlaStock(p: Pick<Producto, "tipoProducto" | "vendeSinStock">): boolean {
  return p.tipoProducto !== "SERVICIO" && !p.vendeSinStock;
}

/** Hasta cuánto se puede cargar de un artículo: lo que no se agota, sin tope. */
export function topeStock(p: Producto): number {
  return controlaStock(p) ? paraVender(p) : Number.POSITIVE_INFINITY;
}

/**
 * Dónde se guarda la venta a medio armar.
 *
 * `sessionStorage` y no `localStorage` a propósito: el carrito es de ESTA
 * sesión del navegador. Un cajero que cierra el turno y se va no tiene que
 * encontrarse mañana con las líneas del cliente de ayer; pero un F5 accidental
 * —o que el navegador recargue la pestaña por memoria, que en las tablets
 * baratas del mostrador pasa— no puede costarle la venta que estaba cargando
 * con el cliente enfrente.
 *
 * La clave lleva el tipo de pedido: el carrito del mostrador y el de un
 * delivery son ventas distintas y no deben pisarse.
 */
const CLAVE_CARRITO = "bamar.carrito";

/**
 * Se guardan sólo los ids y las cantidades, NO el producto entero.
 *
 * Si guardáramos el `Producto` completo, al recargar se restauraría con el
 * precio que tenía cuando se cargó la línea: si el dueño lo cambió mientras
 * tanto, el POS cobraría el viejo. Al rehidratar se busca cada id en el
 * catálogo fresco, y lo que ya no existe simplemente no vuelve.
 */
interface LineaGuardada {
  id: number;
  cantidad: number;
  enMesa: number;
  nota: string;
  /** Lo elegido, no su precio: los extras se recalculan con el catálogo de hoy. */
  agregados?: AgregadoElegido[];
}

/** Los ids que dejó guardados el carrito de ese tipo de pedido. */
export function idsGuardados(tipoPedido: TipoPedido = "LOCAL"): number[] {
  return leerGuardado(`${CLAVE_CARRITO}.${tipoPedido}`).map((l) => l.id);
}

function leerGuardado(clave: string): LineaGuardada[] {
  try {
    const crudo = sessionStorage.getItem(clave);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? (datos as LineaGuardada[]) : [];
  } catch {
    // Modo privado, storage lleno o un JSON de una versión vieja: se sigue sin
    // carrito, que es exactamente como funcionaba antes.
    return [];
  }
}

export function useCarrito(
  tipoPedido: TipoPedido = "LOCAL",
  catalogo: Producto[] = [],
  /**
   * Cuándo ya se puede rehidratar. Por defecto, cuando llegó el catálogo. La
   * farmacia no se trae el catálogo: busca sólo los artículos guardados, y
   * con un carrito vacío no hay nada que buscar — sin esto nunca rehidrataba
   * y, por lo tanto, tampoco guardaba.
   */
  catalogoListo: boolean = catalogo.length > 0,
  /**
   * Un carrito que vive sólo en memoria y arranca con estas líneas: el de
   * modificar una venta ya cobrada (`ModificarVenta`, 15-nov). No lee ni
   * escribe `sessionStorage`: si lo hiciera pisaría la venta a medio armar
   * del mostrador, que es otra cosa. Sin esto —todo el POS de siempre— el
   * carrito se guarda y se rehidrata como antes.
   */
  enMemoria?: { inicial: LineaCarrito[] },
  /**
   * El catálogo de toppings (`GET /agregados/catalogo`): con él se calculan los
   * extras de cada línea y el total. Sin él (el ajuste apagado, o todavía no
   * llegó) las líneas con toppings valen lo del vaso solo.
   */
  catalogoAgregados?: CatalogoAgregados | null,
): Carrito {
  const clave = `${CLAVE_CARRITO}.${tipoPedido}`;
  const sinGuardar = enMemoria !== undefined;
  const [lineasBase, setLineas] = useState<LineaCarrito[]>(() => enMemoria?.inicial ?? []);
  const [rehidratado, setRehidratado] = useState(false);

  // Rehidratar en cuanto llega el catálogo: antes no se puede, porque las
  // líneas necesitan el Producto y sólo tenemos su id.
  useEffect(() => {
    if (sinGuardar) return;
    if (rehidratado || !catalogoListo) return;
    const guardadas = leerGuardado(clave);
    if (guardadas.length > 0) {
      const porId = new Map(catalogo.map((p) => [p.id, p]));
      setLineas(
        guardadas
          .map((g) => {
            const producto = porId.get(g.id);
            if (!producto) return null;
            return {
              producto,
              cantidad: g.cantidad,
              enMesa: g.enMesa,
              nota: g.nota,
              ...(g.agregados?.length ? { agregados: g.agregados } : {}),
            } satisfies LineaCarrito;
          })
          .filter((l): l is LineaCarrito => l !== null),
      );
    }
    setRehidratado(true);
  }, [catalogo, catalogoListo, clave, rehidratado, sinGuardar]);

  /**
   * Las líneas con sus toppings ya calculados. Se arma acá y no al agregar
   * porque lo guardado en la pestaña es sólo lo elegido: después de un F5 los
   * extras salen del catálogo de hoy, igual que el precio del producto.
   */
  const lineas = useMemo(
    () =>
      lineasBase.map((l) =>
        l.agregados?.length ? { ...l, vista: vistaDeAgregados(l.agregados, l.producto.id, catalogoAgregados) } : l,
      ),
    [lineasBase, catalogoAgregados],
  );

  // Y se guarda con cada cambio. Recién después de rehidratar, para que el
  // estado vacío del primer render no borre lo que había guardado.
  useEffect(() => {
    if (sinGuardar || !rehidratado) return;
    try {
      if (lineasBase.length === 0) {
        sessionStorage.removeItem(clave);
        return;
      }
      const guardar: LineaGuardada[] = lineasBase.map((l) => ({
        id: l.producto.id,
        cantidad: l.cantidad,
        enMesa: l.enMesa,
        nota: l.nota,
        ...(l.agregados?.length ? { agregados: l.agregados } : {}),
      }));
      sessionStorage.setItem(clave, JSON.stringify(guardar));
    } catch {
      /* sin storage se sigue igual: es una comodidad, no un requisito */
    }
  }, [lineasBase, clave, rehidratado, sinGuardar]);

  /**
   * Consumo con el que nace una línea nueva. En el local la mayoría se sienta
   * a comer, así que MESA es el default y LLEVAR la excepción que se marca;
   * un delivery o un "recoger" no tienen mesa y ahí no hay más opción que
   * LLEVAR. Mismo criterio que `CarritoViewModel.consumoPorDefecto` (Android).
   */
  const enMesaPorDefecto = tipoPedido === "LOCAL";

  /** Cuántas unidades de ese producto hay en el carrito, sumando las líneas con toppings distintos. */
  const unidadesDe = (ls: LineaCarrito[], productoId: number) =>
    ls.reduce((n, l) => (l.producto.id === productoId ? n + l.cantidad : n), 0);

  const agregar = useCallback(
    (p: Producto, agregados?: AgregadoElegido[]) => {
      const elegidos = agregados?.length ? agregados : undefined;
      const clavePedida = claveDeLinea({ producto: p, agregados: elegidos });
      setLineas((prev) => {
        const ex = prev.find((l) => mismaClave(claveDeLinea(l), clavePedida));
        // El tope es del PRODUCTO: dos vasos con toppings distintos salen del
        // mismo stock, así que se cuentan juntos.
        const tope = topeStock(p);
        if (unidadesDe(prev, p.id) >= tope) return prev;
        if (!ex) {
          return [
            ...prev,
            {
              producto: p,
              cantidad: 1,
              enMesa: enMesaPorDefecto ? 1 : 0,
              nota: "",
              ...(elegidos ? { agregados: elegidos } : {}),
            },
          ];
        }
        // Al subir la cantidad, una línea entera en mesa sigue entera en mesa:
        // si no, sumar la segunda unidad la mandaba sola a "llevar".
        const pura = ex.enMesa === ex.cantidad;
        return prev.map((l) =>
          l === ex ? { ...l, cantidad: l.cantidad + 1, enMesa: pura ? l.enMesa + 1 : l.enMesa } : l,
        );
      });
    },
    [enMesaPorDefecto],
  );

  const quitar = useCallback((id: ClaveLinea) => {
    setLineas((prev) => prev.filter((l) => !mismaClave(claveDeLinea(l), id)));
  }, []);

  const setCantidad = useCallback(
    (id: ClaveLinea, cantidad: number) => {
      if (cantidad < 1) return quitar(id);
      setLineas((prev) =>
        prev.map((l) => {
          if (!mismaClave(claveDeLinea(l), id)) return l;
          // Lo que queda del stock del producto sin contar esta línea.
          const tope = topeStock(l.producto) - (unidadesDe(prev, l.producto.id) - l.cantidad);
          const nueva = Math.min(cantidad, tope);
          // Una línea entera en un consumo se queda entera en ese consumo al
          // cambiar la cantidad: subir de 2 a 3 en una mesa no manda la tercera
          // unidad a "llevar" sola. Si estaba partida, el reparto se conserva y
          // sólo se recorta para no exceder la cantidad nueva. Es lo que hace
          // `CarritoViewModel.ajustarTotal` en la app.
          const pura = l.enMesa === l.cantidad;
          return {
            ...l,
            cantidad: nueva,
            enMesa: pura ? nueva : Math.min(l.enMesa, nueva),
          };
        }),
      );
    },
    [quitar],
  );

  const setAgregados = useCallback((id: ClaveLinea, agregados: AgregadoElegido[]) => {
    setLineas((prev) => {
      const linea = prev.find((l) => mismaClave(claveDeLinea(l), id));
      if (!linea) return prev;
      const elegidos = agregados.length ? agregados : undefined;
      const nueva = { ...linea, agregados: elegidos };
      if (!elegidos) delete nueva.agregados;
      const claveNueva = claveDeLinea(nueva);
      const gemela = prev.find((l) => l !== linea && mismaClave(claveDeLinea(l), claveNueva));
      if (!gemela) return prev.map((l) => (l === linea ? nueva : l));
      // Quedó igual a otra línea del mismo vaso: se juntan en vez de repetirse.
      const juntas: LineaCarrito = {
        ...gemela,
        cantidad: gemela.cantidad + linea.cantidad,
        enMesa: gemela.enMesa + linea.enMesa,
        nota: gemela.nota || linea.nota,
      };
      return prev.filter((l) => l !== linea).map((l) => (l === gemela ? juntas : l));
    });
  }, []);

  const setNota = useCallback((id: ClaveLinea, nota: string) => {
    setLineas((prev) => prev.map((l) => (mismaClave(claveDeLinea(l), id) ? { ...l, nota } : l)));
  }, []);

  const setEnMesa = useCallback((id: ClaveLinea, enMesa: number) => {
    setLineas((prev) =>
      prev.map((l) =>
        mismaClave(claveDeLinea(l), id)
          ? { ...l, enMesa: Math.max(0, Math.min(enMesa, l.cantidad)) }
          : l,
      ),
    );
  }, []);

  const setConsumo = useCallback((id: ClaveLinea, consumo: Consumo) => {
    setLineas((prev) =>
      prev.map((l) =>
        mismaClave(claveDeLinea(l), id) ? { ...l, enMesa: consumo === "MESA" ? l.cantidad : 0 } : l,
      ),
    );
  }, []);

  const setConsumoTodo = useCallback((consumo: Consumo) => {
    setLineas((prev) =>
      prev.map((l) => ({ ...l, enMesa: consumo === "MESA" ? l.cantidad : 0 })),
    );
  }, []);

  const vaciar = useCallback(() => {
    setLineas([]);
  }, []);

  const { unidades, subtotal, totalAgregados } = useMemo(() => {
    let u = 0;
    let s = 0;
    let a = 0;
    for (const l of lineas) {
      const extra = l.vista?.extraPorUnidad ?? 0;
      u += l.cantidad;
      s += l.cantidad * (l.producto.precio + extra);
      a += l.cantidad * extra;
    }
    return { unidades: u, subtotal: s, totalAgregados: Math.round(a * 100) / 100 };
  }, [lineas]);

  const total = useMemo(() => Math.round(subtotal * 100) / 100, [subtotal]);

  const aDetalles = useCallback((): DetalleVentaInput[] => {
    const out: DetalleVentaInput[] = [];
    for (const l of lineas) {
      const nota = l.nota.trim() || undefined;
      // Los toppings viajan en las dos mitades de una línea partida: cada
      // unidad del vaso trae los suyos, vaya a la mesa o se la lleven.
      const agregados = l.vista ? agregadosParaEnviar(l.agregados, l.vista) : undefined;
      // Un delivery o un "recoger" no tienen mesa. El carrito se arma con el
      // pedido en LOCAL (en mesa) y recién después se elige el tipo, así que
      // las líneas llegan acá con su reparto del mostrador: se mandan todas
      // para llevar, sin tocarlo (si vuelve al mostrador, sigue como estaba).
      const enMesa = enMesaPorDefecto ? l.enMesa : 0;
      // Una línea partida viaja como dos detalles: el backend guarda el
      // consumo por detalle, así la comanda sabe qué va a la mesa.
      if (enMesa > 0) {
        out.push({
          productoId: l.producto.id,
          cantidad: enMesa,
          precio: l.producto.precio,
          consumo: "MESA",
          ...(nota ? { nota } : {}),
          ...(agregados ? { agregados } : {}),
        });
      }
      const llevar = l.cantidad - enMesa;
      if (llevar > 0) {
        out.push({
          productoId: l.producto.id,
          cantidad: llevar,
          precio: l.producto.precio,
          consumo: "LLEVAR",
          ...(nota ? { nota } : {}),
          ...(agregados ? { agregados } : {}),
        });
      }
    }
    return out;
  }, [lineas, enMesaPorDefecto]);

  return {
    lineas,
    unidades,
    subtotal,
    total,
    totalAgregados,
    agregar,
    setAgregados,
    setCantidad,
    setNota,
    setEnMesa,
    setConsumo,
    setConsumoTodo,
    quitar,
    vaciar,
    aDetalles,
  };
}
