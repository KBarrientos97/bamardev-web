import { apiExtras, type RentabilidadServicios } from "../../../../lib/belleza/apiExtras";
import { fmtMoney, fmtNum } from "../../../../lib/format";
import { useApi } from "../../../../lib/useApi";
import { hoja, useExportar, useReporte } from "../../contexto";
import { Cargador, KpiR, Tarjeta } from "../../ui";

/**
 * Costo y margen por servicio (belleza, feature `consumo_servicio`): cuánto
 * deja cada servicio después de los insumos que gasta (el tinte, el oxidante).
 *
 * Antes era una pestaña de "Insumos por servicio", con sus propias fechas y
 * sin tope; ahora es un reporte más del grupo de la agenda y mira el período
 * de arriba (13-oct-2026: todos los reportes en un solo lugar). Lo ve quien
 * veía esa pestaña: el que arma las recetas (`consumo.recetas`).
 *
 * Sin `costos.ver` el backend no manda los costos (QA S2SEG-04): se ve una
 * raya, no un cero que haría creer que el servicio no gasta nada.
 */

type FilaServicio = RentabilidadServicios["servicios"][number];

const dinero = (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n));

const TH = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
const TD = "px-3 py-3 tabular-nums";

export default function MargenServicios() {
  const { periodo } = useReporte();
  // El backend lee días (`AAAA-MM-DD`, los dos extremos incluidos).
  const estado = useApi(
    () => apiExtras.rentabilidadServicios({ desde: periodo.desde, hasta: periodo.hasta }),
    [periodo.desde, periodo.hasta],
  );
  const filas = estado.datos?.servicios ?? [];

  useExportar(
    "costo-y-margen-por-servicio",
    filas.length
      ? () => [
          hoja<FilaServicio>(
            "Costo y margen",
            [
              ["Servicio", (s) => s.servicio],
              ["Cobrados", (s) => s.cantidad],
              ["Ingreso (Bs)", (s) => s.ingreso],
              ["Insumos (Bs)", (s) => s.costoInsumos],
              ["Costo por servicio (Bs)", (s) => s.costoPorServicio],
              ["Margen (Bs)", (s) => s.margen],
              ["Margen (%)", (s) => (s.margenPct == null ? null : Math.round(s.margenPct))],
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
        d.servicios.length === 0
          ? { titulo: "Sin servicios cobrados en este período", texto: "Cuando se cobre un servicio con receta, su costo y margen aparecen acá.", icono: "sack" }
          : null
      }
    >
      {(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiR etiqueta="Ingreso por servicios" valor={fmtMoney(d.ingreso)} tono="marca" />
            <KpiR etiqueta="Costo de insumos" valor={dinero(d.costoInsumos)} />
            <KpiR etiqueta="Margen" valor={dinero(d.margen)} />
          </div>
          <Tarjeta titulo="Por servicio" subtitulo="Lo cobrado, lo que gastó en insumos y lo que dejó" cuerpo="">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={TH}>Servicio</th>
                    <th className={`${TH} text-right`}>Cobrados</th>
                    <th className={`${TH} text-right`}>Ingreso</th>
                    <th className={`${TH} text-right`}>Insumos</th>
                    <th className={`${TH} text-right`}>Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde-soft">
                  {d.servicios.map((s) => (
                    <tr key={s.servicioId}>
                      <td className="px-3 py-3 font-bold text-texto">{s.servicio}</td>
                      <td className={`${TD} text-right text-texto-2`}>{fmtNum(s.cantidad)}</td>
                      <td className={`${TD} text-right text-texto-2`}>{fmtMoney(s.ingreso)}</td>
                      <td className={`${TD} text-right text-texto-2`}>
                        {dinero(s.costoInsumos)}
                        {s.costoPorServicio != null && (
                          <span className="block text-[11px] text-texto-4">{fmtMoney(s.costoPorServicio)} c/u</span>
                        )}
                      </td>
                      <td className={`${TD} text-right font-semibold text-texto`}>
                        {dinero(s.margen)}
                        <span className="block text-[11px] font-normal text-texto-4">
                          {s.margenPct == null ? "—" : `${Math.round(s.margenPct)}%`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </>
      )}
    </Cargador>
  );
}
