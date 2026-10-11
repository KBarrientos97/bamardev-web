import { useState } from "react";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Campo, Cargando, ErrorMsg, Input, Kpi, Select } from "../../components/ui";
import { apiComisiones } from "../../lib/agenda/apiComisiones";
import { fechaNegocio, sumarDias } from "../../lib/agenda/horaAgenda";
import type { ReporteAgenda } from "../../lib/agenda/tiposComisiones";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { PuntoColor } from "./config/comun";

type Rango = "7" | "30" | "mes" | "otro";

const RANGOS: [Rango, string][] = [
  ["7", "7 días"],
  ["30", "30 días"],
  ["mes", "Este mes"],
  ["otro", "Elegir"],
];

const ORIGEN: Record<string, string> = { INTERNA: "Agendadas", ONLINE: "Reserva online", WALKIN: "Sin turno" };

/** Un porcentaje del backend (ya en 0-100, o null si no se puede calcular). */
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-BO")}%`);
// Con coma decimal, como el resto de la pantalla ("3,8 h", no "3.8 h": QA DIA-21).
const UNA_CIFRA = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 1 });
const horas = (min: number) => `${UNA_CIFRA.format(Math.round(min / 6) / 10)} h`;

/**
 * Reportes de agenda (PLAN-AGENDA-BELLEZA §12, fase 4): producción por
 * profesional, servicios más pedidos, no-shows y cancelaciones, ticket medio,
 * ocupación y retención. Del dueño y el encargado (`agenda.reportes`).
 *
 * La plata es lo cobrado (neto de anulaciones) por fecha de cobro; lo de la
 * agenda va por la fecha de la cita.
 */
