import { useState } from "react";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { ArqueoDetalle } from "../CierresVista";
import { apiReportes, type CierreApi } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsConSigno, bsEntero, pct, plural } from "../formato";
import { Cargador, FilaLista, KpiR, Lista, Nota } from "../ui";
import { diferenciaDe, estadoDe, hojaCierres, resumenCierres, tituloCierre } from "./Cierres.datos";

/**
 * Cierres de caja: cada turno con lo que tenía que haber en el cajón, lo que
 * se contó y la diferencia. Tocar un turno abre su arqueo (el mismo de
 * siempre, `ArqueoDetalle`) y de ahí lo que se vendió: es lo primero que se
 * pregunta ante un faltante.
 *
 * La diferencia va con color y con nombre —cuadra, faltante en rojo, sobrante
 * en azul— en vez de un número con signo que hay que interpretar.
 */
export default function Cierres() {
  const { rango } = useReporte();
  const datos = useApi(() => apiReportes.cierres(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const [abierto, setAbierto] = useState<CierreApi | null>(null);
  const historial = datos.datos?.historial ?? [];
  useExportar("cierres-de-caja", historial.length > 0 ? () => [hojaCierres(historial)] : null);

  return (
    <>
      <Cargador
        estado={datos}
        vacio={(x) =>
          x.historial.length === 0 ? { titulo: "Sin cierres", texto: "No se cerró ninguna caja en este período.", icono: "lock" } : null
        }
      >
        {(x) => {
          const r = resumenCierres(x.historial);
          return (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiR etiqueta="Cierres" valor={fmtNum(r.cierres)} />
                <KpiR
                  etiqueta="Cuadraron"
                  valor={`${fmtNum(r.cuadraron)} de ${fmtNum(r.cierres)}`}
                  pie={pct(r.cierres > 0 ? r.cuadraron / r.cierres : null)}
                />
                <KpiR
                  etiqueta="Faltantes"
                  valor={<Diferencia monto={r.faltantes} />}
                  pie={r.conFaltante > 0 ? `en ${plural(r.conFaltante, "turno", "turnos")}` : "ninguno"}
                />
                <KpiR
                  etiqueta="Sobrantes"
                  valor={<Diferencia monto={r.sobrantes} />}
                  pie={r.conSobrante > 0 ? `en ${plural(r.conSobrante, "turno", "turnos")}` : "ninguno"}
                />
              </div>
              <Lista>
                {x.historial.map((c) => (
                  <FilaLista
                    key={c.id}
                    icono="fileText"
                    tono="verde"
                    titulo={
                      <>
                        {/* En el celular sin el año: entero no entra y se cortaba el turno. */}
                        <span className="sm:hidden">{tituloCierre(c, false)}</span>
                        <span className="hidden sm:inline">{tituloCierre(c)}</span>
                      </>
                    }
                    linea={`${c.cajero} · esperado ${fmtMoney(c.esperado)} · contado ${fmtMoney(c.conteo)}`}
                    valor={<Pildora diferencia={diferenciaDe(c)} />}
                    valorPie={`vendió ${bsEntero(c.totalDia)}`}
                    onClick={() => setAbierto(c)}
                  />
                ))}
              </Lista>
              <Nota>
                Un turno entra en el período en que se cerró y va a nombre de quien abrió la caja; el día que se muestra es el
                de la apertura (un turno de noche que cierra a las 3 sigue siendo de esa noche). La diferencia es lo contado
                menos lo esperado en el cajón: lo cobrado por QR o tarjeta no entra al cajón. Tocá un turno para ver su
                arqueo.
              </Nota>
            </>
          );
        }}
      </Cargador>
      {abierto && <ArqueoDetalle cierre={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

/** El total de faltantes o sobrantes. Sin ninguno, en gris: un "Bs 0,00" rojo se leía como un faltante. */
function Diferencia({ monto }: { monto: number }) {
  const estado = estadoDe(monto);
  const color = estado === "cuadra" ? "text-texto-4" : estado === "faltante" ? "text-rose-700" : "text-blue-700";
  return <span className={color}>{bsConSigno(monto)}</span>;
}

/**
 * Cuadra = verde, faltante = rojo, sobrante = azul: los mismos colores que el
 * arqueo y que la app. Sin mayúsculas forzadas en el monto ("−Bs 17,00", no
 * "−BS 17,00").
 */
function Pildora({ diferencia }: { diferencia: number }) {
  const estado = estadoDe(diferencia);
  if (estado === "cuadra") {
    return (
      <span className="inline-flex rounded-md bg-primary-50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-primary-700">
        Cuadra
      </span>
    );
  }
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums ${
        estado === "faltante" ? "bg-rose-100 text-rose-700" : "bg-blue-50 text-blue-700"
      }`}
    >
      {bsConSigno(diferencia)}
    </span>
  );
}
