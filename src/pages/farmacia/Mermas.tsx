import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Badge, Boton, Cargando, ErrorMsg, Kpi, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { BajaMerma, ReporteMermas } from "../../types";
import { TRAMOS, type FiltroVencimientos } from "./medicamento";
import { PERIODOS, rangoDe, type Periodo } from "./periodo";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09" → "sep 2026". */
function nombreMes(mes: string): string {
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m} ${y}`;
}

/**
 * Vencimientos y mermas: la plata que se fue y la que se puede ir.
 *
 * Arriba lo del período —lo perdido (vencido, dañado, robado, cargado de más)
 * y lo devuelto al proveedor, que no es pérdida—, y al lado la foto de hoy: lo
 * vencido que sigue en el estante y lo que vence en 90 días, que todavía se
 * puede rematar o devolver. Todo al costo del lote, no al de la última
 * compra.
 */
export default function MermasPagina() {
  const { puede } = useAuth();
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const suc = useSucursales();
  const { desde, hasta } = rangoDe(periodo);

  const reporte = useApi(
    () => api.mermas({ desde, hasta, sucursalId: suc.elegir ? suc.sucursalId : null }),
    [desde, hasta, suc.elegir, suc.sucursalId],
  );
  const r = reporte.datos;
  const verVencimientos = puede("vencimientos");

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <div>
        <EncabezadoPagina
          titulo="Vencimientos y mermas"
          subtitulo="Lo que se perdió por vencido, dañado o robado, y lo que está por perderse."
          volver={{ a: "/reportes", etiqueta: "Reportes" }}
          accion={
            <div className="flex gap-2">
              <Boton
                variante="soft"
                icono="download"
                disabled={!r || r.detalle.length === 0}
                onClick={() => r && bajarCsv(r.detalle, desde, hasta)}
              >
                Exportar a Excel
              </Boton>
            </div>
          }
        />
      </div>


      <div className="space-y-3 rounded-2xl border border-borde bg-white p-4">
        <Chips valor={periodo} opciones={PERIODOS} onChange={setPeriodo} />
        {suc.elegir && (
          <Chips
            valor={suc.sucursalId == null ? "" : String(suc.sucursalId)}
            opciones={suc.opciones}
            onChange={(v) => suc.setSucursalId(v ? Number(v) : null)}
          />
        )}
        <p className="text-xs text-texto-3">
          Del {fmtFecha(desde)} al {fmtFecha(hasta)}. Sale de las salidas de mercadería aprobadas,
          al costo del lote del que salió cada unidad.
        </p>
      </div>

      {reporte.cargando && !r ? (
        <Cargando />
      ) : reporte.error ? (
        <ErrorMsg onReintentar={reporte.recargar}>{reporte.error}</ErrorMsg>
      ) : r ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              etiqueta="Perdido"
              valor={fmtMoney(r.resumen.perdido)}
              pie={`${fmtNum(r.resumen.unidadesPerdidas)} unidades dadas de baja`}
              icono="trendingDown"
              tono="rojo"
            />
            <Kpi
              etiqueta="Devuelto al proveedor"
              valor={fmtMoney(r.resumen.devuelto)}
              pie={`${fmtNum(r.resumen.unidadesDevueltas)} unidades · no es pérdida`}
              icono="truck"
              tono="azul"
            />
            <Kpi
              etiqueta="En riesgo hoy"
              valor={fmtMoney(r.resumen.enRiesgo)}
              pie="Vencido en el estante y lo que vence en 90 días"
              icono="calendar"
              tono="amarillo"
            />
          </div>

          <EnRiesgo
            reporte={r}
            onTramo={
              verVencimientos
                ? (tramo) =>
                    navigate("/vencimientos", { state: { tramo } satisfies FiltroVencimientos })
                : undefined
            }
          />

          {r.detalle.length === 0 ? (
            <Vacio
              icono="check"
              titulo="No hubo bajas en el período"
              texto="Nada se dio de baja ni se devolvió al proveedor en estas fechas."
            />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <PorMotivo reporte={r} />
                <MasPerdido reporte={r} />
              </div>
              {r.porMes.length > 1 && <PorMes reporte={r} />}
              <Detalle filas={r.detalle} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-white p-4">
      <h2 className="mb-3 text-[15px] font-bold text-texto">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * La foto de hoy, por tramo, con los mismos nombres y colores que
 * Vencimientos. Tocar un tramo abre esa lista ya filtrada: ahí se da de baja
 * o se devuelve.
 */
function EnRiesgo({
  reporte: r,
  onTramo,
}: {
  reporte: ReporteMermas;
  onTramo?: (tramo: FiltroVencimientos["tramo"]) => void;
}) {
  return (
    <Tarjeta titulo="En riesgo hoy">
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TRAMOS.map((t) => {
          const d = r.riesgo[t.clave as keyof ReporteMermas["riesgo"]];
          const contenido = (
            <>
              <span className={`text-xs font-bold ${t.texto}`}>
                {t.clave === "VENCIDO" ? "Vencido en el estante" : t.titulo}
              </span>
              <span className="mt-1 block text-lg font-extrabold text-texto">
                {fmtMoney(d.valor)}
              </span>
              <span className="block text-[11px] text-texto-3">
                {d.lotes === 0
                  ? "Nada"
                  : `${fmtNum(d.unidades)} u. · ${d.lotes} ${d.lotes === 1 ? "lote" : "lotes"}`}
              </span>
            </>
          );
          return (
            <li key={t.clave}>
              {onTramo && d.lotes > 0 ? (
                <button
                  onClick={() => onTramo(t.clave)}
                  title={`Ver ${t.titulo.toLowerCase()} en Vencimientos`}
                  className={`block w-full rounded-xl p-3 text-left transition-shadow hover:shadow-md ${t.fondo}`}
                >
                  {contenido}
                </button>
              ) : (
                <div className={`rounded-xl p-3 ${t.fondo}`}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

/**
 * Una barra de proporción: el largo es el valor frente al mayor de la lista.
 * Un solo color, porque dice cuánto y no quién; la devolución va en gris y lo
 * dice con texto, no sólo con el color.
 */
function Barra({ valor, maximo, gris }: { valor: number; maximo: number; gris?: boolean }) {
  const ancho = maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0;
  return (
    <span className="block h-2 w-full rounded-full bg-muted">
      <span
        className={`block h-2 rounded-full ${gris ? "bg-slate-300" : "bg-primary"}`}
        style={{ width: `${ancho}%` }}
      />
    </span>
  );
}

function PorMotivo({ reporte: r }: { reporte: ReporteMermas }) {
  const maximo = Math.max(...r.porMotivo.map((m) => m.valor), 0);
  return (
    <Tarjeta titulo="Por motivo">
      <ul className="space-y-3">
        {r.porMotivo.map((m) => (
          <li key={m.motivo} title={`${m.motivo}: ${fmtMoney(m.valor)} · ${fmtNum(m.unidades)} u.`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-semibold text-texto">
                {m.motivo}
                {m.devolucion && (
                  <span className="ml-1.5 font-normal text-texto-4">· no es pérdida</span>
                )}
              </span>
              <span className="shrink-0 font-bold text-texto">
                {fmtMoney(m.valor)}
                <span className="ml-1.5 font-normal text-texto-4">{fmtNum(m.unidades)} u.</span>
              </span>
            </div>
            <Barra valor={m.valor} maximo={maximo} gris={m.devolucion} />
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function MasPerdido({ reporte: r }: { reporte: ReporteMermas }) {
  return (
    <Tarjeta titulo="Lo que más se pierde">
      {r.porProducto.length === 0 ? (
        <p className="text-[13px] text-texto-3">Sólo hubo devoluciones al proveedor.</p>
      ) : (
        <ol className="divide-y divide-borde-soft">
          {r.porProducto.slice(0, 8).map((p) => (
            <li key={p.productoId} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-texto">{p.nombre}</p>
                <p className="truncate text-xs text-texto-4">
                  {[p.laboratorio, p.motivos.join(", ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-right text-[13px] font-bold text-texto">
                {fmtMoney(p.valor)}
                <span className="block text-[11px] font-normal text-texto-4">
                  {fmtNum(p.unidades)} u.
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  );
}

function PorMes({ reporte: r }: { reporte: ReporteMermas }) {
  const maximo = Math.max(...r.porMes.map((m) => m.perdido), 0);
  return (
    <Tarjeta titulo="Perdido por mes">
      <ul className="space-y-2.5">
        {r.porMes.map((m) => (
          <li key={m.mes} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-[13px]">
            <span className="font-semibold text-texto-2">{nombreMes(m.mes)}</span>
            <Barra valor={m.perdido} maximo={maximo} />
            <span className="text-right font-bold text-texto">
              {fmtMoney(m.perdido)}
              {m.devuelto > 0 && (
                <span className="block text-[11px] font-normal text-texto-4">
                  + {fmtMoney(m.devuelto)} devuelto
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

/** Cada baja, renglón por renglón: la tabla que respalda los números de arriba. */
function Detalle({ filas }: { filas: BajaMerma[] }) {
  const variasSucursales = useMemo(() => new Set(filas.map((f) => f.almacen)).size > 1, [filas]);
  return (
    <Tarjeta titulo="Cada baja">
      <ul className="space-y-2 lg:hidden">
        {filas.map((f, i) => (
          <li key={`${f.movimientoId}-${f.productoId}-${i}`} className="rounded-xl border border-borde-soft p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-texto">{f.nombre}</p>
                <p className="text-xs text-texto-4">
                  {fmtFecha(f.fecha)}
                  {f.lotes.length > 0 && ` · lote ${f.lotes.join(", ")}`}
                  {variasSucursales && ` · ${f.almacen}`}
                </p>
              </div>
              <span className="shrink-0 text-right text-sm font-bold text-texto">
                {fmtMoney(f.valor)}
                <span className="block text-[11px] font-normal text-texto-4">
                  {fmtNum(f.cantidad)} u.
                </span>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-texto-3">
              <Badge tono={f.devolucion ? "azul" : "gris"}>{f.motivo}</Badge>
              {f.nota && <span className="ml-1.5">{f.nota}</span>}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-borde text-xs font-semibold text-texto-3">
            <tr>
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Medicamento</th>
              <th className="py-2 pr-3">Motivo</th>
              <th className="py-2 pr-3 text-right">Cant.</th>
              <th className="py-2 pr-3 text-right">Valor</th>
              <th className="py-2">Quién</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft text-texto-2">
            {filas.map((f, i) => (
              <tr key={`${f.movimientoId}-${f.productoId}-${i}`}>
                <td className="whitespace-nowrap py-2 pr-3 align-top">{fmtFecha(f.fecha)}</td>
                <td className="py-2 pr-3 align-top">
                  <span className="font-semibold text-texto">{f.nombre}</span>
                  {f.lotes.length > 0 && (
                    <span className="block text-xs text-texto-4">lote {f.lotes.join(", ")}</span>
                  )}
                </td>
                <td className="py-2 pr-3 align-top">
                  {f.motivo}
                  {f.nota && <span className="block text-xs text-texto-4">{f.nota}</span>}
                </td>
                <td className="py-2 pr-3 text-right align-top">{fmtNum(f.cantidad)}</td>
                <td className="py-2 pr-3 text-right align-top font-bold text-texto">
                  {fmtMoney(f.valor)}
                </td>
                <td className="py-2 align-top">
                  {f.usuario ?? "—"}
                  {variasSucursales && (
                    <span className="block text-xs text-texto-4">{f.almacen}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/** Una celda de planilla: entre comillas, y sin que Excel la lea como fórmula. */
function celda(v: string | number): string {
  const t = typeof v === "number" ? String(v).replace(".", ",") : v;
  const seguro = /^[=+@-]/.test(t) && !/^-?[\d.,]+$/.test(t) ? `'${t}` : t;
  return `"${seguro.replace(/"/g, '""')}"`;
}

function bajarCsv(filas: BajaMerma[], desde: string, hasta: string) {
  const columnas = [
    "Fecha",
    "Medicamento",
    "Laboratorio",
    "Lotes",
    "Motivo",
    "Nota",
    "Cantidad",
    "Valor",
    "Es devolución",
    "Sucursal",
    "Quién",
  ];
  const lineas = [
    columnas.map(celda).join(";"),
    ...filas.map((f) =>
      [
        fmtFecha(f.fecha),
        f.nombre,
        f.laboratorio ?? "",
        f.lotes.join(", "),
        f.motivo,
        f.nota,
        f.cantidad,
        f.valor,
        f.devolucion ? "Sí" : "No",
        f.almacen,
        f.usuario ?? "",
      ]
        .map(celda)
        .join(";"),
    ),
  ];
  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `mermas-${desde}-a-${hasta}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}
