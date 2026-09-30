import { useEffect, useMemo, useState } from "react";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Badge, Boton, Cargando, ErrorMsg, Kpi, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { ItemSugerencia } from "../../types";
import { conUnidad } from "./medicamento";
import {
  cantidadPedida,
  porLaboratorio,
  SIN_LABORATORIO,
  textoMotivo,
  totalesPedido,
} from "./sugerencia";

const HISTORIA = [
  ["15", "15 días"],
  ["30", "30 días"],
  ["60", "60 días"],
  ["90", "90 días"],
] as const;

const COBERTURA = [
  ["7", "1 semana"],
  ["15", "15 días"],
  ["30", "1 mes"],
] as const;

const VISTAS = [
  ["urgencia", "Por urgencia"],
  ["laboratorio", "Por laboratorio"],
] as const;

/**
 * Sugerencia de compra: qué pedir para que alcance los próximos días, según lo
 * que se vendió, con el stock mínimo como seguridad y sumando lo que
 * encargaron clientes. Lo vencido no cuenta como stock.
 *
 * La cuenta la hace el servidor; acá el dueño la lee, ajusta las cantidades
 * que quiera (cero = no se pide) y se lleva el pedido impreso o en planilla,
 * por laboratorio si le pide a una droguería por cada uno.
 */
