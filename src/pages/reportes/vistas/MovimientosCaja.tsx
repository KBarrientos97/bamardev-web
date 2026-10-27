import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Boton, Vacio } from "../../../components/ui";
import { api } from "../../../lib/api";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora, fmtMoney, fmtNum } from "../../../lib/format";
import { tieneFeature } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { PaginaMeta } from "../../../types";
import { useExportar, useReporte } from "../contexto";
import { bsConSigno, bsResta, pct, plural } from "../formato";
import { Cargador, Chip, FilaLista, KpiR, Lista, Segmentos, Tarjeta } from "../ui";
import {
  anuladosDelFiltro,
  aspectoMovimiento,
  efectoEnGanancia,
  filasPorMotivo,
  hojaMovimientos,
  montoConSigno,
  netoDe,
  TEXTO_EFECTO,
  textoTurno,
  tituloMovimiento,
  type AnuladoCaja,
  type EfectoEnGanancia,
  type FilaPorMotivo,
} from "./MovimientosCaja.datos";

/**
 * Movimientos de caja: el efectivo que entró o salió del cajón SIN una venta
 * detrás —el sencillo, un retiro, un pago en efectivo— y los cobros de fiado
 * en efectivo. Reemplaza la pestaña de Finanzas.
 *
 * No es un libro de caja completo a propósito: las ventas están en Ventas.
 * Esto es lo que sólo se veía con el turno abierto y después no había dónde
 * consultar, y es lo que más descuadra un arqueo mirado a la ligera.
 *
 * Billar (25-oct): lo que el administrador registra desde Supervisión trae su
 * motivo. Cada fila lo nombra y dice si resta de la ganancia; arriba va cuánto
 * quedó de cada motivo y abajo, plegados, los anulados (un anulado y su
 * anulación ya no inflan Entradas y Salidas: el backend los saca de la lista y
 * de los totales). Sin motivos, la pantalla es la de siempre.
 */

const LIMITE = 50;

const FILTROS = [
  ["", "Todo"],
  ["ENTRADA", "Entradas"],
  ["SALIDA", "Salidas"],
] as const;

type Filtro = (typeof FILTROS)[number][0];

