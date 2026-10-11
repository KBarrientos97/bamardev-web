import { useState } from "react";
import { Boton, Campo, ErrorMsg, Modal, Select } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { apiRoles, mensajeDeError, resumenGente } from "../../lib/roles";
import type { RolNegocio } from "../../types";

/**
 * Borrar un rol (borrado lógico). Si alguien lo tiene —un usuario, o una
 * persona de Personal como cargo— hay que decir a qué rol pasa: nadie queda
 * con un rol que ya no existe. El Administrador no se ofrece como destino:
 * pasarle a un grupo entero todos los permisos por un clic de más no se
 * deshace fácil; a quien haga falta, se lo cambia uno por uno en Usuarios.
 */
export default function BorrarRol({
  rol,
  roles,
  onClose,
  onBorrado,
  onDesactualizado,
}: {
  rol: RolNegocio;
  roles: RolNegocio[];
  onClose: () => void;
  onBorrado: (aviso: string) => void;
  /** La cuenta de gente cambió desde que se cargó la lista (409): hay que recargarla. */
  onDesactualizado: () => void;
}) {
  const destinos = roles.filter((r) => r.id !== rol.id && !r.esAdministrador);
  const [conGente, setConGente] = useState(rol.usuarios + rol.personal > 0);
  const [destino, setDestino] = useState("");
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);

  async function borrar() {
    setError("");
    if (conGente && !destino) return setError("Elegí a qué rol pasan.");
    setBorrando(true);
    try {
      await apiRoles.borrar(rol.id, conGente ? Number(destino) : undefined);
      const a = destinos.find((r) => String(r.id) === destino);
      onBorrado(a && conGente ? `Rol "${rol.nombre}" borrado. Su gente pasó a "${a.nombre}".` : `Rol "${rol.nombre}" borrado.`);
    } catch (e) {
      // Alguien le asignó el rol a una persona mientras tanto: ahora sí hay
      // que elegir destino.
      if (e instanceof ApiError && e.codigo === "REASIGNAR_REQUERIDO") {
        setConGente(true);
        onDesactualizado();
      }
      setError(mensajeDeError(e));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={`Borrar "${rol.nombre}"`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={borrando}>
            Cancelar
          </Boton>
          <Boton variante="danger" icono="trash" onClick={borrar} disabled={borrando || (conGente && !destinos.length)}>
            {borrando ? "Un momento…" : "Borrar rol"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        {conGente ? (
          <>
            <p className="text-sm text-texto-2">
              Lo tienen {resumenGente(rol)}. Antes de borrarlo, elegí qué rol pasan a tener.
            </p>
            {destinos.length ? (
              <Campo label="Pasan a" hint="Desde ese momento pueden hacer lo que permite el rol nuevo.">
                <Select value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Pasan a">
                  <option value="">Elegí un rol…</option>
                  {destinos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            ) : (
              <p className="text-sm text-warning-text">
                No hay otro rol al que pasarlos. Creá uno primero.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-texto-2">Nadie lo tiene. Deja de aparecer en la lista; lo que ya pasó queda en la bitácora.</p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
