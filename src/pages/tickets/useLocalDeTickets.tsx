import { useState } from "react";
import { useSucursales } from "../../lib/useSucursales";
import type { Almacen } from "../../types";

/**
 * De qué local se mira el despacho, la numeración y la TV
 * (PLAN-SUCURSAL-TOTAL §3, etapa 5).
 *
 * Los tickets y las TVs son **de un local**: el tablero, el contador y la TV
 * pública salen siempre de uno solo. Sin decir cuál, el backend le da al de
 * organización el principal, y con 2+ locales eso era mirar el despacho de otra
 * sucursal creyendo que es la propia. Por eso acá no hay "Todas": el de
 * organización con 2+ locales elige uno (por defecto, el principal, que es el
 * que ya le daba el backend). El de un local ve el suyo y no elige nada; con un
 * solo local no aparece nada.
 */
export function useLocalDeTickets() {
  const suc = useSucursales();
  const [elegido, setElegido] = useState<number | null>(null);
  const locales: Almacen[] = suc.elegir ? suc.sucursales : [];
  /** El local pedido al backend; `null` = no mandar nada (un local, o un usuario de uno). */
  const sucursalId = suc.elegir ? (elegido ?? suc.sugerida?.id ?? null) : null;
  return {
    /** ¿Se muestra el selector? Sólo la organización con 2+ locales. */
    elegir: suc.elegir,
    locales,
    sucursalId,
    /** Nombre del local que se mira (el elegido, o la sede propia del asignado). */
    nombre: locales.find((a) => a.id === sucursalId)?.nombre ?? suc.miSede ?? "",
    setLocal: setElegido,
    /** La sede del usuario asignado, para una etiqueta discreta. */
    miSede: suc.miSede,
  };
}

/** El desplegable del local; `oscuro` para el despacho, que es de fondo negro. */
export function SelectorLocalTickets({
  locales,
  valor,
  onChange,
  oscuro = false,
}: {
  locales: Almacen[];
  valor: number | null;
  onChange: (id: number) => void;
  oscuro?: boolean;
}) {
  return (
    <select
      aria-label="Sucursal"
      value={valor ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      className={
        oscuro
          ? "rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[13px] font-semibold text-white outline-none [&>option]:text-black"
          : "rounded-xl border border-borde bg-white px-3 py-2 text-[13px] font-semibold text-texto outline-none"
      }
    >
      {locales.map((a) => (
        <option key={a.id} value={a.id}>
          {a.nombre}
        </option>
      ))}
    </select>
  );
}
