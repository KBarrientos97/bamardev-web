import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { bajarXlsx, type Exportacion } from "./contexto";

/**
 * El "Exportar a Excel" del encabezado de Reportes.
 *
 * Un reporte común arma la planilla con lo que ya tiene y baja al instante,
 * como siempre. Uno paginado del restaurante (Ventas, Movimientos de caja;
 * REP-03) baja antes todas las páginas del período, y eso tarda: el botón
 * dice "Preparando…" y no acepta otro toque mientras tanto (dos toques
 * bajaban dos veces el período entero). Si el archivo vino recortado, o no se
 * pudo armar, lo dice debajo:
 * un Excel recortado sin decirlo se lee como el total del período, y uno que
 * no baja sin decir nada parece un botón roto.
 *
 * Va en un fragmento a propósito: el aviso es otro hijo del encabezado (que es
 * `flex-wrap`) y con `basis-full` baja a su propio renglón, a todo el ancho.
 */
export function BotonExportar({ exportacion }: { exportacion: Exportacion }) {
  const [preparando, setPreparando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  // `preparando` apaga el botón recién en el render siguiente: dos clics en el
  // mismo tick pedían el período dos veces.
  const enCurso = useRef(false);

  async function exportar() {
    if (enCurso.current) return;
    setAviso(null);
    if (!exportacion.completa) {
      bajarXlsx(exportacion.nombre, exportacion.hojas());
      return;
    }
    enCurso.current = true;
    setPreparando(true);
    try {
      const r = await exportacion.completa();
      bajarXlsx(exportacion.nombre, r.hojas);
      if (r.aviso) setAviso({ texto: r.aviso, error: false });
    } catch (e) {
      // Con el mensaje del backend, que sabe decir por qué ("el período es
      // demasiado largo"); sin el punto final, que ya pone la frase.
      const motivo = e instanceof Error && e.message ? e.message.replace(/\.+$/, "") : "probá de nuevo";
      setAviso({ texto: `No se pudo armar el Excel: ${motivo}.`, error: true });
    } finally {
      enCurso.current = false;
      setPreparando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={exportar}
        disabled={preparando}
        aria-busy={preparando}
        className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary-boton px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-primary-boton-hover disabled:cursor-wait disabled:opacity-70"
      >
        <Icon name="download" size={16} />
        {preparando ? "Preparando…" : "Exportar a Excel"}
      </button>
      {aviso && (
        <p
          role={aviso.error ? "alert" : "status"}
          className={`basis-full rounded-xl px-3.5 py-2.5 text-[13px] ${
            aviso.error ? "bg-danger-bg text-danger-text" : "bg-amber-50 text-amber-900"
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </>
  );
}
