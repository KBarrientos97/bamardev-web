import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Boton, Cargando, ErrorMsg, Modal, Select, Vacio } from "../../../components/ui";
import { api, qs, request } from "../../../lib/api";
import { esPositivo } from "../../../lib/dinero";
import { fmtFecha, fmtMoney, fmtNum } from "../../../lib/format";
import { tzOffsetMin } from "../../../lib/rangoApi";
import { esFarmacia } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { EstadoDocumento, PaginaMeta, ReporteComprasGeneral, ReporteComprasMensual } from "../../../types";
import { apiReportes, fraccion } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsEntero, pct, plural } from "../formato";
import { Cargador, Chip, Delta, FilaLista, KpiR, Lista, Nota, Segmentos, Sigla } from "../ui";
import {
  aniosComprasMensual,
  armarComprasPorArticulo,
  filasComprasMensual,
  hojaComprasMensual,
  cantidadConUnidad,
  etiquetaOrigen,
  parteDe,
  resumenDocumentos,
  usaInsumos,
  type FilaCompra,
} from "./Compras.datos";
import { ListaRecortada } from "./ListaRecortada";

type Pestana = "articulos" | "documentos" | "mensual";

const PESTANAS = [
  ["articulos", "Por artículo"],
  ["documentos", "Documentos"],
  ["mensual", "Mensual"],
] as const;

/**
 * Compras: qué se compró y cuánto se gastó.
 *
 * Arriba lo que dice el financiero (lo comprado por artículo, con la variación
 * contra el período anterior); en "Documentos", las compras una por una, como
 * las tenía la pestaña Compras de Finanzas, con el detalle de cada una; en
 * "Mensual", los doce meses de un año (también venía de Finanzas, y no sigue
 * el período de arriba).
 *
 * La flecha del total va con el color dado vuelta: comprar más no es "bueno"
 * por sí solo, y un "+40 %" en verde se leía como una buena noticia.
 */
export default function Compras() {
  const [pestana, setPestana] = useState<Pestana>("articulos");
  // Cada pestaña registra su Excel: con una sola montada no se pisan.
  return (
    <>
      <div>
        <Segmentos valor={pestana} opciones={PESTANAS} onChange={setPestana} />
      </div>
      {pestana === "mensual" ? <Mensual /> : <DelPeriodo pestana={pestana} />}
    </>
  );
}