export default function MovimientosCaja() {
  const { rango, veReporte } = useReporte();
  const { negocio } = useAuth();
  const conFiado = tieneFeature(negocio?.features, "fiado");
  const [tipo, setTipo] = useState<Filtro>("");
  // Al cambiar el período, el local o el filtro se vuelve a la página 1: la 7
  // de un resultado que ahora tiene 2 es un vacío que confunde. Derivado de la
  // clave y no con un efecto, que pedía primero la página vieja.
  const clave = `${rango.desde}|${rango.hasta}|${rango.sucursalId ?? ""}|${tipo}`;
  const [elegida, setElegida] = useState({ clave, page: 1 });
  const page = elegida.clave === clave ? elegida.page : 1;
  const arriba = useRef<HTMLDivElement>(null);

  const datos = useApi(
    () => api.reporteCaja({ ...rango, ...(tipo ? { tipo } : {}), page, limite: LIMITE }),
    [rango.desde, rango.hasta, rango.sucursalId, tipo, page],
  );
  const d = datos.datos;
  useExportar("movimientos-de-caja", d && d.items.length > 0 ? () => [hojaMovimientos(d.items, d.pagina, tipo)] : null);

  return (
    <Cargador
      estado={datos}
      // Con algo anulado no está vacío: quién registró y quién anuló es justo
      // lo que se viene a controlar, aunque el efectivo haya quedado igual.
      vacio={(x) =>
        x.totales.movimientos === 0 && !x.anulados?.length
          ? {
              titulo: "Sin movimientos de efectivo",
              texto: "En este período no entró ni salió efectivo sin una venta detrás.",
              icono: "dollar",
            }
          : null
      }
    >
      {(x) => {
        const t = x.totales;
        // Un negocio sin fiado (el billar, 17-oct) no ve un "Cobros de fiado"
        // en cero que no le dice nada; si hubo cobros de antes, se ven igual.
        const verFiado = conFiado || !esCero(t.cobrosCredito);
        const neto = netoDe(t.neto);
        const porMotivo = filasPorMotivo(x.porMotivo);
        const anulados = anuladosDelFiltro(x.anulados, tipo);
        return (
          <>
            {/* Los totales son del período entero y de los dos sentidos aunque
                haya un filtro puesto: con "Salidas" escondiendo las entradas,
                el neto diría cualquier cosa. */}
            <div className={`grid grid-cols-2 gap-3 ${verFiado ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
              <KpiR etiqueta="Entradas" valor={<Apagado si={esCero(t.entradas)}>{fmtMoney(t.entradas)}</Apagado>} tono="marca" />
              {/* Lo que resta va con su signo y en rojo; en cero, gris. */}
              <KpiR etiqueta="Salidas" valor={<Apagado si={esCero(t.salidas)}>{bsResta(t.salidas)}</Apagado>} tono="alerta" />
              <KpiR
                etiqueta={neto.etiqueta}
                valor={<Apagado si={neto.tono === "apagado"}>{bsConSigno(t.neto)}</Apagado>}
                tono={neto.tono === "apagado" ? "normal" : neto.tono}
              />
              {verFiado && (
                <KpiR
                  etiqueta="Cobros de fiado"
                  valor={<Apagado si={esCero(t.cobrosCredito)}>{fmtMoney(t.cobrosCredito)}</Apagado>}
                  pie={
                    esPositivo(t.cobrosCredito) ? (
                      <>
                        {esPositivo(t.entradas) && `${pct(t.cobrosCredito / t.entradas)} de las entradas`}
                        {/* Quién pagó y cuánto debe todavía está en Créditos: el
                            link sólo si ve ese reporte, si no lo devolvería al resumen. */}
                        {veReporte("creditos") && (
                          <>
                            {" · "}
                            <Link to="/reportes/creditos" className="font-semibold text-primary-700 hover:underline">
                              Ver créditos
                            </Link>
                          </>
                        )}
                      </>
                    ) : undefined
                  }
                />
              )}
            </div>
            {porMotivo.length > 0 && <PorMotivo filas={porMotivo} />}
            <div ref={arriba} className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3">
              <Segmentos valor={tipo} opciones={FILTROS} onChange={setTipo} />
              <p className="text-[12px] text-texto-3">
                {/* Con un filtro puesto se dice: si no, "Salidas" con un KPI de
                    entradas lleno parecía un error. */}
                {tipo
                  ? "Los totales de arriba son de los dos sentidos, aunque filtres."
                  : verFiado
                    ? "Sencillo, retiros, pagos en efectivo y cobros de fiado"
                    : "Sencillo, retiros y pagos en efectivo"}
              </p>
            </div>
            {x.items.length === 0 ? (
              <div className="card">
                <Vacio
                  icono="search"
                  titulo={tipo === "SALIDA" ? "Sin salidas" : tipo === "ENTRADA" ? "Sin entradas" : "Sin movimientos"}
                  texto={
                    tipo === "SALIDA"
                      ? "No salió efectivo del cajón en este período."
                      : tipo === "ENTRADA"
                        ? "No entró efectivo sin una venta en este período."
                        : t.movimientos === 0
                          ? "Lo que se registró en este período se anuló: está abajo, en Anulados."
                          : "No hay movimientos en esta página."
                  }
                />
              </div>
            ) : (
              <Lista>
                {x.items.map((m) => {
                  const aspecto = aspectoMovimiento(m.clase);
                  const efecto = efectoEnGanancia(m.origen);
                  // La cena con sus cubiertos, como en Supervisión y en el reporte de cenas.
                  const cena = m.origen === "CENA";
                  return (
                    <FilaLista
                      // El id se repite entre clases: salen de dos tablas distintas.
                      key={`${m.clase}-${m.id}`}
                      icono={cena ? "cubiertos" : aspecto.icono}
                      tono={cena ? "morado" : aspecto.tono}
                      titulo={tituloMovimiento(m)}
                      chip={efecto ? <ChipEfecto efecto={efecto} /> : undefined}
                      linea={[aspecto.etiqueta, m.detalle].filter(Boolean).join(" · ")}
                      linea2={[fmtFechaHora(m.fecha), m.usuario, textoTurno(m.turnoId)].filter(Boolean).join(" · ")}
                      valor={bsConSigno(montoConSigno(m))}
                      tonoValor={aspecto.entra ? "marca" : "rojo"}
                      // Con motivo (sólo el billar) el título lleva el detalle
                      // ("Pago a proveedor · Distribuidora…"): que no se corte.
                      ajustar={efecto != null}
                    />
                  );
                })}
              </Lista>
            )}
            <Paginador
              pagina={x.pagina}
              onPagina={(p) => {
                setElegida({ clave, page: p });
                arriba.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
              }}
            />
            {anulados.length > 0 && <Anulados anulados={anulados} />}
          </>
        );
      }}
    </Cargador>
  );
}

/** "Resta de la ganancia" en rojo, "No cambia la ganancia" en gris: sólo en lo que tiene motivo. */
function ChipEfecto({ efecto }: { efecto: EfectoEnGanancia }) {
  return <Chip tono={efecto === "resta" ? "rosa" : "gris"}>{TEXTO_EFECTO[efecto]}</Chip>;
}

/**
 * Billar: cuánto quedó de cada motivo en el período, sin lo anulado, y si
 * resta de la ganancia. Es lo que el dueño pregunta ("¿cuánto se fue en
 * cenas, en gastos, en proveedores?") y en la lista había que sumarlo a mano,
 * página por página. Como los totales de arriba, es del período entero aunque
 * haya un filtro puesto. Las tarjetas se acomodan al ancho de la columna, no al
 * de la pantalla: con el menú abierto una notebook deja mucho menos.
 */
function PorMotivo({ filas }: { filas: FilaPorMotivo[] }) {
  return (
    <Tarjeta titulo="Por motivo" subtitulo="Lo que se registró en Supervisión, sin lo anulado" cuerpo="p-3 sm:p-4">
      <div className="@container">
        <ul className="grid gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
          {filas.map((f) => (
            <li key={f.codigo} className="min-w-0 rounded-xl bg-slate-50 px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] font-bold text-texto">{f.etiqueta}</span>
                <span className={`shrink-0 text-[15px] font-extrabold tabular-nums ${f.monto < 0 ? "text-rose-700" : "text-primary-700"}`}>
                  {bsConSigno(f.monto)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-[12px] text-texto-3">{plural(f.cantidad, "vez", "veces")}</span>
                <ChipEfecto efecto={f.efecto} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Tarjeta>
  );
}

/**
 * Billar: los movimientos anulados del período, plegados. Un anulado y su
 * anulación no son plata que entró ni que salió, así que no están en la lista
 * ni en los totales; acá se ven tachados, con quién los anuló y cuándo. Antes
 * salían las dos filas sueltas ("Ingreso · Cena anulada · #812", con un id que
 * no se ve en ningún otro lado) y Entradas y Salidas se inflaban con plata que
 * nunca se movió.
 */
function Anulados({ anulados }: { anulados: AnuladoCaja[] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted sm:px-5"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-texto">Anulados ({anulados.length})</span>
          <span className="block text-[12px] text-texto-3">No suman en Entradas ni en Salidas: el efectivo quedó donde estaba.</span>
        </span>
        <Icon name="chevronDown" size={16} className={abierto ? "rotate-180" : ""} />
      </button>
      {abierto && (
        <div className="divide-y divide-borde-soft border-t border-borde-soft">
          {anulados.map((a) => (
            <FilaLista
              key={`anulado-${a.id}`}
              icono={a.origen === "CENA" ? "cubiertos" : aspectoMovimiento(a.clase).icono}
              tono="gris"
              titulo={<span className="line-through">{tituloMovimiento(a)}</span>}
              tachado
              ajustar
              linea={`${a.anuladoPor ? `Anuló ${a.anuladoPor}` : "Anulado"} · ${fmtFechaHora(a.anuladoEn)}`}
              linea2={[fmtFechaHora(a.fecha), a.usuario ? `Registró ${a.usuario}` : null, textoTurno(a.turnoId)].filter(Boolean).join(" · ")}
              valor={bsConSigno(montoConSigno(a))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Un cero en gris, encima del color del KPI: "Bs 0,00" en rojo se leía como una salida. */
function Apagado({ si, children }: { si: boolean; children: string }) {
  return si ? <span className="text-texto-4">{children}</span> : <>{children}</>;
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
