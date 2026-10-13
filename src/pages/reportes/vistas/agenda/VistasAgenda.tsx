import { useState } from "react";
import { apiComisiones } from "../../../../lib/agenda/apiComisiones";
import type { ReporteAgenda } from "../../../../lib/agenda/tiposComisiones";
import { esPositivo } from "../../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../../lib/format";
import { useApi } from "../../../../lib/useApi";
import { PuntoColor } from "../../../agenda/config/comun";
import { fraccion } from "../../api";
import { hoja, useExportar, useReporte } from "../../contexto";
import { bsEntero, horas, pct } from "../../formato";
import { BarraPartida, Cargador, FilaLista, KpiR, Nota, Puesto, Segmentos, Tarjeta } from "../../ui";
import {
  filasOcupacion,
  filasOrigen,
  parteReservada,
  serviciosDestacados,
  totalesProduccion,
  tramosAsistencia,
  type ClaveTramo,
  type FilaOcupacion,
  type FilaOrigen,
  type TramoAsistencia,
} from "./datosAgenda";

/**
 * Los reportes de la agenda (peluquería, barbería, spa, uñas) dentro de
 * Reportes: producción por profesional, servicios, asistencia, ocupación y
 * retención. Antes eran una sola pantalla con su propio período; ahora cada
 * uno es un reporte del grupo y todos miran el período y la sucursal de
 * arriba.
 *
 * La plata es lo cobrado (neto de anulaciones) por fecha de cobro; lo de la
 * agenda (citas, ocupación) va por la fecha de la cita.
 */

type FilaProduccion = ReporteAgenda["produccion"][number];
type FilaServicio = ReporteAgenda["serviciosTop"][number];

/**
 * El reporte de la agenda del período de arriba. El backend arma las seis
 * partes en una sola respuesta, así que los cinco reportes piden lo mismo y
 * cada uno toma la suya. Las fechas viajan como días (`AAAA-MM-DD`, los dos
 * extremos incluidos), que es como las lee `/agenda/reportes`.
 */
function useReporteAgenda(diasRetencion = 90) {
  const { periodo, rango } = useReporte();
  return useApi(
    () => apiComisiones.reporteAgenda({ desde: periodo.desde, hasta: periodo.hasta, sucursalId: rango.sucursalId, diasRetencion }),
    [periodo.desde, periodo.hasta, rango.sucursalId, diasRetencion],
  );
}

/** "3,8 h" desde minutos: la ocupación de la agenda se mide en minutos de horario. */
const enHoras = (min: number) => horas(min / 60);

const TH = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
const TD = "px-3 py-3 tabular-nums";

// ── Producción por profesional ──────────────────────────────────────────────

