import { useState } from "react";
import { fmtMoney } from "../../../../lib/format";
import { useApi } from "../../../../lib/useApi";
import { apiReportes, type CenasReporteApi } from "../../api";
import { hoja, useExportar, useReporte } from "../../contexto";
import { plural, variacion } from "../../formato";
import { BarrasVerticales } from "../../graficos";
import { aDia, diasDelMes, esMesEnCurso, mesDe } from "../../periodo";
import { Cargador, Chip, CifraClara, DeltaClaro, Destacado, FilaLista, KpiR, Lista, Nota, Tarjeta } from "../../ui";
import { barrasPorDia, etiquetaDia, nochesConCenaTexto, nochesSinCena, proyeccionDelMes } from "./Cenas.datos";
import { NotaSucursal } from "./NotaSucursal";

type Noche = CenasReporteApi["porNoche"][number];

/** Cuántas noches se ven de entrada; el resto, con "Ver más". */
const DE_ENTRADA = 8;

/**
 * Cenas del personal (24-oct): lo que sale de la caja del billar para la cena
 * de la cajera. El administrador la registra en Supervisión ("Cena") y cuenta
 * como un gasto del local, aparte de los sueldos. Acá se ve cuánto va, noche
 * por noche y por cajera, contra el período anterior.
 *
 * Una noche es una caja, de que la cajera la abre a que la cierra.
 */
export default function Cenas() {
  const { rango, rangoAnterior } = useReporte();
  const estado = useApi(
    () => apiReportes.cenas(rango, rangoAnterior),
    [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta],
  );
  const r = estado.datos;

  useExportar(
    "cenas-del-personal",
    r && r.total > 0
      ? () => [
          hoja<Noche>(
            "Por noche",
            [
              ["Noche", (n) => etiquetaDia(n.dia)],
              ["Cajera", (n) => n.cajera],
              ["La registró", (n) => n.registro],
              ["Cena (Bs)", (n) => n.monto],
              ["Caja", (n) => (n.abierta ? "Abierta" : "Cerrada")],
            ],
            r.porNoche,
          ),
          hoja<CenasReporteApi["porCajera"][number]>(
            "Por cajera",
            [
              ["Cajera", (c) => c.nombre],
              ["Noches con cena", (c) => c.noches],
              ["Cena (Bs)", (c) => c.monto],
            ],
            r.porCajera,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.total <= 0
          ? {
              titulo: "No se registró ninguna cena en este período",
              texto: "Las cenas se registran en Supervisión, con «Cena» o «Registrar movimiento de efectivo».",
              icono: "cubiertos",
            }
          : null
      }
    >
      {(d) => <Contenido r={d} />}
    </Cargador>
  );
}

function Contenido({ r }: { r: CenasReporteApi }) {
  const { periodo, comparacion, corteMin } = useReporte();
  const [todas, setTodas] = useState(false);
  const delta = r.anterior ? variacion(r.total, r.anterior.total) : null;
  // "A este ritmo": sólo con el mes en curso, que es cuando falta lo que predecir.
  const enCurso = esMesEnCurso(periodo, new Date(), corteMin ?? 0);
  const proyeccion = enCurso ? proyeccionDelMes(r.total, aDia(periodo.hasta).getDate(), diasDelMes(periodo)) : null;
  const barras = barrasPorDia(r);
  const mayor = r.porCajera[0]?.monto ?? 0;
  const sinCena = nochesSinCena(r);
  const visibles = todas ? r.porNoche : r.porNoche.slice(0, DE_ENTRADA);

  return (
    <div className="space-y-4">
      <NotaSucursal />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Destacado
          etiqueta="Gastado en cenas"
          valor={fmtMoney(r.total)}
          pie={
            <div className="grid grid-cols-3 gap-3">
              <CifraClara etiqueta="Noches con cena" valor={nochesConCenaTexto(r)} />
              <CifraClara etiqueta="Promedio por noche" valor={fmtMoney(r.promedio)} />
              <CifraClara etiqueta="La más alta" valor={fmtMoney(r.maxima)} />
            </div>
          }
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <DeltaClaro fraccion={delta} />
            {r.anterior && (
              <span>
                vs. {comparacion.contra}: {fmtMoney(r.anterior.total)}
              </span>
            )}
          </div>
          <p className="mt-2">Va aparte de los sueldos y de los gastos del local.</p>
        </Destacado>

        <div className="space-y-4">
          {proyeccion != null && (
            <KpiR
              etiqueta="A este ritmo"
              valor={fmtMoney(proyeccion)}
              pie={`es lo que costarían las cenas de ${mesDe(periodo)} entero`}
            />
          )}
          {r.porCajera.length > 0 && (
            <div className="space-y-2">
              <h3 className="px-1 text-[13px] font-bold text-texto">Por cajera</h3>
              <Lista>
                {r.porCajera.map((c) => (
                  <FilaLista
                    key={c.nombre}
                    icono="user"
                    tono="gris"
                    titulo={c.nombre}
                    linea={`${plural(c.noches, "noche", "noches")} con cena · ${fmtMoney(c.monto / c.noches)} en promedio`}
                    valor={fmtMoney(c.monto)}
                    barra={mayor > 0 ? { fraccion: c.monto / mayor, tono: "morado" } : undefined}
                  />
                ))}
              </Lista>
            </div>
          )}
        </div>
      </div>

      {barras.length > 0 && (
        <Tarjeta titulo="Cena por noche" subtitulo="Cada barra es un día. Donde no hay barra, no hubo cena.">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <BarrasVerticales barras={barras} formato={fmtMoney} />
            </div>
          </div>
        </Tarjeta>
      )}

      <Tarjeta
        titulo="Detalle por noche"
        subtitulo="Quién la dio y en qué caja salió la plata"
        extra={sinCena > 0 ? plural(sinCena, "noche sin cena", "noches sin cena") : undefined}
        cuerpo=""
      >
        <div className="divide-y divide-borde-soft">
          {visibles.map((n) => (
            <FilaLista
              key={n.cajaId}
              icono={n.monto > 0 ? "cubiertos" : "clock"}
              tono={n.monto > 0 ? "morado" : "gris"}
              titulo={`${etiquetaDia(n.dia)} · ${n.cajera}`}
              chip={n.abierta ? <Chip tono="morado">Caja abierta</Chip> : undefined}
              linea={n.monto > 0 ? `Lo registró ${n.registro}` : "Sin cena"}
              valor={n.monto > 0 ? fmtMoney(n.monto) : "—"}
              tonoValor={n.monto > 0 ? "normal" : "apagado"}
            />
          ))}
        </div>
        {r.porNoche.length > DE_ENTRADA && (
          <div className="border-t border-borde-soft p-3 text-center">
            <button type="button" onClick={() => setTodas((v) => !v)} className="text-[13px] font-bold text-primary-700 underline">
              {todas ? "Ver menos" : `Ver las ${r.porNoche.length} noches`}
            </button>
          </div>
        )}
      </Tarjeta>

      <Nota>
        <b>Cómo entra en tu ganancia:</b> la cena sale de la caja, así que cuenta como un gasto. Resta de lo que ganás y figura
        en su propia línea del Estado de resultado, separada de los sueldos y de los gastos del local. Si en un período no se
        registró ninguna cena, esa línea no aparece.
      </Nota>
    </div>
  );
}
