import { aCentavos, esCero } from "../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import type { DocumentoPdf, GrupoPdf } from "../../lib/pdf/tablaPdf";
import { colorDePlataforma } from "../../lib/pedidosPlataforma/marca";
import { NOMBRE_PLATAFORMA } from "../../lib/pedidosPlataforma/tipos";
import type { FiadoDelTurno, MedioVendido, PlataformaVendida, ReporteCierreProductos } from "../../types";

/**
 * Las cuentas de la lista de lo vendido (`ListaProductosVendidos`) antes de
 * dibujarla: qué es tiempo de mesa y qué es producto, qué precio se puede
 * mostrar y cómo se dice cada cantidad. La lista la usan el cierre de caja de
 * todos los rubros, Reportes › Cierres y la Supervisión del billar.
 */

type ItemVendido = ReporteCierreProductos["categorias"][number]["items"][number];

/** Un producto de la lista, listo para dibujar. */
export interface RenglonVendido {
  /** La key de la fila. */
  clave: string;
  nombre: string;
  cantidad: number;
  /** El precio por unidad si `cantidad × precio` da el total; null si se vendió a varios precios. */
  precio: number | null;
  total: number;
  /** De `cantidad`, lo que salió al fiado. Sólo si salió alguna. */
  fiado?: number;
}

/** El tiempo de mesa cobrado en el turno (billar): un renglón por mesa cerrada. */
export interface TiempoDeMesa {
  mesas: number;
  total: number;
}

/** Las cantidades se guardan con 3 decimales (lo que se vende por peso), la plata con 2. */
export const redondearCantidad = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Saca el "Tiempo de mesa" de lo vendido (billar, 25-oct). El backend lo manda
 * como un producto más, marcado con `tiempoMesa` y dentro de su categoría y de
 * los totales (el APK lee esa forma y su total tiene que cerrar con el
 * arqueo). Así se leía "9 unidades · 4 productos" con dos de esas unidades
 * siendo mesas cobradas, en "Sin categoría" al lado de una cerveza, y con un
 * precio que era el promedio por mesa ("2 × Bs 25" por una mesa de Bs 10 y
 * otra de Bs 40).
 *
 * Devuelve lo vendido sin él (sus unidades, su total y sus productos
 * descontados; la categoría que queda vacía no se muestra) y el tiempo aparte.
 * Las categorías se vuelven a ordenar por total, el criterio del backend: la
 * que lo tenía estaba arriba por la plata del tiempo. Sin tiempo de mesa (los
 * demás rubros) devuelve lo mismo que recibió.
 */
export function separarTiempoDeMesa(d: ReporteCierreProductos): {
  tiempo: TiempoDeMesa | null;
  productos: ReporteCierreProductos;
} {
  let mesas = 0;
  let total = 0;
  let lineas = 0;
  const categorias: ReporteCierreProductos["categorias"] = [];
  for (const c of d.categorias) {
    const deTiempo = c.items.filter((i) => i.tiempoMesa);
    if (deTiempo.length === 0) {
      categorias.push(c);
      continue;
    }
    const cant = deTiempo.reduce((t, i) => t + i.cantidad, 0);
    const bs = deTiempo.reduce((t, i) => t + i.total, 0);
    mesas += cant;
    total += bs;
    lineas += deTiempo.length;
    const items = c.items.filter((i) => !i.tiempoMesa);
    if (items.length > 0) {
      categorias.push({ ...c, unidades: redondearCantidad(c.unidades - cant), total: aCentavos(c.total - bs), items });
    }
  }
  if (lineas === 0) return { tiempo: null, productos: d };
  return {
    tiempo: { mesas: redondearCantidad(mesas), total: aCentavos(total) },
    productos: {
      // Lo demás que diga el backend (el fiado, los cobros) sigue igual.
      ...d,
      categorias: categorias.sort((a, b) => b.total - a.total),
      unidades: redondearCantidad(d.unidades - mesas),
      total: aCentavos(d.total - total),
      lineas: d.lineas - lineas,
    },
  };
}

