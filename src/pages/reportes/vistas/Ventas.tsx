import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Boton, Select, Vacio } from "../../../components/ui";
import { api, qs, request } from "../../../lib/api";
import { esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtFechaHora, fmtMoney, fmtNum } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { tzOffsetMin } from "../../../lib/rangoApi";
import { esBillar } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { PaginaMeta, ReporteVentasMensual } from "../../../types";
import { ModalDetalleVenta } from "../../billar/supervision/DetalleVenta";
import { useExportar, useReporte } from "../contexto";
import { bsEntero, plural } from "../formato";
import { Cargador, Chip, FichaIcono, FilaLista, KpiR, Lista, Nota, Segmentos, Sigla } from "../ui";
import {
  aniosDelSelector,
  aspectoMetodo,
  cantidadCorta,
  chipEstado,
  esTiempoDeMesa,
  filasMensual,
  hojaDetalle,
  hojaMensual,
  hojaVentas,
  lineaVenta,
  quienVendio,
  tituloLinea,
  variasSucursales,
  type ReporteDetalle,
  type ReporteVentas,
} from "./Ventas.datos";

/**
 * Ventas: el historial de lo vendido, en tres pestañas. Reemplaza la sección
 * Ventas de Finanzas.
 *
 * - **General**: una fila por venta, con las anuladas y las pendientes de
 *   cobro, porque el historial refleja lo que pasó. Los KPIs cuentan sólo las
 *   aprobadas (una anulada no es plata que entró) y son del período entero,
 *   no de la página.
 * - **Detallado**: una fila por línea vendida, en bruto (antes de promos).
 * - **Mensual**: los doce meses de un año. No sigue el período de arriba.
 *
 * General y Detallado vienen paginados de a 50: un año de ventas no entra en
 * una pantalla, y pedirlo entero colgaba el navegador de un celular barato.
 */

const LIMITE = 50;

type Pestana = "general" | "detallado" | "mensual";

const PESTANAS = [
  ["general", "General"],
  ["detallado", "Detallado"],
  ["mensual", "Mensual"],
] as const;

/** El cajero elegido en el filtro, con su nombre: si en otro período no vendió, el filtro lo sigue mostrando. */
interface Cajero {
  id: number;
  nombre: string;
}

export default function Ventas() {
  const [pestana, setPestana] = useState<Pestana>("general");
  // El cajero vale para General y Detallado: al pasar de una pestaña a la
  // otra se sigue mirando a la misma persona.
  const [cajero, setCajero] = useState<Cajero | null>(null);
  return (
    <>
      <div>
        <Segmentos valor={pestana} opciones={PESTANAS} onChange={setPestana} />
      </div>
      {pestana === "general" && <General cajero={cajero} onCajero={setCajero} />}
      {pestana === "detallado" && <Detallado cajero={cajero} onCajero={setCajero} />}
      {pestana === "mensual" && <Mensual />}
    </>
  );
}

/**
 * La página de una lista paginada. Al cambiar el período, el local o el
 * filtro se vuelve a la 1: quedarse en la 7 de un resultado que ahora tiene 2
 * muestra un vacío que confunde. Se deriva de la clave y no con un efecto,
 * que pedía primero la página vieja y después la buena.
 */
function usePagina(clave: string): [number, (p: number) => void] {
  const [elegida, setElegida] = useState({ clave, page: 1 });
  const page = elegida.clave === clave ? elegida.page : 1;
  return [page, (p: number) => setElegida({ clave, page: p })];
}

// ── General ─────────────────────────────────────────────────────────────────

