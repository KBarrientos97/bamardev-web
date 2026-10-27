import type { NombreIcono } from "../../../../components/Icon";
import { aCentavos, esPositivo } from "../../../../lib/dinero";
import { fmtCantidad, fmtNum } from "../../../../lib/format";
import { esBelleza, esBillar, esFarmacia } from "../../../../lib/rubro";
import type { ReporteAgenda } from "../../../../lib/agenda/tiposComisiones";
import type { ReporteMermas } from "../../../../types";
import type { BillarReporteApi, CreditosApi, MeserosApi, MetodoPagoApi, PuntoTendencia, ResumenApi, SugerenciaApi } from "../../api";
import { bsEntero, horas, pct } from "../../formato";
import type { PuntoLinea } from "../../graficos";
import type { TonoR } from "../../ui";

/**
 * Las cuentas del Resumen, separadas de la pantalla para poder probarlas: la
 * serie del gráfico, el desglose de la tarjeta de ventas, los avisos de "Para
 * tener en cuenta" y el texto que se manda por WhatsApp.
 */

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "Sáb 3 oct" para un día, "octubre 2026" para un mes; sin fecha, la etiqueta del backend. */
export function detalleFecha(p: PuntoTendencia): string {
  if (p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) {
    const [a, m, d] = p.fecha.split("-").map(Number);
    const f = new Date(a, m - 1, d);
    return `${DIAS[f.getDay()]} ${d} ${MESES[m - 1]}`;
  }
  if (p.fecha && /^\d{4}-\d{2}$/.test(p.fecha)) {
    const [a, m] = p.fecha.split("-").map(Number);
    return `${MESES_LARGOS[m - 1]} ${a}`;
  }
  return p.etiqueta;
}

/**
 * La serie del gráfico: el período y, punto por punto, el anterior. Se
 * alinean por posición (el día 1 con el día 1): "Este mes" del 1 al 12 contra
 * el 1 al 12 del mes pasado. Si el anterior es más corto, los últimos puntos
 * quedan sin comparación en vez de inventarla.
 */
export function serie(actual: PuntoTendencia[], anterior?: PuntoTendencia[] | null): PuntoLinea[] {
  return actual.map((p, i) => ({
    etiqueta: p.etiqueta,
    detalle: detalleFecha(p),
    valor: p.monto,
    anterior: anterior ? (anterior[i]?.monto ?? null) : null,
  }));
}

/** ¿La serie es por mes? El backend pasa a meses en rangos de más de 45 días. */
export function esMensual(actual: PuntoTendencia[]): boolean {
  const f = actual.find((p) => p.fecha)?.fecha;
  if (f) return /^\d{4}-\d{2}$/.test(f);
  // Un backend anterior no manda la fecha: "oct" u "oct 26" son meses, "12 oct" es un día.
  return actual.length > 0 && actual.every((p) => /^[a-zé]{3}( \d{2})?$/.test(p.etiqueta));
}

export function estadisticas(puntos: PuntoLinea[]): { total: number; promedio: number; mejor: PuntoLinea | null } {
  const total = puntos.reduce((a, p) => a + p.valor, 0);
  const mejor = puntos.reduce<PuntoLinea | null>((m, p) => (p.valor > (m?.valor ?? 0) ? p : m), null);
  return { total, promedio: puntos.length ? total / puntos.length : 0, mejor };
}

export interface Parte {
  etiqueta: string;
  valor: number;
}

/**
 * Las tres cifras de abajo de la tarjeta de ventas, según el rubro: el billar
 * separa el tiempo de mesa de los consumos, el restaurante el salón del
 * delivery, una peluquería los servicios de los productos. En el resto, cómo
 * te pagaron.
 */
