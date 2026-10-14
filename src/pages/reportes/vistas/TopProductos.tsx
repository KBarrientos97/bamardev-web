import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Vacio } from "../../../components/ui";
import { esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsResta } from "../formato";
import { Cargador, Chip, FilaLista, Lista, Nota, Puesto, Segmentos } from "../ui";
import { ListaRecortada } from "./ListaRecortada";
import {
  armarTop,
  cuantosSinCosto,
  filasExportTop,
  fraccionTop,
  lineaTiempoMesa,
  lineaTop,
  valorTop,
  type FilaExportTop,
  type FilaTop,
  type OrdenTop,
} from "./TopProductos.datos";
import { palabraProductos } from "./vocabularioProductos";

const ORDENES = [
  ["vendidos", "Más vendidos"],
  ["rentables", "Más rentables"],
] as const;

/**
 * Top productos: qué se vende más y qué deja más.
 *
 * Los montos son BRUTOS (antes de promos), como los manda el backend: suman
 * más que lo cobrado y así lo dice la nota. En un billar, el tiempo de mesa va
 * en su propia fila, arriba y sin puesto: es un servicio sin costo, y metido
 * en el ranking ganaba "más rentables" por paliza y dejaba a los productos con
 * barras de un pixel.
 */
export default function TopProductos() {
  const { rango, veReporte } = useReporte();
  const { rubro } = useAuth();
  const [orden, setOrden] = useState<OrdenTop>("vendidos");
  const estado = useApi(() => apiReportes.topProductos(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const datos = estado.datos;
  const top = useMemo(() => (datos ? armarTop(datos, orden, rubro) : null), [datos, orden, rubro]);
  const p = palabraProductos(rubro);

  useExportar(
    "top-productos",
    datos?.length
      ? () => [
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
        return (
          <>
            <Segmentos valor={orden} opciones={ORDENES} onChange={setOrden} />
            {top.tiempoMesa && (
              <Lista>
                <FilaTiempoMesa fila={top.tiempoMesa} orden={orden} />
              </Lista>
            )}
            {top.filas.length > 0 ? (
              <ListaRecortada filas={top.filas} clave={(f, i) => `${f.nombre}-${f.categoria}-${i}`}>
                {(f, i) => <FilaRanking fila={f} puesto={i + 1} primero={top.filas[0]} orden={orden} />}
              </ListaRecortada>
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
                  su ganancia es el precio entero y en “Más rentables” aparece más arriba de lo que va.{" "}
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

/** Una fila del ranking: el puesto (los tres primeros resaltados), la barra contra el primero y el monto. */
function FilaRanking({ fila, puesto, primero, orden }: { fila: FilaTop; puesto: number; primero: FilaTop; orden: OrdenTop }) {
  const valor = valorTop(fila, orden);
  // Un artículo vendido por debajo de su costo: la pérdida va en rojo y con
  // su nombre, nunca como una "ganancia" negativa en negro.
  const perdida = esPositivo(-valor);
  return (
    <FilaLista
      inicio={<Puesto n={puesto} destacado={puesto <= 3} />}
      titulo={fila.nombre}
      linea={lineaTop(fila)}
      barra={{ fraccion: fraccionTop(fila, primero, orden), tono: perdida ? "rosa" : "marca" }}
      valor={perdida ? bsResta(valor) : fmtMoney(valor)}
      valorPie={orden === "vendidos" ? "ingreso" : perdida ? "pérdida" : "ganancia"}
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

function hojaTop(nombre: string, filas: FilaExportTop[]) {
  return hoja<FilaExportTop>(
    nombre,
    [
      ["Puesto", (f) => f.puesto],
      ["Producto", (f) => f.nombre],
      ["Categoría", (f) => f.categoria],
      ["Unidades", (f) => f.unidades],
      ["Ingresos (Bs)", (f) => f.ingresos],
      ["Ganancia (Bs)", (f) => f.utilidad],
      ["Margen (%)", (f) => f.margenPct],
      ["Nota", (f) => f.nota],
    ],
    filas,
  );
}
