import { useMemo, useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import type { ContadorTramo, LotePorVencer, TramoVencimiento } from "../../types";
import { COLOR_TRAMO, textoVida } from "./medicamento";

/**
 * Vencimientos: la pantalla que evita que la plata se pudra en el estante.
 *
 * Es la única de farmacia que **no** sirve para atender a alguien: sirve para
 * decidir. Por eso lo primero que se ve no es una lista sino un número —cuánto
 * cuesta lo que está por vencer— y recién después qué lo compone. "9 lotes por
 * vencer" no mueve a nadie; "Bs 2.807 que se te vencen en tres meses" sí.
 *
 * El orden de la lista es el orden en el que hay que actuar: primero lo que ya
 * venció (sacarlo del estante hoy), después lo que vence en 30 días (devolver
 * al proveedor o rematar), y así.
 */

const TRAMOS: {
  clave: TramoVencimiento;
  campo: "vencidos" | "hasta30" | "hasta60" | "hasta90";
  titulo: string;
  ayuda: string;
  /** El color dice qué tan urgente es, no qué tan lindo queda. */
  texto: string;
  fondo: string;
  barra: string;
}[] = [
  {
    clave: "VENCIDO",
    campo: "vencidos",
    titulo: "Vencidos",
    ayuda: "Sacar del estante",
    ...COLOR_TRAMO.VENCIDO,
  },
  {
    clave: "HASTA_30",
    campo: "hasta30",
    titulo: "≤ 30 días",
    ayuda: "Rematar o devolver",
    ...COLOR_TRAMO.HASTA_30,
  },
  {
    clave: "HASTA_60",
    campo: "hasta60",
    titulo: "31 – 60 días",
    ayuda: "Mover con promoción",
    ...COLOR_TRAMO.HASTA_60,
  },
  {
    clave: "HASTA_90",
    campo: "hasta90",
    titulo: "61 – 90 días",
    ayuda: "Tener en el radar",
    ...COLOR_TRAMO.HASTA_90,
  },
];

export default function Vencimientos() {
  const datos = useApi(() => api.vencimientos(), []);
  const [tramo, setTramo] = useState<TramoVencimiento | null>(null);

  const detalle = datos.datos?.detalle ?? [];
  const filtrado = useMemo(
    () => (tramo ? detalle.filter((d) => d.tramo === tramo) : detalle),
    [detalle, tramo],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Vencimientos"
        subtitulo="Los lotes ordenados por lo que vence primero"
      />

      <ErrorMsg>{datos.error}</ErrorMsg>

      {datos.cargando ? (
        <Cargando texto="Revisando los lotes…" />
      ) : !datos.datos ? null : (
        <>
          {/* El número que le habla al dueño. Va arriba de todo y en grande:
              es la razón por la que esta pantalla existe. */}
          <div className="card flex flex-wrap items-baseline justify-between gap-2 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
                Valor en riesgo
              </p>
              <p className="text-3xl font-extrabold text-texto">
                {fmtMoney(datos.datos.valorEnRiesgo)}
              </p>
            </div>
            <p className="max-w-xs text-[13px] text-texto-3">
              Lo que costó la mercadería que ya venció o vence dentro de los
              próximos 90 días.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TRAMOS.map((t) => (
              <Contador
                key={t.clave}
                tramo={t}
                datos={datos.datos![t.campo]}
                activo={tramo === t.clave}
                onClick={() => setTramo(tramo === t.clave ? null : t.clave)}
              />
            ))}
          </div>

          {filtrado.length === 0 ? (
            <div className="card">
              <Vacio
                icono="calendar"
                titulo={tramo ? "Nada en este tramo" : "Nada por vencer"}
                texto={
                  tramo
                    ? "Tocá el contador de nuevo para ver todos."
                    : "Ningún lote vence en los próximos 90 días. Los lotes se cargan al ingresar mercadería."
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <ul className="divide-y divide-borde-soft">
                {filtrado.map((l) => (
                  <Fila key={`${l.loteId}-${l.almacen.id}`} lote={l} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Contador({
  tramo: t,
  datos,
  activo,
  onClick,
}: {
  tramo: (typeof TRAMOS)[number];
  datos: ContadorTramo;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition-shadow hover:shadow-md ${
        activo ? "ring-2 ring-primary" : ""
      }`}
    >
      <p className={`text-3xl font-extrabold ${datos.lotes ? t.texto : "text-texto-4"}`}>
        {datos.lotes}
      </p>
      <p className="text-[13px] font-bold text-texto">{t.titulo}</p>
      <p className="text-xs text-texto-3">
        {datos.lotes ? fmtMoney(datos.valor) : t.ayuda}
      </p>
    </button>
  );
}

function Fila({ lote: l }: { lote: LotePorVencer }) {
  const t = TRAMOS.find((x) => x.clave === l.tramo) ?? TRAMOS[3];

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* La barra de color a la izquierda: deja leer la urgencia de la lista
          entera sin detenerse en cada fila. */}
      <span aria-hidden className={`h-10 w-1 shrink-0 rounded-full ${t.barra}`} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-texto">{l.producto.nombre}</p>
        <p className="truncate text-[13px] text-texto-3">
          Lote {l.codigo}
          {l.producto.laboratorio && ` · ${l.producto.laboratorio}`}
          {l.almacen && ` · ${l.almacen.nombre}`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-[13px] font-bold ${t.texto}`}>{textoVida(l.diasRestantes)}</p>
        <p className="text-xs text-texto-3">{fmtFecha(l.vencimiento ?? "")}</p>
      </div>

      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[13px] font-bold text-texto">{fmtMoney(l.valor)}</p>
        <p className="text-xs text-texto-3">{fmtNum(l.cantidad)} u.</p>
      </div>
    </li>
  );
}
