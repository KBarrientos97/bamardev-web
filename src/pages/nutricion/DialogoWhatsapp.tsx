import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/ui";
import { conDedo, enfocaSolo, enfocarOMostrar } from "../../lib/nutricion/foco";
import {
  abrirChatConPdf,
  compartirPdf,
  numeroDeLaFicha,
  numeroParaMostrar,
  numeroParaWhatsapp,
  type ResultadoCompartir,
} from "../../lib/nutricion/pdfComun";

/** Lo que necesita el diálogo para mandar el PDF: de quién, a qué número de entrada y qué se manda. */
export interface EnvioPorWhatsapp {
  /** El teléfono de la ficha del paciente, como está guardado (o nada). */
  telefono: string | null;
  /** El nombre del paciente: «Seguimiento de Lucía Paredes». */
  paciente: string;
  que: "Seguimiento" | "Evaluación";
  /** El mensaje: «Seguimiento del tratamiento al 26/11/2026.» */
  mensaje: string;
  nombreArchivo: string;
  armar: () => Promise<Blob>;
}

/**
 * El nombre del PDF, que pasa de renglón sin cortarse: la fecha del final
 * («2026-11-26.pdf») va entera; si no entra, baja después de un guion de
 * antes (a 360 px quedaba «…-2026-11-» arriba y «26.pdf» abajo).
 */
function NombreDeArchivo({ nombre }: { nombre: string }) {
  const partes = /^(.*?)(\d{4}-\d{2}-\d{2}\.pdf)$/.exec(nombre);
  if (!partes) return <>{nombre}</>;
  return (
    <>
      {partes[1]}
      <wbr />
      <span className="whitespace-nowrap">{partes[2]}</span>
    </>
  );
}

// ── El diálogo ──────────────────────────────────────────────────────────────

/**
 * «Enviar por WhatsApp» del PDF de nutrición (26-nov-2026): el número de la
 * ficha del paciente en un campo y el botón redondo de enviar, como en
 * WhatsApp, que abre el chat de ESE número con el mensaje listo. Antes, en el
 * teléfono, salía el diálogo de compartir del sistema: había que buscar el
 * contacto, y si el paciente no estaba agendado no aparecía.
 *
 * Desde una página web `wa.me` no puede adjuntar el PDF: se descarga y se
 * adjunta en el chat con el clip (el diálogo lo dice). Donde el equipo puede
 * compartir archivos, también está «Compartir el PDF por otra app», que sí lo
 * adjunta pero sin elegir el número.
 *
 * Cada vez que se abre, el número es el de la ficha o vacío: no se recuerda
 * uno escrito antes. El PDF se empieza a armar al abrir, para que al tocar
 * enviar (o compartir) ya esté.
 */
