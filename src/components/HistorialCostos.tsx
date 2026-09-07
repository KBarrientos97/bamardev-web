import { api } from "../lib/api";
import { fmtFecha, fmtMoney, fmtNum } from "../lib/format";
import { useApi } from "../lib/useApi";
import { Icon } from "./Icon";
import { Cargando, ErrorMsg, Modal, Vacio } from "./ui";

/**
 * A cuánto llegó el artículo en cada compra, de la más nueva a la más vieja.
 *
 * Sirve para artículos e insumos: un insumo es un Producto con `esInsumo=true`
 * y comparten endpoint, así que también comparten esta pantalla — igual que
 * `HistorialCostosDialog` en la app.
 *
 * Responde la pregunta del dueño: "¿el pollo me está llegando más caro?".
 */
export default function HistorialCostos({
  productoId,
  nombre,
  onClose,
}: {
  productoId: number;
  nombre: string;
  onClose: () => void;
}) {
  const datos = useApi(() => api.historialCostos(productoId), [productoId]);
  const h = datos.datos;

  return (
    <Modal abierto titulo="Historial de costos" subtitulo={nombre} onClose={onClose}>
      <div className="space-y-4 p-4">
        <ErrorMsg>{datos.error}</ErrorMsg>

        {datos.cargando ? (
          <Cargando />
        ) : !h || h.compras.length === 0 ? (
          <Vacio
            icono="trendingDown"
            titulo="Sin compras registradas"
            texto="Cuando registres entradas de este artículo con su costo, vas a ver acá cómo cambió."
          />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi titulo="Costo actual" valor={fmtMoney(h.costoActual)} />
              <Kpi
                titulo="Promedio"
                valor={h.costoPromedio === null ? "—" : fmtMoney(h.costoPromedio)}
                // Ponderado por cantidad: un camión a Bs 10 pesa más que una
                // caja a Bs 30, y el promedio simple diría otra cosa.
                nota="Ponderado"
              />
              <Kpi
                titulo="Más barato"
                valor={h.costoMinimo === null ? "—" : fmtMoney(h.costoMinimo)}
              />
              <Kpi
                titulo="Más caro"
                valor={h.costoMaximo === null ? "—" : fmtMoney(h.costoMaximo)}
              />
            </dl>

            <ul className="space-y-2">
              {h.compras.map((c) => (
                <li
                  key={`${c.movimientoId}-${c.fecha}-${c.costoUnitario}`}
                  className="rounded-xl border border-borde p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[13px] font-bold text-texto">
                        {fmtMoney(c.costoUnitario)}
                        {h.unidad && (
                          <span className="font-normal text-texto-3">/ {h.unidad}</span>
                        )}
                        {c.esCostoActual && (
                          <span className="rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-bold text-primary-700">
                            Costo actual
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-texto-3">
                        {fmtFecha(c.fecha)}
                        {c.comprobante ? ` · ${c.comprobante}` : ""}
                        {c.almacen ? ` · ${c.almacen}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-texto-4">
                        {fmtNum(c.cantidad)} {h.unidad ?? "u"} · {fmtMoney(c.total)}
                      </p>
                    </div>

                    {/* Contra qué se compara: sin el costo anterior a la vista
                        había que buscar la fila de abajo para entender el %. */}
                    {c.variacion !== null && c.costoAnterior !== null && (
                      <div
                        className={`shrink-0 text-right text-xs font-bold ${
                          c.variacion > 0
                            ? "text-danger-text"
                            : c.variacion < 0
                              ? "text-primary-700"
                              : "text-texto-3"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <Icon
                            name={c.variacion > 0 ? "arrowUp" : "arrowDown"}
                            size={13}
                          />
                          {Math.abs(c.variacion).toFixed(1)}%
                        </span>
                        <span className="font-normal text-texto-4">
                          antes {fmtMoney(c.costoAnterior)}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2.5">
      <dt className="text-xs text-texto-3">{titulo}</dt>
      <dd className="text-[13px] font-bold text-texto">{valor}</dd>
      {nota && <dd className="text-[11px] text-texto-4">{nota}</dd>}
    </div>
  );
}
