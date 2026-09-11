import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Badge, Boton, Cargando, ErrorMsg, Modal, Select, Vacio } from "../components/ui";
import { api } from "../lib/api";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../lib/format";
import { useApi } from "../lib/useApi";
import type {
  PaginaMeta,
  RangoReporte,
  ReporteCompraDocumento,
  ReporteComprasDetalle,
  ReporteComprasGeneral,
  ReporteComprasMensual,
  ReporteMovimientosCaja,
  ReporteVentasDetalle,
  ReporteVentasGeneral,
  ReporteVentasMensual,
} from "../types";

/**
 * Finanzas: el historial de lo que entró y lo que salió.
 *
 * Es la sección que la app tiene y la web no tenía: Ventas y Compras con sus
 * tres pestañas (general, detallado, mensual) y los movimientos de efectivo.
 * Cada listado es paginado — un año de ventas no entra en una pantalla.
 *
 * Una "compra" acá es un movimiento de inventario de ENTRADA: no hay tabla de
 * compras ni de proveedores, lo que entra al depósito ES el documento.
 */

type Seccion = "ventas" | "compras" | "caja";
type Pestana = "general" | "detalle" | "mensual";

const SECCIONES: { clave: Seccion; label: string; icono: "cart" | "truck" | "dollar" }[] = [
  { clave: "ventas", label: "Ventas", icono: "cart" },
  { clave: "compras", label: "Compras", icono: "truck" },
  { clave: "caja", label: "Movimientos de caja", icono: "dollar" },
];

const LIMITE = 50;