function DelPeriodo({ pestana }: { pestana: Exclude<Pestana, "mensual"> }) {
  const { rango, rangoAnterior, comparacion, veReporte } = useReporte();
  const { rubro, negocio } = useAuth();
  const estado = useApi(
    () => apiReportes.financiero(rango, rangoAnterior),
    [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta],
  );
  const d = estado.datos;
  const conInsumos = usaInsumos(rubro, negocio?.features);
  const almacen = esFarmacia(rubro) ? "Sucursal" : "Almacén";

  useExportar(
    "compras",
    d?.desglose.length
      ? () => [
          hoja<{ concepto: string; valor: number | null }>(
            "Resumen",
            [
              ["Concepto", (f) => f.concepto],
              ["Valor", (f) => f.valor],
            ],
            [
              { concepto: "Total comprado (Bs)", valor: d.compras.total },
              { concepto: "Productos de reventa (Bs)", valor: d.compras.productos },
              { concepto: "Insumos (Bs)", valor: d.compras.insumos },
              { concepto: "Compras (documentos)", valor: d.numCompras },
              { concepto: `Variación vs. ${comparacion.contra} (%)`, valor: d.comprasDeltaPct },
            ],
          ),
          hoja<FilaCompra>(
            "Por artículo",
            [
              ["Artículo", (f) => f.nombre],
              ["Tipo", (f) => (f.tipo === "INSUMO" ? "Insumo" : "Producto")],
              ["Cantidad", (f) => f.cantidad],
              ["Unidad", (f) => f.unidad || null],
              ["Costo unitario (Bs)", (f) => f.costoUnitario],
              ["Total (Bs)", (f) => f.total],
            ],
            armarComprasPorArticulo(d.desglose),
          ),
        ]
      : null,
  );

  return (
    <Cargador estado={estado}>
      {(x) => {
        // Los insumos se muestran si el negocio los usa o si igual se compró
        // alguno: una cifra en cero para un rubro que no los tiene es ruido.
        const verInsumos = conInsumos || esPositivo(x.compras.insumos);
        const parteProductos = parteDe(x.compras.productos, x.compras.total);
        const parteInsumos = parteDe(x.compras.insumos, x.compras.total);
        return (
          <>
            <div className={`grid gap-3 ${verInsumos ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <KpiR
                etiqueta="Total comprado"
                valor={fmtMoney(x.compras.total)}
                delta={<Delta fraccion={fraccion(x.comprasDeltaPct)} menosEsMejor />}
                pie={[x.comprasDeltaPct != null ? `vs. ${comparacion.contra}` : null, plural(x.numCompras, "compra", "compras")]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <KpiR
                etiqueta="Productos de reventa"
                valor={fmtMoney(x.compras.productos)}
                pie={parteProductos == null ? undefined : `${pct(parteProductos)} de lo comprado`}
              />
              {verInsumos && (
                <KpiR
                  etiqueta="Insumos"
                  valor={fmtMoney(x.compras.insumos)}
                  pie={parteInsumos == null ? undefined : `${pct(parteInsumos)} de lo comprado`}
                />
              )}
            </div>
            {pestana === "articulos" ? (
              <PorArticulo filas={armarComprasPorArticulo(x.desglose)} />
            ) : (
              <Documentos conFiltro={verInsumos} almacen={almacen} />
            )}
            <Nota>
              Lo que se compra no es lo mismo que lo que se vende: la ganancia se calcula con el costo de lo vendido, en{" "}
              {veReporte("resultado") ? (
                <Link to="/reportes/resultado" className="font-bold underline underline-offset-2">
                  Estado de resultado
                </Link>
              ) : (
                "Estado de resultado"
              )}
              .
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

// ── Mensual ─────────────────────────────────────────────────────────────────

/**
 * Los doce meses de un año, como los tenía Finanzas. No sigue el período de
 * arriba pero sí la sucursal: el mensual de un local no puede traer las
 * compras del negocio entero.
 *
 * El mes que más se compró va en ámbar y no en verde: comprar más no es una
 * buena noticia por sí sola.
 */
function Mensual() {
  const { rango } = useReporte();
  const [anio, setAnio] = useState<number | undefined>(undefined);
  const datos = useApi(
    () =>
      request<ReporteComprasMensual>(
        `/reportes/compras-mensual${qs({ anio, tzOffsetMin: tzOffsetMin(), sucursalId: rango.sucursalId })}`,
      ),
    [anio, rango.sucursalId],
  );
  const d = datos.datos;
  useExportar(
    d ? `compras-mensual-${d.anio}` : "compras-mensual",
    d && d.totales.compras > 0 ? () => [hojaComprasMensual(d)] : null,
  );

  return (
    <Cargador estado={datos}>
      {(x) => {
        const meses = filasComprasMensual(x);
        const mayor = x.totales.mayorMes;
        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-bold text-texto">Año de gestión</span>
                <div className="w-28">
                  <Select aria-label="Año de gestión" value={String(x.anio)} onChange={(e) => setAnio(Number(e.target.value))}>
                    {aniosComprasMensual(x).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {mayor && esPositivo(mayor.total) && (
                <p className="text-[12px] text-texto-3">
                  Mes de mayor gasto: <b className="text-texto">{mayor.nombre}</b> ({bsEntero(mayor.total)})
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiR etiqueta="Compras del año" valor={fmtNum(x.totales.compras)} />
              <KpiR etiqueta="Total del año" valor={fmtMoney(x.totales.total)} />
              <KpiR
                etiqueta="Promedio mensual"
                valor={x.totales.mesesConCompras > 0 ? fmtMoney(x.totales.promedioMensual) : "—"}
                pie={
                  x.totales.mesesConCompras > 0
                    ? `sobre ${plural(x.totales.mesesConCompras, "mes con compras", "meses con compras")}`
                    : undefined
                }
              />
            </div>
            <Lista>
              {meses.map((m) => {
                const futuro = m.estado === "FUTURO";
                const conCompras = m.estado === "CON_COMPRAS";
                return (
                  <FilaLista
                    key={m.mes}
                    inicio={<Sigla texto={m.sigla} apagado={!conCompras} />}
                    titulo={m.nombre}
                    chip={m.mayor ? <Chip tono="ambar">Mayor gasto</Chip> : undefined}
                    linea={futuro ? "Todavía no llegó" : plural(m.compras, "compra", "compras")}
                    // Un mes que no llegó no es un cero: no se pinta como uno.
                    valor={futuro ? "—" : fmtMoney(m.total)}
                    tonoValor={conCompras ? "normal" : "apagado"}
                    valorPie={futuro ? undefined : <Chip tono={conCompras ? "azul" : "gris"}>{conCompras ? "Con compras" : "Sin compras"}</Chip>}
                    barra={conCompras ? { fraccion: m.fraccion, tono: "azul" } : undefined}
                  />
                );
              })}
            </Lista>
            <Nota>
              El mensual no sigue el período de arriba: muestra el año elegido, con cada mes cortado en la hora del negocio.
              El promedio es sobre los meses con compras.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

function PorArticulo({ filas }: { filas: FilaCompra[] }) {
  if (filas.length === 0) {
    return (
      <div className="card">
        <Vacio icono="truck" titulo="No se compró nada en este período" texto="Probá con otro período." />
      </div>
    );
  }
  return (
    <ListaRecortada filas={filas} clave={(f, i) => `${f.tipo}-${f.nombre}-${i}`}>
      {(f) => {
        const insumo = f.tipo === "INSUMO";
        return (
          <FilaLista
            icono="cart"
            tono={insumo ? "verde" : "azul"}
            titulo={f.nombre}
            chip={<Chip tono={insumo ? "gris" : "azul"}>{insumo ? "Insumo" : "Producto"}</Chip>}
            barra={{ fraccion: f.fraccion, tono: insumo ? "marca" : "azul" }}
            valor={fmtMoney(f.total)}
            valorPie={cantidadConUnidad(f.cantidad, f.unidad)}
          />
        );
      }}
    </ListaRecortada>
  );
}

// ── Documentos ──────────────────────────────────────────────────────────────

const LIMITE = 50;

type Tipo = "" | "INSUMO" | "PRODUCTO";

const TIPOS: readonly (readonly [Tipo, string])[] = [
  ["", "Todo"],
  ["INSUMO", "Insumos"],
  ["PRODUCTO", "Productos"],
];

type DocumentoCompra = ReporteComprasGeneral["items"][number];

/** Las compras del período una por una, paginadas: un año de compras no entra en una pantalla. */
function Documentos({ conFiltro, almacen }: { conFiltro: boolean; almacen: string }) {
  const { rango } = useReporte();
  const [tipo, setTipo] = useState<Tipo>("");
  const [abierta, setAbierta] = useState<number | null>(null);
  // La página vuelve a la 1 al cambiar el período, el local o el filtro:
  // quedarse en la 7 de un resultado que ahora tiene 2 páginas mostraba un
  // vacío que confundía. Va derivada de la clave y no con un efecto, que
  // primero pedía la página vieja y después la 1.
  const clave = `${rango.desde}|${rango.hasta}|${rango.sucursalId ?? ""}|${tipo}`;
  const [paginaDe, setPaginaDe] = useState({ clave, pagina: 1 });
  const pagina = paginaDe.clave === clave ? paginaDe.pagina : 1;
  const estado = useApi(
    () => api.reporteCompras({ ...rango, ...(tipo ? { tipo } : {}), page: pagina, limite: LIMITE }),
    [clave, pagina],
  );

  return (
    <div className="space-y-3">
      {conFiltro && <FiltroTipo valor={tipo} onCambio={setTipo} />}
      <Cargador
        estado={estado}
        vacio={(d) =>
          d.items.length === 0
            ? { titulo: "Sin compras en este período", texto: tipo ? "Probá con otro filtro o período." : "Probá con otro período.", icono: "truck" }
            : null
        }
      >
        {(d) => (
          <>
            <p className="text-[12px] text-texto-3">{resumenDocumentos(d.totales)}</p>
            <TablaDocumentos items={d.items} almacen={almacen} onAbrir={setAbierta} />
            <ListaDocumentos items={d.items} onAbrir={setAbierta} />
            <Paginador pagina={d.pagina} onPagina={(p) => setPaginaDe({ clave, pagina: p })} />
          </>
        )}
      </Cargador>
      {abierta != null && <DetalleCompra id={abierta} almacen={almacen} onCerrar={() => setAbierta(null)} />}
    </div>
  );
}

function FiltroTipo({ valor, onCambio }: { valor: Tipo; onCambio: (t: Tipo) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
      {TIPOS.map(([k, nombre]) => (
        <button
          key={k || "todo"}
          type="button"
          onClick={() => onCambio(k)}
          aria-pressed={valor === k}
          className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            valor === k ? "bg-primary-50 text-primary-700" : "border border-borde bg-white text-texto-3 hover:bg-muted"
          }`}
        >
          {nombre}
        </button>
      ))}
    </div>
  );
}

