import { fmtMoney, fmtNum } from "../../../lib/format";
import { tieneFeature } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsCorto, pct } from "../formato";
import { Dona } from "../graficos";
import { Cargador, Delta, Nota, Tarjeta } from "../ui";
import { armarFilas } from "./MetodosPago.datos";

/**
 * Métodos de pago: cómo entró la plata del período.
 *
 * Lo fiado no es un pago (no hay `VentaPago` hasta que se cobra), así que el
 * backend no lo trae acá: sale del reporte de créditos —lo fiado en el
 * período— y va como una porción más, en ámbar, que es el color de la plata
 * que te deben. Si ese reporte no está (sin fiado en el plan) o falla, la dona
 * se arma sin esa porción: es un dato de más, no la base del reporte.
 */
export default function MetodosPago() {
  const { rango, rangoAnterior, comparacion } = useReporte();
  const { negocio } = useAuth();
  const conFiado = tieneFeature(negocio?.features, "fiado");
  const actual = useApi(() => apiReportes.metodosPago(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const previo = useApi(() => apiReportes.metodosPago(rangoAnterior), [rangoAnterior.desde, rangoAnterior.hasta, rangoAnterior.sucursalId]);
  const creditos = useApi(
    () => (conFiado ? apiReportes.creditos(rango) : Promise.resolve(null)),
    [conFiado, rango.desde, rango.hasta, rango.sucursalId],
  );
  const fiado = creditos.datos?.resumen.fiadoEnPeriodo ?? 0;
  const filas = actual.datos ? armarFilas(actual.datos, previo.datos, fiado) : [];

  useExportar(
    "metodos-de-pago",
    filas.length
      ? () => [
          hoja(
            "Métodos de pago",
            [
              ["Método", (f) => f.nombre],
              ["Monto (Bs)", (f) => f.monto],
              ["% del total", (f) => Math.round(f.fraccion * 1000) / 10],
              ["Cobros", (f) => f.cantidad ?? null],
              [`Monto ${comparacion.leyenda} (Bs)`, (f) => f.anterior ?? null],
            ],
            filas,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={actual}
      vacio={() => (filas.length === 0 ? { titulo: "Sin cobros en este período", texto: "Probá con otro período.", icono: "tarjetas" } : null)}
    >
      {() => {
        const total = filas.reduce((a, f) => a + f.monto, 0);
        return (
          <>
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
              <Tarjeta titulo="Distribución de cobros" subtitulo={`Total: ${fmtMoney(total)}`}>
                <div className="py-2">
                  <Dona
                    partes={filas.map((f) => ({ etiqueta: f.nombre, valor: f.monto, color: f.color }))}
                    centroTitulo="Total"
                    centroValor={bsCorto(total)}
                  />
                </div>
              </Tarjeta>
              <div className="space-y-4">
                <div className="card divide-y divide-borde-soft overflow-hidden">
                  {filas.map((f) => (
                    <div key={f.nombre} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                      <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: f.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-texto">{f.nombre}</p>
                        <p className="text-[12px] text-texto-3">
                          {f.esFiado
                            ? "Lo fiado en el período · por cobrar en Créditos"
                            : f.cantidad != null
                              ? `${fmtNum(f.cantidad)} ${f.cantidad === 1 ? "cobro" : "cobros"}`
                              : "Cobrado en el período"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-extrabold tabular-nums text-texto">{fmtMoney(f.monto)}</p>
                        <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[12px] text-texto-3">
                          <Delta fraccion={f.delta} />
                          <span>{pct(f.fraccion)} del total</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Nota>
                  Los pagos mixtos se reparten entre efectivo y QR según el monto real de cada parte: no hay una
                  categoría “Mixto” aparte. Las flechas comparan contra {comparacion.contra}.
                </Nota>
              </div>
            </div>
          </>
        );
      }}
    </Cargador>
  );
}