export default function Finanzas({ rango }: { rango: RangoReporte }) {
  const [seccion, setSeccion] = useState<Seccion>("ventas");
  const [pestana, setPestana] = useState<Pestana>("general");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SECCIONES.map((s) => (
          <button
            key={s.clave}
            onClick={() => {
              setSeccion(s.clave);
              setPestana("general");
            }}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              seccion === s.clave
                ? "bg-primary-boton text-white"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            <Icon name={s.icono} size={16} />
            {s.label}
          </button>
        ))}
      </div>

      {seccion !== "caja" && (
        <div className="flex gap-2">
          {(["general", "detalle", "mensual"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPestana(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                pestana === p
                  ? "bg-primary-50 text-primary-700"
                  : "text-texto-3 hover:bg-muted"
              }`}
            >
              {p === "general" ? "General" : p === "detalle" ? "Detallado" : "Mensual"}
            </button>
          ))}
        </div>
      )}

      {seccion === "ventas" && pestana === "general" && <VentasGeneral rango={rango} />}
      {seccion === "ventas" && pestana === "detalle" && <VentasDetalle rango={rango} />}
      {seccion === "ventas" && pestana === "mensual" && <VentasMensual />}
      {seccion === "compras" && pestana === "general" && <ComprasGeneral rango={rango} />}
      {seccion === "compras" && pestana === "detalle" && <ComprasDetalle rango={rango} />}
      {seccion === "compras" && pestana === "mensual" && <ComprasMensual />}
      {seccion === "caja" && <MovimientosCaja rango={rango} />}
    </div>
  );
}

// ── Ventas ──────────────────────────────────────────────────────────────────

function VentasGeneral({ rango }: { rango: RangoReporte }) {
  const [page, setPage] = useState(1);
  const [usuarioId, setUsuarioId] = useState("");

  // Volver a la página 1 al cambiar el rango o el vendedor: quedarse en la 7
  // de un resultado que ahora tiene 2 páginas muestra un vacío que confunde.
  useEffect(() => setPage(1), [rango.desde, rango.hasta, usuarioId]);

  const datos = useApi<ReporteVentasGeneral>(
    () =>
      api.reporteVentas({
        ...rango,
        ...(usuarioId ? { usuarioId: Number(usuarioId) } : {}),
        page,
        limite: LIMITE,
      }),
    [rango.desde, rango.hasta, usuarioId, page],
  );
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <Kpis
            items={[
              ["Ventas", fmtNum(d.totales.ventas)],
              ["Ingresos", fmtMoney(d.totales.ingresos)],
              ["Ticket promedio", fmtMoney(d.totales.ticketPromedio)],
              ["Anuladas", fmtNum(d.totales.anuladas)],
            ]}
          />

          {d.vendedores.length > 1 && (
            <Select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">Todos los vendedores</option>
              {d.vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Select>
          )}

          <Tabla
            columnas={["Comprobante", "Fecha", "Cliente", "Vendedor", "Pago", "Total"]}
            vacio="No hubo ventas en este período."
            filas={d.items.map((v) => ({
              key: v.id,
              celdas: [
                <span key="comp" className="flex items-center gap-1.5">
                  {v.comprobante}
                  {v.estado === "ANULADO" && <Badge tono="rojo">Anulada</Badge>}
                  {v.estado === "PENDIENTE" && <Badge tono="amarillo">Pendiente</Badge>}
                </span>,
                fmtFechaHora(v.fecha),
                v.cliente,
                v.vendedor,
                v.metodoPago,
                <span key="total" className={v.estado === "ANULADO" ? "text-texto-4 line-through" : ""}>
                  {fmtMoney(v.total)}
                </span>,
              ],
            }))}
          />
          <Paginador pagina={d.pagina} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

function VentasDetalle({ rango }: { rango: RangoReporte }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rango.desde, rango.hasta]);

  const datos = useApi<ReporteVentasDetalle>(
    () => api.reporteVentasDetalle({ ...rango, page, limite: LIMITE }),
    [rango.desde, rango.hasta, page],
  );
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <Kpis
            items={[
              ["Unidades", fmtNum(d.totales.productos, 2)],
              ["Recaudado", fmtMoney(d.totales.recaudado)],
              ["Precio promedio", fmtMoney(d.totales.precioPromedio)],
              ["Líneas", fmtNum(d.totales.lineas)],
            ]}
          />
          <Tabla
            columnas={["Producto", "Comprobante", "Fecha", "Cantidad", "Precio", "Subtotal"]}
            vacio="No se vendió nada en este período."
            filas={d.items.map((l, i) => ({
              key: `${l.ventaId}-${l.producto}-${i}`,
              celdas: [
                <span key="prod">
                  {l.producto}
                  {l.codigo && (
                    <span className="block text-xs text-texto-4">{l.codigo}</span>
                  )}
                </span>,
                l.comprobante,
                fmtFechaHora(l.fecha),
                fmtNum(l.cantidad, 2),
                fmtMoney(l.precio),
                fmtMoney(l.subtotal),
              ],
            }))}
          />
          <Paginador pagina={d.pagina} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

function VentasMensual() {
  const [anio, setAnio] = useState<number | undefined>(undefined);
  const datos = useApi<ReporteVentasMensual>(() => api.reporteVentasMensual(anio), [anio]);
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <SelectorAnio anios={d.anios} valor={d.anio} onCambio={setAnio} />
          <Kpis
            items={[
              ["Ventas del año", fmtNum(d.totales.ventas)],
              ["Total", fmtMoney(d.totales.total)],
              // Sobre los meses CON ventas, no dividido por 12: un negocio que
              // abrió en octubre no tuvo nueve meses malos.
              ["Promedio mensual", fmtMoney(d.totales.promedioMensual)],
              [
                "Mejor mes",
                d.totales.mejorMes
                  ? `${d.totales.mejorMes.nombre} · ${fmtMoney(d.totales.mejorMes.total)}`
                  : "—",
              ],
            ]}
          />
          <BarrasMes
            meses={d.meses.map((m) => ({
              nombre: m.nombre,
              cantidad: m.ventas,
              total: m.total,
              futuro: m.estado === "FUTURO",
            }))}
            etiquetaCantidad="ventas"
          />
        </>
      )}
    </Panel>
  );
}

// ── Compras ─────────────────────────────────────────────────────────────────

const TIPOS_COMPRA = [
  ["", "Todo"],
  ["INSUMO", "Insumos"],
  ["PRODUCTO", "Productos"],
] as const;

function ComprasGeneral({ rango }: { rango: RangoReporte }) {
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState("");
  const [verCompra, setVerCompra] = useState<number | null>(null);
  useEffect(() => setPage(1), [rango.desde, rango.hasta, tipo]);

  const datos = useApi<ReporteComprasGeneral>(
    () => api.reporteCompras({ ...rango, ...(tipo ? { tipo } : {}), page, limite: LIMITE }),
    [rango.desde, rango.hasta, tipo, page],
  );
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <Kpis
            items={[
              ["Compras", fmtNum(d.totales.compras)],
              ["Invertido", fmtMoney(d.totales.invertido)],
              ["Promedio", fmtMoney(d.totales.promedioCompra)],
              ["Anuladas", fmtNum(d.totales.anuladas)],
            ]}
          />
          <ChipsTipo valor={tipo} opciones={TIPOS_COMPRA} onCambio={setTipo} />
          <Tabla
            columnas={["Comprobante", "Fecha", "Almacén", "Origen", "Artículos", "Total"]}
            vacio="No hubo compras en este período."
            onFila={(key) => setVerCompra(Number(key))}
            filas={d.items.map((c) => ({
              key: c.id,
              celdas: [
                <span key="comp" className="flex items-center gap-1.5">
                  {c.comprobante}
                  {c.estado === "ANULADO" && <Badge tono="rojo">Anulada</Badge>}
                  {c.estado === "PENDIENTE" && <Badge tono="amarillo">Pendiente</Badge>}
                </span>,
                fmtFecha(c.fecha),
                c.almacen || "—",
                etiquetaOrigen(c.origen),
                fmtNum(c.articulos),
                fmtMoney(c.total),
              ],
            }))}
          />
          <Paginador pagina={d.pagina} onPage={setPage} />
        </>
      )}

      {verCompra !== null && (
        <DetalleCompra id={verCompra} onClose={() => setVerCompra(null)} />
      )}
    </Panel>
  );
}

function ComprasDetalle({ rango }: { rango: RangoReporte }) {
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState("");
  useEffect(() => setPage(1), [rango.desde, rango.hasta, tipo]);

  const datos = useApi<ReporteComprasDetalle>(
    () =>
      api.reporteComprasDetalle({
        ...rango,
        ...(tipo ? { tipo } : {}),
        page,
        limite: LIMITE,
      }),
    [rango.desde, rango.hasta, tipo, page],
  );
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <Kpis
            items={[
              ["Unidades", fmtNum(d.totales.articulos, 2)],
              ["Costo total", fmtMoney(d.totales.costoTotal)],
              ["Costo promedio", fmtMoney(d.totales.costoPromedio)],
              ["Líneas", fmtNum(d.totales.lineas)],
            ]}
          />
          <ChipsTipo valor={tipo} opciones={TIPOS_COMPRA} onCambio={setTipo} />
          <Tabla
            columnas={["Artículo", "Comprobante", "Fecha", "Cantidad", "Costo", "Subtotal"]}
            vacio="No se compró nada en este período."
            filas={d.items.map((l, i) => ({
              key: `${l.compraId}-${l.producto}-${i}`,
              celdas: [
                <span key="prod">
                  {l.producto}
                  <span className="block text-xs text-texto-4">
                    {l.esInsumo ? "Insumo" : "Producto"}
                    {l.unidad ? ` · ${l.unidad}` : ""}
                  </span>
                </span>,
                l.comprobante,
                fmtFecha(l.fecha),
                fmtNum(l.cantidad, 2),
                fmtMoney(l.costo),
                fmtMoney(l.subtotal),
              ],
            }))}
          />
          <Paginador pagina={d.pagina} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

function ComprasMensual() {
  const [anio, setAnio] = useState<number | undefined>(undefined);
  const datos = useApi<ReporteComprasMensual>(() => api.reporteComprasMensual(anio), [anio]);
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <SelectorAnio anios={d.anios} valor={d.anio} onCambio={setAnio} />
          <Kpis
            items={[
              ["Compras del año", fmtNum(d.totales.compras)],
              ["Total", fmtMoney(d.totales.total)],
              ["Promedio mensual", fmtMoney(d.totales.promedioMensual)],
              [
                "Mes de mayor gasto",
                d.totales.mayorMes
                  ? `${d.totales.mayorMes.nombre} · ${fmtMoney(d.totales.mayorMes.total)}`
                  : "—",
              ],
            ]}
          />
          <BarrasMes
            meses={d.meses.map((m) => ({
              nombre: m.nombre,
              cantidad: m.compras,
              total: m.total,
              futuro: m.estado === "FUTURO",
            }))}
            etiquetaCantidad="compras"
          />
        </>
      )}
    </Panel>
  );
}

function DetalleCompra({ id, onClose }: { id: number; onClose: () => void }) {
  const datos = useApi<ReporteCompraDocumento>(() => api.reporteCompra(id), [id]);
  const c = datos.datos;

  return (
    <Modal abierto titulo="Detalle de la compra" subtitulo={c?.comprobante} onClose={onClose}>
      <div className="space-y-3 p-4">
        <ErrorMsg>{datos.error}</ErrorMsg>
        {datos.cargando ? (
          <Cargando />
        ) : (
          c && (
            <>
              <Kpis
                items={[
                  ["Fecha", fmtFecha(c.fecha)],
                  ["Almacén", c.almacen || "—"],
                  ["Artículos", fmtNum(c.articulos)],
                  ["Total", fmtMoney(c.total)],
                ]}
              />
              {c.descripcion && (
                <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
                  {c.descripcion}
                </p>
              )}
              <Tabla
                columnas={["Artículo", "Cantidad", "Costo", "Subtotal"]}
                vacio="Esta compra no tiene líneas cargadas."
                filas={c.items.map((l, i) => ({
                  key: `${l.producto}-${i}`,
                  celdas: [
                    <span key="prod">
                      {l.producto}
                      <span className="block text-xs text-texto-4">
                        {l.esInsumo ? "Insumo" : "Producto"}
                        {l.unidad ? ` · ${l.unidad}` : ""}
                      </span>
                    </span>,
                    fmtNum(l.cantidad, 2),
                    fmtMoney(l.costo),
                    fmtMoney(l.subtotal),
                  ],
                }))}
              />
            </>
          )
        )}
      </div>
    </Modal>
  );
}

// ── Movimientos de caja ─────────────────────────────────────────────────────

const TIPOS_CAJA = [
  ["", "Todo"],
  ["ENTRADA", "Entradas"],
  ["SALIDA", "Salidas"],
] as const;

function MovimientosCaja({ rango }: { rango: RangoReporte }) {
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState("");
  useEffect(() => setPage(1), [rango.desde, rango.hasta, tipo]);

  const datos = useApi<ReporteMovimientosCaja>(
    () => api.reporteCaja({ ...rango, ...(tipo ? { tipo } : {}), page, limite: LIMITE }),
    [rango.desde, rango.hasta, tipo, page],
  );
  const d = datos.datos;

  return (
    <Panel estado={datos}>
      {d && (
        <>
          <Kpis
            items={[
              ["Entradas", fmtMoney(d.totales.entradas)],
              ["Salidas", fmtMoney(d.totales.salidas)],
              ["Neto", fmtMoney(d.totales.neto)],
              ["Cobros de fiado", fmtMoney(d.totales.cobrosCredito)],
            ]}
          />
          <p className="text-xs text-texto-4">
            El efectivo que se movió sin una venta detrás. Los totales son siempre de los
            dos sentidos, aunque haya un filtro puesto.
          </p>
          <ChipsTipo valor={tipo} opciones={TIPOS_CAJA} onCambio={setTipo} />
          <Tabla
            columnas={["Concepto", "Fecha", "Usuario", "Turno", "Monto"]}
            vacio="No hubo movimientos de efectivo en este período."
            filas={d.items.map((m) => ({
              // El id se repite entre clases: son dos tablas distintas.
              key: `${m.clase}-${m.id}`,
              celdas: [
                <span key="concepto">
                  {m.concepto || "—"}
                  <span className="block text-xs text-texto-4">
                    {m.clase === "COBRO_CREDITO" ? "Cobro de fiado" : m.clase === "INGRESO" ? "Ingreso" : "Egreso"}
                    {m.detalle ? ` · ${m.detalle}` : ""}
                  </span>
                </span>,
                fmtFechaHora(m.fecha),
                m.usuario ?? "—",
                `#${m.turnoId}`,
                <span
                  key="monto"
                  className={
                    m.clase === "EGRESO" ? "font-bold text-danger-text" : "font-bold text-primary-700"
                  }
                >
                  {m.clase === "EGRESO" ? "−" : "+"}
                  {fmtMoney(m.monto)}
                </span>,
              ],
            }))}
          />
          <Paginador pagina={d.pagina} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}