export function partesVenta(
  rubro: string | undefined,
  d: { billar?: BillarReporteApi | null; composicion?: ResumenApi["composicion"]; metodos?: MetodoPagoApi[] | null },
): Parte[] {
  if (esBillar(rubro) && d.billar) {
    // Las cuentas abiertas (sin mesa ni tiempo, 21-oct) van con la venta
    // rápida: las dos son lo vendido sin mesa, y la tarjeta muestra tres cifras
    // (una cuarta no se veía). Sin cuentas, como siempre.
    const cuentas = d.billar.cuentas?.bs ?? 0;
    return [
      { etiqueta: "Tiempo de mesa", valor: d.billar.tiempoBs },
      { etiqueta: "Consumos en mesa", valor: d.billar.consumosBs },
      esPositivo(cuentas)
        ? { etiqueta: "Cuentas y venta rápida", valor: aCentavos(d.billar.rapidas.bs + cuentas) }
        : { etiqueta: "Venta rápida", valor: d.billar.rapidas.bs },
    ];
  }
  const c = d.composicion;
  if (c && esBelleza(rubro) && (esPositivo(c.servicios) || esPositivo(c.productos))) {
    return [
      { etiqueta: "Servicios", valor: c.servicios },
      { etiqueta: "Productos", valor: c.productos },
    ];
  }
  if (c && rubro === "RESTAURANTE") {
    const partes = [
      { etiqueta: "Salón", valor: c.salon },
      { etiqueta: "Delivery", valor: c.delivery },
      { etiqueta: "Para recoger", valor: c.recoger },
      { etiqueta: "Mostrador", valor: c.mostrador },
    ].filter((p) => esPositivo(p.valor));
    if (partes.length > 1) return partes.slice(0, 4);
  }
  if (d.metodos?.length) {
    return [...d.metodos]
      .filter((m) => esPositivo(m.monto))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 3)
      .map((m) => ({ etiqueta: m.nombre, valor: m.monto }));
  }
  return [];
}

// ── Para tener en cuenta ────────────────────────────────────────────────────

export interface Consejo {
  id: string;
  icono: NombreIcono;
  tono: TonoR;
  /** El texto, con las partes en negrita marcadas. */
  partes: (string | { b: string })[];
  /** El reporte que lo explica. */
  a: string;
}

const DIAS_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

function h12(h: number): number {
  return h % 12 === 0 ? 12 : h % 12;
}

function meridiano(h: number): string {
  return h < 12 ? "a. m." : "p. m.";
}

/** "de 4 a 8 p. m.", "de 11 a. m. a 2 p. m." */
export function tramoHoras(desde: number, hasta: number): string {
  const fin = hasta % 24;
  return meridiano(desde) === meridiano(fin)
    ? `de ${h12(desde)} a ${h12(fin)} ${meridiano(fin)}`
    : `de ${h12(desde)} ${meridiano(desde)} a ${h12(fin)} ${meridiano(fin)}`;
}

/** Las horas con juego en el orden de la jornada: un billar que abre a las 4 p. m. y cierra a las 2 a. m. empieza en las 16. */
export function horasDeJornada(horasConJuego: number[]): number[] {
  const hs = [...new Set(horasConJuego)].sort((a, b) => a - b);
  if (hs.length < 2) return hs;
  let corte = 0;
  let hueco = -1;
  for (let i = 0; i < hs.length; i++) {
    const distancia = (hs[(i + 1) % hs.length] - hs[i] + 24) % 24 || 24;
    if (distancia > hueco) {
      hueco = distancia;
      corte = (i + 1) % hs.length;
    }
  }
  return [...hs.slice(corte), ...hs.slice(0, corte)];
}

/**
 * El tramo más flojo de la semana: el día y las cuatro horas seguidas (dentro
 * del horario en que se juega) con menos ocupación. Un día sin ninguna celda
 * es un día cerrado y no cuenta: si no, "los lunes de 4 a 8" saldría siempre
 * en un billar que no abre los lunes.
 */
export function tramoFlojo(calor: NonNullable<BillarReporteApi["calor"]>): { dia: number; desde: number; hasta: number; ocupacion: number } | null {
  const orden = horasDeJornada(calor.map((c) => c.hora));
  if (orden.length === 0) return null;
  const largo = Math.min(4, orden.length);
  let peor: { dia: number; desde: number; hasta: number; ocupacion: number } | null = null;
  for (let dia = 0; dia < 7; dia++) {
    const delDia = calor.filter((c) => c.dia === dia);
    if (delDia.length === 0) continue;
    const valor = (h: number) => delDia.find((c) => c.hora === h)?.ocupacion ?? 0;
    for (let i = 0; i + largo <= orden.length; i++) {
      const tramo = orden.slice(i, i + largo);
      const promedio = tramo.reduce((a, h) => a + valor(h), 0) / largo;
      if (!peor || promedio < peor.ocupacion) peor = { dia, desde: tramo[0], hasta: tramo[largo - 1] + 1, ocupacion: promedio };
    }
  }
  return peor;
}

export interface EntradaConsejos {
  rubro?: string;
  ve: (id: string) => boolean;
  /** Variación de las ventas (fracción). */
  ventasDelta: number | null;
  contra: string;
  billar?: BillarReporteApi | null;
  sugerencia?: SugerenciaApi | null;
  creditos?: CreditosApi | null;
  ventasSinCosto?: number | null;
  mermas?: ReporteMermas | null;
  agenda?: ReporteAgenda | null;
  meseros?: MeserosApi | null;
}

