import { agruparPorDominio, esDisponible, type NombresPermisos } from "../../lib/roles";
import type { PermisoDeRolVista } from "../../types";

const SIN_CATALOGO: NombresPermisos = new Map();

/**
 * "Qué puede hacer este rol" (PLAN-ROLES §11): los permisos reales del rol en
 * ESTE negocio, agrupados por tema. Reales = los que el negocio puede usar
 * (`disponible`): una plantilla de rubro puede traer la agenda o las mesas a
 * una pollería, y decir que el cajero "ve alergias" era mentira (QA R1 W-03). Lo usan el detalle de un usuario, el
 * selector de rol al crear una cuenta y la pantalla de Roles.
 *
 * Plegado cuando acompaña a un formulario: está para el que quiere el detalle
 * antes de entregar una cuenta, no para todos.
 */
export default function PermisosDelRol({
  nombre,
  permisos,
  nombres = SIN_CATALOGO,
  esAdministrador = false,
  plegado = true,
}: {
  nombre: string;
  permisos: PermisoDeRolVista[];
  /** Del catálogo, para quien lo tenga a mano; los permisos ya traen su nombre. */
  nombres?: NombresPermisos;
  esAdministrador?: boolean;
  plegado?: boolean;
}) {
  const efectivos = permisos.filter(esDisponible);
  const lista = esAdministrador ? (
    <p className="mt-2 text-xs text-texto-3">Todos los permisos que incluye el plan del negocio.</p>
  ) : efectivos.length === 0 ? (
    <p className="mt-2 text-xs text-texto-3">
      Ningún permiso: es un cargo descriptivo, quien lo tenga no entra a ninguna sección.
    </p>
  ) : (
    <ul className="mt-2 space-y-1 text-xs text-texto-3">
      {agruparPorDominio(efectivos, nombres).map(({ dominio, permisos: delDominio }) => (
        <li key={dominio}>
          <span className="font-medium text-texto-2">{dominio}:</span>{" "}
          {delDominio
            .map((p) => (p.alcance === "PROPIO" ? `${p.nombre} (sólo lo suyo)` : p.nombre))
            .join(" · ")}
        </li>
      ))}
    </ul>
  );
  if (!plegado) return lista;
  return (
    <details className="mt-2 text-xs text-texto-3">
      {/* El nombre tal como lo puso el negocio (QA R1 W-09): "QA Caja simple"
          no es "qa caja simple". */}
      <summary className="cursor-pointer select-none">Qué puede hacer {nombre}</summary>
      {lista}
    </details>
  );
}