// ── Piezas compartidas ──────────────────────────────────────────────────────

function Panel({
  estado,
  children,
}: {
  estado: { cargando: boolean; error: string };
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <ErrorMsg>{estado.error}</ErrorMsg>
      {estado.cargando ? <Cargando /> : children}
    </div>
  );
}

function Kpis({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([titulo, valor]) => (
        <div key={titulo} className="rounded-xl bg-muted px-3 py-2.5">
          <dt className="text-xs text-texto-3">{titulo}</dt>
          <dd className="truncate text-[13px] font-bold text-texto">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function ChipsTipo({
  valor,
  opciones,
  onCambio,
}: {
  valor: string;
  opciones: readonly (readonly [string, string])[];
  onCambio: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {opciones.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onCambio(k)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
            valor === k ? "bg-primary-50 text-primary-700" : "text-texto-3 hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Tabla({
  columnas,
  filas,
  vacio,
  onFila,
}: {
  columnas: string[];
  filas: { key: string | number; celdas: React.ReactNode[] }[];
  vacio: string;
  onFila?: (key: string | number) => void;
}) {
  if (filas.length === 0) {
    return (
      <div className="card">
        <Vacio icono="search" titulo="Sin datos" texto={vacio} />
      </div>
    );
  }

  return (
    // Scroll propio: con seis columnas en un celular, el que se mueve es la
    // tabla y no la página entera.
    <div className="overflow-x-auto rounded-xl border border-borde">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="bg-muted text-left text-xs font-semibold text-texto-3">
            {columnas.map((c, i) => (
              <th key={c} className={`px-3.5 py-2 ${i >= columnas.length - 3 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde-soft bg-white">
          {filas.map((f) => (
            <tr
              key={f.key}
              onClick={onFila ? () => onFila(f.key) : undefined}
              className={onFila ? "cursor-pointer hover:bg-muted" : undefined}
            >
              {f.celdas.map((c, i) => (
                <td
                  key={i}
                  className={`px-3.5 py-2.5 text-texto ${
                    i >= columnas.length - 3 ? "text-right" : ""
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Paginador({ pagina, onPage }: { pagina: PaginaMeta; onPage: (p: number) => void }) {
  if (pagina.totalPaginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-texto-3">
        {fmtNum(pagina.total)} en total · página {pagina.page} de {pagina.totalPaginas}
      </p>
      <div className="flex gap-2">
        <Boton
          variante="ghost"
          onClick={() => onPage(pagina.page - 1)}
          disabled={pagina.page <= 1}
        >
          Anterior
        </Boton>
        <Boton
          variante="ghost"
          onClick={() => onPage(pagina.page + 1)}
          disabled={pagina.page >= pagina.totalPaginas}
        >
          Siguiente
        </Boton>
      </div>
    </div>
  );
}

function SelectorAnio({
  anios,
  valor,
  onCambio,
}: {
  anios: number[];
  valor: number;
  onCambio: (a: number) => void;
}) {
  return (
    <Select value={String(valor)} onChange={(e) => onCambio(Number(e.target.value))}>
      {anios.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </Select>
  );
}

/**
 * Los doce meses del año como barras. Un mes FUTURO se pinta distinto de un
 * cero real: todavía no pasó, no es que no se vendió.
 */
function BarrasMes({
  meses,
  etiquetaCantidad,
}: {
  meses: { nombre: string; cantidad: number; total: number; futuro: boolean }[];
  etiquetaCantidad: string;
}) {
  const max = useMemo(() => Math.max(...meses.map((m) => m.total), 1), [meses]);

  return (
    <ul className="space-y-1.5">
      {meses.map((m) => (
        <li key={m.nombre} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs font-semibold text-texto-2">{m.nombre}</span>
          <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
            {!m.futuro && m.total > 0 && (
              <div
                className="h-full rounded-md bg-primary"
                style={{ width: `${Math.max(2, (m.total / max) * 100)}%` }}
              />
            )}
          </div>
          <span className="w-32 shrink-0 text-right text-xs text-texto-3">
            {m.futuro ? (
              "—"
            ) : (
              <>
                <span className="font-bold text-texto">{fmtMoney(m.total)}</span>
                <span className="block text-texto-4">
                  {fmtNum(m.cantidad)} {etiquetaCantidad}
                </span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function etiquetaOrigen(o: ReporteComprasGeneral["items"][number]["origen"]): string {
  if (o === "INSUMO") return "Insumos";
  if (o === "PRODUCTO") return "Productos";
  if (o === "MIXTO") return "Mixta";
  return "Sin líneas";
}