/**
 * El precio por unidad que se puede escribir como "3 u × Bs 10,00". El del
 * backend es un promedio (total ÷ cantidad): si el producto se vendió a dos
 * precios en el turno (le cambiaron el precio, o una venta tuvo descuento),
 * "3 × Bs 9,33" daba Bs 27,99 contra un total de Bs 28,00. Si no multiplica
 * (con medio centavo de tolerancia) es null y la pantalla dice "varios precios".
 *
 * Con la marca del backend (`variosPrecios`) es null aunque multiplique: 1 a
 * Bs 10 y 1 a Bs 12 dan "2 u × Bs 11,00", un precio que no existió. La cuenta
 * queda para un backend anterior, que no la manda.
 */
export function precioQueMultiplica(i: Pick<ItemVendido, "cantidad" | "precio" | "total" | "variosPrecios">): number | null {
  if (i.variosPrecios) return null;
  return esCero(i.cantidad * i.precio - i.total) ? i.precio : null;
}

/**
 * Un producto del backend como renglón. La key es el artículo: dos artículos distintos pueden llamarse igual.
 * Un producto borrado sale con `productoId: 0` (backend del 16-nov): no es un artículo, y dos borrados
 * repetirían `p0`; sin un id real la key es el nombre con su posición.
 */
export function renglonVendido(i: ItemVendido, indice: number): RenglonVendido {
  return {
    clave: i.productoId != null && i.productoId > 0 ? `p${i.productoId}` : `${i.nombre}-${indice}`,
    nombre: i.nombre,
    cantidad: i.cantidad,
    precio: precioQueMultiplica(i),
    total: i.total,
    ...(i.fiado ? { fiado: i.fiado } : {}),
  };
}

/** "1 al fiado", "2 al fiado": las unidades del renglón que salieron fiadas. */
export function textoAlFiado(n: number): string {
  return `${fmtCantidad(n)} al fiado`;
}

/**
 * Lo que salió al fiado en el turno, en una frase (Kevin, 11-nov: "sí salió
 * el producto, pero no entró dinero"). Con adelanto se dice qué parte sí
 * entró, porque el "Al fiado" del cierre es lo que quedó debiendo y no lo
 * que salió: sin decirlo, los dos números no cuadran a simple vista.
 */
export function textoFiadoDelTurno(f: FiadoDelTurno): string {
  const ventas = f.ventas === 1 ? "1 venta" : `${fmtCantidad(f.ventas)} ventas`;
  const base = `${textoUnidades(f.unidades)} en ${ventas} al fiado`;
  if (esCero(f.adelantos)) return `${base}: ${fmtMoney(f.total)} que no entraron al cajón.`;
  return `${base}: ${fmtMoney(f.total)}. Entraron ${fmtMoney(f.adelantos)} de adelanto; quedan ${fmtMoney(f.porCobrar)} por cobrar.`;
}

/** Los cobros de fiado del turno: plata sin producto, porque el producto salió el día que se fió. */
export function textoCobrosDeFiado(total: number): string {
  return `Además entraron ${fmtMoney(total)} de cobros de fiado, sin producto: esos salieron el día que se fiaron.`;
}

/** "1 unidad", "3 unidades", "0,5 unidades": sin ",00" (Kevin, 25-oct) y en singular sólo si es una. */
export function textoUnidades(n: number): string {
  const t = fmtCantidad(n);
  return `${t} ${t === "1" ? "unidad" : "unidades"}`;
}

/** "1 producto", "3 productos": productos distintos, no unidades. */
export function textoProductos(n: number): string {
  return `${fmtCantidad(n)} ${n === 1 ? "producto" : "productos"}`;
}

/** "1 pedido", "3 pedidos". */
export function textoPedidos(n: number): string {
  const t = fmtCantidad(n);
  return `${t} ${t === "1" ? "pedido" : "pedidos"}`;
}

/**
 * Las plataformas con pedidos en el turno (PLAN-PEDIDOS-PLATAFORMA §11). El
 * campo es opcional: contra un backend anterior, o sin pedidos, queda vacío y
 * la lista se ve igual que siempre.
 */
