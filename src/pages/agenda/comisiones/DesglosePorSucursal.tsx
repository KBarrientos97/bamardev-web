import { fmtMoney } from "../../../lib/format";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { useSucursales } from "../../../lib/useSucursales";
import type { FilaComisionSucursal } from "../../../lib/agenda/tiposComisiones";

/**
 * ¿Hay algo que desglosar? Sólo con 2+ sucursales en el negocio y 2+ filas en el
 * desglose (PLAN-SUCURSAL-TOTAL §1 y §8.1). Con un local, o con una liquidación
 * vieja (`porSucursal: []`), la pantalla queda como siempre. Se decide acá para
 * que la previa, el detalle y la confirmación digan lo mismo.
 */
export function useDesgloseSucursal(filas: readonly FilaComisionSucursal[] | undefined) {
  const suc = useSucursales();
  const lista = filas ?? [];
  return { ver: suc.hayVarias && lista.length >= 2, filas: lista };
}

/**
 * Cómo cae una liquidación en cada local: comisión, ajustes y neto. En la
 * previa el neto es lo que se cargará como gasto a cada sucursal; en el detalle,
 * lo que se cargó. Una fila sin local es lo que no es de ninguna sucursal.
 */
export function DesglosePorSucursal({
  filas,
  titulo = "Por sucursal",
  nota,
}: {
  filas: readonly FilaComisionSucursal[];
  titulo?: string;
  /** Una línea bajo la tabla. */
  nota?: string;
}) {
  const pal = usePalabras();
  return (
    <div>
      <h3 className="mb-1 text-[13px] font-semibold text-texto-2">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-texto-4">
            <tr>
              <th className="py-1.5 pr-2">{pal.Sede}</th>
              <th className="py-1.5 pr-2 text-right">Comisión</th>
              <th className="py-1.5 pr-2 text-right">Ajustes</th>
              <th className="py-1.5 text-right">Neto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {filas.map((f) => (
              <tr key={f.almacenId ?? "sin"}>
                <td className="py-1.5 pr-2">{f.sucursal ?? "Sin " + pal.sede}</td>
                <td className="py-1.5 pr-2 text-right">{fmtMoney(f.comision)}</td>
                <td className="py-1.5 pr-2 text-right">{f.ajustes ? fmtMoney(f.ajustes) : "—"}</td>
                <td className="py-1.5 text-right font-semibold">
                  {f.neto == null ? "—" : fmtMoney(f.neto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nota && <p className="mt-1 text-[12px] text-texto-3">{nota}</p>}
    </div>
  );
}

/**
 * La frase de la confirmación de liquidar: «Se registra un gasto de sueldos por
 * sucursal: Centro Bs 24,00 · Norte Bs 12,00». Vacía si no corresponde (un solo
 * gasto general, o menos de 2 filas con monto).
 */
export function textoGastoPorSucursal(
  filas: readonly FilaComisionSucursal[],
  sede: string,
): string {
  const conMonto = filas.filter((f) => f.neto != null && f.neto > 0);
  if (conMonto.length < 2) return "";
  const partes = conMonto.map((f) => `${f.sucursal ?? "Sin " + sede} ${fmtMoney(f.neto ?? 0)}`);
  return `Se registra un gasto de sueldos por ${sede}: ${partes.join(" · ")}.`;
}
