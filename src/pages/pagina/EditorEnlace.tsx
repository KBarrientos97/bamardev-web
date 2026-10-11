import { useEffect, useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { ICONO_BOTON, NOMBRE_ICONO_BOTON, TIPOS_EDITOR } from "../../lib/pagina/aspecto";
import type { EnlaceEditor, EnlaceInput, FormatoEnlace, TipoEnlace } from "../../lib/pagina/tipos";
import { Trazo } from "./VistaPagina";

/** Lo que muestra el campo `valor` al editar: lo que escribió el dueño. */
function mensajeDe(url: string): string {
  const m = /[?&]text=([^&]*)/.exec(url);
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Alta y edición de un enlace de la página: el dueño elige el tipo y escribe
 * su usuario o número (§1.5); el backend arma y valida la URL.
 */
export default function EditorEnlace({
  abierto,
  enlace,
  tipoInicial,
  formatoInicial,
  onClose,
  onGuardar,
}: {
  abierto: boolean;
  /** null = alta. */
  enlace: EnlaceEditor | null;
  tipoInicial?: TipoEnlace;
  formatoInicial?: FormatoEnlace;
  onClose: () => void;
  onGuardar: (input: EnlaceInput) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoEnlace>("WHATSAPP");
  const [formato, setFormato] = useState<FormatoEnlace>("ICONO");
  const [etiqueta, setEtiqueta] = useState("");
  const [valor, setValor] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [icono, setIcono] = useState("enlace");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError("");
    setTipo(enlace?.tipo ?? tipoInicial ?? "WHATSAPP");
    setFormato(enlace?.formato ?? formatoInicial ?? (tipoInicial === "BOTON" ? "BOTON" : "ICONO"));
    setEtiqueta(enlace?.etiqueta ?? "");
    setValor(enlace?.valor ?? "");
    setMensaje(enlace?.tipo === "WHATSAPP" ? mensajeDe(enlace.url) : "");
    setIcono(enlace?.icono ?? "enlace");
  }, [abierto, enlace, tipoInicial, formatoInicial]);

  const meta = TIPOS_EDITOR.find((t) => t.tipo === tipo) ?? TIPOS_EDITOR[0];
  const esLibre = tipo === "BOTON";
  const formatoFinal: FormatoEnlace = esLibre ? "BOTON" : formato;

  const guardar = async () => {
    if (!valor.trim()) {
      setError(`Completá: ${meta.pide.toLowerCase()}`);
      return;
    }
    if (esLibre && !etiqueta.trim()) {
      setError("Escribí el texto del botón");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onGuardar({
        tipo,
        formato: formatoFinal,
        etiqueta: etiqueta.trim() || undefined,
        valor: valor.trim(),
        mensaje: tipo === "WHATSAPP" ? mensaje.trim() || undefined : undefined,
        icono: formatoFinal === "BOTON" && esLibre ? icono : undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo={enlace ? "Editar enlace" : esLibre ? "Nuevo botón" : "Nueva red o enlace"}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <ErrorMsg>{error}</ErrorMsg>
        <Campo label="Tipo">
          <Select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEnlace)}>
            {TIPOS_EDITOR.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label={meta.pide} hint={tipo === "WHATSAPP" ? "El número de tu negocio. Arma el enlace wa.me solo." : undefined}>
          <Input
            aria-label={meta.pide}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={meta.ejemplo}
            inputMode={tipo === "WHATSAPP" || tipo === "TELEFONO" ? "tel" : undefined}
            autoFocus
          />
        </Campo>
        {tipo === "WHATSAPP" && (
          <Campo label="Mensaje inicial (opcional)" hint="Lo que aparece escrito cuando el cliente abre el chat.">
            <Input
              aria-label="Mensaje inicial"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Hola, quiero hacer un pedido"
              maxLength={300}
            />
          </Campo>
        )}
        <Campo label={esLibre ? "Texto del botón" : "Texto (opcional)"} hint={esLibre ? undefined : `Si lo dejás vacío: "${meta.nombre}"`}>
          <Input
            aria-label={esLibre ? "Texto del botón" : "Texto"}
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder={esLibre ? "Ver el menú y precios" : meta.nombre}
            maxLength={60}
          />
        </Campo>
        {!esLibre && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">Cómo se muestra</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["ICONO", "Ícono en la fila de redes"],
                  ["BOTON", "Botón grande"],
                ] as const
              ).map(([f, texto]) => (
                <label
                  key={f}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                    formato === f ? "border-primary bg-primary-50 font-semibold text-primary-700" : "border-borde"
                  }`}
                >
                  <input type="radio" name="formato" checked={formato === f} onChange={() => setFormato(f)} />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {esLibre && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">Ícono</legend>
            <div className="flex flex-wrap gap-2">
              {Object.keys(ICONO_BOTON).map((k) => (
                <button
                  key={k}
                  type="button"
                  title={NOMBRE_ICONO_BOTON[k]}
                  aria-label={`Ícono ${NOMBRE_ICONO_BOTON[k]}`}
                  aria-pressed={icono === k}
                  onClick={() => setIcono(k)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                    icono === k ? "border-primary bg-primary-50" : "border-borde bg-white"
                  }`}
                >
                  <Trazo d={ICONO_BOTON[k]} color="#374151" />
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