/**
 * Hasta tres avisos que salen de los números del período, de lo más propio
 * del rubro a lo más general. Cada uno lleva al reporte que lo explica, y
 * sólo se dice si ese reporte lo puede abrir quien mira: un aviso que no se
 * puede seguir es ruido.
 */
export function consejos(e: EntradaConsejos): Consejo[] {
  const lista: Consejo[] = [];

  const calor = e.billar?.calor;
  const flojo = calor?.length ? tramoFlojo(calor) : null;
  if (flojo && flojo.ocupacion < 0.3) {
    lista.push({
      id: "tramo-flojo",
      icono: "calendar",
      tono: "ambar",
      partes: [
        `Los ${DIAS_PLURAL[flojo.dia]} ${tramoHoras(flojo.desde, flojo.hasta)} la ocupación es de solo `,
        { b: pct(flojo.ocupacion) },
        ". Buen horario para una promo, por ejemplo la primera hora más barata.",
      ],
      a: "ocupacion",
    });
  }

  const mesas = (e.billar?.porMesa ?? []).filter((m) => m.bsPorHoraAbierta != null && m.horas > 0);
  if (mesas.length >= 3) {
    const promedio = mesas.reduce((a, m) => a + (m.bsPorHoraAbierta ?? 0), 0) / mesas.length;
    const peor = mesas.reduce((a, m) => ((m.bsPorHoraAbierta ?? 0) < (a.bsPorHoraAbierta ?? 0) ? m : a));
    const menos = promedio > 0 ? 1 - (peor.bsPorHoraAbierta ?? 0) / promedio : 0;
    if (menos >= 0.3) {
      lista.push({
        id: "mesa-floja",
        icono: "bola",
        tono: "gris",
        partes: [
          { b: `Mesa ${peor.mesaId}` },
          ` deja ${bsEntero(peor.bsPorHoraAbierta ?? 0)} por hora abierta, ${pct(menos)} menos que el promedio. Revisá su estado, ubicación o tarifa.`,
        ],
        a: "mesas",
      });
    }
  }

  const agotado = (e.sugerencia?.items ?? []).filter((i) => i.motivo === "AGOTADO" && i.vendidas > 0).sort((a, b) => b.vendidas - a.vendidas)[0];
  if (agotado) {
    lista.push({
      id: "agotado",
      icono: "cart",
      tono: "rosa",
      partes: [
        { b: agotado.nombre },
        ` está agotado y se vendieron ${fmtCantidad(agotado.vendidas)} en los últimos ${e.sugerencia?.dias ?? 30} días. Conviene reponer.`,
      ],
      a: "stock-critico",
    });
  }

  const deuda = e.creditos?.resumen;
  if (deuda && esPositivo(deuda.totalVencido)) {
    lista.push({
      id: "fiado-vencido",
      icono: "clock",
      tono: "ambar",
      partes: [
        "Hay ",
        { b: bsEntero(deuda.totalVencido) },
        ` de fiado vencido${esPositivo(deuda.totalPorCobrar) ? ` (${pct(deuda.totalVencido / deuda.totalPorCobrar)} de lo que te deben)` : ""}. Conviene cobrarlo.`,
      ],
      a: "creditos",
    });
  }

  if (esFarmacia(e.rubro) && e.mermas && esPositivo(e.mermas.resumen.enRiesgo)) {
    lista.push({
      id: "por-vencer",
      icono: "alert",
      tono: "rosa",
      partes: ["Hay ", { b: bsEntero(e.mermas.resumen.enRiesgo) }, " en medicamentos vencidos o que vencen en los próximos 90 días."],
      a: "mermas",
    });
  }

  const a = e.agenda?.asistencia;
  if (a && a.tasaNoShow != null && a.tasaNoShow >= 10) {
    lista.push({
      id: "no-shows",
      icono: "userX",
      tono: "ambar",
      partes: [{ b: `${fmtNum(a.tasaNoShow, 0)} %` }, ` de las citas no vinieron (${a.noShows} de ${a.total}). Un recordatorio el día antes ayuda.`],
      a: "asistencia",
    });
  }

  const anulados = e.meseros?.totales;
  if (anulados && anulados.itemsAnulados > 0 && esPositivo(anulados.montoAnulado)) {
    lista.push({
      id: "comandas-anuladas",
      icono: "x",
      tono: "rosa",
      partes: [
        "Se anularon ",
        { b: `${fmtNum(anulados.itemsAnulados)} ${anulados.itemsAnulados === 1 ? "ítem" : "ítems"}` },
        " de comandas por ",
        { b: bsEntero(anulados.montoAnulado) },
        ".",
      ],
      a: "meseros",
    });
  }

  if (e.ventasSinCosto != null && esPositivo(e.ventasSinCosto)) {
    lista.push({
      id: "sin-costo",
      icono: "info",
      tono: "azul",
      partes: [{ b: bsEntero(e.ventasSinCosto) }, " de lo vendido salió de productos sin costo cargado: la ganancia se ve más alta de lo que es."],
      a: "resultado",
    });
  }

  if (e.ventasDelta != null && Math.abs(e.ventasDelta) >= 0.1) {
    const baja = e.ventasDelta < 0;
    lista.push({
      id: "ventas",
      icono: baja ? "trendingDown" : "trendingUp",
      tono: baja ? "rosa" : "verde",
      partes: ["Vendiste ", { b: `${Math.round(Math.abs(e.ventasDelta) * 100)} % ${baja ? "menos" : "más"}` }, ` que ${e.contra}.`],
      a: "ventas",
    });
  }

  return lista.filter((c) => e.ve(c.a)).slice(0, 3);
}

