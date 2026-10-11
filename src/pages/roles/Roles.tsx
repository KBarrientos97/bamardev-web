import { useMemo, useState } from "react";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { AvisoOk, Badge, Boton, Cargando, ErrorMsg, useAviso, Vacio } from "../../components/ui";
import { apiRoles, nombresDelCatalogo, resumenGente, textoCantidadPermisos, tonoDeRol } from "../../lib/roles";
import { useApi } from "../../lib/useApi";
import type { RolNegocio } from "../../types";
import BitacoraRoles from "./BitacoraRoles";
import BorrarRol from "./BorrarRol";
import EditorRol from "./EditorRol";

/**
 * Roles del negocio (PLAN-ROLES-NEGOCIO): qué puede hacer cada uno. El negocio
 * crea los suyos, los renombra, les cambia los permisos y los borra; el
 * Administrador está siempre, con todo, y no se toca.
 *
 * Se usa sobre todo en el celular: la lista es de tarjetas a lo ancho y el
 * editor es una hoja que sube desde abajo, con los permisos plegados por tema.
 */

type Pestana = "roles" | "bitacora";
const PESTANAS = [
  ["roles", "Roles"],
  ["bitacora", "Bitácora"],
] as const;

export default function Roles() {
  const roles = useApi(() => apiRoles.listar(), []);
  // Sin el catálogo el editor no sabe qué permisos ofrecer: se avisa al abrirlo.
  const catalogo = useApi(() => apiRoles.catalogo(), []);
  const nombres = useMemo(() => nombresDelCatalogo(catalogo.datos), [catalogo.datos]);
  const [pestana, setPestana] = useState<Pestana>("roles");
  const [editando, setEditando] = useState<RolNegocio | "nuevo" | null>(null);
  const [borrando, setBorrando] = useState<RolNegocio | null>(null);
  const [aviso, setAviso] = useAviso();
  const lista = roles.datos ?? [];

  const alGuardar = (texto: string) => {
    setEditando(null);
    setAviso(texto);
    roles.recargar();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Roles"
        subtitulo="Qué puede hacer cada persona del equipo"
        accion={
          <Boton icono="plus" onClick={() => setEditando("nuevo")} disabled={!catalogo.datos}>
            Nuevo rol
          </Boton>
        }
      />
      <Chips valor={pestana} opciones={PESTANAS} onChange={setPestana} />
      <AvisoOk>{aviso}</AvisoOk>

      {pestana === "bitacora" ? (
        <BitacoraRoles nombres={nombres} />
      ) : roles.cargando && !roles.datos ? (
        <Cargando />
      ) : roles.error ? (
        <ErrorMsg>{roles.error}</ErrorMsg>
      ) : lista.length === 0 ? (
        <div className="card">
          <Vacio icono="key" titulo="Todavía no hay roles" texto="Creá el primero con lo que puede hacer." />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Roles del negocio">
          {lista.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setEditando(r)}
                className="card flex h-full w-full flex-col p-4 text-left transition-shadow hover:shadow-md"
                aria-label={`Ver el rol ${r.nombre}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[15px] font-bold text-texto">{r.nombre}</h3>
                  {r.esAdministrador ? (
                    <Badge tono="morado" className="shrink-0 gap-1">
                      <Icon name="lock" size={12} />
                      Sólo lectura
                    </Badge>
                  ) : (
                    <Icon name="chevronRight" size={17} color="#94A3B8" />
                  )}
                </div>
                {r.descripcion && <p className="mt-1 line-clamp-2 text-[13px] text-texto-3">{r.descripcion}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs text-texto-4">
                  {/* Sólo lo que el negocio puede usar: una plantilla trae
                      permisos de otros rubros que no cuentan (QA R1 W-02). */}
                  <Badge tono={tonoDeRol(r, lista)}>{textoCantidadPermisos(r)}</Badge>
                  <span className="flex items-center gap-1">
                    <Icon name="users" size={13} />
                    {resumenGente(r)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <EditorRol
          rol={editando === "nuevo" ? null : editando}
          catalogo={catalogo.datos ?? null}
          errorCatalogo={catalogo.error}
          onClose={() => setEditando(null)}
          onGuardado={alGuardar}
          onBorrar={(r) => {
            setEditando(null);
            setBorrando(r);
          }}
        />
      )}
      {borrando && (
        <BorrarRol
          rol={borrando}
          roles={lista}
          onClose={() => setBorrando(null)}
          onBorrado={(texto) => {
            setBorrando(null);
            setAviso(texto);
            roles.recargar();
          }}
          onDesactualizado={() => roles.recargar()}
        />
      )}
    </div>
  );
}