function General({ cajero, onCajero }: { cajero: Cajero | null; onCajero: (c: Cajero | null) => void }) {
  const { rango } = useReporte();
  const { rubro, usuario } = useAuth();
  const enBillar = esBillar(rubro);
  // El detalle de una venta del billar (26-oct): el tiempo de mesa, los
  // productos y cómo se pagó, pago por pago. Lo da la ruta de Supervisión, que
  // es del administrador del billar: sin ese permiso la fila no se toca.
  const conDetalle = enBillar && tienePermiso(usuario, "billar.admin");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [page, irA] = usePagina(`${rango.desde}|${rango.hasta}|${rango.sucursalId ?? ""}|${cajero?.id ?? ""}`);
  const arriba = useRef<HTMLDivElement>(null);

  const datos = useApi(
    () =>
      api.reporteVentas({
        ...rango,
        ...(cajero ? { usuarioId: cajero.id } : {}),
        page,
        limite: LIMITE,
      }) as Promise<ReporteVentas>,
    [rango.desde, rango.hasta, rango.sucursalId, cajero?.id, page],
  );
  const d = datos.datos;
  useExportar("ventas-general", d && d.items.length > 0 ? () => [hojaVentas(d.items, d.pagina, enBillar)] : null);

  return (
    <>
      <Cargador
        estado={datos}
        vacio={(x) =>
          x.pagina.total === 0 && !cajero
            ? { titulo: "Sin ventas en este período", texto: "Probá con otro período.", icono: "fileText" }
            : null
        }
      >
        {(x) => {
          const varias = variasSucursales(x.items);
          const aparte = [
            x.totales.anuladas > 0 ? plural(x.totales.anuladas, "anulada", "anuladas") : null,
            x.totales.pendientes > 0 ? plural(x.totales.pendientes, "pendiente de cobro", "pendientes de cobro") : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiR etiqueta="Ventas" valor={fmtNum(x.totales.ventas)} />
                <KpiR etiqueta="Ingresos totales" valor={fmtMoney(x.totales.ingresos)} tono="marca" />
                {/* Sin ventas el promedio no existe: "—", no Bs 0. */}
                <KpiR etiqueta="Ticket promedio" valor={x.totales.ventas > 0 ? fmtMoney(x.totales.ticketPromedio) : "—"} />
              </div>
              <div ref={arriba} className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3">
                <FiltroCajero cajero={cajero} vendedores={x.vendedores} onCajero={onCajero} />
                {aparte && <p className="ml-auto text-[12px] text-texto-3">{aparte}</p>}
              </div>
              {x.items.length === 0 ? (
                <div className="card">
                  <Vacio
                    icono="search"
                    titulo="Sin ventas"
                    texto={cajero ? `${cajero.nombre} no vendió en este período.` : "No hay ventas en esta página."}
                  />
                </div>
              ) : (
                <Lista>
                  {x.items.map((v) => {
                    const aspecto = aspectoMetodo(v.metodoPago, v.estado);
                    const estado = chipEstado(v.estado);
                    return (
                      <FilaLista
                        key={v.id}
                        icono={aspecto.icono}
                        tono={aspecto.tono}
                        titulo={v.comprobante}
                        chip={<Chip tono={estado.tono}>{estado.texto}</Chip>}
                        linea={lineaVenta(v, enBillar)}
                        linea2={quienVendio(v, varias)}
                        valor={fmtMoney(v.total)}
                        // `articulos` son las líneas de la venta, no las unidades.
                        valorPie={plural(v.articulos, "artículo", "artículos")}
                        tachado={v.estado === "ANULADO"}
                        onClick={conDetalle ? () => setAbierta(v.id) : undefined}
                        // "Mixto (Efectivo Bs 80,00 + QR Bs 80,00)" es el dato: baja de
                        // renglón en vez de cortarse en el celular.
                        ajustar={enBillar && (v.partes?.length ?? 0) >= 2}
                      />
                    );
                  })}
                </Lista>
              )}
              <Paginador
                pagina={x.pagina}
                onPagina={(p) => {
                  irA(p);
                  arriba.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
                }}
              />
            </>
          );
        }}
      </Cargador>
      {/* Con clave: otra venta abierta con el diálogo a la vista arranca de cero. */}
      {abierta != null && <ModalDetalleVenta key={abierta} consulta={{ venta: abierta }} ahora={Date.now()} onClose={() => setAbierta(null)} />}
    </>
  );
}

// ── Detallado ───────────────────────────────────────────────────────────────

