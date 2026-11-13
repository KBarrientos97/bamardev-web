import type { ReactNode } from "react";
import { fmtMoney, fmtNum } from "../../../lib/format";
import { conMayuscula, termino } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, fraccion, type FilaPorSucursal, type PorSucursalApi } from "../api";
import { useExportar, useReporte } from "../contexto";
import { bsEntero, bsSubtotal, pct } from "../formato";
import { Cargador, Chip, KpiR, Nota, Tarjeta } from "../ui";
import {
  aclaracionDeFila,
  columnasConDatos,
  filaGeneral,
  filasDeLocales,
  hayQueComparar,
  hojaComparativo,
  localQueMasVendio,
  tonoUtilidad,
} from "./CompararSucursales.datos";

/**
 * Comparar sucursales: cada local lado a lado, con la cuenta del Estado de
 * resultado partida por local (PLAN-SUCURSAL-TOTAL §9.4). Una fila por
 * sucursal, otra con los gastos que no son de ninguna («General del negocio») y
 * el total del negocio.
 *
 * Es el corte por sucursal, así que NO sigue el filtro de arriba: aunque haya un
 * local elegido, compara todos (y lo dice). Sólo lo ve la organización con 2+
 * locales (el catálogo lo esconde a los demás).
 *
 * Desde tablet, una tabla; en el celular, una tarjeta por local (siete columnas
 * no entran en 375 px).
 */
export default function CompararSucursales() {
  const { rango } = useReporte();
  const { rubro, vocabulario } = useAuth();
  const suc = useSucursales();
  const estado = useApi(
    () => apiReportes.porSucursal(rango),
    // La sucursal elegida no cambia la consulta: el comparativo es de todas.
    [rango.desde, rango.hasta, rango.corteMin],
  );
  const d = estado.datos;
  const rotulo = conMayuscula(termino(rubro, "sucursal", vocabulario));

  useExportar(
    "comparar-sucursales",
    d && hayQueComparar(d) ? () => [hojaComparativo(d, rotulo)] : null,
    undefined,
    // Junta todos los locales aunque arriba haya uno elegido: el archivo no puede decir el elegido.
    { nombre: suc.todas, rotulo },
  );

  return (
    <Cargador
      estado={estado}
      vacio={(x) =>
        hayQueComparar(x)
          ? null
          : {
              titulo: "No hay nada que comparar",
              texto: `Hace falta tener dos ${termino(rubro, "sucursales", vocabulario)} o más para compararlas.`,
              icono: "home",
            }
      }
    >
      {(x) => <Contenido d={x} elegida={rango.sucursalId != null} rotulo={rotulo} />}
    </Cargador>
  );
}