// ── Enviar resumen ──────────────────────────────────────────────────────────

export interface EntradaTexto {
  negocio: string;
  sucursal: string;
  /** "de la semana", "de septiembre". */
  cual: string;
  rango: string;
  rubro?: string;
  ventas: number;
  ventasDelta: number | null;
  contra: string;
  partes: Parte[];
  ganancia?: number | null;
  billar?: BillarReporteApi | null;
  meseros?: MeserosApi | null;
  agenda?: ReporteAgenda | null;
  mermas?: ReporteMermas | null;
  metodos?: MetodoPagoApi[] | null;
  /** Lo fiado que sigue abierto (reporte de créditos). */
  porCobrar?: number | null;
  /** Los pedidos sin cobrar del período (ver `pedidosPorCobrar`). */
  pedidosPorCobrar?: ResumenApi["porCobrar"] | null;
}

/**
 * El resumen para el celular del dueño, en texto plano: WhatsApp no dibuja
 * tablas, y lo que entra en una pantalla de chat son diez renglones.
 */
export function textoResumen(e: EntradaTexto): string {
  const flecha = e.ventasDelta == null ? "" : ` (${e.ventasDelta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(e.ventasDelta * 100))} % vs. ${e.contra})`;
  const bloques: string[][] = [
    [`${e.negocio}${e.sucursal ? ` · ${e.sucursal}` : ""}`, `Resumen ${e.cual} (${e.rango})`],
    [
      `Ventas: ${bsEntero(e.ventas)}${flecha}`,
      ...e.partes.filter((p) => esPositivo(p.valor)).map((p) => `• ${p.etiqueta}: ${bsEntero(p.valor)}`),
      ...(e.ganancia != null ? [e.ganancia < 0 ? `Pérdida: ${bsEntero(-e.ganancia)}` : `Ganancia real: ${bsEntero(e.ganancia)}`] : []),
    ],
  ];

  const rubro: string[] = [];
  if (e.billar && e.billar.horas > 0) {
    rubro.push(`Horas jugadas: ${horas(e.billar.horas)} · Ocupación ${pct(e.billar.ocupacion)}`);
    const masUsada = [...e.billar.porMesa].sort((a, b) => b.horas - a.horas)[0];
    if (masUsada) rubro.push(`Mesa más usada: Mesa ${masUsada.mesaId}`);
  }
  if (e.meseros && e.meseros.totales.mesas > 0) {
    rubro.push(`Mesas atendidas: ${fmtNum(e.meseros.totales.mesas)}${esPositivo(e.meseros.totales.propinas) ? ` · Propinas ${bsEntero(e.meseros.totales.propinas)}` : ""}`);
  }
  if (e.agenda && e.agenda.asistencia.total > 0) {
    const ns = e.agenda.asistencia.tasaNoShow;
    rubro.push(`Citas atendidas: ${e.agenda.asistencia.completadas}${ns != null ? ` · No vinieron ${fmtNum(ns, 0)} %` : ""}`);
  }
  if (e.mermas && esPositivo(e.mermas.resumen.enRiesgo)) rubro.push(`Vencido o por vencer (90 días): ${bsEntero(e.mermas.resumen.enRiesgo)}`);
  bloques.push(rubro);

  const caja: string[] = [];
  const metodos = [...(e.metodos ?? [])].filter((m) => esPositivo(m.monto)).sort((a, b) => b.monto - a.monto).slice(0, 3);
  if (metodos.length) caja.push(metodos.map((m) => `${m.nombre} ${bsEntero(m.monto)}`).join(" · "));
  if (e.porCobrar != null && esPositivo(e.porCobrar)) caja.push(`Fiado por cobrar: ${bsEntero(e.porCobrar)}`);
  const pedidos = e.pedidosPorCobrar ? pedidosPorCobrar({ porCobrar: e.pedidosPorCobrar }) : null;
  if (pedidos) caja.push(`${textoPedidos(pedidos.cantidad)} por cobrar: ${bsEntero(pedidos.total)} (${pedidos.cantidad === 1 ? "no suma" : "no suman"} en Ventas)`);
  bloques.push(caja);

  return bloques
    .filter((b) => b.length)
    .map((b) => b.join("\n"))
    .join("\n\n");
}