export function plataformasDelTurno(d: Pick<ReporteCierreProductos, "plataformas">): PlataformaVendida[] {
  return (d.plataformas ?? []).filter((p) => p.pedidos > 0 || p.unidades > 0);
}

/**
 * Lo que descontó la app en los pedidos de esa plataforma (19-nov); 0 si no
 * hubo o si el backend es viejo y no lo manda.
 */
export function descuentosDePlataforma(p: Pick<PlataformaVendida, "descuentos">): number {
  const d = Number(p.descuentos ?? 0);
  return Number.isFinite(d) && d > 0 ? aCentavos(d) : 0;
}

/**
 * Lo que paga la app: la suma de los renglones menos sus descuentos. Sin
 * descuentos es el `total` de siempre.
 */
export function totalDePlataforma(p: Pick<PlataformaVendida, "total" | "descuentos">): number {
  return aCentavos(p.total - descuentosDePlataforma(p));
}

/** «Descuentos»: el renglón al final de la tabla de una plataforma, para que renglones − descuentos = encabezado. */
export const ETIQUETA_DESCUENTOS_PLATAFORMA = "Descuentos";

/**
 * «Yango · 3 pedidos · 5 unidades · Bs 85,00»: el encabezado de la sección de
 * una plataforma, con lo que paga la app (ya sin sus descuentos).
 */
export function textoEncabezadoPlataforma(p: PlataformaVendida): string {
  const nombre = NOMBRE_PLATAFORMA[p.plataforma] ?? p.plataforma;
  return `${nombre} · ${textoPedidos(p.pedidos)} · ${textoUnidades(p.unidades)} · ${fmtMoney(totalDePlataforma(p))}`;
}

/**
 * La línea corta del resumen del cierre: «+ Yango 3 · PedidosYa 1 pedidos».
 * `null` si no hubo pedidos.
 */
export function textoPedidosDePlataforma(d: Pick<ReporteCierreProductos, "plataformas">): string | null {
  const ps = plataformasDelTurno(d);
  if (ps.length === 0) return null;
  const partes = ps.map((p) => `${NOMBRE_PLATAFORMA[p.plataforma] ?? p.plataforma} ${fmtCantidad(p.pedidos)}`);
  return `+ ${partes.join(" · ")} pedidos`;
}

/** "1 venta", "4 ventas". */
export function textoVentas(n: number): string {
  const t = fmtCantidad(n);
  return `${t} ${t === "1" ? "venta" : "ventas"}`;
}

/** Las dos vistas de «Productos vendidos» (§11 bis). */
export type VistaProductos = "medio" | "todo";

/** Lo que dice el aviso bajo el encabezado de lo que se debe. */
export const LEYENDA_FIADO = "No entró al cajón";

/**
 * Las secciones por forma de pago, si la lista se puede ver así (§11 bis):
 * el backend las manda y no hay "Tiempo de mesa" (billar), que se cobra como
 * un producto más y hoy se muestra aparte, arriba; partido por forma de pago
 * no tendría dónde ir. Sin esto (un backend anterior) la lista es la de siempre.
 */
export function mediosDelTurno(d: Pick<ReporteCierreProductos, "porMedio">): MedioVendido[] {
  const medios = (d.porMedio ?? []).filter((m) => m.ventas > 0 || m.unidades > 0);
  const conTiempo = medios.some((m) => m.categorias.some((c) => c.items.some((i) => i.tiempoMesa)));
  return conTiempo ? [] : medios;
}

/** «Efectivo · 4 ventas · 7 unidades · Bs 140,00»: el encabezado de la sección de una forma de pago. */
export function textoEncabezadoMedio(m: MedioVendido): string {
  return `${m.nombre} · ${textoVentas(m.ventas)} · ${textoUnidades(m.unidades)} · ${fmtMoney(m.total)}`;
}

/** «Total de unidades: 15». */
export function textoTotalDeUnidades(n: number): string {
  return `Total de unidades: ${fmtCantidad(n)}`;
}