function Contenido({ d, elegida, rotulo }: { d: PorSucursalApi; elegida: boolean; rotulo: string }) {
  const locales = filasDeLocales(d);
  const general = filaGeneral(d);
  const cols = columnasConDatos(d);
  const mejor = localQueMasVendio(d);
  return (
    <>
      {elegida && (
        <Nota>Este reporte compara todas las sucursales: el filtro de arriba no se aplica acá.</Nota>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiR etiqueta="Ventas del negocio" valor={bsEntero(d.total.ventas)} pie={`${fmtNum(d.total.tickets)} ${d.total.tickets === 1 ? "venta" : "ventas"}`} />
        <KpiR
          etiqueta="Utilidad operativa"
          valor={bsSubtotal(d.total.utilidadOperativa)}
          tono={d.total.utilidadOperativa < 0 ? "alerta" : "marca"}
          pie="después de costo, mermas y gastos"
        />
        {mejor && (
          <KpiR
            etiqueta="Vendió más"
            valor={<span className="block truncate">{mejor.nombre}</span>}
            pie={bsEntero(mejor.ventas)}
          />
        )}
      </div>

      <Tarjeta cuerpo="">
        {/* Desde tablet, la tabla. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={TH}>{rotulo}</th>
                <th className={`${TH} text-right`}>Ventas</th>
                <th className={`${TH} text-right`}>Tickets</th>
                <th className={`${TH} text-right`}>Costo</th>
                <th className={`${TH} text-right`}>Utilidad bruta</th>
                {cols.mermas && <th className={`${TH} text-right`}>Mermas</th>}
                <th className={`${TH} text-right`}>Gastos</th>
                <th className={`${TH} text-right`}>Utilidad operativa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde-soft">
              {locales.map((f) => (
                <FilaTabla key={f.sucursalId ?? "x"} f={f} mermas={cols.mermas} />
              ))}
              {general && <FilaTabla f={general} mermas={cols.mermas} />}
              <FilaTabla f={d.total} mermas={cols.mermas} total />
            </tbody>
          </table>
        </div>

        {/* En el celular, una tarjeta por local con sus números en grilla. */}
        <ul className="divide-y divide-borde-soft md:hidden">
          {locales.map((f) => (
            <TarjetaLocal key={f.sucursalId ?? "x"} f={f} mermas={cols.mermas} />
          ))}
          {general && <TarjetaLocal f={general} mermas={cols.mermas} />}
          <TarjetaLocal f={d.total} mermas={cols.mermas} total />
        </ul>
      </Tarjeta>

      {cols.bajoLaLinea && (
        <p className="px-1 text-[12.5px] text-texto-3">
          Banco e impuestos, que no restan en la utilidad operativa: {fmtMoney(d.total.bajoLaLinea)} en total
          {locales.filter((f) => f.bajoLaLinea > 0).length > 0
            ? ` (${locales
                .filter((f) => f.bajoLaLinea > 0)
                .map((f) => `${f.nombre} ${fmtMoney(f.bajoLaLinea)}`)
                .join(" · ")}${general && general.bajoLaLinea > 0 ? ` · General ${fmtMoney(general.bajoLaLinea)}` : ""})`
            : ""}
          .
        </p>
      )}
      <Nota>
        La cuenta es la del Estado de resultado, partida por local: las ventas y su costo van al local donde se vendió y
        los gastos al local al que se cargaron. «General del negocio» junta los gastos que no son de ninguno. El total
        sale de las ventas de todo el negocio, no de sumar las filas (puede apartarse unos centavos por redondeo).
      </Nota>
    </>
  );
}

const TH = "px-3 py-3 text-[11px] font-bold uppercase leading-tight tracking-wider text-texto-3";
const TD = "whitespace-nowrap px-3 py-3 text-right tabular-nums";

/** El color de una utilidad: rojo si es pérdida, verde si hay ganancia, gris si es cero. */
function claseUtilidad(n: number): string {
  const t = tonoUtilidad(n);
  return t === "negativo" ? "text-rose-700" : t === "positivo" ? "text-emerald-700" : "text-texto-4";
}

function NombreFila({ f, total }: { f: FilaPorSucursal; total: boolean }): ReactNode {
  const aclaracion = total ? null : aclaracionDeFila(f);
  return (
    <>
      <span className="font-bold text-texto">{f.nombre}</span>
      {!total && f.esPrincipal && <Chip tono="gris">Principal</Chip>}
      {aclaracion && <span className="block text-[11.5px] font-normal text-texto-3">{aclaracion}</span>}
    </>
  );
}

function FilaTabla({ f, mermas, total = false }: { f: FilaPorSucursal; mermas: boolean; total?: boolean }) {
  const margen = fraccion(f.margenBrutoPct);
  return (
    <tr className={total ? "bg-slate-50 font-extrabold" : ""}>
      <td className="px-3 py-3">
        <span className="flex flex-wrap items-center gap-1.5">
          <NombreFila f={f} total={total} />
        </span>
      </td>
      <td className={TD}>{fmtMoney(f.ventas)}</td>
      <td className={TD}>{fmtNum(f.tickets)}</td>
      <td className={TD}>{fmtMoney(f.costoVentas)}</td>
      <td className={TD}>
        {bsSubtotal(f.utilidadBruta)}
        {margen != null && <span className="block text-[11.5px] font-normal text-texto-3">{pct(margen)} de las ventas</span>}
      </td>
      {mermas && <td className={TD}>{fmtMoney(f.mermas)}</td>}
      <td className={TD}>{fmtMoney(f.gastosOperativos)}</td>
      <td className={`${TD} font-extrabold ${claseUtilidad(f.utilidadOperativa)}`}>{bsSubtotal(f.utilidadOperativa)}</td>
    </tr>
  );
}

function TarjetaLocal({ f, mermas, total = false }: { f: FilaPorSucursal; mermas: boolean; total?: boolean }) {
  const margen = fraccion(f.margenBrutoPct);
  return (
    <li className={`px-4 py-3.5 ${total ? "bg-slate-50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px]">
            <NombreFila f={f} total={total} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-[15px] font-extrabold tabular-nums ${claseUtilidad(f.utilidadOperativa)}`}>{bsSubtotal(f.utilidadOperativa)}</p>
          <p className="text-[11px] text-texto-3">utilidad operativa</p>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
        <Dato etiqueta="Ventas" valor={fmtMoney(f.ventas)} />
        <Dato etiqueta="Tickets" valor={fmtNum(f.tickets)} />
        <Dato etiqueta="Costo" valor={fmtMoney(f.costoVentas)} />
        <Dato etiqueta="Utilidad bruta" valor={`${bsSubtotal(f.utilidadBruta)}${margen != null ? ` · ${pct(margen)}` : ""}`} />
        {mermas && <Dato etiqueta="Mermas" valor={fmtMoney(f.mermas)} />}
        <Dato etiqueta="Gastos" valor={fmtMoney(f.gastosOperativos)} />
      </dl>
    </li>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10.5px] font-bold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="truncate text-[13px] font-semibold tabular-nums text-texto-2">{valor}</dd>
    </div>
  );
}
