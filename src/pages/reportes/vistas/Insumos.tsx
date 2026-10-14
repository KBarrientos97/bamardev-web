import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiReportes, fraccion } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { pct, plural } from "../formato";
import { Cargador, Delta, FilaLista, Nota, Tarjeta } from "../ui";
import { armarInsumos, lineaInsumo, proporcionSobreVentas, type CompraInsumo } from "./Insumos.datos";

/**
 * Insumos: lo que se gastó en comprar materia prima, y cuánto es de lo
 * vendido. Mismo rediseño que la app (12-oct, ea9b8ac): sin "Ganancia
 * estimada", que no era una ganancia, y con el camino a donde está la de
 * verdad (Estado de resultado).
 */
export default function Insumos() {
  const { rango, rangoAnterior, comparacion, veReporte } = useReporte();
  const estado = useApi(
    () => apiReportes.insumos(rango, rangoAnterior),
    [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta],
  );
  const d = estado.datos;

  useExportar(
    "insumos",
    d && (d.compras.length > 0 || esPositivo(d.invertido))
      ? () => {
          const proporcion = proporcionSobreVentas(d.invertido, d.ingresos);
          return [
            hoja<CompraInsumo>(
              "Compra por insumo",
              [
                ["Insumo", (c) => c.nombre],
                ["Cantidad", (c) => c.cantidad],
                ["Unidad", (c) => c.unidad || null],
                ["Costo unitario (Bs)", (c) => c.costoUnitario],
                ["Total (Bs)", (c) => c.total],
              ],
              armarInsumos(d.compras),
            ),
            // Sin la fila de "ganancia": la pantalla no la muestra porque no lo
            // es, y la planilla no puede decir otra cosa.
            hoja<{ concepto: string; valor: number | null }>(
              "Resumen",
              [
                ["Concepto", (f) => f.concepto],
                ["Valor", (f) => f.valor],
              ],
              [
                { concepto: "Comprado en insumos (Bs)", valor: d.invertido },
                { concepto: "Vendido en el período (Bs)", valor: d.ingresos },
                { concepto: "% de lo vendido", valor: proporcion == null ? null : Math.round(proporcion * 1000) / 10 },
                { concepto: "Compras (documentos)", valor: d.numCompras },
              ],
            ),
          ];
        }
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(x) =>
        x.compras.length === 0 && !esPositivo(x.invertido) && !esPositivo(x.ingresos)
          ? { titulo: "Sin compras de insumos en este período", texto: "Probá con otro período.", icono: "sack" }
          : null
      }
    >
      {(x) => {
        const proporcion = proporcionSobreVentas(x.invertido, x.ingresos);
        const filas = armarInsumos(x.compras);
        const delta = fraccion(x.invertidoDeltaPct);
        return (
          <>
            <section className="card p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">Lo que gastaste en comprar</p>
              {/* Sin "−" adelante: es lo que se pagó, no una resta de nada. */}
              <p className="mt-1 text-[28px] font-extrabold leading-tight tabular-nums text-texto sm:text-[32px]">
                {fmtMoney(x.invertido)}
              </p>
              {delta != null && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-texto-3">
                  {/* Color dado vuelta: acá gastar menos que antes es la buena noticia. */}
                  <Delta fraccion={delta} menosEsMejor />
                  <span>vs. {comparacion.contra}</span>
                </p>
              )}
              {proporcion == null ? (
                <p className="mt-4 text-[13px] text-texto-2">No hubo ventas en el período para comparar.</p>
              ) : (
                <>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(1, proporcion) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-[13px] text-texto-2">
                    Son el <b className="font-extrabold text-texto">{pct(proporcion)}</b> de lo que vendiste (
                    {/* Espacio que no se corta: "Bs" quedaba solo al final del renglón. */}
                    {fmtMoney(x.ingresos).replace(" ", " ")})
                  </p>
                </>
              )}
              <div className="mt-4 rounded-xl bg-muted px-3.5 py-3">
                <p className="text-[13px] text-texto-2">
                  Esto no es tu ganancia: es lo que pagaste por mercadería. Parte todavía está en tu stock.
                </p>
                {veReporte("resultado") && (
                  <Link
                    to="/reportes/resultado"
                    className="mt-1.5 inline-flex min-h-11 items-center gap-1 text-[13px] font-bold text-primary-700 hover:underline"
                  >
                    Ver cuánto te queda en Estado de resultado
                    <Icon name="chevronRight" size={15} />
                  </Link>
                )}
              </div>
            </section>

            <Tarjeta
              titulo="Compra por insumo"
              subtitulo={`${plural(x.numCompras, "compra", "compras")} en el período`}
              cuerpo=""
            >
              {filas.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-texto-3 sm:px-5">Sin compras registradas en este período</p>
              ) : (
                <div className="divide-y divide-borde-soft">
                  {filas.map((c, i) => (
                    <FilaLista
                      key={`${c.nombre}-${i}`}
                      titulo={c.nombre}
                      linea={lineaInsumo(c)}
                      barra={{ fraccion: c.fraccion }}
                      valor={fmtMoney(c.total)}
                    />
                  ))}
                </div>
              )}
            </Tarjeta>

            <Nota>
              Es lo efectivamente comprado en insumos en el período, no el costo de lo que vendiste. Si las compras crecen
              mucho más que las ventas, puede haber sobre-stock o merma.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}
