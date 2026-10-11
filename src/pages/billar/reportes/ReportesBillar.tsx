import { useMemo } from "react";
import { Kpi, Vacio } from "../../../components/ui";
import { fmtMoney, fmtNum } from "../../../lib/format";
import type { RangoReporte } from "../../../types";
import { horaDe, round2 } from "../calculo";
import { useBillar } from "../store";
import { Fila, Tarjeta } from "../ui";
import { HORARIO, horaCorta, reporteBillar, textoPico, type ReporteBillar } from "./datosReporte";

/**
 * Reportes → Billar (§7.15): lo que dejaron las mesas en el período elegido
 * arriba (Hoy, Semana, Mes… los mismos filtros de toda la pantalla).
 *
 * MAQUETA (oct-2026): cifras de ejemplo (ver `datosReporte.ts`); la auditoría
 * suma lo que se hizo en el tablero.
 */
export default function ReportesBillar({ rango }: { rango: RangoReporte }) {
  const e = useBillar();
  const r = useMemo(
    () =>
      rango.desde && rango.hasta
        ? reporteBillar(rango.desde, rango.hasta, e.productos, e.auditoria, new Date())
        : null,
    [rango.desde, rango.hasta, e.productos, e.auditoria],
  );

  if (!r || (r.jornadas === 0 && r.auditoria.length === 0)) {
    const hoy = new Date().getHours() < HORARIO.abre;
    return (
      <Vacio
        icono="bola"
        titulo="Sin movimiento en estas fechas"
        texto={
          hoy
            ? `El billar abre a las ${horaCorta(HORARIO.abre)}: todavía no hay nada jugado hoy. Probá con Semana o Mes.`
            : "Elegí otro período."
        }
      />
    );
  }

  const porDia = r.jornadas ? r.horas / r.jornadas : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Ingresos por tiempo" valor={fmtMoney(r.tiempoBs)} icono="clock" pie="Alquiler de mesas" />
        <Kpi etiqueta="Consumos en mesas" valor={fmtMoney(r.consumosBs)} icono="cart" pie="Productos cargados a mesas" />
        <Kpi
          etiqueta="Horas jugadas"
          valor={`${fmtNum(r.horas)} h`}
          icono="cronometro"
          pie={`Promedio ${fmtNum(porDia, 1)} h por día`}
        />
        <Kpi
          etiqueta="Ocupación"
          valor={`${Math.round(r.ocupacion * 100)} %`}
          icono="chart"
          pie="De las horas abiertas del local"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <HorasPorMesa r={r} />
        <OcupacionPorHora r={r} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <TiempoVsConsumos r={r} />
        <Tarjeta titulo="Tiempo fijo y excedentes">
          <div className="space-y-1.5 text-[13px]">
            <Fila etiqueta="Tiempos fijos vendidos" valor={fmtNum(r.fijos.vendidos)} />
            <Fila etiqueta="Monto en tiempo fijo" valor={fmtMoney(r.fijos.monto)} />
            <Fila
              etiqueta="Siguieron jugando"
              valor={`${r.fijos.vendidos ? Math.round((r.fijos.conExcedente / r.fijos.vendidos) * 100) : 0} %`}
            />
            <Fila
              etiqueta="Cobrado en excedentes"
              valor={<span className="text-primary-700">{fmtMoney(r.fijos.excedenteBs)}</span>}
            />
          </div>
          <p className="mt-3 text-xs text-texto-4">"Siguieron jugando": se les cumplió el tiempo y pagaron de más.</p>
        </Tarjeta>
        <UsoPorMesa r={r} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Ventas rápidas" extra="Sin mesa, en el mostrador">
          <div className="space-y-1.5 text-[13px]">
            <Fila etiqueta="Ventas" valor={fmtNum(r.rapidas.cantidad)} />
            <Fila etiqueta="Total" valor={fmtMoney(r.rapidas.bs)} />
            <Fila
              etiqueta="Ticket promedio"
              valor={fmtMoney(r.rapidas.cantidad ? round2(r.rapidas.bs / r.rapidas.cantidad) : 0)}
            />
          </div>
        </Tarjeta>
        <Tarjeta titulo="Lo más vendido en el billar" extra="En mesas y ventas rápidas">
          {r.productos.length === 0 ? (
            <p className="text-[13px] text-texto-3">Nada vendido en estas fechas.</p>
          ) : (
            <ol className="space-y-1.5 text-[13px]">
              {r.productos.map((p, i) => (
                <li key={p.nombre} className="flex items-baseline gap-3">
                  <span className="w-4 shrink-0 text-right font-bold tabular-nums text-texto-4">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-texto-2">{p.nombre}</span>
                  <span className="shrink-0 tabular-nums text-texto-3">{fmtNum(p.cant)} u.</span>
                  <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-texto">{fmtMoney(p.bs)}</span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>
      </div>

      <Auditoria r={r} />
    </div>
  );
}

function HorasPorMesa({ r }: { r: ReporteBillar }) {
  const max = Math.max(...r.porMesa.map((m) => m.horas), 0.0001);
  const mas = r.porMesa[0];
  const menos = r.porMesa[r.porMesa.length - 1];
  return (
    <Tarjeta
      titulo="Horas por mesa"
      extra={mas && menos && mas !== menos ? `Más usada: Mesa ${mas.mesaId} · Menos: Mesa ${menos.mesaId}` : undefined}
    >
      <ul className="space-y-2.5">
        {r.porMesa.map((m) => (
          <li key={m.mesaId} className="flex items-center gap-3 text-[13px]">
            <span className="w-14 shrink-0 font-semibold text-texto">Mesa {m.mesaId}</span>
            <span className="h-5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-full rounded-full ${m === menos && m !== mas ? "bg-primary/45" : "bg-primary"}`}
                style={{ width: `${(m.horas / max) * 100}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-bold tabular-nums text-texto">{fmtNum(m.horas)} h</span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function OcupacionPorHora({ r }: { r: ReporteBillar }) {
  const pico = textoPico(r.porHora);
  return (
    <Tarjeta titulo="Ocupación por hora" extra="Promedio del período">
      <div className="flex h-40 items-end gap-1.5 sm:gap-2" role="img" aria-label={pico ?? "Ocupación por hora"}>
        {r.porHora.map((h) => (
          <div key={h.hora} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span
              className={`w-full rounded-t-md ${h.ocupacion >= 0.8 ? "bg-primary" : "bg-primary-100"}`}
              style={{ height: `${Math.max(2, h.ocupacion * 100)}%` }}
              title={`${horaCorta(h.hora)}: ${Math.round(h.ocupacion * 100)} %`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-2">
        {r.porHora.map((h) => (
          <span key={h.hora} className="min-w-0 flex-1 text-center text-[10px] tabular-nums text-texto-3 sm:text-[11px]">
            {etiquetaHora(h.hora)}
          </span>
        ))}
      </div>
      {pico && <p className="mt-3 text-xs text-texto-3">{pico}</p>}
    </Tarjeta>
  );
}

/** "04p", "12a", "01a": como en la maqueta, para que entren diez debajo de las barras. */
function etiquetaHora(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
}

function TiempoVsConsumos({ r }: { r: ReporteBillar }) {
  const total = round2(r.tiempoBs + r.consumosBs);
  const pctTiempo = total ? Math.round((r.tiempoBs / total) * 100) : 0;
  return (
    <Tarjeta titulo="Tiempo vs. consumos">
      <div className="flex h-3 overflow-hidden rounded-full bg-primary-100" aria-hidden>
        <span className="h-full bg-primary-boton" style={{ width: `${pctTiempo}%` }} />
      </div>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <Fila etiqueta={`Tiempo · ${pctTiempo} %`} valor={fmtMoney(r.tiempoBs)} />
        <Fila etiqueta={`Consumos · ${100 - pctTiempo} %`} valor={fmtMoney(r.consumosBs)} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-borde-soft pt-3">
        <span className="text-[15px] font-semibold text-texto">Ventas del billar</span>
        <span className="text-lg font-extrabold tabular-nums text-primary-700">{fmtMoney(total)}</span>
      </div>
      {r.horas > 0 && (
        <p className="mt-2 text-xs text-texto-3">
          Cada hora de mesa deja {fmtMoney(round2(r.consumosBs / r.horas))} en consumos.
        </p>
      )}
    </Tarjeta>
  );
}

function UsoPorMesa({ r }: { r: ReporteBillar }) {
  return (
    <Tarjeta titulo="Uso por mesa" cuerpo="px-4 py-2 sm:px-5">
      <ul className="divide-y divide-borde-soft text-[13px]">
        {[...r.porMesa]
          .sort((a, b) => a.mesaId - b.mesaId)
          .map((m) => (
            <li key={m.mesaId} className="flex items-center gap-3 py-2">
              <span className="flex-1 font-semibold text-texto">Mesa {m.mesaId}</span>
              <span className="tabular-nums text-texto-3">{fmtNum(m.horas)} h</span>
              <span className="w-12 text-right font-bold tabular-nums text-texto">{Math.round(m.pct * 100)} %</span>
            </li>
          ))}
      </ul>
    </Tarjeta>
  );
}

/** "06/10 · 11:12 p. m." */
function cuando(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${horaDe(ms)}`;
}

function Auditoria({ r }: { r: ReporteBillar }) {
  const th = "px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-texto-3";
  return (
    <Tarjeta titulo="Pausas y ajustes" extra="Quién pausó, anuló o movió una cuenta, y por qué" cuerpo="">
      {r.auditoria.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-texto-3">Sin pausas ni anulaciones en estas fechas.</p>
      ) : (
        <>
          {/* Tabla desde tablet; en el celular, una tarjeta por fila. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Fecha</th>
                  <th className={th}>Mesa</th>
                  <th className={th}>Acción</th>
                  <th className={th}>Quién</th>
                  <th className={th}>Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-soft">
                {r.auditoria.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-texto-2">{cuando(a.hora)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-texto">
                      {a.mesaId ? `Mesa ${a.mesaId}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-texto">{a.accion}</td>
                    <td className="px-4 py-3 text-texto-2">
                      {a.quien}
                      {a.autorizo && <span className="block text-[11px] text-texto-4">Autorizó: {a.autorizo}</span>}
                    </td>
                    <td className="px-4 py-3 text-texto-3">{a.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-borde-soft md:hidden">
            {r.auditoria.map((a) => (
              <li key={a.id} className="px-4 py-3 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-bold text-texto">{a.mesaId ? `Mesa ${a.mesaId}` : "—"}</span>
                  <span className="text-[12px] tabular-nums text-texto-3">{cuando(a.hora)}</span>
                </div>
                <p className="mt-0.5 text-texto">{a.accion}</p>
                <p className="mt-0.5 text-[12px] text-texto-3">
                  {a.quien}
                  {a.autorizo ? ` · autorizó ${a.autorizo}` : ""}
                  {a.motivo ? ` · ${a.motivo}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  );
}