/** «C 3 · M 5 · L 2 · Topping 4»: cuántas salieron de cada categoría, ventas y pedidos juntos. */
export function textoUnidadesPorCategoria(d: Pick<ReporteCierreProductos, "todo">): string {
  return (d.todo?.categorias ?? [])
    .filter((c) => c.unidades > 0)
    .map((c) => `${c.nombre} ${fmtCantidad(c.unidades)}`)
    .join(" · ");
}

/** "1 mesa cobrada", "4 mesas cobradas". */
export function textoMesasCobradas(n: number): string {
  const t = fmtCantidad(n);
  return `${t} ${t === "1" ? "mesa cobrada" : "mesas cobradas"}`;
}

/** "3 u × Bs 10,00", o "3 u · varios precios" si no hay un precio que multiplique. */
export function textoCantidadPorPrecio(cantidad: number, precio: number | null): string {
  return precio == null ? `${fmtCantidad(cantidad)} u · varios precios` : `${fmtCantidad(cantidad)} u × ${fmtMoney(precio)}`;
}

/**
 * Cuántos renglones de cada grupo se ven con un tope: los primeros `limite` en
 * el orden en que vienen (lo que más salió, primero). Sin tope, o si sobra uno
 * solo, se ven todos: el botón para mostrarlo ocupa el mismo renglón.
 */
export function renglonesVisibles(porGrupo: number[], limite?: number): { visibles: number[]; ocultos: number } {
  const total = porGrupo.reduce((t, n) => t + n, 0);
  if (limite == null || total <= limite + 1) return { visibles: porGrupo, ocultos: 0 };
  let quedan = limite;
  const visibles = porGrupo.map((n) => {
    const v = Math.min(n, quedan);
    quedan -= v;
    return v;
  });
  return { visibles, ocultos: total - limite };
}

/**
 * El PDF de Productos vendidos, igual al de la app (5-nov): la tabla con las
 * categorías y sus subtotales, cada producto con su unitario abajo, el TOTAL
 * VENDIDO y la nota de que no es lo que hay en el cajón. Reemplaza al CSV, que
 * en el celular se abría con la fila entera en una celda.
 */
