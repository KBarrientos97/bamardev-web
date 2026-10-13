import { useMemo } from "react";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsCorto, bsResta, pct, plural } from "../formato";
import { Dona } from "../graficos";
import { Cargador, Nota, Tarjeta } from "../ui";
import { armarCategorias, partePct, type FilaCategoria } from "./Categorias.datos";

/**
 * Categorías: cuánto vende y cuánto deja cada parte del catálogo.
 *
 * La dona reparte las ventas BRUTAS (antes de promos), igual que Top
 * productos: los dos reportes salen de la misma cuenta del backend y tienen
 * que cuadrar entre sí.
 */
export default function Categorias() {
  const { rango } = useReporte();
  const { rubro } = useAuth();
  const estado = useApi(() => apiReportes.categorias(rango), [rango.desde, rango.hasta, rango.sucursalId]);
  const cats = useMemo(() => (estado.datos ? armarCategorias(estado.datos, rubro) : null), [estado.datos, rubro]);

  useExportar(
    "categorias",
    cats?.filas.length
      ? () => [
          hoja<FilaCategoria>(
            "Categorías",
            [
              ["Categoría", (f) => f.etiqueta],
              ["Ventas (Bs)", (f) => f.ingresos],
              ["% del total", (f) => Math.round(f.fraccion * 1000) / 10],
              ["Unidades", (f) => f.unidades],
              ["Utilidad (Bs)", (f) => f.utilidad],
              ["Margen (%)", (f) => (f.margen == null ? null : Math.round(f.margen * 1000) / 10)],
            ],
            cats.filas,
          ),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) => (d.length === 0 ? { titulo: "Sin ventas en este período", texto: "Probá con otro período.", icono: "grid" } : null)}
    >
      {() => {
        if (!cats) return null;
        return (
          <>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Tarjeta titulo="Distribución por categoría" subtitulo={`Total: ${fmtMoney(cats.total)}`}>
                <div className="py-2">
                  <Dona partes={cats.partes} centroTitulo="Total" centroValor={bsCorto(cats.total)} />
                </div>
              </Tarjeta>
              <div className="space-y-3">
                {cats.filas.map((f) => (
                  <TarjetaCategoria key={f.nombre} fila={f} />
                ))}
              </div>
            </div>
            <Nota>
              Los montos son antes de promos y cupones, y la utilidad es lo vendido menos su costo: un producto sin costo
              cargado suma su precio entero.
            </Nota>
          </>
        );
      }}
    </Cargador>
  );
}

function TarjetaCategoria({ fila }: { fila: FilaCategoria }) {
  // Una categoría que se vende por debajo del costo no se pinta del color de
  // la marca: la utilidad negativa va en rojo y con el signo pegado.
  const perdida = esPositivo(-fila.utilidad);
  const colorUtilidad = perdida ? "text-rose-700" : esCero(fila.utilidad) ? "text-texto-3" : "text-primary-700";
  return (
    <div className="card min-w-0 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: fila.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug text-texto">{fila.etiqueta}</p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            <span className={`font-semibold ${colorUtilidad}`}>
              Utilidad: {perdida ? bsResta(fila.utilidad) : fmtMoney(fila.utilidad)}
            </span>{" "}
            · Margen {pct(fila.margen)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[14px] font-extrabold tabular-nums text-texto">{fmtMoney(fila.ingresos)}</p>
          <p className="text-[12px] text-texto-3">
            {partePct(fila.fraccion)} · {plural(fila.unidades, "ud", "uds")}
          </p>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(1, Math.min(1, fila.fraccion) * 100)}%`, background: fila.color }}
        />
      </div>
    </div>
  );
}
