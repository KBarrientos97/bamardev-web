import type { ReactNode } from "react";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiReportes } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsConSigno, bsEntero, plural } from "../formato";
import { BarraFila, Cargador, Nota, Tarjeta } from "../ui";
import { cajaDe, hojaCajeros, unirCajeros, type FilaCajero } from "./Cajeros.datos";

/**
 * Ventas por cajero: quién atendió, cuánto vendió, qué anuló y cómo le quedó
 * la caja.
 *
 * Junta dos reportes del backend: cierres (quién cobró y sus turnos) y
 * descuentos (anulaciones y promos de cada uno). Se cruzan por nombre porque
 * ninguno trae el id del usuario (ver `unirCajeros`).
 */
export default function Cajeros() {
  const { rango } = useReporte();
  // Las dos mitades juntas: si falla una, falla el reporte entero
  // (invariante 6). Sin las anulaciones, la tabla mostraría ceros que se leen
  // como "no anuló nada".
  const datos = useApi(
    () => Promise.all([apiReportes.cierres(rango), apiReportes.descuentos(rango)]),
    [rango.desde, rango.hasta, rango.sucursalId],
  );
  const filas = datos.datos ? unirCajeros(datos.datos[0], datos.datos[1]) : [];
  useExportar("ventas-por-cajero", filas.length > 0 ? () => [hojaCajeros(filas)] : null);

  return (
    <Cargador
      estado={datos}
      vacio={() =>
        filas.length === 0
          ? { titulo: "Nadie vendió en este período", texto: "No hay ventas, turnos ni anulaciones a nombre de nadie.", icono: "users" }
          : null
      }
    >
      {() => {
        const conVentas = filas.filter((f) => esPositivo(f.total));
        const max = Math.max(0, ...conVentas.map((f) => f.total));
        return (
          <>
            {conVentas.length > 0 && (
              <Tarjeta titulo="Quién vendió más">
                <div className="space-y-2.5">
                  {conVentas.map((f) => (
                    <BarraFila
                      key={f.clave}
                      etiqueta={f.cajero}
                      valor={bsEntero(f.total)}
                      fraccion={max > 0 ? f.total / max : 0}
                      ancho="w-28 sm:w-40"
                    />
                  ))}
                </div>
              </Tarjeta>
            )}

            {/* Ocho columnas no entran en un celular: tabla desde md, tarjetas debajo. */}
            <div className="card hidden overflow-hidden md:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-borde-soft bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-texto-3">
                    <th className="px-4 py-2.5 text-left">Cajero</th>
                    <th className="px-2 py-2.5 text-right">Turnos</th>
                    <th className="px-2 py-2.5 text-right">Ventas</th>
                    <th className="px-2 py-2.5 text-right">Total</th>
                    <th className="px-2 py-2.5 text-right">Ticket prom.</th>
                    <th className="px-2 py-2.5 text-right">Anulaciones</th>
                    <th className="px-2 py-2.5 text-right">Descuentos</th>
                    <th className="px-4 py-2.5 text-right">Caja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde-soft">
                  {filas.map((f) => (
                    <tr key={f.clave}>
                      <td className="px-4 py-3 font-semibold text-texto">{f.cajero}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-texto">{f.turnos > 0 ? fmtNum(f.turnos) : "—"}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-texto">{fmtNum(f.ventas)}</td>
                      <td className="px-2 py-3 text-right font-bold tabular-nums text-texto">{bsEntero(f.total)}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-texto">
                        {f.ticketPromedio != null ? bsEntero(f.ticketPromedio) : "—"}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Conteo n={f.anuladas} monto={f.anulado} />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Conteo n={f.tickets} monto={f.descuentos} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EstadoCaja f={f} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {filas.map((f) => (
                <TarjetaCajero key={f.clave} f={f} />
              ))}
            </div>

            <Nota>
              Ventas y total: lo que cobró cada uno en el período. Turnos y caja: las cajas que abrió y que se cerraron en el
              período; dice “cuadra” sólo si cuadraron todas. Las anulaciones y los descuentos (promos y cupones) van a nombre
              de quien vendió, no de quien anuló.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

/** Cuántas y, debajo, cuánta plata. Un cero va en gris. */
function Conteo({ n, monto }: { n: number; monto: number }) {
  if (n === 0 && esCero(monto)) return <span className="tabular-nums text-texto-4">0</span>;
  return (
    <>
      <span className="block tabular-nums text-texto">{fmtNum(n)}</span>
      <span className="block whitespace-nowrap text-[11.5px] tabular-nums text-texto-3">{fmtMoney(monto)}</span>
    </>
  );
}

/**
 * La caja de cada uno: CUADRA (verde) sólo si cuadraron todos sus turnos; si
 * no, la suma de sus diferencias, roja si faltó y azul si sobró. Diferencias
 * que se anulan entre sí no se pintan de verde: no cuadró.
 */
function EstadoCaja({ f }: { f: FilaCajero }) {
  const caja = cajaDe(f);
  const base = "inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums";
  switch (caja.tipo) {
    case "sinTurnos":
      return <span className="text-texto-4">—</span>;
    case "cuadra":
      return <span className={`${base} bg-primary-50 uppercase tracking-wide text-primary-700`}>Cuadra</span>;
    case "compensada":
      return (
        <span className={`${base} bg-slate-100 text-slate-600`} title="Hubo faltantes y sobrantes que se anulan entre sí">
          Se compensa
        </span>
      );
    case "diferencia":
      return (
        <span className={`${base} ${esPositivo(caja.monto) ? "bg-blue-50 text-blue-700" : "bg-rose-100 text-rose-700"}`}>
          {bsConSigno(caja.monto)}
        </span>
      );
  }
}

function TarjetaCajero({ f }: { f: FilaCajero }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-texto">{f.cajero}</p>
          <p className="text-[12px] text-texto-3">
            {plural(f.ventas, "venta", "ventas")} · {plural(f.turnos, "turno", "turnos")}
          </p>
        </div>
        <EstadoCaja f={f} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
        <Dato etiqueta="Total" valor={<b className="text-texto">{bsEntero(f.total)}</b>} />
        <Dato etiqueta="Ticket promedio" valor={f.ticketPromedio != null ? bsEntero(f.ticketPromedio) : "—"} />
        <Dato
          etiqueta="Anulaciones"
          valor={f.anuladas > 0 ? `${fmtNum(f.anuladas)} · ${fmtMoney(f.anulado)}` : <span className="text-texto-4">0</span>}
        />
        <Dato
          etiqueta="Descuentos"
          valor={f.tickets > 0 ? `${fmtNum(f.tickets)} · ${fmtMoney(f.descuentos)}` : <span className="text-texto-4">0</span>}
        />
      </dl>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-texto-3">{etiqueta}</dt>
      <dd className="truncate tabular-nums text-texto-2">{valor}</dd>
    </div>
  );
}
