import { useMemo, type ReactNode } from "react";
import { esPositivo } from "../../../lib/dinero";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiReportes, type MeserosApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsEntero, bsResta } from "../formato";
import { BarraFila, Cargador, Chip, KpiR, Nota, Tarjeta } from "../ui";
import { filasMeseros, quienVendioMas, textoMinutos, type FilaMesero } from "./datosMeseros";

/**
 * Ventas por mesero: quién atendió el salón, cuánto vendió y qué anuló.
 *
 * No es otro total de plata: es la misma venta del salón mirada por quién la
 * atendió (el backend garantiza que lo vendido acá da igual a las ventas de
 * salón del período). Por eso no se suma con nada.
 *
 * Lo anulado va a nombre de quien lo sacó de la cuenta, no del mesero de la
 * mesa: el encargado que anula aparece con sus anulaciones y sin mesas, y la
 * pantalla lo marca así en vez de mostrarle "Bs 0 por mesa".
 */
export default function Meseros() {
  const { rango } = useReporte();
  const estado = useApi(() => apiReportes.meseros(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const filas = useMemo(() => (estado.datos ? filasMeseros(estado.datos) : []), [estado.datos]);

  useExportar(
    "ventas-por-mesero",
    filas.length
      ? () => [
          hoja<FilaMesero>(
            "Meseros",
            [
              ["Mesero", (f) => f.nombre],
              ["Mesas", (f) => f.mesas],
              ["Comensales", (f) => f.comensales],
              ["Vendido (Bs)", (f) => f.vendido],
              ["Por mesa (Bs)", (f) => f.ticket],
              ["Por comensal (Bs)", (f) => f.porComensal],
              ["Propinas (Bs)", (f) => f.propinas],
              ["Minutos promedio por mesa", (f) => f.minutos],
              ["Ítems anulados", (f) => f.itemsAnulados],
              ["Monto anulado (Bs)", (f) => f.montoAnulado],
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
        d.items.length === 0
          ? { titulo: "Sin ventas de salón en este período", texto: "Las mesas cobradas aparecen acá, con el mesero que las atendió.", icono: "users" }
          : null
      }
    >
      {(d) => <Contenido t={d.totales} filas={filas} />}
    </Cargador>
  );
}

function Contenido({ t, filas }: { t: MeserosApi["totales"]; filas: FilaMesero[] }) {
  const top = quienVendioMas(filas);
  const max = top[0]?.vendido ?? 0;
  // Los que atendieron mesas: sin quien sólo anuló (el encargado) ni la fila
  // "Sin mesero", que es venta de mesas viejas y no una persona.
  const atendieron = filas.filter((f) => !f.soloAnulo && !f.sinMesero).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiR
          etiqueta="Vendido en salón"
          valor={bsEntero(t.vendido)}
          tono="marca"
          pie={atendieron > 0 ? `${fmtNum(atendieron)} ${atendieron === 1 ? "mesero" : "meseros"}` : undefined}
        />
        {/* Los promedios del backend vienen en 0 cuando no hay con qué dividir:
            sin mesas no hay "Bs 0 por mesa", no se dice nada. */}
        <KpiR etiqueta="Mesas atendidas" valor={fmtNum(t.mesas)} pie={t.mesas > 0 ? `${bsEntero(t.ticketPromedio)} por mesa` : undefined} />
        <KpiR
          etiqueta="Comensales"
          valor={fmtNum(t.comensales)}
          pie={t.comensales > 0 ? `${bsEntero(t.porComensal)} por comensal` : "Sin comensales cargados"}
        />
        <KpiR etiqueta="Propinas" valor={bsEntero(t.propinas)} pie="Aparte: no están en lo vendido" />
      </div>

      {top.length > 0 && (
        <Tarjeta titulo="Quién vendió más" subtitulo={top.length < filas.filter((f) => esPositivo(f.vendido)).length ? "Los 10 que más vendieron" : "Lo vendido por cada mesero"}>
          <div className="space-y-2.5">
            {top.map((f) => (
              <BarraFila key={f.clave} etiqueta={f.nombre} valor={bsEntero(f.vendido)} fraccion={max > 0 ? f.vendido / max : 0} ancho="w-24 sm:w-32" />
            ))}
          </div>
        </Tarjeta>
      )}

      <TablaMeseros filas={filas} />

      <Nota>
        Las propinas van aparte: no están dentro de lo vendido. Lo anulado va a nombre de quien lo sacó de la cuenta, no
        del mesero de la mesa: por eso pueden aparecer el encargado o el cajero con anulaciones y sin mesas.
      </Nota>
    </>
  );
}

function Anulado({ f }: { f: FilaMesero }) {
  if (f.itemsAnulados === 0) return <span className="text-texto-4">—</span>;
  return (
    <span className="whitespace-nowrap text-rose-700">
      {fmtNum(f.itemsAnulados)} {f.itemsAnulados === 1 ? "ítem" : "ítems"} · {bsResta(f.montoAnulado)}
    </span>
  );
}

function TablaMeseros({ filas }: { filas: FilaMesero[] }) {
  const th = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
  const td = "px-3 py-3 tabular-nums";
  // Un cero de quien sólo anuló es real (no atendió mesas), pero no es lo que
  // se mira de esa fila: va apagado.
  const cero = (f: FilaMesero) => (f.soloAnulo ? "text-texto-4" : "text-texto-2");
  return (
    <Tarjeta titulo="Por mesero" subtitulo="Mesas, comensales, lo vendido y lo que anuló cada uno" cuerpo="">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Mesero</th>
              <th className={`${th} text-right`}>Mesas</th>
              <th className={`${th} text-right`}>Comensales</th>
              <th className={`${th} text-right`}>Vendido</th>
              <th className={`${th} text-right`}>Por mesa</th>
              <th className={`${th} text-right`}>Propinas</th>
              <th className={`${th} text-right`}>Duración por mesa</th>
              <th className={`${th} text-right`}>Anulado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {filas.map((f) => (
              <tr key={f.clave}>
                <td className="px-3 py-3">
                  <span className="font-bold text-texto">{f.nombre}</span>
                  {f.soloAnulo && (
                    <span className="ml-2 align-middle">
                      <Chip>Sólo anuló</Chip>
                    </span>
                  )}
                </td>
                <td className={`${td} text-right ${cero(f)}`}>{fmtNum(f.mesas)}</td>
                <td className={`${td} text-right ${cero(f)}`}>{fmtNum(f.comensales)}</td>
                <td className={`${td} whitespace-nowrap text-right font-extrabold ${f.soloAnulo ? "text-texto-4" : "text-texto"}`}>{fmtMoney(f.vendido)}</td>
                <td className={`${td} whitespace-nowrap text-right text-texto-2`}>{f.ticket == null ? "—" : fmtMoney(f.ticket)}</td>
                <td className={`${td} whitespace-nowrap text-right ${cero(f)}`}>{fmtMoney(f.propinas)}</td>
                <td className={`${td} whitespace-nowrap text-right text-texto-2`}>{f.minutos == null ? "—" : textoMinutos(f.minutos)}</td>
                <td className={`${td} text-right`}>
                  <Anulado f={f} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-borde-soft md:hidden">
        {filas.map((f) => (
          <li key={f.clave} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-[14px] font-bold text-texto">{f.nombre}</span>
                  {f.soloAnulo && <Chip>Sólo anuló</Chip>}
                </div>
                <p className="mt-0.5 text-[12px] text-texto-3">
                  {fmtNum(f.mesas)} {f.mesas === 1 ? "mesa" : "mesas"} · {fmtNum(f.comensales)} {f.comensales === 1 ? "comensal" : "comensales"}
                </p>
              </div>
              <p className={`shrink-0 text-[15px] font-extrabold tabular-nums ${f.soloAnulo ? "text-texto-4" : "text-texto"}`}>{fmtMoney(f.vendido)}</p>
            </div>
            <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
              <Dato etiqueta="Por mesa" valor={f.ticket == null ? "—" : bsEntero(f.ticket)} />
              <Dato etiqueta="Propinas" valor={bsEntero(f.propinas)} />
              <Dato etiqueta="Duración" valor={f.minutos == null ? "—" : textoMinutos(f.minutos)} />
            </dl>
            {f.itemsAnulados > 0 && (
              <p className="mt-2 text-[12px]">
                <span className="text-texto-3">Anuló </span>
                <Anulado f={f} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </Tarjeta>
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
