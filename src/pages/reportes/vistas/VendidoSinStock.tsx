import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, type VendidoSinStockApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { Cargador, FilaLista, KpiR, Nota } from "../ui";
import { ListaRecortada } from "./ListaRecortada";
import { cantidadCon, lineaArticulo, lineaVenta, pieVenta, textoModo } from "./VendidoSinStock.datos";

type Item = VendidoSinStockApi["items"][number];
type Linea = VendidoSinStockApi["ultimas"][number];

/**
 * Vendido sin stock (09-nov): lo que se vendió sin stock que lo respaldara.
 *
 * Es el reporte del restaurante que vende sin control de stock: mientras no
 * cuenta, lo que la caja vendió de cada bebida es lo que salió de la heladera,
 * y el dueño lo ve acá por artículo y venta por venta, con quién la cobró. Con
 * el control prendido también sirve: lo que una mesa sirvió o una venta sin
 * internet vendió cuando ya no quedaba.
 *
 * Son ventas, sin costo: lo ve quien ve las ventas. Lo anulado no cuenta.
 */
export default function VendidoSinStock() {
  const { rango } = useReporte();
  const { puede } = useAuth();
  const estado = useApi(() => apiReportes.vendidoSinStock(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const d = estado.datos;

  useExportar(
    "vendido-sin-stock",
    d?.items.length
      ? () => [
          hoja<Item>(
            "Por artículo",
            [
              ["Artículo", (i) => i.nombre],
              ["Categoría", (i) => i.categoria],
              ["Vendido sin stock", (i) => i.unidades],
              ["Unidad", (i) => i.unidad],
              ["Ventas", (i) => i.ventas],
              ["Cobrado (Bs)", (i) => i.monto],
            ],
            d.items,
          ),
          hoja<Linea>(
            "Venta por venta",
            [
              ["Venta", (l) => l.ventaId],
              ["Comprobante", (l) => l.comprobante],
              ["Fecha", (l) => l.fecha],
              ["Artículo", (l) => l.producto],
              ["Sin stock", (l) => l.unidades],
              ["De la línea", (l) => l.cantidad],
              ["Cobró", (l) => l.usuario],
            ],
            d.ultimas,
          ),
        ]
      : null,
  );

  return (
    <div className="space-y-4">
      {d && (
        <p className="flex items-start gap-1.5 text-[12px] text-texto-3">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          <span>
            {textoModo(d.controlaStock)}
            {!d.controlaStock && puede("config_inventario") && (
              <>
                {" "}
                Cuando cuentes tu mercadería,{" "}
                <Link to="/configuracion/inventario" className="font-semibold underline underline-offset-2">
                  prendé el control de stock
                </Link>
                .
              </>
            )}
          </span>
        </p>
      )}
      <Cargador
        estado={estado}
        vacio={(x) =>
          x.items.length === 0
            ? {
                titulo: "Nada vendido sin stock",
                texto: x.controlaStock
                  ? "En este período todo lo que se vendió tenía stock."
                  : "En este período no se vendió nada de lo que lleva stock.",
                icono: "cart",
              }
            : null
        }
      >
        {(x) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiR etiqueta="Vendido sin stock" valor={fmtNum(x.resumen.unidades, 0)} pie="unidades, sumando todo" />
              <KpiR etiqueta="Cobrado por eso" valor={fmtMoney(x.resumen.monto)} tono="marca" pie="lo que entró por esas unidades" />
              <KpiR etiqueta="Artículos" valor={fmtNum(x.resumen.articulos)} />
              <KpiR etiqueta="Ventas" valor={fmtNum(x.resumen.ventas)} pie="con algo sin stock" />
            </div>

            <Titulo texto="Por artículo" bajada="Lo que más salió sin stock, primero" />
            <ListaRecortada filas={x.items} clave={(i) => String(i.productoId)}>
              {(i) => (
                <FilaLista
                  icono="cart"
                  tono="azul"
                  titulo={i.nombre}
                  linea={lineaArticulo(i)}
                  valor={cantidadCon(i.unidades, i.unidad)}
                  valorPie={fmtMoney(i.monto)}
                />
              )}
            </ListaRecortada>

            <Titulo
              texto="Venta por venta"
              bajada={
                x.recortado ? `Las ${fmtNum(x.ultimas.length)} más nuevas; los totales de arriba son del período entero` : "La más nueva primero"
              }
            />
            <ListaRecortada filas={x.ultimas} clave={(l) => String(l.lineaId)}>
              {(l) => (
                <FilaLista
                  icono="fileText"
                  tono="gris"
                  titulo={l.producto}
                  linea={lineaVenta(l)}
                  valor={cantidadCon(l.unidades, l.unidad)}
                  valorPie={pieVenta(l)}
                />
              )}
            </ListaRecortada>

            <Nota>
              Cuenta sólo lo que faltó: si había 2 y se vendieron 5, son 3. Lo que vendiste en cada turno, con o sin
              stock, está en «Productos vendidos» del cierre de caja. Las ventas anuladas no cuentan.
            </Nota>
          </>
        )}
      </Cargador>
    </div>
  );
}

/** El título de cada lista, con su bajada. */
function Titulo({ texto, bajada }: { texto: string; bajada: string }) {
  return (
    <div className="px-1 pt-2">
      <h2 className="text-[15px] font-bold text-texto">{texto}</h2>
      <p className="mt-0.5 text-[12px] text-texto-3">{bajada}</p>
    </div>
  );
}
