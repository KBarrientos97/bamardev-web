import { useAuth } from "../store/AuthContext";
import { Icon } from "./Icon";

/**
 * Barra de aviso de licencia. Aparece en los 7 días previos al vencimiento y
 * durante los 3 de gracia posteriores (ver `vigencia.ts` del backend).
 *
 * No se puede cerrar a propósito: el bloqueo llega igual cuando se acaba la
 * gracia, y un aviso que el dueño descarta el primer día no le sirve a nadie.
 * Las situaciones vigentes normales ("activa", "prueba") no muestran nada.
 */
export default function AvisoLicencia() {
  const { licencia } = useAuth();

  if (!licencia || !licencia.mensaje) return null;
  const { situacion } = licencia;
  if (situacion !== "por_vencer" && situacion !== "en_gracia") return null;

  // En gracia ya venció: el tono sube de aviso a alarma.
  const urgente = situacion === "en_gracia";

  return (
    <div
      role="status"
      className={[
        "flex items-center gap-3 border-b px-4 py-2.5 text-[13px] font-semibold print:hidden",
        urgente
          ? "border-danger-text/20 bg-danger-bg text-danger-text"
          : "border-warning/30 bg-warning-bg text-warning-text",
      ].join(" ")}
    >
      <Icon name="alert" size={17} />
      <span className="min-w-0 flex-1">{licencia.mensaje}</span>
      {licencia.urlPago && (
        <a
          href={licencia.urlPago}
          target="_blank"
          rel="noreferrer"
          className={[
            "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white",
            urgente ? "bg-danger-text" : "bg-warning-text",
          ].join(" ")}
        >
          Pagar
        </a>
      )}
    </div>
  );
}