export function documentoProductosVendidos(
  d: ReporteCierreProductos,
  o: { negocio?: string | null; subtitulo: string; vista?: VistaProductos },
): DocumentoPdf {
  // El fiado va arriba, junto a cuántos productos (es lo primero que se mira
  // en el celular), y explicado en las notas; cada producto fiado lo dice en
  // su renglón. El TOTAL sigue siendo lo vendido, fiado incluido, como el
  // "Total vendido" del arqueo.
  const fiado = d.fiado && d.fiado.unidades > 0 ? d.fiado : null;
  const plataformas = plataformasDelTurno(d);
  const medios = mediosDelTurno(d);
  // Por forma de pago es la vista de entrada cuando el backend la manda (§11 bis).
  const porMedio = medios.length > 0 && (o.vista ?? "medio") === "medio";
  const deplataformas = textoPedidosDePlataforma(d);
  const gruposDe = (categorias: ReporteCierreProductos["categorias"]): GrupoPdf[] =>
    categorias.map((c) => ({
      titulo: c.nombre,
      celdas: [
        { texto: fmtCantidad(c.unidades), tono: "apagado" },
        { texto: fmtMoney(c.total) },
      ],
      filas: c.items.map((i) => {
        const precio = precioQueMultiplica(i);
        const unitario = precio == null ? "varios precios" : `${fmtMoney(precio)} c/u`;
        return {
          nombre: i.nombre,
          detalle: i.fiado ? `${unitario} · ${textoAlFiado(i.fiado)}` : unitario,
          celdas: [{ texto: fmtCantidad(i.cantidad) }, { texto: fmtMoney(i.total) }],
        };
      }),
    }));
  const seccionesDePlataforma: GrupoPdf[] = plataformas.flatMap((p) => {
    const descuentos = descuentosDePlataforma(p);
    return [
      {
        titulo: textoEncabezadoPlataforma(p),
        color: colorDePlataforma(p.plataforma),
        aclaracion: "",
        celdas: [],
        filas: [],
      },
      ...gruposDe(p.categorias),
      // Los renglones van al precio de la app; lo que descontó, al final, para
      // que la tabla cierre con el encabezado (19-nov). El guion común y no el
      // signo menos: la letra del PDF (Helvetica) no lo tiene.
      ...(descuentos > 0
        ? [{ titulo: ETIQUETA_DESCUENTOS_PLATAFORMA, celdas: [{ texto: "" }, { texto: `-${fmtMoney(descuentos)}` }], filas: [] }]
        : []),
    ];
  });
  const notaPlataformas = plataformas.length > 0
    ? ["Los pedidos de Yango y PedidosYa van aparte: los paga la app de delivery y no suman al total vendido."]
    : [];
  if (porMedio) {
    // Una sección por forma de pago, después las plataformas y al final el
    // resumen: el total en caja y las unidades de todo, por categoría.
    const unidades = d.todo?.unidades;
    const desglose = textoUnidadesPorCategoria(d);
    return {
      titulo: "Productos vendidos",
      negocio: o.negocio,
      subtitulo: o.subtitulo,
      resumen: `${textoProductos(d.lineas)} · ${textoUnidades(d.unidades)}${fiado ? ` · ${textoAlFiado(fiado.unidades)}` : ""}${deplataformas ? ` · ${deplataformas}` : ""}`,
      columnas: ["PRODUCTO", "CANT.", "TOTAL"],
      grupos: [
        ...medios.flatMap((m) => [
          {
            titulo: textoEncabezadoMedio(m),
            aclaracion: m.medio === "FIADO" ? LEYENDA_FIADO : "",
            celdas: [],
            filas: [],
          } satisfies GrupoPdf,
          ...gruposDe(m.categorias),
        ]),
        ...seccionesDePlataforma,
      ],
      total: { etiqueta: "TOTAL VENDIDO EN CAJA", celdas: [{ texto: "" }, { texto: fmtMoney(d.total) }] },
      despuesDelTotal:
        unidades != null
          ? [{ titulo: textoTotalDeUnidades(unidades), aclaracion: desglose, celdas: [], filas: [] }]
          : [],
      notas: [
        ...notaPlataformas,
        ...(fiado ? [textoFiadoDelTurno(fiado)] : []),
        ...(d.cobrosDeFiado && !esCero(d.cobrosDeFiado.total) ? [textoCobrosDeFiado(d.cobrosDeFiado.total)] : []),
        "Es lo vendido en el turno, no lo que hay en el cajón. Un crédito cobrado hoy tampoco suma acá: ese producto ya se vendió antes.",
      ],
    };
  }
  return {
    titulo: "Productos vendidos",
    negocio: o.negocio,
    subtitulo: o.subtitulo,
    resumen: `${textoProductos(d.lineas)} · ${textoUnidades(d.unidades)}${fiado ? ` · ${textoAlFiado(fiado.unidades)}` : ""}${deplataformas ? ` · ${deplataformas}` : ""}`,
    columnas: ["PRODUCTO", "CANT.", "TOTAL"],
    grupos: gruposDe(d.categorias),
    total: { etiqueta: "TOTAL VENDIDO", celdas: [{ texto: "" }, { texto: fmtMoney(d.total) }] },
    // Cada plataforma, aparte y después del total (§11): su encabezado y debajo
    // sus categorías con el mismo formato que las ventas.
    despuesDelTotal: seccionesDePlataforma,
    notas: [
      ...notaPlataformas,
      ...(fiado ? [textoFiadoDelTurno(fiado)] : []),
      ...(d.cobrosDeFiado && !esCero(d.cobrosDeFiado.total) ? [textoCobrosDeFiado(d.cobrosDeFiado.total)] : []),
      "Es lo vendido en el turno, no lo que hay en el cajón. Un crédito cobrado hoy tampoco suma acá: ese producto ya se vendió antes.",
    ],
  };
}