/**
 * Los pedidos del período que todavía no se cobraron, o null si no hay. No
 * suman en las ventas (entran el día que se cobran), pero son plata que el
 * dueño espera: sin mostrarlos, un período con muchos delivery pendientes se
 * leía como un mal período.
 */
export function pedidosPorCobrar(r: Pick<ResumenApi, "porCobrar">): { cantidad: number; total: number } | null {
  const p = r.porCobrar;
  return p && p.cantidad > 0 ? p : null;
}

/** "1 pedido", "3 pedidos". */
export function textoPedidos(cantidad: number): string {
  return `${fmtNum(cantidad)} ${cantidad === 1 ? "pedido" : "pedidos"}`;
}

/** Las filas de la hoja "Resumen" del Excel: lo mismo que se ve, en números. */
export function filasResumen(
  r: ResumenApi,
  er: {
    gastosOperativos: number;
    gastosFinancieros: number;
    impuestos: number;
    utilidadNeta: number;
    /** Billar: lo que se pagó de la caja. */
    cenasPersonal?: number;
    gastosCaja?: number;
  } | null,
): [string, number | null][] {
  const pc = pedidosPorCobrar(r);
  return [
    ["Ventas (Bs)", r.ventas],
    ["Ventas del período anterior (Bs)", r.ventasPeriodoAnterior],
    ["Variación de las ventas (%)", r.ventasDeltaPct],
    ["Tickets", r.tickets.valor],
    ["Ticket promedio (Bs)", r.ticketPromedio.valor],
    ["Unidades", r.unidades.valor],
    // Al lado de las ventas y dicho en la etiqueta: en el Excel no hay
    // tarjeta que aclare, y sumarlo a mano daría un total que la caja no vio.
    ...(pc
      ? ([
          ["Pedidos por cobrar (no suman en Ventas)", pc.cantidad],
          ["Monto por cobrar de esos pedidos (Bs)", pc.total],
        ] as [string, number][])
      : []),
    ["Ingresos brutos (Bs)", r.finanzas.ingresosBrutos],
    ["Descuentos y promos (Bs)", r.finanzas.descuentos],
    ["Costo de venta (Bs)", r.finanzas.costoVenta],
    ["Utilidad bruta (Bs)", r.finanzas.utilidadBruta],
    ...(er
      ? ([
          ["Gastos operativos (Bs)", er.gastosOperativos],
          // Billar: lo que se pagó de la caja, sólo si hubo, como en la tarjeta.
          // La ganancia real de abajo ya lo resta.
          ...(esPositivo(er.cenasPersonal ?? 0) ? ([["Cenas del personal (Bs)", er.cenasPersonal ?? 0]] as [string, number][]) : []),
          ...(esPositivo(er.gastosCaja ?? 0) ? ([["Gastos pagados de la caja (Bs)", er.gastosCaja ?? 0]] as [string, number][]) : []),
          ["Banco e impuestos (Bs)", er.gastosFinancieros + er.impuestos],
          ["Ganancia real (Bs)", er.utilidadNeta],
        ] as [string, number][])
      : []),
  ];
}

/** Sólo los dígitos, con el 591 adelante si es un celular de Bolivia escrito sin código (8 dígitos que empiezan en 6 o 7). */
export function numeroWhatsapp(texto: string): string {
  const digitos = texto.replace(/\D/g, "");
  return /^[67]\d{7}$/.test(digitos) ? `591${digitos}` : digitos;
}