export function Profesionales() {
  const estado = useReporteAgenda();
  const filas = estado.datos?.produccion ?? [];

  useExportar(
    "produccion-por-profesional",
    filas.length
      ? () => [
          hoja<FilaProduccion>(
            "Producción",
            [
              ["Profesional", (p) => p.nombre],
              ["Producción (Bs)", (p) => p.produccion],
              ["En servicios (Bs)", (p) => p.produccionServicios],
              ["En productos (Bs)", (p) => p.produccionProductos],
              ["Servicios hechos", (p) => p.servicios],
              ["Clientes", (p) => p.clientes],
              ["Ticket medio (Bs)", (p) => p.ticketMedio],
            ],
            filas,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.produccion.length === 0
          ? { titulo: "Sin cobros con profesional en este período", texto: "Lo cobrado con un profesional asignado aparece acá.", icono: "users" }
          : null
      }
    >
      {(d) => <ProduccionVista r={d} />}
    </Cargador>
  );
}

function ProduccionVista({ r }: { r: ReporteAgenda }) {
  const t = totalesProduccion(r.produccion);
  const max = Math.max(0, ...r.produccion.map((p) => p.produccion));
  const tm = r.ticketMedio;
  const n = r.produccion.length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiR
          etiqueta="Producción"
          valor={bsEntero(t.produccion)}
          tono="marca"
          pie={`Servicios ${bsEntero(t.servicios)} · productos ${bsEntero(t.productos)}`}
        />
        {/* Sin una cita cobrada no hay ticket que promediar: "—", no "Bs 0". */}
        <KpiR
          etiqueta="Ticket medio"
          valor={tm.ticketMedio == null ? "—" : fmtMoney(tm.ticketMedio)}
          pie={`${fmtNum(tm.ventas)} ${tm.ventas === 1 ? "cita cobrada" : "citas cobradas"}`}
        />
        <KpiR etiqueta="Servicios hechos" valor={fmtNum(t.cantidadServicios)} pie={`Entre ${fmtNum(n)} ${n === 1 ? "profesional" : "profesionales"}`} />
      </div>

      <Tarjeta titulo="Por profesional" subtitulo="Lo cobrado por cada uno, del que más produjo al que menos" cuerpo="">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>Profesional</th>
                <th className={`${TH} text-right`}>Producción</th>
                <th className={`${TH} text-right`}>Servicios</th>
                <th className={`${TH} text-right`}>En productos</th>
                <th className={`${TH} text-right`}>Clientes</th>
                <th className={`${TH} text-right`}>Ticket medio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde-soft">
              {r.produccion.map((p) => (
                <tr key={p.recursoId}>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2 font-bold text-texto">
                      <PuntoColor color={p.color} />
                      <span className="truncate">{p.nombre}</span>
                    </span>
                    <Proporcion fraccion={max > 0 ? p.produccion / max : 0} />
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right font-extrabold text-texto`}>{fmtMoney(p.produccion)}</td>
                  <td className={`${TD} text-right text-texto-2`}>{fmtNum(p.servicios)}</td>
                  <td className={`${TD} whitespace-nowrap text-right ${esPositivo(p.produccionProductos) ? "text-texto-2" : "text-texto-4"}`}>
                    {fmtMoney(p.produccionProductos)}
                  </td>
                  <td className={`${TD} text-right text-texto-2`}>{fmtNum(p.clientes)}</td>
                  <td className={`${TD} whitespace-nowrap text-right text-texto-2`}>{p.ticketMedio == null ? "—" : fmtMoney(p.ticketMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-borde-soft md:hidden">
          {r.produccion.map((p) => (
            <li key={p.recursoId} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="flex items-center gap-2 text-[14px] font-bold text-texto">
                    <PuntoColor color={p.color} />
                    <span className="truncate">{p.nombre}</span>
                  </span>
                  <p className="mt-0.5 text-[12px] text-texto-3">
                    {fmtNum(p.servicios)} {p.servicios === 1 ? "servicio" : "servicios"} · {fmtNum(p.clientes)} {p.clientes === 1 ? "cliente" : "clientes"}
                    {esPositivo(p.produccionProductos) && ` · productos ${bsEntero(p.produccionProductos)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-extrabold tabular-nums text-texto">{fmtMoney(p.produccion)}</p>
                  <p className="text-[11.5px] text-texto-3">ticket {p.ticketMedio == null ? "—" : fmtMoney(p.ticketMedio)}</p>
                </div>
              </div>
              <Proporcion fraccion={max > 0 ? p.produccion / max : 0} />
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Nota>
        La producción es lo cobrado con el profesional asignado (neto de descuentos y anulaciones), por fecha de cobro.
        “Clientes” son las ventas que atendió: una venta atendida por dos profesionales cuenta para ambos, por eso no se
        suman.
      </Nota>
    </>
  );
}

/** La barra fina de "cuánto contra el primero". Un solo color: dice cuánto, no quién. */
function Proporcion({ fraccion: f }: { fraccion: number }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, Math.min(1, f) * 100)}%` }} />
    </div>
  );
}

// ── Servicios más pedidos ───────────────────────────────────────────────────

export function Servicios() {
  const estado = useReporteAgenda();
  const filas = estado.datos?.serviciosTop ?? [];

  useExportar(
    "servicios-mas-pedidos",
    filas.length
      ? () => [
          hoja<FilaServicio>(
            "Servicios",
            [
              ["Servicio", (s) => s.servicio],
              ["Citas", (s) => s.pedidos],
              ["Cobrados", (s) => s.cobrados],
              ["Ingresos (Bs)", (s) => s.ingresos],
            ],
            filas,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.serviciosTop.length === 0 ? { titulo: "Sin citas en este período", texto: "Probá con otro período.", icono: "tag" } : null
      }
    >
      {(d) => <ServiciosVista r={d} />}
    </Cargador>
  );
}

function ServiciosVista({ r }: { r: ReporteAgenda }) {
  const { masPedido, masDeja } = serviciosDestacados(r.serviciosTop);
  const max = Math.max(0, ...r.serviciosTop.map((s) => s.pedidos));
  return (
    <>
      {(masPedido || masDeja) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {masPedido && (
            <KpiR
              icono="tag"
              etiqueta="El más pedido"
              valor={masPedido.servicio}
              pie={`${fmtNum(masPedido.pedidos)} ${masPedido.pedidos === 1 ? "cita" : "citas"}`}
            />
          )}
          {masDeja && <KpiR icono="dollar" etiqueta="El que más deja" valor={masDeja.servicio} pie={`${fmtMoney(masDeja.ingresos)} cobrados`} />}
        </div>
      )}

      <Tarjeta titulo="Los más pedidos" subtitulo="Por cantidad de citas, con lo que se cobró de cada uno" cuerpo="">
        <ul className="divide-y divide-borde-soft">
          {r.serviciosTop.map((s, i) => (
            <li key={s.servicioId}>
              <FilaLista
                inicio={<Puesto n={i + 1} destacado={i === 0} />}
                titulo={s.servicio}
                linea={`${fmtNum(s.pedidos)} ${s.pedidos === 1 ? "cita" : "citas"} · ${fmtNum(s.cobrados)} ${s.cobrados === 1 ? "cobrado" : "cobrados"}`}
                valor={fmtMoney(s.ingresos)}
                tonoValor={esPositivo(s.ingresos) ? "normal" : "apagado"}
                barra={{ fraccion: max > 0 ? s.pedidos / max : 0, tono: "morado" }}
              />
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Nota>
        Las citas cuentan por su fecha (sin las canceladas) y lo cobrado por la fecha de cobro: un servicio del último día
        puede cobrarse al siguiente. Son los 15 más pedidos.
      </Nota>
    </>
  );
}

// ── Asistencia ──────────────────────────────────────────────────────────────

/** El color de cada final: rojo lo que se perdió (no vino), azul lo que sigue abierto. */
const COLOR_TRAMO: Record<ClaveTramo, string> = {
  atendidas: "bg-primary",
  noShows: "bg-rose-500",
  canceladas: "bg-slate-400",
  abandonadas: "bg-violet-500",
  pendientes: "bg-blue-500",
};

const ICONO_ORIGEN: Record<string, "calendar" | "pantalla" | "users"> = { INTERNA: "calendar", ONLINE: "pantalla", WALKIN: "users" };

export function Asistencia() {
  const estado = useReporteAgenda();
  const a = estado.datos?.asistencia ?? null;

  useExportar(
    "asistencia-agenda",
    a && a.total > 0
      ? () => [
          hoja<TramoAsistencia>(
            "Cómo terminaron",
            [
              ["Citas", (t) => t.nombre],
              ["Cantidad", (t) => t.cantidad],
              ["% de las citas", (t) => Math.round(t.fraccion * 1000) / 10],
            ],
            tramosAsistencia(a),
          ),
          hoja<FilaOrigen>(
            "Por origen",
            [
              ["Origen", (o) => o.nombre],
              ["Citas", (o) => o.total],
              ["No vinieron", (o) => o.noShows],
              ["No-shows (%)", (o) => (o.tasa == null ? null : Math.round(o.tasa * 1000) / 10)],
            ],
            filasOrigen(a),
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.asistencia.total === 0 ? { titulo: "Sin citas en este período", texto: "Probá con otro período.", icono: "userX" } : null
      }
    >
      {(d) => <AsistenciaVista a={d.asistencia} />}
    </Cargador>
  );
}

function AsistenciaVista({ a }: { a: ReporteAgenda["asistencia"] }) {
  const tramos = tramosAsistencia(a);
  const origenes = filasOrigen(a);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiR icono="userX" etiqueta="No-shows" valor={pct(fraccion(a.tasaNoShow))} pie={`${fmtNum(a.noShows)} de ${fmtNum(a.total)} citas`} />
        <KpiR icono="x" etiqueta="Cancelaciones" valor={pct(fraccion(a.tasaCancelacion))} pie={`${fmtNum(a.canceladas)} de ${fmtNum(a.total)} citas`} />
        <KpiR icono="calendar" etiqueta="Citas" valor={fmtNum(a.total)} pie="En el período" />
        <KpiR icono="checkCirculo" etiqueta="Atendidas" valor={fmtNum(a.completadas)} pie={`${pct(a.total > 0 ? a.completadas / a.total : null)} de las citas`} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Cómo terminaron" subtitulo={`Las ${fmtNum(a.total)} citas del período`}>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {tramos.map((t) => (
              <span key={t.clave} className={`h-full ${COLOR_TRAMO[t.clave]}`} style={{ width: `${t.fraccion * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {tramos.map((t) => (
              <li key={t.clave} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-texto-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COLOR_TRAMO[t.clave]}`} />
                  <span className="truncate">{t.nombre}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <b className="text-texto">{fmtNum(t.cantidad)}</b>
                  <span className="text-texto-3"> · {pct(t.fraccion)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>

        {origenes.length > 0 && (
          <Tarjeta titulo="Por origen" subtitulo="Cómo llegó cada cita y cuántas no vinieron" cuerpo="">
            <ul className="divide-y divide-borde-soft">
              {origenes.map((o) => (
                <li key={o.origen}>
                  <FilaLista
                    icono={ICONO_ORIGEN[o.origen] ?? "calendar"}
                    tono={o.noShows > 0 ? "rosa" : "gris"}
                    titulo={o.nombre}
                    linea={`${fmtNum(o.total)} ${o.total === 1 ? "cita" : "citas"} · ${fmtNum(o.noShows)} no ${o.noShows === 1 ? "vino" : "vinieron"}`}
                    valor={pct(o.tasa)}
                    valorPie="no-shows"
                    tonoValor={o.noShows > 0 ? "rojo" : "apagado"}
                  />
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </div>

      <Nota>
        Un no-show es una cita a la que el cliente no vino. Las tasas son sobre todas las citas del período, sin las
        solicitudes rechazadas ni las vencidas.
      </Nota>
    </>
  );
}

// ── Ocupación de la agenda ──────────────────────────────────────────────────

export function OcupacionAgenda() {
  const estado = useReporteAgenda();
  const o = estado.datos?.ocupacion ?? null;

  useExportar(
    "ocupacion-agenda",
    o && o.recursos.length
      ? () => [
          hoja<FilaOcupacion>(
            "Ocupación",
            [
              ["Profesional", (p) => p.nombre],
              ["Ocupación (%)", (p) => p.pct],
              ["Horas reservadas", (p) => Math.round(p.minutosReservados / 6) / 10],
              ["Horas de horario", (p) => Math.round(p.minutosDisponibles / 6) / 10],
            ],
            filasOcupacion(o),
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.ocupacion.recursos.length === 0
          ? { titulo: "Sin profesionales activos", texto: "La ocupación se mide sobre el horario de cada profesional.", icono: "calendar" }
          : d.ocupacion.minutosDisponibles === 0
            ? {
                titulo: "Sin horario cargado en este período",
                texto: "La ocupación se mide contra el horario de cada profesional: cargalo en la configuración de la agenda.",
                icono: "calendar",
              }
            : null
      }
    >
      {(d) => <OcupacionVista o={d.ocupacion} />}
    </Cargador>
  );
}

function OcupacionVista({ o }: { o: ReporteAgenda["ocupacion"] }) {
  const libres = Math.max(0, o.minutosDisponibles - o.minutosReservados);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiR icono="clock" etiqueta="Ocupación" valor={pct(fraccion(o.pct))} pie={`${enHoras(o.minutosReservados)} de ${enHoras(o.minutosDisponibles)}`} />
        <KpiR icono="calendar" etiqueta="Horas reservadas" valor={enHoras(o.minutosReservados)} pie="Con los no-shows: ese tiempo estaba tomado" />
        <KpiR icono="relojArena" etiqueta="Horas libres" valor={enHoras(libres)} pie="Horario sin reservas: lo que queda por vender" />
      </div>

      <Tarjeta titulo="Por profesional" subtitulo="Horas reservadas sobre horas de horario, sin lo bloqueado">
        <ul className="space-y-3">
          {filasOcupacion(o).map((p) => {
            const parte = parteReservada(p.minutosReservados, p.minutosDisponibles);
            return (
              <li key={p.recursoId}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2 font-semibold text-texto">
                    <PuntoColor color={p.color} />
                    <span className="truncate">{p.nombre}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-texto-3">
                    <b className="text-texto">{pct(fraccion(p.pct))}</b>
                    {p.minutosDisponibles > 0
                      ? ` · ${enHoras(p.minutosReservados)} de ${enHoras(p.minutosDisponibles)}`
                      : " · sin horario cargado"}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  {parte != null && <div className="h-full rounded-full bg-primary" style={{ width: `${parte * 100}%` }} />}
                </div>
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <Nota>
        La ocupación son las horas reservadas sobre las horas de horario de cada profesional, sin lo bloqueado. Un no-show
        cuenta: ese tiempo estaba tomado y no se le pudo dar a otro cliente.
      </Nota>
    </>
  );
}

// ── Retención ───────────────────────────────────────────────────────────────

const VENTANAS = [
  ["30", "30 días"],
  ["60", "60 días"],
  ["90", "90 días"],
] as const;

type Ventana = (typeof VENTANAS)[number][0];

export function Retencion() {
  // La ventana es de este reporte y no del período: "volvió dentro de 90 días"
  // se cuenta desde la primera visita del período, aunque caiga fuera de él.
  const [ventana, setVentana] = useState<Ventana>("90");
  const estado = useReporteAgenda(Number(ventana));
  const ret = estado.datos?.retencion ?? null;

  useExportar(
    "retencion-clientes",
    ret && ret.clientes > 0
      ? () => [
          hoja<[string, number | null]>(
            "Retención",
            [
              ["Concepto", (x) => x[0]],
              ["Valor", (x) => x[1]],
            ],
            [
              ["Días para volver", ret.dias],
              ["Clientes atendidos", ret.clientes],
              ["Volvieron", ret.volvieron],
              ["Volvieron (%)", ret.pct],
              ["Nuevos", ret.nuevos],
              ["Recurrentes", ret.recurrentes],
              ["Todavía pueden volver", ret.ventanaAbierta],
            ],
          ),
        ]
      : null,
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-60 text-[13px] text-texto-3">
          De los clientes atendidos en el período, cuántos volvieron dentro de los días elegidos.
        </p>
        <Segmentos valor={ventana} opciones={VENTANAS} onChange={setVentana} />
      </div>
      <Cargador
        estado={estado}
        vacio={(d) =>
          d.retencion.clientes === 0
            ? { titulo: "Sin clientes atendidos en este período", texto: "La retención se mide sobre las citas atendidas con un cliente cargado.", icono: "userHeart" }
            : null
        }
      >
        {(d) => <RetencionVista ret={d.retencion} />}
      </Cargador>
    </>
  );
}

function RetencionVista({ ret }: { ret: ReporteAgenda["retencion"] }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiR icono="userHeart" etiqueta="Volvieron" valor={pct(fraccion(ret.pct))} pie={`${fmtNum(ret.volvieron)} de ${fmtNum(ret.clientes)} clientes`} />
        <KpiR icono="users" etiqueta="Clientes atendidos" valor={fmtNum(ret.clientes)} pie="En el período" />
        <KpiR icono="user" etiqueta="Nuevos" valor={fmtNum(ret.nuevos)} pie="Primera visita al negocio" />
        <KpiR icono="users" etiqueta="Recurrentes" valor={fmtNum(ret.recurrentes)} pie="Ya habían venido antes" />
      </div>

      <Tarjeta
        titulo={`De los ${fmtNum(ret.clientes)} ${ret.clientes === 1 ? "cliente atendido" : "clientes atendidos"}`}
        subtitulo={`Si volvieron dentro de los ${ret.dias} días de su primera visita del período`}
      >
        <BarraPartida a={ret.volvieron} b={ret.clientes - ret.volvieron} etiquetaA="Volvieron" etiquetaB="No volvieron (todavía)" tonoB="rosa" />
        <div className="mt-5">
          <BarraPartida a={ret.recurrentes} b={ret.nuevos} etiquetaA="Recurrentes" etiquetaB="Nuevos" tonoB="morado" />
        </div>
      </Tarjeta>

      {ret.ventanaAbierta > 0 && (
        <Nota>
          {fmtNum(ret.ventanaAbierta)} {ret.ventanaAbierta === 1 ? "cliente todavía puede" : "clientes todavía pueden"} volver: su
          ventana de {ret.dias} días no terminó, así que el porcentaje puede subir.
        </Nota>
      )}
    </>
  );
}
