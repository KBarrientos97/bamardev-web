import { useState } from "react";
import { useLocation } from "react-router-dom";
import { RUTA_ENTRAR, bienvenidaPendiente, marcarBienvenidaVista, type DatosBienvenida } from "../lib/alta/entrada";
import { fmtFecha } from "../lib/format";
import { useAuth } from "../store/AuthContext";
import { Boton, Modal } from "./ui";

/**
 * La bienvenida de una cuenta creada desde la landing (PLAN-ALTA-LANDING).
 * Entró sin escribir nada —el enlace traía el código—, así que es la única
 * vez que alguien le dice con qué se entra la próxima: el código de su negocio
 * (el alias, que eligió el backend), el usuario `admin` y la contraseña que
 * puso en el formulario. Sale una sola vez por usuario de cada negocio.
 */
export default function BienvenidaAlta() {
  const { token, usuario, negocio } = useAuth();
  const { pathname } = useLocation();
  // En `/entrar` todavía no: la deja pendiente esa pantalla después de abrir
  // la sesión, y se monta recién al llegar al inicio, cuando ya está escrita.
  if (!token || !usuario || !negocio || pathname === RUTA_ENTRAR) return null;
  // Con `key`: si en la misma pestaña entra otra cuenta, se vuelve a mirar.
  return <Bienvenida key={`${negocio.id}:${usuario.id}`} negocioId={negocio.id} usuarioId={usuario.id} />;
}

function Bienvenida({ negocioId, usuarioId }: { negocioId: number; usuarioId: number }) {
  const [datos, setDatos] = useState<DatosBienvenida | null>(() =>
    bienvenidaPendiente(negocioId, usuarioId),
  );
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);

  if (!datos) return null;

  const cerrar = () => {
    marcarBienvenidaVista(negocioId, usuarioId);
    setDatos(null);
  };

  // La contraseña no va: no la tenemos, y aunque la tuviéramos no se copia a
  // un portapapeles que lee cualquier app del celular.
  const texto = `Mi cuenta de BamarDev\nCódigo del negocio: ${datos.alias}\nUsuario: ${datos.usuario}\nEntrar: ${window.location.origin}`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  };

  return (
    <Modal
      abierto
      titulo="¡Listo, tu cuenta está creada!"
      subtitulo={datos.nombreNegocio}
      onClose={cerrar}
      // Que no se pierda con un toque al costado antes de anotar los datos.
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <Boton type="button" onClick={cerrar} className="w-full sm:w-auto">
          Empezar
        </Boton>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-snug text-texto-2">
          Guardá estos datos: con ellos entrás la próxima vez, desde este o cualquier otro equipo.
        </p>
        <dl className="divide-y divide-borde-soft rounded-xl border border-borde bg-muted text-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-texto-3">Código de tu negocio</dt>
            <dd className="font-mono text-base font-bold text-texto" data-testid="bienvenida-alias">
              {datos.alias}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-texto-3">Usuario</dt>
            <dd className="font-mono text-base font-bold text-texto">{datos.usuario}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-texto-3">Contraseña</dt>
            <dd className="text-right text-texto-2">Es la que elegiste</dd>
          </div>
        </dl>
        <Boton type="button" variante="soft" icono={copiado === "si" ? "check" : undefined} onClick={copiar} className="w-full">
          {copiado === "si" ? "Datos copiados" : "Copiar mis datos"}
        </Boton>
        {copiado === "no" && (
          <p role="status" className="text-center text-xs text-texto-3">
            No se pudo copiar. Anotalos o sacales una captura.
          </p>
        )}
        <p className="rounded-xl bg-primary-50 px-4 py-3 text-sm leading-snug text-texto-2">
          Tenés <strong className="font-semibold text-texto">7 días de prueba gratis</strong>
          {datos.vence ? ` (hasta el ${fmtFecha(datos.vence)})` : ""}. Para seguir después, pagás con QR
          desde la app.
        </p>
      </div>
    </Modal>
  );
}
