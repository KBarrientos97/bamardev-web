import { useMemo } from "react";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { Cargador, FilaLista, KpiR, Nota } from "../ui";
import { ListaRecortada } from "./ListaRecortada";
import { armarLentos, consejoLentos, lineaLento, type FilaLenta } from "./ProductosLentos.datos";
import { conMayuscula, palabraProductos } from "./vocabularioProductos";

/**
 * Productos lentos: lo que casi no se vende y cuánta plata tiene parada.
 *
 * Las ventas son del período elegido; el stock y su valor, de HOY (es lo que
 * hay en el estante ahora). Con farmacia se habla de medicamentos, como en el
 * título del catálogo.
 */
export default function ProductosLentos() {
  const { rango } = useReporte();
  const { rubro } = useAuth();
  const estado = useApi(() => apiReportes.lentos(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const lentos = useMemo(() => (estado.datos ? armarLentos(estado.datos) : null), [estado.datos]);
  const p = palabraProductos(rubro);

  useExportar(
    `${p}-lentos`,
    lentos?.filas.length
      ? () => [
          hoja<FilaLenta>(
            `${conMayuscula(p)} lentos`,
            [
              [conMayuscula(palabraProductos(rubro, false)), (f) => f.nombre],
              ["Categoría", (f) => f.categoria],
              ["Vendidos en el período", (f) => f.vendidas],
              ["Stock hoy", (f) => f.stock],
              ["Plata parada (Bs)", (f) => (f.sinCosto ? null : f.valorParado)],
              ["Nota", (f) => (f.sinCosto ? "Sin costo cargado" : null)],
            ],
            lentos.filas,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        armarLentos(d).filas.length === 0
          ? {
              titulo: `No hay ${p} lentos`,
              texto: "Todo lo que tiene stock vendió más de 5 unidades en el período.",
              icono: "trendingUp",
            }
          : null
      }
    >
      {() => {
        if (!lentos) return null;
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiR
                etiqueta={`Plata parada en estos ${p}`}
                valor={fmtMoney(lentos.plataParada)}
                pie={lentos.sinCosto > 0 ? `stock × costo · ${fmtNum(lentos.sinCosto)} sin costo cargado` : "stock × costo"}
              />
              <KpiR etiqueta={`${conMayuscula(p)} lentos`} valor={fmtNum(lentos.filas.length)} pie="en este período" />
            </div>
            <ListaRecortada filas={lentos.filas} clave={(f, i) => `${f.nombre}-${i}`}>
              {(f) => (
                <FilaLista
                  icono="trendingDown"
                  tono="rosa"
                  titulo={f.nombre}
                  linea={lineaLento(f)}
                  valor={f.sinCosto ? "—" : fmtMoney(f.valorParado)}
                  valorPie={f.sinCosto ? "sin costo cargado" : "plata parada"}
                  tonoValor={f.sinCosto ? "apagado" : "normal"}
                />
              )}
            </ListaRecortada>
            <Nota>
              Son los que menos rotan: 5 unidades o menos en el período, con el stock de hoy. {consejoLentos(rubro)}
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}
