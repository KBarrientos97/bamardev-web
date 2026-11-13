import type { ReactNode } from "react";
import { fmtNum } from "../../../../lib/format";
import type { BillarPorSucursalApi, FilaBillarSucursal } from "../../api";
import { bsEntero, horas, pct } from "../../formato";
import { Chip, Tarjeta } from "../../ui";
import { ventaSinMesa } from "./datosBillar";

/**
 * El billar con «Todas las sucursales» (PLAN-SUCURSAL-TOTAL §9.6): cada local
 * con mesas, lado a lado, y el total. Es lo único del reporte de mesas que se
 * puede mirar de todo el negocio: el resto (mesa por mesa, el mapa de calor) es
 * de UN local y no se suma sin volverse ilegible. La ocupación del total es la
 * ponderada (horas jugadas sobre horas de mesa disponibles de todos los locales
 * juntos), no el promedio de los porcentajes.
 *
 * Desde tablet, una tabla; en el celular, una tarjeta por local.
 */
export function PorSucursalBillar({ p }: { p: BillarPorSucursalApi }) {
  const th = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
  const td = "whitespace-nowrap px-3 py-3 text-right tabular-nums";
  return (
    <Tarjeta titulo="Por sucursal" subtitulo="Los locales con mesas, juntos y por separado" cuerpo="">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Sucursal</th>
              <th className={`${th} text-right`}>Mesas</th>
              <th className={`${th} text-right`}>Horas</th>
              <th className={`${th} text-right`}>Ocupación</th>
              <th className={`${th} text-right`}>Tiempo</th>
              <th className={`${th} text-right`}>Consumos</th>
              <th className={`${th} text-right`}>Sin mesa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {p.filas.map((f) => (
              <tr key={f.sucursal.id}>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap items-center gap-1.5 font-bold text-texto">
                    {f.sucursal.nombre}
                    {f.esPrincipal && <Chip>Principal</Chip>}
                  </span>
                </td>
                <Celdas f={f} td={td} />
              </tr>
            ))}
            <tr className="bg-slate-50 font-extrabold">
              <td className="px-3 py-3 text-texto">Total</td>
              <Celdas f={p.total} td={td} />
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-borde-soft md:hidden">
        {[...p.filas, null].map((f) => {
          const fila = f ?? p.total;
          return (
            <li key={f ? f.sucursal.id : "total"} className={`px-4 py-3.5 ${f ? "" : "bg-slate-50"}`}>
              <div className="flex items-start gap-3">
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-bold text-texto">
                  {f ? f.sucursal.nombre : "Total"}
                  {f?.esPrincipal && <Chip>Principal</Chip>}
                </p>
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-extrabold tabular-nums text-texto">{pct(fila.ocupacion)}</p>
                  <p className="text-[11px] text-texto-3">ocupación</p>
                </div>
              </div>
              <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
                <Dato etiqueta="Mesas" valor={fmtNum(fila.mesas)} />
                <Dato etiqueta="Horas" valor={horas(fila.horas)} />
                <Dato etiqueta="Tiempo" valor={bsEntero(fila.tiempoBs)} />
                <Dato etiqueta="Consumos" valor={bsEntero(fila.consumosBs)} />
                <Dato etiqueta="Sin mesa" valor={bsEntero(ventaSinMesa(fila))} />
              </dl>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

function Celdas({ f, td }: { f: Omit<FilaBillarSucursal, "sucursal" | "esPrincipal">; td: string }) {
  return (
    <>
      <td className={td}>{fmtNum(f.mesas)}</td>
      <td className={td}>{horas(f.horas)}</td>
      <td className={td}>{pct(f.ocupacion)}</td>
      <td className={td}>{bsEntero(f.tiempoBs)}</td>
      <td className={td}>{bsEntero(f.consumosBs)}</td>
      <td className={td}>{bsEntero(ventaSinMesa(f))}</td>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10.5px] font-bold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="truncate text-[13px] font-semibold tabular-nums text-texto-2">{valor}</dd>
    </div>
  );
}
