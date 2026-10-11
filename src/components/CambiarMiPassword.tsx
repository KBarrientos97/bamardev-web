import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { Icon } from "./Icon";
import { AvisoOk, Boton, Campo, ErrorMsg, InputPassword, Modal } from "./ui";

/**
 * "Cambiar mi contraseña" (API-12), desde el menú: cualquiera cambia la suya,
 * tenga o no permiso de administrar usuarios. Pide la actual —quien encuentra
 * la sesión abierta en la tablet del mostrador no se la cambia al dueño— y la
 * nueva dos veces, como el alta.
 */
export default function CambiarMiPassword({ onClose }: { onClose: () => void }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  // Un solo ojo para las dos nuevas: se alternan juntas (ver InputPassword).
  const [verNueva, setVerNueva] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  async function guardar() {
    setError("");
    if (!actual) return setError("Poné tu contraseña actual.");
    if (nueva.length < 6) return setError("La contraseña nueva necesita al menos 6 caracteres.");
    if (nueva !== repetir) return setError("Las dos contraseñas nuevas no coinciden.");
    if (nueva === actual) return setError("La nueva tiene que ser distinta de la actual.");
    setGuardando(true);
    try {
      await api.cambiarMiPassword(actual, nueva);
      setListo(true);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Cambiar mi contraseña"
      subtitulo={listo ? undefined : "La próxima vez que entres, usá la nueva."}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-sm"
      acciones={
        listo ? (
          <Boton onClick={onClose}>Listo</Boton>
        ) : (
          <>
            {/* En el pie, junto a Guardar: siempre a la vista (QA R1 W-01). */}
            {error && (
              <div role="alert" className="basis-full">
                <ErrorMsg>{error}</ErrorMsg>
              </div>
            )}
            <Boton variante="ghost" onClick={onClose} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton icono="save" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </>
        )
      }
    >
      {listo ? (
        <AvisoOk>Contraseña actualizada. Esta sesión sigue abierta.</AvisoOk>
      ) : (
        <div className="space-y-4">
          <Campo label="Contraseña actual">
            <InputPassword
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </Campo>
          <Campo label="Contraseña nueva" hint="Mínimo 6 caracteres">
            <InputPassword
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              visible={verNueva}
              onCambiarVisible={setVerNueva}
              autoComplete="new-password"
            />
          </Campo>
          <Campo label="Repetir la nueva">
            <InputPassword
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              visible={verNueva}
              sinOjo
              autoComplete="new-password"
            />
          </Campo>
        </div>
      )}
    </Modal>
  );
}

/**
 * El acceso a "Cambiar mi contraseña" de las pantallas que van sin el menú
 * lateral (QA R2-03): Mi agenda del profesional, su aviso de "llega pronto" y
 * el turno del mesero. En el menú lo abre el Layout; acá cada botón trae su
 * formulario. `icono` es el botón cuadrado de una cabecera oscura (junto a
 * Salir); si no, una línea de texto como el "Cerrar sesión" de al lado.
 */
export function BotonCambiarMiPassword({
  icono = false,
  className = "",
}: {
  icono?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {icono ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Cambiar mi contraseña"
          title="Cambiar mi contraseña"
          className={className}
        >
          <Icon name="lock" size={20} />
        </button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className={className}>
          <Icon name="lock" size={15} />
          Cambiar mi contraseña
        </button>
      )}
      {abierto && <CambiarMiPassword onClose={() => setAbierto(false)} />}
    </>
  );
}

/**
 * La actual equivocada puede llegar como 401 o 400/403 según el backend; el
 * 401 no cierra la sesión acá (ver RUTAS_LOGIN en api.ts) y se dice claro.
 */
function mensaje(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return "La contraseña actual no es correcta.";
  return e instanceof Error && e.message ? e.message : "No se pudo cambiar la contraseña.";
}
