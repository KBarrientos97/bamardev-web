import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { Cargador, Chip, FilaLista, KpiR, Nota } from "../ui";
import { ListaRecortada } from "./ListaRecortada";
import {
  DIAS_COBERTURA,
  DIAS_HISTORIA,
  detalleStock,
  estadoStock,
  lineaStock,
  plazo,
  resumenStock,
  textoCobertura,
  utilDe,
  type ItemStock,
} from "./StockCritico.datos";
import { conMayuscula, palabraProductos } from "./vocabularioProductos";

/**
 * Stock crítico: lo que hay que reponer, con cuánto pedir.
 *
 * Es una foto de HOY —el stock de este momento y el ritmo de los últimos 30
 * días— y no depende del período elegido arriba, así que no lo pide: cambiar
 * de "Semana" a "Mes" no mueve ningún número y la pantalla lo dice. Sí sigue a
 * la sucursal: lo que falta en un local no lo tapa lo que sobra en otro. Con
 * "Todas las sucursales" va sin sucursal, que es el negocio entero.
 */
export default function StockCritico() {
  const { rango, veReporte } = useReporte();
  const { rubro } = useAuth();
  const estado = useApi(
    () => apiReportes.sugerencia({ dias: DIAS_HISTORIA, cobertura: DIAS_COBERTURA, sucursalId: rango.sucursalId }),
    [rango.sucursalId],
  );
  const d = estado.datos;

  useExportar(
    "stock-critico",
    d?.items.length
      ? () => [
          hoja<ItemStock>(
            "Stock crítico",
            [
              [conMayuscula(palabraProductos(rubro, false)), (i) => i.nombre],
              ["Categoría", (i) => i.categoria],
              ["Estado", (i) => estadoStock(i).texto],
              ["Quedan", (i) => utilDe(i)],
              ["Vencido", (i) => i.vencido],
              [`Vendido en ${d.dias} días`, (i) => i.vendidas],
              ["Alcanza (días)", (i) => i.alcanzaDias],
              ["Pedir", (i) => i.sugerido],
              ["Costo unitario (Bs)", (i) => i.costo],
              ["Subtotal (Bs)", (i) => i.subtotal],
            ],
            d.items,
          ),
        ]
      : null,
  );

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-[12px] text-texto-3">
        <Icon name="clock" size={14} />
        Foto de hoy: el stock de este momento. No cambia con el período elegido arriba.
      </p>
      <Cargador
        estado={estado}
        vacio={(x) =>
          x.items.length === 0
            ? {
                titulo: "Nada por reponer",
                texto: `Con el stock de hoy alcanza ${textoCobertura(x.cobertura)} al ritmo de venta de los últimos ${x.dias} días.`,
                icono: "cart",
              }
            : null
        }
      >
        {(x) => {
          const r = resumenStock(x.items);
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiR etiqueta="Agotados" valor={fmtNum(r.agotados)} tono={r.agotados > 0 ? "alerta" : "normal"} />
                <KpiR etiqueta="Se acaban en menos de 7 días" valor={fmtNum(r.seAcaban)} />
              </div>
              <ListaRecortada filas={x.items} clave={(i) => String(i.productoId)}>
                {(i) => {
                  const estadoFila = estadoStock(i);
                  return (
                    <FilaLista
                      icono="cart"
                      tono={estadoFila.tono === "rojo" ? "rosa" : "ambar"}
                      titulo={i.nombre}
                      chip={<Chip tono={estadoFila.tono}>{estadoFila.texto}</Chip>}
                      linea={lineaStock(i, x.dias)}
                      linea2={detalleStock(i) ?? undefined}
                      valor={`Pedir ${fmtNum(i.sugerido)}`}
                      valorPie={textoCobertura(x.cobertura)}
                    />
                  );
                }}
              </ListaRecortada>
              <Nota>
                El pedido sugerido cubre {plazo(x.cobertura)} al ritmo de venta de los últimos {x.dias} días, más el
                stock mínimo que cargaste y lo que encargaron clientes.
                {veReporte("sugerencia-compra") && (
                  <>
                    {" "}
                    Para ajustar las cantidades e imprimir el pedido, andá a{" "}
                    <Link to="/reportes/sugerencia-compra" className="font-bold underline underline-offset-2">
                      Sugerencia de compra
                    </Link>
                    .
                  </>
                )}
              </Nota>
            </>
          );
        }}
      </Cargador>
    </div>
  );
}
