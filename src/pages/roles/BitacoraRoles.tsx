import { Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { fmtFechaHora } from "../../lib/format";
import { apiRoles, autorDelEvento, renglonesDetalle, type NombresPermisos } from "../../lib/roles";
import { useApi } from "../../lib/useApi";
import type { EventoRol } from "../../types";

const ACCION: Record<string, string> = {
  CREAR: "Creó",
  RENOMBRAR: "Renombró",
  DESCRIPCION: "Cambió la descripción de",
  PERMISOS: "Cambió los permisos de",
  ELIMINAR: "Borró",
  RESTABLECER: "Restableció",
};

/**
 * Quién cambió qué rol y cuándo. Sin `rolId`, la de todo el negocio (la
 * pestaña Bitácora); con él, la de un rol (dentro de su editor). Lo que hizo
 * el soporte de BamarDev desde el panel se dice, y lo de la migración o el
 * alta va como "Sistema": el dueño tiene que saber que no lo tocó nadie de su
 * equipo. Cada evento nombra al rol como se llamaba entonces (`rolNombre`
 * del evento): renombrarlo no reescribe la historia. `nombres` (del catálogo) nombra los permisos
 * del detalle; sin él, van por su código.
 */
export default function BitacoraRoles({
  rolId,
  compacta = false,
  nombres = new Map(),
}: {
  rolId?: number;
  compacta?: boolean;
  nombres?: NombresPermisos;
}) {
  const eventos = useApi(() => (rolId != null ? apiRoles.bitacoraDe(rolId) : apiRoles.bitacora()), [rolId]);

  if (eventos.cargando && !eventos.datos) return <Cargando />;
  if (eventos.error) return <ErrorMsg>{eventos.error}</ErrorMsg>;
  const lista = eventos.datos ?? [];
  if (!lista.length) {
    return compacta ? (
      <p className="text-[13px] text-texto-3">Sin cambios registrados.</p>
    ) : (
      <div className="card">
        <Vacio icono="clock" titulo="Sin cambios todavía" texto="Cada vez que alguien cree, renombre, edite o borre un rol, queda acá." />
      </div>
    );
  }
  return (
    <ul className={compacta ? "space-y-2" : "card divide-y divide-borde-soft"} aria-label="Bitácora de roles">
      {lista.map((e) => (
        <Renglon key={e.id} evento={e} compacta={compacta} nombres={nombres} />
      ))}
    </ul>
  );
}

function Renglon({ evento: e, compacta, nombres }: { evento: EventoRol; compacta: boolean; nombres: NombresPermisos }) {
  const quien = autorDelEvento(e);
  const detalle = renglonesDetalle(e, nombres);
  return (
    <li className={compacta ? "text-[13px]" : "px-4 py-3 text-sm"}>
      <p className="text-texto">
        <span className="font-semibold">{quien}</span> {(ACCION[e.accion] ?? e.accion).toLowerCase()}{" "}
        <span className="font-semibold">{e.rolNombre}</span>
      </p>
      {detalle.map((r, i) => (
        <p key={i} className="mt-0.5 text-xs text-texto-3">
          {r}
        </p>
      ))}
      <p className="mt-0.5 text-xs text-texto-4">{fmtFechaHora(e.fecha)}</p>
    </li>
  );
}
