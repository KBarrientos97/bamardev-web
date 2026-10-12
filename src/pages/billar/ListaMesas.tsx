import { useState } from "react";
import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { horaDe } from "./calculo";
import { useAccionesMesa } from "./acciones";
import { ESTADOS } from "./estilos";
import { BotonB, EstadoBadge } from "./ui";
import type { VistaMesa } from "./vista";
import { cronoDe } from "./vista";

type Orden = { por: "crono" | "saldo"; asc: boolean } | null;

/**
 * La vista Lista del tablero (§7.1): una fila por mesa. Sólo en pantallas
 * anchas; en tablet y celular el tablero va en tarjetas (una tabla de once
 * columnas no entra).
 */
export default function ListaMesas({
  vistas,
  seleccionada,
  onSeleccionar,
}: {
  vistas: VistaMesa[];
  seleccionada: number | null;
  onSeleccionar: (id: number) => void;
}) {
  const accionesDe = useAccionesMesa();
  const [orden, setOrden] = useState<Orden>(null);

  const filas = [...vistas];
  if (orden) {
    const valor = (v: VistaMesa) =>
      orden.por === "saldo" ? (v.cuenta?.saldo ?? -1) : v.cuenta ? (v.cuenta.restante ?? v.cuenta.secs) : -1;
    filas.sort((a, b) => (orden.asc ? valor(a) - valor(b) : valor(b) - valor(a)));
  }

  const ordenar = (por: "crono" | "saldo") =>
    setOrden((o) => (o?.por === por ? (o.asc ? { por, asc: false } : null) : { por, asc: true }));

  const th = "px-2.5 py-3 text-[11px] font-bold uppercase tracking-wider text-texto-3";
  const flecha = (por: "crono" | "saldo") => (
    <Icon
      name={orden?.por === por ? (orden.asc ? "arrowUp" : "arrowDown") : "chevronDown"}
      size={12}
      className={orden?.por === por ? "text-texto" : "opacity-40"}
    />
  );

  return (
    // Con el panel abierto al costado no entran las once columnas: la tabla se
    // desliza dentro de su tarjeta en vez de aplastarse.
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[920px] whitespace-nowrap text-[13px]">
        <thead className="border-b border-borde">
          <tr className="text-left">
            <th className={`${th} pl-5`}>Mesa</th>
            <th className={th}>Tipo</th>
            <th className={th}>Estado</th>
            <th className={th}>Inicio</th>
            <th className={th}>
              <button type="button" onClick={() => ordenar("crono")} className="inline-flex items-center gap-1 uppercase">
                Cronómetro {flecha("crono")}
              </button>
            </th>
            <th className={`${th} text-right`}>Tiempo</th>
            <th className={`${th} text-right`}>Consumos</th>
            <th className={`${th} text-right`}>Total</th>
            {/* Pagado = total − saldo: en un monitor chico es la que sobra. */}
            <th className={`${th} hidden text-right 2xl:table-cell`}>Pagado</th>
            <th className={`${th} text-right`}>
              <button type="button" onClick={() => ordenar("saldo")} className="inline-flex items-center gap-1 uppercase">
                Saldo {flecha("saldo")}
              </button>
            </th>
            <th className={`${th} pr-5 text-right`}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((v) => {
            const c = v.cuenta;
            const a = accionesDe(v)[0];
            const apagada = v.estado === "fuera";
            const guion = <span className="text-texto-4">—</span>;
            return (
              <tr
                key={v.mesa.id}
                onClick={() => onSeleccionar(v.mesa.id)}
                className={`cursor-pointer border-b border-borde-soft last:border-0 ${
                  seleccionada === v.mesa.id ? "bg-primary-50/60" : "hover:bg-muted"
                } ${apagada ? "text-texto-4" : "text-texto"}`}
              >
                <td className="relative py-3.5 pl-5 pr-3 font-bold">
                  <span aria-hidden className={`absolute inset-y-1.5 left-0 w-1 rounded-r ${ESTADOS[v.estado].barra}`} />
                  Mesa {v.mesa.id}
                  {v.mesa.alias && <span className="block text-[11px] font-semibold text-texto-3">{v.mesa.alias}</span>}
                </td>
                <td className="px-3">{v.tipo.nombre}</td>
                <td className="px-3">
                  <EstadoBadge estado={v.estado} />
                </td>
                <td className="px-2.5 tabular-nums">
                  {v.mesa.sesion
                    ? horaDe(v.mesa.sesion.start)
                    : v.mesa.reserva
                      ? horaDe(v.mesa.reserva.hora)
                      : guion}
                </td>
                <td className={`px-2.5 font-bold tabular-nums ${ESTADOS[v.estado].crono}`}>
                  {c ? (c.restante !== null && c.restante > 0 ? `Quedan ${cronoDe(v)}` : cronoDe(v)) : guion}
                </td>
                <td className="px-2.5 text-right tabular-nums">{c ? fmtMoney(c.tiempoBs) : guion}</td>
                <td className="px-2.5 text-right tabular-nums">{c ? fmtMoney(c.consumosBs) : guion}</td>
                <td className="px-2.5 text-right font-bold tabular-nums text-primary-700">
                  {c ? fmtMoney(c.total) : guion}
                </td>
                <td className="hidden px-2.5 text-right tabular-nums 2xl:table-cell">{c ? fmtMoney(c.pagado) : guion}</td>
                <td className="px-2.5 text-right font-bold tabular-nums text-amber-800">
                  {c ? fmtMoney(c.saldo) : guion}
                </td>
                <td className="py-2 pl-3 pr-5 text-right">
                  {a && !apagada && (
                    <BotonB
                      variante={v.estado === "libre" ? "menta" : v.estado === "pausada" || v.estado === "vence" ? "ambar" : "blanco"}
                      icono={a.clave === "consumo" ? "plus" : undefined}
                      className="min-h-9 whitespace-nowrap px-3.5 text-[13px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        a.hacer();
                      }}
                    >
                      {a.clave === "consumo" ? "Consumo" : a.etiqueta}
                    </BotonB>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
