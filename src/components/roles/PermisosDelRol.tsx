import { agruparPorDominio, type NombresPermisos } from "../../lib/roles";
import type { PermisoDeRol } from "../../types";

/**
 * "Qué puede hacer este rol" (PLAN-ROLES §11): los permisos reales del rol en
 * ESTE negocio, agrupados por tema. Lo usan el detalle de un usuario, el
 * selector de rol al crear una cuenta y la pantalla de Roles.
 *
 * Plegado cuando acompaña a un formulario: está para el que quiere el detalle
 * antes de entregar una cuenta, no para todos.
 */
export default function PermisosDelRol({
  nombre,
  permisos,
  nombres,
  esAdministrador = false,
  plegado = true,
}: {
  nombre: string;
  permisos: PermisoDeRol[];
  nombres: NombresPermisos;
  esAdministrador?: boolean;
  plegado?: boolean;
}) {
  const lista = esAdministrador ? (
    <p className="mt-2 text-xs text-texto-3">Todos los permisos que incluye el plan del negocio.</p>
  ) : permisos.length === 0 ? (
    <p className="mt-2 text-xs text-texto-3">
      Ningún permiso: es un cargo descriptivo, quien lo tenga no entra a ninguna sección.
    </p>
  ) : (
    <ul className="mt-2 space-y-1 text-xs text-texto-3">
      {agruparPorDominio(permisos, nombres).map(({ dominio, permisos: delDominio }) => (
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
      <summary className="cursor-pointer select-none">Qué puede hacer {nombre.toLowerCase()}</summary>
      {lista}
    </details>
  );
}
