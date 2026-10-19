import { useCallback, useEffect, useState } from "react";
import { tienePermiso } from "../../lib/permisos";
import { apiSeguridad, type RespuestaIntentos } from "../../lib/seguridad/apiSeguridad";
import { franjaDe } from "../../lib/seguridad/intentosPin";
import { useAuth } from "../../store/AuthContext";
import { Icon } from "../Icon";
import { EVENTO_INTENTOS_PIN, ModalIntentosPin } from "./ModalIntentosPin";

/** Cada cuánto se mira si hay algo nuevo, con la pestaña a la vista. */
const CADA_MS = 60_000;

/**
 * La franja de los PIN mal escritos (el dueño, 18-oct-2026: "de alguna
 * manera al admin le debe llegar un warning"), arriba de todas las pantallas
 * de quien administra los PIN (`usuarios.asignar_pin`: de fábrica, sólo el
 * Administrador). La TV del salón va fuera del Layout: ahí no sale.
 *
 * Roja fija si alguien está frenado del día (no se cierra hasta habilitarlo);
 * roja con una alarma (se revisa en el detalle); gris con un fallo que nadie
 * explicó ("Ya lo vi" acá mismo). Es la garantía: la push al celular es un
 * plus que puede no estar configurada. Se mira al abrir, cada minuto con la
 * pestaña a la vista, al volver a ella y cuando el modal cambia algo.
 */
export default function FranjaIntentosPin() {
  const { usuario } = useAuth();
  const administra = tienePermiso(usuario, "usuarios.asignar_pin");
  const [datos, setDatos] = useState<RespuestaIntentos | null>(null);
  const [abierto, setAbierto] = useState(false);

  const mirar = useCallback(async () => {
    try {
      setDatos(await apiSeguridad.intentos({ sinVer: true }));
    } catch {
      // Sin red o un backend viejo sin la ruta: no se muestra nada y se
      // vuelve a mirar en el próximo minuto. No es motivo para un cartel.
    }
  }, []);

  useEffect(() => {
    if (!administra) {
      // Otra sesión en el mismo navegador no ve lo de la anterior.
      setDatos(null);
      return;
    }
    void mirar();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void mirar();
    }, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    const alCambiar = () => void mirar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_INTENTOS_PIN, alCambiar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_INTENTOS_PIN, alCambiar);
    };
  }, [administra, mirar]);

  if (!administra || !datos) return null;
  const franja = franjaDe(datos, usuario?.id);

  async function yaLoVi() {
    if (!franja) return;
    try {
      await apiSeguridad.marcarVistos(franja.hastaId);
    } finally {
      void mirar();
    }
  }

  return (
    <>
      {franja && (
        <div
          role={franja.tono === "rojo" ? "alert" : "status"}
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 text-[13px] print:hidden ${
            franja.tono === "rojo"
              ? "border-danger-text/20 bg-danger-bg text-danger-text"
              : "border-borde bg-muted text-texto-2"
          }`}
        >
          <Icon name="lock" size={16} />
          <p className="min-w-0 flex-1 basis-64 font-semibold">{franja.texto}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
            >
              {franja.boton}
            </button>
            {franja.cerrable && (
              <button
                type="button"
                onClick={yaLoVi}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-white/60"
              >
                Ya lo vi
              </button>
            )}
          </div>
        </div>
      )}
      {abierto && <ModalIntentosPin inicial="sinVer" onClose={() => setAbierto(false)} />}
    </>
  );
}