function ChipEstado({ estado }: { estado: EstadoDocumento }) {
  if (estado === "ANULADO") return <Chip tono="rojo">Anulada</Chip>;
  if (estado === "PENDIENTE") return <Chip tono="gris">Pendiente</Chip>;
  return null;
}

/** Desde tablet: la tabla. En el celular va la lista de abajo (seis columnas no entran en 375 px). */
function TablaDocumentos({ items, almacen, onAbrir }: { items: DocumentoCompra[]; almacen: string; onAbrir: (id: number) => void }) {
  return (
    <div className="card hidden overflow-hidden md:block">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-borde-soft bg-muted/60 text-left text-[11px] font-bold uppercase tracking-wider text-texto-3">
            <th className="px-4 py-2.5">Comprobante</th>
            <th className="px-3 py-2.5">Fecha</th>
            <th className="px-3 py-2.5">{almacen}</th>
            <th className="px-3 py-2.5">Origen</th>
            <th className="px-3 py-2.5 text-right">Artículos</th>
            <th className="px-4 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde-soft">
          {items.map((c) => (
            <tr
              key={c.id}
              onClick={() => onAbrir(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAbrir(c.id);
              }}
              tabIndex={0}
              className="cursor-pointer transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <td className="px-4 py-2.5">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold text-texto">
                  {c.comprobante}
                  <ChipEstado estado={c.estado} />
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-texto-2">{fmtFecha(c.fecha)}</td>
              <td className="px-3 py-2.5 text-texto-2">{c.almacen || "—"}</td>
              <td className="px-3 py-2.5 text-texto-2">{etiquetaOrigen(c.origen)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-texto-2">{fmtNum(c.articulos)}</td>
              <td
                className={`whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums ${
                  c.estado === "ANULADO" ? "text-texto-4 line-through" : "text-texto"
                }`}
              >
                {fmtMoney(c.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaDocumentos({ items, onAbrir }: { items: DocumentoCompra[]; onAbrir: (id: number) => void }) {
  return (
    <div className="md:hidden">
      <Lista>
        {items.map((c) => (
          <FilaLista
            key={c.id}
            icono="fileText"
            tono="azul"
            titulo={c.comprobante}
            chip={<ChipEstado estado={c.estado} />}
            linea={`${fmtFecha(c.fecha)}${c.almacen ? ` · ${c.almacen}` : ""}`}
            linea2={`${etiquetaOrigen(c.origen)} · ${plural(c.articulos, "artículo", "artículos")}`}
            valor={fmtMoney(c.total)}
            tachado={c.estado === "ANULADO"}
            onClick={() => onAbrir(c.id)}
          />
        ))}
      </Lista>
    </div>
  );
}

function Paginador({ pagina, onPagina }: { pagina: PaginaMeta; onPagina: (p: number) => void }) {
  if (pagina.totalPaginas <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[12px] text-texto-3">
        {fmtNum(pagina.total)} en total · página {pagina.page} de {pagina.totalPaginas}
      </p>
      <div className="flex gap-2">
        <Boton variante="ghost" onClick={() => onPagina(pagina.page - 1)} disabled={pagina.page <= 1}>
          Anterior
        </Boton>
        <Boton variante="ghost" onClick={() => onPagina(pagina.page + 1)} disabled={pagina.page >= pagina.totalPaginas}>
          Siguiente
        </Boton>
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted px-3 py-2.5">
      <dt className="text-[12px] text-texto-3">{titulo}</dt>
      <dd className="truncate text-[13.5px] font-bold text-texto">{valor}</dd>
    </div>
  );
}

/** El documento entero de una compra: cuándo, dónde y qué líneas trajo. */
function DetalleCompra({ id, almacen, onCerrar }: { id: number; almacen: string; onCerrar: () => void }) {
  const estado = useApi(() => api.reporteCompra(id), [id]);
  const c = estado.datos;
  return (
    <Modal abierto titulo="Detalle de la compra" subtitulo={c?.comprobante} onClose={onCerrar}>
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !c ? (
        <Cargando texto="Abriendo la compra…" />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2">
            <Dato titulo="Fecha" valor={fmtFecha(c.fecha)} />
            <Dato titulo={almacen} valor={c.almacen || "—"} />
            <Dato titulo="Artículos" valor={fmtNum(c.articulos)} />
            <Dato titulo="Total" valor={fmtMoney(c.total)} />
          </dl>
          {c.estado !== "APROBADO" && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-texto-2">
              <ChipEstado estado={c.estado} />
              {c.estado === "ANULADO" ? "No suma a lo comprado: se anuló." : "Todavía no entró al depósito: no suma a lo comprado."}
            </p>
          )}
          {c.descripcion && <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">{c.descripcion}</p>}
          {c.items.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-texto-3">Esta compra no tiene líneas cargadas.</p>
          ) : (
            <ul className="divide-y divide-borde-soft overflow-hidden rounded-xl border border-borde">
              {c.items.map((l, i) => (
                <li key={`${l.producto}-${i}`} className="flex items-start gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-texto">{l.producto}</p>
                    <p className="text-[12px] text-texto-3">
                      {l.esInsumo ? "Insumo" : "Producto"} · {cantidadConUnidad(l.cantidad, l.unidad)} × {fmtMoney(l.costo)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[13.5px] font-bold tabular-nums text-texto">{fmtMoney(l.subtotal)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