function Detallado({ cajero, onCajero }: { cajero: Cajero | null; onCajero: (c: Cajero | null) => void }) {
  const { rango, veReporte } = useReporte();
  const { rubro } = useAuth();
  const enBillar = esBillar(rubro);
  const [page, irA] = usePagina(`${rango.desde}|${rango.hasta}|${rango.sucursalId ?? ""}|${cajero?.id ?? ""}`);
  const arriba = useRef<HTMLDivElement>(null);

  const datos = useApi(
    () =>
      api.reporteVentasDetalle({
        ...rango,
        ...(cajero ? { usuarioId: cajero.id } : {}),
        page,
        limite: LIMITE,
      }) as Promise<ReporteDetalle>,
    [rango.desde, rango.hasta, rango.sucursalId, cajero?.id, page],
  );
  // El detallado no trae la lista de cajeros: sale del General, de a una venta
  // para que pese poco. Es un dato de más: si falla, no hay filtro y el
  // reporte se ve igual.
  const cajeros = useApi(
    () => api.reporteVentas({ ...rango, page: 1, limite: 1 }).then((r) => r.vendedores),
    [rango.desde, rango.hasta, rango.sucursalId],
  );
  const d = datos.datos;
  useExportar("ventas-detallado", d && d.items.length > 0 ? () => [hojaDetalle(d.items, d.pagina)] : null);

  return (
    <Cargador
      estado={datos}
      vacio={(x) =>
        x.pagina.total === 0 && !cajero
          ? { titulo: "No se vendió nada en este período", texto: "Probá con otro período.", icono: "box" }
          : null
      }
    >
      {(x) => {
        const varias = variasSucursales(x.items);
        const unidades = x.totales.productos;
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiR
                etiqueta="Productos vendidos"
                // Lo vendido por peso trae decimales: 12,5 kg no es "13", y
                // tampoco "12,50" (Kevin, 25-oct: sin ",00" en las cantidades).
                valor={fmtCantidad(unidades)}
                pie={`en ${plural(x.totales.lineas, "línea", "líneas")}`}
              />
              <KpiR etiqueta="Total recaudado" valor={fmtMoney(x.totales.recaudado)} tono="marca" />
              <KpiR etiqueta="Precio promedio" valor={esPositivo(unidades) ? fmtMoney(x.totales.precioPromedio) : "—"} />
            </div>
            <div ref={arriba} className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3">
              <FiltroCajero cajero={cajero} vendedores={cajeros.datos ?? []} onCajero={onCajero} />
              <p className="ml-auto text-[12px] text-texto-3">Sólo ventas aprobadas</p>
            </div>
            {x.items.length === 0 ? (
              <div className="card">
                <Vacio
                  icono="search"
                  titulo="Sin productos"
                  texto={cajero ? `${cajero.nombre} no vendió en este período.` : "No hay líneas en esta página."}
                />
              </div>
            ) : (
              <Lista>
                {x.items.map((l, i) => {
                  const tiempo = esTiempoDeMesa(l.producto, enBillar);
                  return (
                    <FilaLista
                      key={`${l.ventaId}-${l.producto}-${i}`}
                      inicio={tiempo ? <FichaIcono icono="clock" tono="verde" size={40} /> : <Cantidad n={l.cantidad} />}
                      titulo={tituloLinea(l)}
                      linea={[l.comprobante, fmtFechaHora(l.fecha), varias ? l.sucursal : null].filter(Boolean).join(" · ")}
                      linea2={l.codigo ? `Código ${l.codigo}` : undefined}
                      valor={fmtMoney(l.subtotal)}
                      // El tiempo es un renglón de cantidad 1 con el precio de lo
                      // jugado: "Bs 28 c/u" ahí no quiere decir nada.
                      valorPie={tiempo ? "tiempo" : `${fmtMoney(l.precio)} c/u`}
                    />
                  );
                })}
              </Lista>
            )}
            <Paginador
              pagina={x.pagina}
              onPagina={(p) => {
                irA(p);
                arriba.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
              }}
            />
            <Nota>
              Montos brutos, antes de promociones y cupones: por eso la suma puede pasar lo cobrado que muestra la pestaña
              General.
              {/* El link sólo si ve ese reporte: si no, lo devolvería al resumen. */}
              {veReporte("descuentos") && (
                <>
                  {" "}
                  Lo que restaron las promos está en{" "}
                  <Link to="/reportes/descuentos" className="font-semibold underline">
                    Descuentos y anulaciones
                  </Link>
                  .
                </>
              )}
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

/** "×2" en el lugar del ícono: cuántas se vendieron en esa línea. */
function Cantidad({ n }: { n: number }) {
  return (
    <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 px-1.5 text-[13px] font-extrabold tabular-nums text-primary-700">
      {cantidadCorta(n)}
    </span>
  );
}

// ── Mensual ─────────────────────────────────────────────────────────────────

function Mensual() {
  const { rango } = useReporte();
  const [anio, setAnio] = useState<number | undefined>(undefined);
  // Con la sucursal elegida arriba: `api.reporteVentasMensual` no la manda y
  // el mensual de un local salía con las ventas del negocio entero.
  const datos = useApi(
    () =>
      request<ReporteVentasMensual>(
        `/reportes/ventas-mensual${qs({ anio, tzOffsetMin: tzOffsetMin(), sucursalId: rango.sucursalId })}`,
      ),
    [anio, rango.sucursalId],
  );
  const d = datos.datos;
  useExportar(
    d ? `ventas-mensual-${d.anio}` : "ventas-mensual",
    d && d.totales.ventas > 0 ? () => [hojaMensual(d)] : null,
  );

  return (
    <Cargador estado={datos}>
      {(x) => {
        const meses = filasMensual(x);
        const mejor = x.totales.mejorMes;
        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-bold text-texto">Año de gestión</span>
                <div className="w-28">
                  <Select aria-label="Año de gestión" value={String(x.anio)} onChange={(e) => setAnio(Number(e.target.value))}>
                    {aniosDelSelector(x).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              {mejor && esPositivo(mejor.total) && (
                <p className="text-[12px] text-texto-3">
                  Mejor mes: <b className="text-texto">{mejor.nombre}</b> ({bsEntero(mejor.total)})
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiR etiqueta="Ventas del año" valor={fmtNum(x.totales.ventas)} />
              <KpiR etiqueta="Total del año" valor={fmtMoney(x.totales.total)} tono="marca" />
              <KpiR
                etiqueta="Promedio mensual"
                valor={x.totales.mesesConVentas > 0 ? fmtMoney(x.totales.promedioMensual) : "—"}
                pie={
                  x.totales.mesesConVentas > 0
                    ? `sobre ${plural(x.totales.mesesConVentas, "mes con ventas", "meses con ventas")}`
                    : undefined
                }
              />
            </div>
            <Lista>
              {meses.map((m) => {
                const futuro = m.estado === "FUTURO";
                const conVentas = m.estado === "CON_VENTAS";
                return (
                  <FilaLista
                    key={m.mes}
                    inicio={<Sigla texto={m.sigla} apagado={!conVentas} />}
                    titulo={m.nombre}
                    chip={m.mejor ? <Chip tono="verde">Mejor mes</Chip> : undefined}
                    linea={futuro ? "Todavía no llegó" : plural(m.ventas, "venta", "ventas")}
                    // Un mes que no llegó no es un cero: no se pinta como uno.
                    valor={futuro ? "—" : fmtMoney(m.total)}
                    tonoValor={conVentas ? "normal" : "apagado"}
                    valorPie={
                      futuro ? undefined : <Chip tono={conVentas ? "verde" : "gris"}>{conVentas ? "Con ventas" : "Sin ventas"}</Chip>
                    }
                    barra={conVentas ? { fraccion: m.fraccion } : undefined}
                  />
                );
              })}
            </Lista>
            <Nota>
              El mensual no sigue el período de arriba: muestra el año elegido, con cada mes cortado en la hora del negocio.
              El promedio es sobre los meses con ventas: un negocio que abrió en julio no tuvo seis meses malos.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function FiltroCajero({
  cajero,
  vendedores,
  onCajero,
}: {
  cajero: Cajero | null;
  vendedores: Cajero[];
  onCajero: (c: Cajero | null) => void;
}) {
  // Con un solo cajero no hay nada que filtrar. Si ya hay uno elegido se deja,
  // para poder volver a "Todos".
  if (vendedores.length <= 1 && !cajero) return null;
  // El elegido sigue en la lista aunque en este período no haya vendido: si
  // no, el desplegable mostraba "Todos" mientras filtraba por él.
  const opciones = cajero && !vendedores.some((v) => v.id === cajero.id) ? [...vendedores, cajero] : vendedores;
  return (
    <div className="w-full sm:w-64">
      <Select
        aria-label="Cajero"
        value={cajero ? String(cajero.id) : ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          onCajero(e.target.value ? (opciones.find((v) => v.id === id) ?? null) : null);
        }}
      >
        <option value="">Todos los cajeros</option>
        {opciones.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nombre}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Paginador({ pagina, onPagina }: { pagina: PaginaMeta; onPagina: (p: number) => void }) {
  if (pagina.totalPaginas <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12px] text-texto-3">
        {fmtNum(pagina.total)} en total · página {fmtNum(pagina.page)} de {fmtNum(pagina.totalPaginas)}
      </p>
      <div className="flex gap-2">
        <Boton variante="ghost" icono="chevronLeft" disabled={pagina.page <= 1} onClick={() => onPagina(pagina.page - 1)}>
          Anterior
        </Boton>
        <Boton variante="ghost" disabled={pagina.page >= pagina.totalPaginas} onClick={() => onPagina(pagina.page + 1)}>
          Siguiente
          <Icon name="chevronRight" size={17} />
        </Boton>
      </div>
    </nav>
  );
}
