import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Buscador } from "../../../components/filtros";
import { Boton, Select, Vacio } from "../../../components/ui";
import { esPositivo } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsResta } from "../formato";
import { Cargador, Chip, FilaLista, Lista, Nota, Puesto, Segmentos } from "../ui";
import { ListaRecortada } from "./ListaRecortada";
import {
  armarTop,
  cuantosSinCosto,
  cuentaLoVisible,
  filasExportTop,
  filtrando,
  filtrarTop,
  fraccionTop,
  guardarOrdenTop,
  hojaTop,
  hojaTopVisible,
  leerOrdenTop,
  lineaTiempoMesa,
  lineaTop,
  pieTop,
  resumenTop,
  textoFiltro,
  totalesTop,
  valorTop,
  type FilaTop,
  type OrdenTop,
  type VistaTop,
} from "./TopProductos.datos";
import { palabraProductos } from "./vocabularioProductos";

const ORDENES = [
  ["vendidos", "Más vendidos"],
  ["rentables", "Más rentables"],
] as const;

/**
 * Las del restaurante, como la app: Ingresos, Ganancia y Unidades. "Más
 * vendidos" ordenaba por plata y se leía como cantidad, justo al lado de la
 * pestaña que sí cuenta (BUG-reportes-5): cada una dice lo que mide.
 */
const ORDENES_CONTEO = [
  ["vendidos", "Ingresos"],
  ["rentables", "Ganancia"],
  ["unidades", "Unidades"],
] as const;

/**
 * Top productos: qué se vende más y qué deja más.
 *
 * Los montos son BRUTOS (antes de promos), como los manda el backend: suman
 * más que lo cobrado y así lo dice la nota. En un billar, el tiempo de mesa va
 * en su propia fila, arriba y sin puesto: es un servicio sin costo, y metido
 * en el ranking ganaba "más rentables" por paliza y dejaba a los productos con
 * barras de un pixel.
 *
 * En el restaurante (REP-01, 28-oct) además se cuenta, como en la app: lo que
 * más se usa no es el podio sino "¿cuántos cuartos vendí este mes?". Por eso
 * lleva buscador (nombre y categoría, sin importar tildes), filtro por
 * categoría, la métrica Unidades, el total de lo que queda a la vista con el
 * filtro escrito al lado, y la métrica elegida se recuerda.
 */