export default function DialogoWhatsapp({
  envio,
  onCerrar,
  onAviso,
  onError,
}: {
  envio: EnvioPorWhatsapp;
  onCerrar: () => void;
  /** El aviso verde de la pantalla, después de cerrar. */
  onAviso: (texto: string) => void;
  onError: (texto: string) => void;
}) {
  const inicial = numeroDeLaFicha(envio.telefono);
  const [valor, setValor] = useState(inicial);
  const [error, setError] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const pdf = useRef<Promise<Blob> | null>(null);
  // El PDF ya armado: con él, enviar baja el archivo antes de saltar al chat (`abrirChatConPdf`).
  const pdfListo = useRef<Blob | null>(null);

  // Una sola vez por diálogo abierto (el guardián también cubre el doble
  // efecto del modo estricto). El error de armarlo se muestra al usarlo.
  useEffect(() => {
    if (pdf.current) return;
    const armado = envio.armar();
    armado.then(
      (blob) => {
        pdfListo.current = blob;
      },
      () => {},
    );
    pdf.current = armado;
  }, [envio]);
  const elPdf = () => pdf.current ?? envio.armar();

  const numero = numeroParaWhatsapp(valor);
  // Con «+» adelante es de otro país (o el código va escrito): el «+591» fijo sobra.
  const otroPais = valor.trim().startsWith("+");
  const puedeCompartir = conDedo() && typeof navigator.share === "function" && typeof navigator.canShare === "function";

  function enviar(e?: FormEvent) {
    e?.preventDefault();
    if (!numero) {
      setError(true);
      enfocarOMostrar(campo.current);
      return;
    }
    const mostrar = numeroParaMostrar(numero);
    // El chat se abre acá mismo, dentro del toque: `abrirChatConPdf` no espera nada antes.
    const listo = elPdf();
    abrirChatConPdf({ numero, texto: envio.mensaje, nombreArchivo: envio.nombreArchivo, armar: () => listo, listo: pdfListo.current }).then(
      () => onAviso(`Se abrió el chat de ${mostrar}. El PDF se descargó: adjuntalo con el clip.`),
      () => onError("No se pudo armar el PDF. Probá de nuevo."),
    );
    onCerrar();
  }

  async function compartir() {
    if (compartiendo) return;
    setCompartiendo(true);
    let r: ResultadoCompartir;
    try {
      r = await compartirPdf({ texto: envio.mensaje, nombreArchivo: envio.nombreArchivo, armar: elPdf });
    } catch {
      onError("No se pudo armar el PDF. Probá de nuevo.");
      onCerrar();
      return;
    }
    // Cancelado: sigue abierto, para mandarlo por el número o probar otra vez.
    if (r === "cancelado") {
      setCompartiendo(false);
      return;
    }
    if (r === "descargado") onAviso("Se descargó el PDF: adjuntalo en el chat de WhatsApp.");
    onCerrar();
  }

  return (
    <Modal abierto titulo="Enviar por WhatsApp" subtitulo={`${envio.que} de ${envio.paciente}`} onClose={onCerrar} ancho="max-w-md">
      <form onSubmit={enviar} noValidate className="pb-[env(safe-area-inset-bottom)]">
        <label htmlFor="whatsapp-numero" className="block text-[13px] font-semibold text-texto-2">
          Número de WhatsApp
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <div
            className={`flex h-[50px] min-w-0 flex-1 items-center rounded-full border bg-white transition-colors focus-within:ring-2 ${
              error ? "border-danger focus-within:ring-danger/20" : "border-borde focus-within:border-primary focus-within:ring-primary-100"
            }`}
          >
            {!otroPais && (
              <span aria-hidden="true" className="flex h-6 shrink-0 items-center border-r border-borde pl-4 pr-2.5 text-[15px] font-semibold tabular-nums text-texto-3">
                +591
              </span>
            )}
            <input
              ref={campo}
              id="whatsapp-numero"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              // En la PC toma el foco; con el dedo no, para que el teclado no tape el diálogo al abrir.
              autoFocus={enfocaSolo()}
              maxLength={20}
              value={valor}
              aria-invalid={error || undefined}
              aria-describedby="whatsapp-ayuda"
              onChange={(e) => {
                // Mientras se escribe: dígitos, espacios, «+» y guiones.
                setValor(e.target.value.replace(/[^\d\s+-]/g, ""));
                setError(false);
              }}
              className={`h-full min-w-0 flex-1 bg-transparent pr-2 text-base tabular-nums text-texto outline-none placeholder:text-texto-4 ${otroPais ? "pl-4" : "pl-3"}`}
            />
            {valor && (
              <button
                type="button"
                aria-label="Borrar el número"
                // Si el campo ya tenía el foco (el teclado arriba), lo sigue teniendo.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValor("");
                  setError(false);
                  enfocarOMostrar(campo.current);
                }}
                className="mr-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-texto-4 transition-colors hover:bg-muted hover:text-texto-2"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          <button
            type="submit"
            aria-label={numero ? `Enviar por WhatsApp al ${numeroParaMostrar(numero)}` : "Enviar por WhatsApp"}
            title="Abrir el chat"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-[#008F70] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00A884] active:scale-95"
          >
            <Icon name="enviar" size={22} />
          </button>
        </div>
        {error ? (
          <p key="error" id="whatsapp-ayuda" role="alert" className="mt-2 text-[13px] font-semibold text-danger-text">
            Escribí el número completo: 8 dígitos.
          </p>
        ) : (
          <p key="ayuda" id="whatsapp-ayuda" className="mt-2 min-h-5 text-[13px] text-texto-3">
            {!inicial ? "No tiene teléfono en su ficha: escribí el número." : valor === inicial ? "Es el teléfono de su ficha. Podés cambiarlo." : ""}
          </p>
        )}

        <p className="mt-4 text-[13px] font-semibold text-texto-2">Se envía</p>
        {/* Como se ve en el chat: el mensaje, con el PDF adjunto. */}
        <div className="mt-1.5 rounded-2xl rounded-tr-md bg-[#D9FDD3] p-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/85 px-2.5 py-2">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Icon name="fileText" size={19} />
            </span>
            <span className="min-w-0 break-words text-[13px] font-semibold text-texto">
              <NombreDeArchivo nombre={envio.nombreArchivo} />
            </span>
          </div>
          <p className="break-words px-1.5 pb-0.5 pt-2 text-sm text-texto">{envio.mensaje}</p>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-texto-3">
          <Icon name="info" size={15} className="mt-px shrink-0" />
          <span>Se abre el chat de ese número con el mensaje listo. El PDF se descarga: adjuntalo en el chat con el clip.</span>
        </p>

        {puedeCompartir && (
          <div className="mt-4 border-t border-borde-soft pt-4">
            <button
              type="button"
              onClick={() => void compartir()}
              disabled={compartiendo}
              aria-describedby="whatsapp-compartir"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted disabled:opacity-60"
            >
              <Icon name="compartir" size={17} />
              {compartiendo ? "Abriendo…" : "Compartir el PDF por otra app"}
            </button>
            <p id="whatsapp-compartir" className="mt-1.5 text-center text-xs text-texto-3">
              Para elegir un contacto guardado u otra aplicación.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