export default function ReportesAgenda() {
  const hoy = fechaNegocio();
  const [rango, setRango] = useState<Rango>("30");
  const [desdeOtro, setDesdeOtro] = useState(sumarDias(hoy, -29));
  const [hastaOtro, setHastaOtro] = useState(hoy);
  const [dias, setDias] = useState(90);

  const { desde, hasta } =
    rango === "7"
      ? { desde: sumarDias(hoy, -6), hasta: hoy }
      : rango === "30"
        ? { desde: sumarDias(hoy, -29), hasta: hoy }
        : rango === "mes"
          ? { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
          : { desde: desdeOtro, hasta: hastaOtro };

  const reporte = useApi(
    () => apiComisiones.reporteAgenda({ desde, hasta, diasRetencion: dias }),
    [desde, hasta, dias],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina titulo="Reportes de agenda" subtitulo="Producción, asistencia, ocupación y retención." />
      <div className="flex flex-wrap items-end gap-3">
        <Chips valor={rango} opciones={RANGOS} onChange={setRango} />
        {rango === "otro" && (
          <div className="flex gap-2">
            <Campo label="Desde">
              <Input type="date" value={desdeOtro} max={hastaOtro} onChange={(e) => e.target.value && setDesdeOtro(e.target.value)} />
            </Campo>
            <Campo label="Hasta">
              <Input type="date" value={hastaOtro} min={desdeOtro} onChange={(e) => e.target.value && setHastaOtro(e.target.value)} />
            </Campo>
          </div>
        )}
      </div>

      {reporte.error ? (
        <ErrorMsg onReintentar={reporte.recargar}>{reporte.error}</ErrorMsg>
      ) : !reporte.datos ? (
        <Cargando />
      ) : (
        <Contenido r={reporte.datos} dias={dias} onDias={setDias} />
      )}
    </div>
  );
}

function Contenido({ r, dias, onDias }: { r: ReporteAgenda; dias: number; onDias: (d: number) => void }) {
  const a = r.asistencia;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Ticket medio"
          valor={r.ticketMedio.ticketMedio == null ? "—" : fmtMoney(r.ticketMedio.ticketMedio)}
          pie={`${r.ticketMedio.ventas} citas cobradas`}
          icono="dollar"
        />
        <Kpi etiqueta="Ocupación" valor={pct(r.ocupacion.pct)} pie={`${horas(r.ocupacion.minutosReservados)} de ${horas(r.ocupacion.minutosDisponibles)}`} icono="clock" />
        <Kpi
          etiqueta="No-shows"
          valor={pct(a.tasaNoShow)}
          pie={`${a.noShows} de ${a.total} citas`}
          icono="alert"
          tono="amarillo"
        />
        <Kpi
          etiqueta={`Volvieron (${r.retencion.dias} días)`}
          valor={pct(r.retencion.pct)}
          pie={`${r.retencion.volvieron} de ${r.retencion.clientes} clientes`}
          icono="users"
          tono="azul"
        />
      </div>

      <section className="card overflow-hidden" aria-label="Producción por profesional">
        <h2 className="border-b border-borde-soft px-4 py-3 text-[15px] font-bold text-texto">Producción por profesional</h2>
        {r.produccion.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-texto-3">Sin cobros con profesional en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted text-left text-[12px] uppercase tracking-wide text-texto-4">
                <tr>
                  <th className="px-4 py-2">Profesional</th>
                  <th className="px-3 py-2 text-right">Producción</th>
                  <th className="px-3 py-2 text-right">Servicios</th>
                  <th className="px-3 py-2 text-right">Productos</th>
                  <th className="px-3 py-2 text-right">Clientes</th>
                  <th className="px-3 py-2 text-right">Ticket medio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-soft">
                {r.produccion.map((p) => (
                  <tr key={p.recursoId}>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 font-semibold text-texto">
                        <PuntoColor color={p.color} />
                        {p.nombre}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtMoney(p.produccion)}</td>
                    <td className="px-3 py-2 text-right">{p.servicios}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.produccionProductos)}</td>
                    <td className="px-3 py-2 text-right">{p.clientes}</td>
                    <td className="px-3 py-2 text-right">{p.ticketMedio == null ? "—" : fmtMoney(p.ticketMedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-label="Servicios más pedidos">
          <h2 className="mb-2 text-[15px] font-bold text-texto">Servicios más pedidos</h2>
          {r.serviciosTop.length === 0 ? (
            <p className="py-4 text-center text-sm text-texto-3">Sin citas en el período.</p>
          ) : (
            <ol className="space-y-2">
              {r.serviciosTop.map((s) => (
                <li key={s.servicioId}>
                  <div className="flex justify-between gap-2 text-[13px]">
                    <span className="font-semibold text-texto">{s.servicio}</span>
                    <span className="text-texto-3">
                      {s.pedidos} {s.pedidos === 1 ? "cita" : "citas"} · {fmtMoney(s.ingresos)}
                    </span>
                  </div>
                  <Barra valor={s.pedidos} max={r.serviciosTop[0].pedidos} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card p-4" aria-label="Asistencia">
          <h2 className="mb-2 text-[15px] font-bold text-texto">No-shows y cancelaciones</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Par etiqueta="Citas" valor={String(a.total)} />
            <Par etiqueta="Atendidas" valor={String(a.completadas)} />
            <Par etiqueta="No vinieron" valor={`${a.noShows} (${pct(a.tasaNoShow)})`} />
            <Par etiqueta="Canceladas" valor={`${a.canceladas} (${pct(a.tasaCancelacion)})`} />
            <Par etiqueta="Se fueron de la cola" valor={String(a.abandonadas)} />
            <Par etiqueta="Por venir o cobrar" valor={String(a.pendientes)} />
          </dl>
          <h3 className="mb-1 mt-3 text-[13px] font-semibold text-texto-2">Por origen</h3>
          <ul className="space-y-1 text-[13px] text-texto-2">
            {a.porOrigen.map((o) => (
              <li key={o.origen} className="flex justify-between">
                <span>{ORIGEN[o.origen] ?? o.origen}</span>
                <span>
                  {o.total} citas · {o.noShows} no-shows
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-4" aria-label="Ocupación por profesional">
        <h2 className="text-[15px] font-bold text-texto">Ocupación</h2>
        <p className="mb-3 text-[12px] text-texto-3">
          Horas reservadas sobre horas de horario (sin lo bloqueado). Un no-show cuenta: ese tiempo estaba tomado.
        </p>
        {r.ocupacion.recursos.length === 0 ? (
          <p className="py-4 text-center text-sm text-texto-3">Sin profesionales activos.</p>
        ) : (
          <ul className="space-y-2.5">
            {r.ocupacion.recursos.map((o) => (
              <li key={o.recursoId}>
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2 font-semibold text-texto">
                    <PuntoColor color={o.color} />
                    {o.nombre}
                  </span>
                  <span className="text-texto-3">
                    {pct(o.pct)} · {horas(o.minutosReservados)} de {horas(o.minutosDisponibles)}
                  </span>
                </div>
                <Barra valor={o.minutosReservados} max={o.minutosDisponibles} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4" aria-label="Retención">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-texto">Retención</h2>
            <p className="text-[12px] text-texto-3">
              De los clientes atendidos en el período, cuántos volvieron dentro de los días elegidos.
            </p>
          </div>
          <Campo label="Ventana">
            <Select value={String(dias)} onChange={(e) => onDias(Number(e.target.value))}>
              <option value="30">30 días</option>
              <option value="60">60 días</option>
              <option value="90">90 días</option>
            </Select>
          </Campo>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Par etiqueta="Clientes atendidos" valor={String(r.retencion.clientes)} />
          <Par etiqueta="Volvieron" valor={`${r.retencion.volvieron} (${pct(r.retencion.pct)})`} />
          <Par etiqueta="Nuevos" valor={String(r.retencion.nuevos)} />
          <Par etiqueta="Recurrentes" valor={String(r.retencion.recurrentes)} />
        </dl>
        {r.retencion.ventanaAbierta > 0 && (
          <p className="mt-2 text-[12px] text-texto-3">
            {r.retencion.ventanaAbierta} todavía pueden volver: su ventana no terminó.
          </p>
        )}
      </section>
    </div>
  );
}

function Barra({ valor, max }: { valor: number; max: number }) {
  const ancho = max > 0 ? Math.min(100, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${ancho}%` }} />
    </div>
  );
}

function Par({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-2.5">
      <dt className="text-[11px] uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="font-semibold text-texto">{valor}</dd>
    </div>
  );
}