export default function SugerenciaCompraPagina() {
  const { negocio } = useAuth();
  const [dias, setDias] = useState<(typeof HISTORIA)[number][0]>("30");
  const [cobertura, setCobertura] = useState<(typeof COBERTURA)[number][0]>("15");
  const [vista, setVista] = useState<(typeof VISTAS)[number][0]>("urgencia");
  const suc = useSucursales();

  const sugerencia = useApi(
    () =>
      api.sugerenciaCompra({
        dias: Number(dias),
        cobertura: Number(cobertura),
        sucursalId: suc.elegir ? suc.sucursalId : null,
      }),
    [dias, cobertura, suc.elegir, suc.sucursalId],
  );

  // Lo que el dueño cambió a mano. Con otra cuenta (otros días, otra
  // sucursal) lo ajustado deja de tener sentido: arranca de nuevo.
  const [ajustes, setAjustes] = useState<Map<number, number>>(new Map());
  useEffect(() => setAjustes(new Map()), [dias, cobertura, suc.sucursalId]);

  const items = useMemo(() => sugerencia.datos?.items ?? [], [sugerencia.datos]);
  const totales = totalesPedido(items, ajustes);
  const grupos = vista === "laboratorio" ? porLaboratorio(items) : [{ laboratorio: "", items }];
  const hayAjustes = ajustes.size > 0;

  function ajustar(i: ItemSugerencia, n: number) {
    setAjustes((prev) => {
      const sigue = new Map(prev);
      if (n === i.sugerido) sigue.delete(i.productoId);
      else sigue.set(i.productoId, n);
      return sigue;
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5 print:max-w-none print:p-0">
      <div className="print:hidden">
        <EncabezadoPagina
          titulo="Sugerencia de compra"
          subtitulo={`Qué pedir para que alcance ${etiqueta(COBERTURA, cobertura)}, según lo vendido en los últimos ${dias} días.`}
          volver={{ a: "/reportes", etiqueta: "Reportes" }}
          accion={
            <div className="flex gap-2">
              <Boton
                variante="soft"
                icono="download"
                disabled={totales.articulos === 0}
                onClick={() => bajarCsv(items, ajustes, Number(dias))}
              >
                Planilla
              </Boton>
              <Boton
                variante="soft"
                icono="printer"
                disabled={totales.articulos === 0}
                onClick={() => window.print()}
              >
                Imprimir
              </Boton>
            </div>
          }
        />
      </div>

      <div className="hidden print:block">
        <h1 className="text-lg font-bold">Pedido sugerido</h1>
        <p className="text-sm">
          {negocio?.nombre} · {fmtFecha(isoDia(new Date()))}
          {suc.nombre ? ` · ${suc.nombre}` : ""} · para {etiqueta(COBERTURA, cobertura)}
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-borde bg-white p-4 print:hidden">
        <Fila titulo="Mirar las ventas de">
          <Chips valor={dias} opciones={HISTORIA} onChange={setDias} />
        </Fila>
        <Fila titulo="Que alcance para">
          <Chips valor={cobertura} opciones={COBERTURA} onChange={setCobertura} />
        </Fila>
        {suc.elegir && (
          <Fila titulo="Sucursal">
            <Chips
              valor={suc.sucursalId == null ? "" : String(suc.sucursalId)}
              opciones={suc.opciones}
              onChange={(v) => suc.setSucursalId(v ? Number(v) : null)}
            />
          </Fila>
        )}
        <p className="border-t border-borde-soft pt-3 text-xs text-texto-3">
          Pedido = lo que se vende en ese tiempo + el stock mínimo + lo que encargaron clientes −
          lo que hay (lo vencido no cuenta). Podés cambiar cualquier cantidad antes de imprimir; 0
          es no pedirlo.
        </p>
      </div>

      {sugerencia.cargando && !sugerencia.datos ? (
        <Cargando texto="Calculando…" />
      ) : sugerencia.error ? (
        <ErrorMsg onReintentar={sugerencia.recargar}>{sugerencia.error}</ErrorMsg>
      ) : items.length === 0 ? (
        <Vacio
          icono="check"
          titulo="No hace falta pedir nada"
          texto={`Con lo que hay alcanza para ${etiqueta(COBERTURA, cobertura)} y nada quedó bajo el mínimo.`}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 print:hidden">
            <Kpi
              etiqueta="Para pedir"
              valor={`${fmtNum(totales.articulos)} ${totales.articulos === 1 ? "artículo" : "artículos"}`}
              pie={`${fmtNum(totales.unidades)} unidades${hayAjustes ? " · con tus cambios" : ""}`}
              icono="cart"
            />
            <Kpi
              etiqueta="Inversión estimada"
              valor={fmtMoney(totales.inversion)}
              pie="Al costo de la última compra"
              icono="dollar"
              tono="azul"
            />
            <Kpi
              etiqueta="Agotados"
              valor={fmtNum(sugerencia.datos?.resumen.agotados ?? 0)}
              pie="No queda nada para vender"
              icono="alert"
              tono="rojo"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <Chips valor={vista} opciones={VISTAS} onChange={setVista} />
            {hayAjustes && (
              <button
                onClick={() => setAjustes(new Map())}
                className="text-[13px] font-semibold text-primary-700 hover:underline"
              >
                Volver a lo sugerido
              </button>
            )}
          </div>

          {grupos.map((g) => (
            <section key={g.laboratorio || "todos"} className="space-y-2 print:break-inside-avoid">
              {g.laboratorio && (
                <h2 className="flex items-baseline justify-between gap-2 pt-1 text-[15px] font-bold text-texto">
                  <span>{g.laboratorio}</span>
                  <span className="text-[13px] font-semibold text-texto-3">
                    {fmtMoney(totalesPedido(g.items, ajustes).inversion)}
                  </span>
                </h2>
              )}

              {/* Teléfono: una tarjeta por artículo. */}
              <ul className="space-y-2 lg:hidden print:hidden">
                {g.items.map((i) => (
                  <TarjetaSugerencia
                    key={i.productoId}
                    item={i}
                    dias={Number(dias)}
                    pedir={cantidadPedida(i, ajustes)}
                    conLaboratorio={vista === "urgencia"}
                    onPedir={(n) => ajustar(i, n)}
                  />
                ))}
              </ul>

              {/* Escritorio y papel. */}
              <div className="hidden overflow-x-auto rounded-2xl border border-borde bg-white lg:block print:block print:rounded-none print:border-0">
                <table className="w-full text-left text-[13px] print:text-[11px]">
                  <thead className="border-b border-borde bg-muted text-xs font-semibold text-texto-3 print:bg-white">
                    <tr>
                      <th className="px-3 py-2.5">Medicamento</th>
                      <th className="px-3 py-2.5 print:hidden">Por qué</th>
                      <th className="px-3 py-2.5 text-right">Hay</th>
                      <th className="px-3 py-2.5 text-right">Se vende</th>
                      <th className="px-3 py-2.5 text-right">Encargos</th>
                      <th className="px-3 py-2.5 text-right">Pedir</th>
                      <th className="px-3 py-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde-soft">
                    {g.items.map((i) => (
                      <FilaSugerencia
                        key={i.productoId}
                        item={i}
                        dias={Number(dias)}
                        pedir={cantidadPedida(i, ajustes)}
                        conLaboratorio={vista === "urgencia"}
                        onPedir={(n) => ajustar(i, n)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="hidden text-right text-sm font-bold print:block">
            Total estimado: {fmtMoney(totales.inversion)}
          </p>
        </>
      )}
    </div>
  );
}

function etiqueta(opciones: readonly (readonly [string, string])[], valor: string): string {
  const texto = opciones.find(([k]) => k === valor)?.[1] ?? `${valor} días`;
  return texto === "1 semana" ? "una semana" : texto === "1 mes" ? "un mes" : texto;
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-40 shrink-0 text-xs font-semibold text-texto-3">{titulo}</span>
      {children}
    </div>
  );
}

/** La droga y el laboratorio, lo que distingue dos cajas que se llaman igual. */
function detalle(i: ItemSugerencia, conLaboratorio: boolean): string {
  const droga = [i.principioActivo, i.concentracion].filter(Boolean).join(" ");
  return [
    droga && droga.toLowerCase() !== i.nombre.toLowerCase() ? droga : null,
    conLaboratorio ? i.laboratorio : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface PropsItem {
  item: ItemSugerencia;
  dias: number;
  pedir: number;
  conLaboratorio: boolean;
  onPedir: (n: number) => void;
}

/** Lo que hay para vender, y lo vencido aparte: está, pero no cuenta. */
function Hay({ item: i, enLinea = false }: { item: ItemSugerencia; enLinea?: boolean }) {
  return (
    <>
      {conUnidad(Math.max(0, i.stock - i.vencido), i.unidad)}
      {i.vencido > 0 && (
        <span
          className={`${enLinea ? "ml-1" : "block"} text-[11px] font-semibold text-danger-text`}
        >
          {enLinea ? `(+ ${fmtNum(i.vencido)} vencidos)` : `+ ${fmtNum(i.vencido)} vencidos`}
        </span>
      )}
    </>
  );
}

function FilaSugerencia({ item: i, dias, pedir, conLaboratorio, onPedir }: PropsItem) {
  const motivo = textoMotivo(i);
  const texto = detalle(i, conLaboratorio);
  return (
    <tr className={pedir === 0 ? "text-texto-4" : "text-texto-2"}>
      <td className="px-3 py-2.5 align-top">
        <span className={`font-semibold ${pedir === 0 ? "" : "text-texto"}`}>{i.nombre}</span>
        {texto && <span className="block text-xs text-texto-4">{texto}</span>}
      </td>
      <td className="px-3 py-2.5 align-top print:hidden">
        <Badge tono={motivo.tono}>{motivo.texto}</Badge>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
        <Hay item={i} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
        {fmtNum(i.vendidas)} en {dias} d
        {/* Con una venta al mes, "0,0 por día" confunde: el total ya lo dice. */}
        {i.porDia >= 0.1 && (
          <span className="block text-[11px] text-texto-4">{fmtNum(i.porDia, 1)} por día</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right align-top">{i.encargos > 0 ? fmtNum(i.encargos) : "—"}</td>
      <td className="px-3 py-2.5 text-right align-top">
        <CampoPedir item={i} valor={pedir} onCambiar={onPedir} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold">
        {fmtMoney(pedir * i.costo)}
        <span className="block text-[11px] font-normal text-texto-4">{fmtMoney(i.costo)} c/u</span>
      </td>
    </tr>
  );
}

function TarjetaSugerencia({ item: i, dias, pedir, conLaboratorio, onPedir }: PropsItem) {
  const motivo = textoMotivo(i);
  const texto = detalle(i, conLaboratorio);
  return (
    <li
      className={`rounded-2xl border border-borde bg-white p-3.5 ${pedir === 0 ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-texto">{i.nombre}</p>
          {texto && <p className="text-xs text-texto-4">{texto}</p>}
        </div>
        <Badge tono={motivo.tono}>{motivo.texto}</Badge>
      </div>
      <p className="mt-2 text-xs text-texto-3">
        Hay <Hay item={i} enLinea /> · Se vendió {fmtNum(i.vendidas)} en {dias} días
        {i.encargos > 0 && ` · ${fmtNum(i.encargos)} encargados`}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-texto-3">
          Pedir
          <CampoPedir item={i} valor={pedir} onCambiar={onPedir} />
        </label>
        <span className="text-sm font-bold text-texto">{fmtMoney(pedir * i.costo)}</span>
      </div>
    </li>
  );
}

/**
 * La cantidad a pedir, que se puede cambiar. Sólo números enteros; vacío es
 * cero. Si quedó distinta de lo sugerido, lo dice abajo para no perder la
 * referencia.
 */
function CampoPedir({
  item: i,
  valor,
  onCambiar,
}: {
  item: ItemSugerencia;
  valor: number;
  onCambiar: (n: number) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <input
        value={texto ?? String(valor)}
        inputMode="numeric"
        aria-label={`Cantidad a pedir de ${i.nombre}`}
        onFocus={(e) => {
          setTexto(String(valor));
          e.target.select();
        }}
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, "").slice(0, 5);
          setTexto(limpio);
          onCambiar(limpio ? Number(limpio) : 0);
        }}
        onBlur={() => setTexto(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-16 rounded-lg border border-borde bg-white px-2 py-1 text-right text-[13px] font-bold text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100 print:hidden"
      />
      <span className="hidden font-bold print:inline">{fmtNum(valor)}</span>
      {valor !== i.sugerido && (
        <span className="mt-0.5 text-[11px] text-texto-4 print:hidden">
          sugerido {fmtNum(i.sugerido)}
        </span>
      )}
    </span>
  );
}

/** Una celda de planilla: entre comillas, y sin que Excel la lea como fórmula. */
function celda(v: string | number): string {
  const t = typeof v === "number" ? String(v).replace(".", ",") : v;
  const seguro = /^[=+@-]/.test(t) && !/^-?[\d.,]+$/.test(t) ? `'${t}` : t;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/** El pedido como planilla, por laboratorio, con lo que se ajustó a mano. */
function bajarCsv(items: ItemSugerencia[], ajustes: ReadonlyMap<number, number>, dias: number) {
  const columnas = [
    "Laboratorio",
    "Medicamento",
    "Droga",
    "Hay",
    "Vencido",
    `Vendido en ${dias} días`,
    "Por día",
    "Encargos",
    "Sugerido",
    "Pedir",
    "Costo",
    "Subtotal",
  ];
  const filas = porLaboratorio(items).flatMap((g) =>
    g.items
      .filter((i) => cantidadPedida(i, ajustes) > 0)
      .map((i) => {
        const pedir = cantidadPedida(i, ajustes);
        return [
          g.laboratorio === SIN_LABORATORIO ? "" : g.laboratorio,
          i.nombre,
          [i.principioActivo, i.concentracion].filter(Boolean).join(" "),
          Math.max(0, i.stock - i.vencido),
          i.vencido,
          i.vendidas,
          i.porDia,
          i.encargos,
          i.sugerido,
          pedir,
          i.costo,
          Math.round(pedir * i.costo * 100) / 100,
        ]
          .map(celda)
          .join(";");
      }),
  );
  const blob = new Blob(["﻿" + [columnas.map(celda).join(";"), ...filas].join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `pedido-sugerido-${isoDia(new Date())}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}
