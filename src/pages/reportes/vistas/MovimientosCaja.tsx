import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Boton, Vacio } from "../../../components/ui";
import { api } from "../../../lib/api";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFechaHora, fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import type { PaginaMeta } from "../../../types";
import { useExportar, useReporte } from "../contexto";
import { bsConSigno, bsResta, pct } from "../formato";
import { Cargador, FilaLista, KpiR, Lista, Segmentos } from "../ui";
import { aspectoMovimiento, hojaMovimientos, montoConSigno, netoDe, textoTurno } from "./MovimientosCaja.datos";

/**
 * Movimientos de caja: el efectivo que entró o salió del cajón SIN una venta
 * detrás —el sencillo, un retiro, un pago en efectivo— y los cobros de fiado
 * en efectivo. Reemplaza la pestaña de Finanzas.
 *
 * No es un libro de caja completo a propósito: las ventas están en Ventas.
 * Esto es lo que sólo se veía con el turno abierto y después no había dónde
 * consultar, y es lo que más descuadra un arqueo mirado a la ligera.
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
      vacio={(x) =>
        x.totales.movimientos === 0
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
        const neto = netoDe(t.neto);
        return (
          <>
            {/* Los totales son del período entero y de los dos sentidos aunque
                haya un filtro puesto: con "Salidas" escondiendo las entradas,
                el neto diría cualquier cosa. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiR etiqueta="Entradas" valor={<Apagado si={esCero(t.entradas)}>{fmtMoney(t.entradas)}</Apagado>} tono="marca" />
              {/* Lo que resta va con su signo y en rojo; en cero, gris. */}
              <KpiR etiqueta="Salidas" valor={<Apagado si={esCero(t.salidas)}>{bsResta(t.salidas)}</Apagado>} tono="alerta" />
              <KpiR
                etiqueta={neto.etiqueta}
                valor={<Apagado si={neto.tono === "apagado"}>{bsConSigno(t.neto)}</Apagado>}
                tono={neto.tono === "apagado" ? "normal" : neto.tono}
              />
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
            </div>
            <div ref={arriba} className="flex scroll-mt-4 flex-wrap items-center justify-between gap-3">
              <Segmentos valor={tipo} opciones={FILTROS} onChange={setTipo} />
              <p className="text-[12px] text-texto-3">
                {/* Con un filtro puesto se dice: si no, "Salidas" con un KPI de
                    entradas lleno parecía un error. */}
                {tipo
                  ? "Los totales de arriba son de los dos sentidos, aunque filtres."
                  : "Sencillo, retiros, pagos en efectivo y cobros de fiado"}
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
                        : "No hay movimientos en esta página."
                  }
                />
              </div>
            ) : (
              <Lista>
                {x.items.map((m) => {
                  const aspecto = aspectoMovimiento(m.clase);
                  return (
                    <FilaLista
                      // El id se repite entre clases: salen de dos tablas distintas.
                      key={`${m.clase}-${m.id}`}
                      icono={aspecto.icono}
                      tono={aspecto.tono}
                      titulo={m.concepto || aspecto.etiqueta}
                      linea={[aspecto.etiqueta, m.detalle].filter(Boolean).join(" · ")}
                      linea2={[fmtFechaHora(m.fecha), m.usuario, textoTurno(m.turnoId)].filter(Boolean).join(" · ")}
                      valor={bsConSigno(montoConSigno(m))}
                      tonoValor={aspecto.entra ? "marca" : "rojo"}
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
          </>
        );
      }}
    </Cargador>
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