export default function TopProductos() {
  const { rango, veReporte } = useReporte();
  const { rubro, negocio, usuario } = useAuth();
  const conConteo = cuentaLoVisible(rubro);
  const alias = negocio?.alias;
  const username = usuario?.username;
  // Se lee una vez al abrir: quien entra a contar, entra a contar siempre.
  const [orden, setOrden] = useState<OrdenTop>(() => (conConteo ? leerOrdenTop(alias, username) : "vendidos"));
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const estado = useApi(() => apiReportes.topProductos(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const datos = estado.datos;
  const top = useMemo(() => (datos ? armarTop(datos, orden, rubro) : null), [datos, orden, rubro]);
  const vista = useMemo(
    () => (top && conConteo ? filtrarTop(top.filas, busqueda, categoria) : null),
    [top, conConteo, busqueda, categoria],
  );
  const p = palabraProductos(rubro);
  const ordenes: readonly (readonly [OrdenTop, string])[] = conConteo ? ORDENES_CONTEO : ORDENES;
  const etiquetaDe = (o: OrdenTop) => ordenes.find(([k]) => k === o)?.[1] ?? "";

  function elegirOrden(o: OrdenTop) {
    setOrden(o);
    if (conConteo) guardarOrdenTop(alias, username, o);
  }

  useExportar(
    "top-productos",
    datos?.length
      ? () =>
          vista
            ? [hojaTopVisible(vista, etiquetaDe(orden))]
            : [
                hojaTop("Más vendidos", filasExportTop(armarTop(datos, "vendidos", rubro))),
                hojaTop("Más rentables", filasExportTop(armarTop(datos, "rentables", rubro))),
              ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) => (d.length === 0 ? { titulo: "Sin ventas en este período", texto: "Probá con otro período.", icono: "trendingUp" } : null)}
    >
      {() => {
        if (!top) return null;
        const sinCosto = cuantosSinCosto(top);
        const filas = vista ? vista.visibles : top.filas;
        return (
          <>
            <Segmentos valor={orden} opciones={ordenes} onChange={elegirOrden} />
            {vista && (
              <FiltrosTop
                vista={vista}
                busqueda={busqueda}
                onBusqueda={setBusqueda}
                onCategoria={setCategoria}
              />
            )}
            {/* Un total en cero se lee como un dato: sin nada que sumar, no va. */}
            {vista && vista.visibles.length > 0 && <TotalVisible vista={vista} orden={orden} />}
            {top.tiempoMesa && (
              <Lista>
                <FilaTiempoMesa fila={top.tiempoMesa} orden={orden} />
              </Lista>
            )}
            {filas.length > 0 ? (
              <ListaRecortada filas={filas} clave={(f, i) => `${f.nombre}-${f.categoria}-${i}`}>
                {(f, i) => <FilaRanking fila={f} puesto={i + 1} primero={filas[0]} orden={orden} />}
              </ListaRecortada>
            ) : vista && filtrando(vista) ? (
              // Dos vacíos que piden cosas opuestas: acá lo que falta es
              // soltar el filtro, no vender.
              <div className="card">
                <Vacio
                  icono="search"
                  titulo={`Ningún ${palabraProductos(rubro, false)} coincide`}
                  texto="Probá con otro nombre o elegí «Todas las categorías»."
                  accion={
                    <Boton
                      variante="soft"
                      onClick={() => {
                        setBusqueda("");
                        setCategoria(null);
                      }}
                    >
                      Ver todos
                    </Boton>
                  }
                />
              </div>
            ) : (
              <div className="card">
                <Vacio icono="box" titulo={`No se vendieron ${p} en este período`} texto="Sólo se cobró tiempo de mesa." />
              </div>
            )}
            <Nota>
              <p>
                Los montos son antes de promos y cupones: es lo vendido a precio de lista, así que puede dar más que lo
                cobrado.
              </p>
              {top.tiempoMesa && (
                <p className="mt-1.5">
                  {top.tiempoMesa.sinCosto
                    ? "El tiempo de mesa no tiene costo: entra entero como ganancia, por eso va aparte y no compite con los productos."
                    : "El tiempo de mesa va aparte: es un servicio y no compite con los productos."}{" "}
                  {veReporte("mesas") && (
                    <>
                      Lo que rinde cada mesa está en{" "}
                      <Link to="/reportes/mesas" className="font-bold underline underline-offset-2">
                        Rendimiento por mesa
                      </Link>
                      .
                    </>
                  )}
                </p>
              )}
              {sinCosto > 0 && (
                <p className="mt-1.5">
                  {sinCosto === 1 ? `Un ${palabraProductos(rubro, false)} no tiene` : `${sinCosto} ${p} no tienen`} costo cargado:
                  su ganancia es el precio entero y en “{etiquetaDe("rentables")}” aparece más arriba de lo que va.{" "}
                  {sinCosto === 1 ? "Cargale" : "Cargales"} el costo para que el ranking sea real.
                </p>
              )}
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

/**
 * El buscador y la categoría. La categoría en un desplegable y no en chips:
 * una carta tiene más categorías de las que entran en una fila, y con chips
 * la elegida quedaba fuera de la vista y la pantalla parecía sin filtrar.
 */
function FiltrosTop({
  vista,
  busqueda,
  onBusqueda,
  onCategoria,
}: {
  vista: VistaTop;
  busqueda: string;
  onBusqueda: (v: string) => void;
  onCategoria: (c: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[14rem] flex-1">
        <Buscador
          valor={busqueda}
          onChange={onBusqueda}
          placeholder="Buscar producto o categoría…"
          etiqueta="Buscar producto o categoría"
        />
      </div>
      <div className="w-full sm:w-60">
        <Select
          aria-label="Categoría"
          // La que de verdad está aplicada: una elegida que en este período no
          // vendió nada ya cayó en todas, y el desplegable lo dice.
          value={vista.categoria ?? ""}
          onChange={(e) => onCategoria(e.target.value || null)}
        >
          <option value="">Todas las categorías</option>
          {vista.categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/**
 * El total de lo que queda a la vista, con el filtro escrito al lado. Lo
 * segundo no es decoración: un total recortado por un filtro, sin decir por
 * cuál, se lee como el total del período entero.
 */
function TotalVisible({ vista, orden }: { vista: VistaTop; orden: OrdenTop }) {
  const r = resumenTop(totalesTop(vista.visibles), orden);
  return (
    <section className="card px-4 py-3.5 sm:px-5" aria-label="En lo que estás viendo">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-texto-3">En lo que estás viendo</p>
        {filtrando(vista) && <p className="min-w-0 break-words text-[12px] font-bold text-primary-700">{textoFiltro(vista)}</p>}
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-[24px] font-extrabold leading-tight tabular-nums ${r.perdida ? "text-rose-700" : "text-texto"}`}>
          {r.valor}
        </span>{" "}
        <span className={`text-[14px] font-bold ${r.perdida ? "text-rose-700" : "text-texto-3"}`}>{r.sufijo}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-texto-3">{r.detalle}</p>
    </section>
  );
}

/** Una fila del ranking: el puesto (los tres primeros resaltados), la barra contra el primero y el número de la métrica. */
function FilaRanking({ fila, puesto, primero, orden }: { fila: FilaTop; puesto: number; primero: FilaTop; orden: OrdenTop }) {
  const valor = valorTop(fila, orden);
  // Un artículo vendido por debajo de su costo: la pérdida va en rojo y con
  // su nombre, nunca como una "ganancia" negativa en negro.
  const perdida = orden !== "unidades" && esPositivo(-valor);
  return (
    <FilaLista
      inicio={<Puesto n={puesto} destacado={puesto <= 3} />}
      titulo={fila.nombre}
      linea={lineaTop(fila, orden)}
      barra={{ fraccion: fraccionTop(fila, primero, orden), tono: perdida ? "rosa" : "marca" }}
      // Las unidades con sus decimales si se vendió por peso, sin ",00".
      valor={orden === "unidades" ? fmtCantidad(valor) : perdida ? bsResta(valor) : fmtMoney(valor)}
      valorPie={pieTop(fila, orden)}
      tonoValor={perdida ? "rojo" : "normal"}
    />
  );
}

function FilaTiempoMesa({ fila, orden }: { fila: FilaTop; orden: OrdenTop }) {
  return (
    <FilaLista
      icono="cronometro"
      tono="verde"
      titulo="Tiempo de mesa"
      chip={<Chip>Servicio</Chip>}
      linea={lineaTiempoMesa(fila)}
      valor={fmtMoney(valorTop(fila, orden))}
      valorPie={orden === "vendidos" ? "ingreso" : "ganancia"}
    />
  );
}
