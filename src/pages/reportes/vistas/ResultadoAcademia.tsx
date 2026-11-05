import { esCero } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { apiReportes } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsResta, bsSubtotal, plural } from "../formato";
import { Cargador, FilaLista, KpiR, Lista, Nota } from "../ui";
import { hojaResultado } from "./ResultadoAcademia.datos";

/**
 * Resultado de la academia (Derick, 04-nov): la academia sola, sin lo que
 * vende la tienda del mismo local. Entra lo cobrado por clases (las cuotas) y
 * sale lo cargado en Gastos en el período, por categoría, con los sueldos
 * docentes de la planilla incluidos. Es el número que se reparte con el socio
 * de la academia; la cuenta del local entero sigue en el Estado de resultado.
 */
export default function ResultadoAcademia() {
  const { rango } = useReporte();
  const datos = useApi(() => apiReportes.resultadoAcademia(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const x = datos.datos;
  useExportar("resultado-de-la-academia", x ? () => [hojaResultado(x)] : null);

  return (
    <Cargador
      estado={datos}
      vacio={(d) =>
        esCero(d.ingresos) && esCero(d.gastos)
          ? { titulo: "Sin movimiento", texto: "No se cobraron clases ni se cargaron gastos en este período.", icono: "birrete" }
          : null
      }
    >
      {(d) => {
        const perdida = d.resultado < 0 && !esCero(d.resultado);
        const mayor = d.categorias[0]?.monto ?? 0;
        return (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiR etiqueta="Cobrado por clases" valor={fmtMoney(d.ingresos)} tono="marca" pie="Las cuotas cobradas" />
              <KpiR etiqueta="Gastos" valor={bsResta(d.gastos)} pie={plural(d.categorias.length, "categoría", "categorías")} />
              <KpiR
                etiqueta={esCero(d.resultado) ? "Resultado" : perdida ? "Pérdida" : "Ganancia"}
                valor={bsSubtotal(d.resultado)}
                tono={perdida ? "alerta" : "marca"}
                pie="Clases menos gastos"
              />
            </div>
            {d.categorias.length > 0 && (
              <Lista>
                {d.categorias.map((c) => (
                  <FilaLista
                    key={c.codigo}
                    icono="billetera"
                    tono="rosa"
                    titulo={c.nombre}
                    linea={plural(c.cantidad, "gasto", "gastos")}
                    valor={bsResta(c.monto)}
                    barra={mayor > 0 ? { fraccion: c.monto / mayor, tono: "rosa" } : undefined}
                  />
                ))}
              </Lista>
            )}
            <Nota>
              Entra sólo lo cobrado por clases: lo que se vende en la tienda no cuenta, ni su costo. Los gastos son todos los cargados en el
              período, pagados o no, con los sueldos docentes de la planilla: si en Gastos también se cargan los de la tienda, acá restan.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}
