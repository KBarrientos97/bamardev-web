import { Desplegable } from "../../components/Desplegable";
import { api } from "../../lib/api";
import { conMayuscula, termino } from "../../lib/rubro";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";

/**
 * El selector de la sede de la caja en el Punto de venta (13-nov-2026).
 *
 * El admin de una organización con 2+ sucursales puede tener una caja abierta
 * en cada una y saltar de una a otra desde acá. A cada sede le dice si ya tiene
 * caja ("Caja abierta") o no ("Sin caja", y al elegirla aparece «Abrir caja»
 * con esa sede ya puesta).
 *
 * Lo dibuja SÓLO quien llama cuando la regla lo permite (`useSedeDeCaja().usa`:
 * organización con 2+ locales); el cajero atado a una sede, y todo negocio de un
 * local, siguen viendo lo de siempre. Sin conexión no se sabe quién tiene caja:
 * las opciones salen sin el dato y no se rompe nada.
 *
 * `soloConCajas`: en la pantalla de «Abrir caja» el selector sólo aparece si
 * hay una caja abierta en otra sede a la que saltar; sin ninguna, la pantalla
 * queda exactamente como antes.
 */
export function SelectorSedeCaja({
  valor,
  onElegir,
  soloConCajas = false,
}: {
  /** La sede en la que está parado (la de la caja abierta, o la elegida). */
  valor: number | null;
  onElegir: (sedeId: number, nombre: string) => void;
  soloConCajas?: boolean;
}) {
  const { rubro, vocabulario } = useAuth();
  const suc = useSucursales();
  // Se vuelve a pedir al cambiar de sede: abrir o cerrar una caja cambia el dato.
  const cajas = useApi(() => api.cajasAbiertas().catch(() => ({ cajas: [] })), [valor]);
  const conCaja = new Set((cajas.datos?.cajas ?? []).map((c) => c.almacenId));
  if (suc.sucursales.length < 2) return null;
  if (soloConCajas && conCaja.size === 0) return null;

  const palabra = conMayuscula(termino(rubro, "sucursal", vocabulario));
  const nombre = suc.sucursales.find((s) => s.id === valor)?.nombre;
  return (
    <Desplegable
      etiqueta={palabra}
      titulo={`En qué ${palabra.toLowerCase()} vendés`}
      valor={valor}
      opciones={suc.sucursales.map((s) => ({
        id: s.id,
        etiqueta: s.nombre + (s.esPrincipal ? " (principal)" : ""),
        ...(cajas.datos ? { detalle: conCaja.has(s.id) ? "Caja abierta" : "Sin caja" } : {}),
      }))}
      onElegir={(id) => onElegir(id, suc.sucursales.find((s) => s.id === id)?.nombre ?? "")}
      className="inline-flex h-7 max-w-[12rem] shrink-0 items-center gap-1 rounded-lg bg-primary-50 pl-2 pr-1.5 text-[12px] font-semibold text-primary-700 outline-none hover:bg-primary-100 focus-visible:ring-2 focus-visible:ring-primary-100"
    >
      <span className="truncate">{nombre ?? `Elegí la ${palabra.toLowerCase()}`}</span>
    </Desplegable>
  );
}
