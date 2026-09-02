import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Badge, Cargando, ErrorMsg, Kpi, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { EstadoDocumento } from "../../types";

const TONO_ESTADO: Record<EstadoDocumento, "verde" | "amarillo" | "rojo"> = {
  APROBADO: "verde",
  PENDIENTE: "amarillo",
  ANULADO: "rojo",
};

export default function Dashboard() {
  const { datos, cargando, error } = useApi(() => api.getDashboard(), []);

  if (cargando) return <Cargando />;
  if (error)
    return (
      <div className="p-5">
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    );
  if (!datos) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5">
      <header>
        <h1 className="text-xl font-bold text-texto">Dashboard</h1>
        <p className="mt-0.5 text-[13px] text-texto-3">
          Vista general del sistema de inventario
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Artículos"
          valor={fmtNum(datos.articulos)}
          icono="archive"
          tono="azul"
          pie="En catálogo"
        />
        <Kpi
          etiqueta="Almacenes"
          valor={fmtNum(datos.almacenes)}
          icono="warehouse"
          pie="Ubicaciones"
        />
        <Kpi
          etiqueta="Valor inventario"
          valor={fmtMoney(datos.totalInventario)}
          icono="dollar"
          pie="Total en stock"
        />
        <Kpi
          etiqueta="Bajo stock"
          valor={fmtNum(datos.bajoStock)}
          icono="alert"
          tono={datos.bajoStock > 0 ? "amarillo" : "verde"}
          pie={datos.bajoStock > 0 ? "Requiere atención" : "Todo en orden"}
        />
      </div>

      <section className="card p-5">
        <div className="mb-3">
          <h2 className="text-[15px] font-bold text-texto">Stock crítico</h2>
          <p className="mt-0.5 text-xs font-medium text-primary">
            Artículos con bajo inventario
          </p>
        </div>
        {datos.stockCritico.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-texto-3">
            Sin artículos en estado crítico
          </p>
        ) : (
          <ul className="divide-y divide-borde-soft">
            {datos.stockCritico.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-texto">{a.nombre}</p>
                  <p className="mt-0.5 text-xs text-texto-3">
                    Mínimo: {fmtNum(a.stockMinimo)}
                  </p>
                </div>
                <Badge tono={a.stock <= 0 ? "rojo" : "amarillo"}>
                  {a.stock <= 0 ? "Sin stock" : `${fmtNum(a.stock)} restantes`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-texto">Movimientos recientes</h2>
          <Link
            to="/inventario/movimientos"
            className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-700"
          >
            Ver todos <Icon name="chevronRight" size={15} />
          </Link>
        </div>

        {datos.movimientos.length === 0 ? (
          <div className="card">
            <Vacio icono="swap" titulo="Sin movimientos" texto="Todavía no hay entradas ni salidas registradas." />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {datos.movimientos.slice(0, 5).map((m) => {
              const esEntrada = m.tipo === "ENTRADA";
              return (
                <li key={m.id} className="card flex items-center gap-3 p-4">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      esEntrada
                        ? "bg-primary-50 text-primary-700"
                        : "bg-danger-bg text-danger-text"
                    }`}
                  >
                    <Icon name={esEntrada ? "trendingUp" : "trendingDown"} size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-texto">
                        {m.comprobante ?? `#${m.id}`}
                      </span>
                      <Badge tono={TONO_ESTADO[m.estado]}>{m.estado}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-texto-3">
                      <span className="flex items-center gap-1">
                        <Icon name="calendar" size={12} /> {fmtFecha(m.fecha)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="warehouse" size={12} /> {m.almacen}
                      </span>
                      <span>
                        {m.items} {m.items === 1 ? "artículo" : "artículos"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-texto">{fmtMoney(m.monto)}</p>
                    <p
                      className={`text-xs font-semibold ${
                        esEntrada ? "text-primary-700" : "text-danger-text"
                      }`}
                    >
                      {esEntrada ? "Entrada" : m.tipo === "SALIDA" ? "Salida" : "Ajuste"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
