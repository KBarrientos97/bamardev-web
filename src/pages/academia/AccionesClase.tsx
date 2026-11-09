import { useState } from "react";
import { Boton, Campo, Confirmar, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { cuandoEsClase, estaSuspendida } from "../../lib/academia/clases";
import { mensajeDelBackend } from "../../lib/academia/errores";
import type { PersonaClase } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { BotonFila, Chip } from "./piezas";

/**
 * Lo que una clase necesita para sus acciones: lo tienen las de Clases de hoy
 * (`ClaseDelDia`) y las del grupo (`ClaseDelGrupo`).
 */
export interface ClaseAccionable {
  sesionId: number;
  fecha?: string;
  horaInicio: string;
  estado?: string;
  suspendida?: boolean;
  motivoSuspension?: string | null;
  docente: string | PersonaClase | null;
  titular?: PersonaClase | null;
  reemplazo?: boolean;
  llegadaEn: string | null;
  conAtraso?: boolean;
  atrasoJustificado?: boolean;
  justificacion?: string | null;
  lista: { pasada: boolean };
}


const nombreDocente = (d: ClaseAccionable["docente"]) => (typeof d === "string" ? d : (d?.nombre ?? null));


/** Las frases que más se escriben: un toque y queda puesta. */
const MOTIVOS_SUSPENSION = ["El docente no vino", "Feriado", "Corte de luz"];
const MOTIVOS_ATRASO = ["Avisó antes", "Trancadera", "Problema de salud"];

/**
 * Los chips de lo que cambió en una clase: suspendida (con el motivo),
 * reemplazo (quién la da en lugar de quién) y el atraso justificado.
 */
export function ChipsDeClase({ c }: { c: ClaseAccionable }) {
  const p = usePalabras();
  return (
    <>
      {estaSuspendida(c) && (
        <Chip tono="rojo" className="text-[12px]">
          Suspendida{c.motivoSuspension ? ` · ${c.motivoSuspension}` : ""}
        </Chip>
      )}
      {c.reemplazo && (
        <Chip tono="azul" className="text-[12px]">
          Reemplazo{c.titular ? ` de ${c.titular.nombre}` : ` de otro ${p.docente}`}
        </Chip>
      )}
      {c.atrasoJustificado && (
        <span title={c.justificacion ?? undefined}>
          <Chip tono="azul" className="text-[12px]">
            Atraso justificado{c.justificacion ? ` · ${c.justificacion}` : ""}
          </Chip>
        </span>
      )}
    </>
  );
}

/**
 * Las acciones de la administración sobre una clase puntual (tanda 2 de la
 * revisión del 08-nov), iguales en Clases de hoy y en la lista de clases del
 * grupo:
 *
 *   · «No vino» (ítem 16): suspender la clase con su motivo o poner a otro
 *     docente por ese día. Con `academia.grupos`. Sólo mientras no tenga
 *     llegada ni lista: si ya se dio, no se suspende. D7: el reemplazo no
 *     cambia el pago, y se dice;
 *   · deshacer la suspensión o quitar el reemplazo, con confirmación (se le
 *     avisa al docente);
 *   · «Justificar» un atraso de verdad (pasada la tolerancia), con su motivo.
 *     Con `asistencia.justificar`.
 *
 * Todo lo que cambia lo responde el servidor; la pantalla vuelve a pedir lo
 * suyo con `onCambio`.
 */
export function AccionesClase({ c, sedeId, onCambio }: { c: ClaseAccionable; sedeId?: number | null; onCambio: () => void }) {
  const { usuario } = useAuth();
  const p = usePalabras();
  const arma = tienePermiso(usuario, "academia.grupos");
  const justifica = tienePermiso(usuario, "asistencia.justificar");
  const [abierto, setAbierto] = useState<"novino" | "justificar" | "deshacer" | "sinReemplazo" | "sinJustificar" | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const suspendida = estaSuspendida(c);
  const docente = nombreDocente(c.docente);

  async function hacer(accion: () => Promise<unknown>) {
    setProcesando(true);
    setError("");
    try {
      await accion();
      setAbierto(null);
      onCambio();
    } catch (e) {
      setAbierto(null);
      setError(mensajeDelBackend(e, "No se pudo guardar"));
    } finally {
      setProcesando(false);
    }
  }

  const botones: React.ReactNode[] = [];
  if (arma && suspendida) {
    botones.push(
      <BotonFila key="deshacer" variante="ghost" icono="girar" onClick={() => setAbierto("deshacer")} aria-label={`Deshacer la suspensión de las ${c.horaInicio}`}>
        Deshacer suspensión
      </BotonFila>,
    );
  } else if (arma && c.reemplazo) {
    botones.push(
      <BotonFila key="sinReemplazo" variante="ghost" icono="girar" onClick={() => setAbierto("sinReemplazo")} aria-label={`Quitar el reemplazo de las ${c.horaInicio}`}>
        Quitar reemplazo
      </BotonFila>,
    );
  } else if (arma && !c.llegadaEn && !c.lista.pasada) {
    botones.push(
      <BotonFila key="novino" variante="ghost" icono="userX" onClick={() => setAbierto("novino")} aria-label={`No vino el ${p.docente} de las ${c.horaInicio}`}>
        No vino
      </BotonFila>,
    );
  }
  if (justifica && c.llegadaEn && c.conAtraso) {
    botones.push(
      c.atrasoJustificado ? (
        <BotonFila key="sinJustificar" variante="ghost" icono="x" onClick={() => setAbierto("sinJustificar")} aria-label={`Quitar la justificación de las ${c.horaInicio}`}>
          Quitar justificación
        </BotonFila>
      ) : (
        <BotonFila key="justificar" variante="ghost" icono="check" onClick={() => setAbierto("justificar")} aria-label={`Justificar el atraso de las ${c.horaInicio}`}>
          Justificar
        </BotonFila>
      ),
    );
  }
  if (!botones.length && !error) return null;

  return (
    <>
      {botones}
      {error && (
        <span className="basis-full">
          <ErrorMsg>{error}</ErrorMsg>
        </span>
      )}
      {abierto === "novino" && (
        <DialogoNoVino
          c={c}
          sedeId={sedeId}
          procesando={procesando}
          onCerrar={() => setAbierto(null)}
          onSuspender={(motivo) => void hacer(() => apiAcademia.suspenderClase(c.sesionId, motivo))}
          onReemplazo={(personalId) => void hacer(() => apiAcademia.ponerReemplazo(c.sesionId, personalId))}
        />
      )}
      {abierto === "justificar" && (
        <DialogoMotivo
          titulo="Justificar el atraso"
          subtitulo={`${docente ?? `El ${p.docente}`} · ${cuandoEsClase(c)}`}
          texto="¿Por qué llegó tarde? Queda anotado y no se descuenta nada."
          etiqueta="Motivo"
          sugerencias={MOTIVOS_ATRASO}
          etiquetaOk="Justificar"
          procesando={procesando}
          onCerrar={() => setAbierto(null)}
          onOk={(motivo) => void hacer(() => apiAcademia.justificarAtraso(c.sesionId, motivo))}
        />
      )}
      <Confirmar
        abierto={abierto === "deshacer"}
        titulo="Deshacer la suspensión"
        texto={`La clase del ${cuandoEsClase(c)} vuelve a estar en pie. Se le avisa al ${p.docente}.`}
        etiquetaOk="Sí, la clase va"
        procesando={procesando}
        onCancel={() => setAbierto(null)}
        onOk={() => void hacer(() => apiAcademia.quitarSuspension(c.sesionId))}
      />
      <Confirmar
        abierto={abierto === "sinReemplazo"}
        titulo="Quitar el reemplazo"
        texto={`La clase del ${cuandoEsClase(c)} vuelve a ${c.titular?.nombre ?? `su ${p.docente}`}${docente ? ` y ya no la da ${docente}` : ""}. Se les avisa.`}
        etiquetaOk="Quitar reemplazo"
        procesando={procesando}
        onCancel={() => setAbierto(null)}
        onOk={() => void hacer(() => apiAcademia.quitarReemplazo(c.sesionId))}
      />
      <Confirmar
        abierto={abierto === "sinJustificar"}
        titulo="Quitar la justificación"
        texto={`El atraso del ${cuandoEsClase(c)} queda sin justificar${c.justificacion ? ` (era: «${c.justificacion}»)` : ""}.`}
        etiquetaOk="Quitar"
        procesando={procesando}
        onCancel={() => setAbierto(null)}
        onOk={() => void hacer(() => apiAcademia.quitarJustificacion(c.sesionId))}
      />
    </>
  );
}

/**
 * «No vino»: dos caminos grandes, uno debajo del otro, y lo que pide cada uno.
 * Suspender pide el motivo; el reemplazo, quién la da (de la sede del grupo).
 */
function DialogoNoVino({
  c,
  sedeId,
  procesando,
  onCerrar,
  onSuspender,
  onReemplazo,
}: {
  c: ClaseAccionable;
  sedeId?: number | null;
  procesando: boolean;
  onCerrar: () => void;
  onSuspender: (motivo: string) => void;
  onReemplazo: (personalId: number) => void;
}) {
  const p = usePalabras();
  const [camino, setCamino] = useState<"suspender" | "reemplazo" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [suplente, setSuplente] = useState("");
  const [error, setError] = useState("");
  const docentes = useApi(() => (camino === "reemplazo" ? apiAcademia.docentes() : Promise.resolve(null)), [camino === "reemplazo"]);
  const actual = typeof c.docente === "object" && c.docente ? c.docente.personalId : null;
  // Los de la sede del grupo (o sin sede), menos el que no vino.
  const opciones = (docentes.datos ?? []).filter(
    (d) => d.personalId !== actual && (sedeId == null || !d.sedes.length || d.sedes.some((s) => s.id === sedeId)),
  );
  const docente = nombreDocente(c.docente);

  function confirmar() {
    setError("");
    if (camino === "suspender") {
      if (motivo.trim().length < 3) return setError("Escribí el motivo (o tocá uno de los de arriba).");
      return onSuspender(motivo.trim());
    }
    if (camino === "reemplazo") {
      if (!suplente) return setError(`Elegí quién da la clase.`);
      return onReemplazo(Number(suplente));
    }
  }

  const opcion = (clave: "suspender" | "reemplazo", titulo: string, texto: string) => (
    <button
      type="button"
      aria-pressed={camino === clave}
      onClick={() => {
        setCamino(clave);
        setError("");
      }}
      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
        camino === clave ? "border-primary bg-primary-50 ring-2 ring-primary-100" : "border-borde bg-white hover:bg-muted"
      }`}
    >
      <span className="block text-[15px] font-bold text-texto">{titulo}</span>
      <span className="mt-0.5 block text-[13px] text-texto-3">{texto}</span>
    </button>
  );

  return (
    <Modal
      abierto
      titulo={docente ? `No vino ${docente}` : `No vino el ${p.docente}`}
      subtitulo={cuandoEsClase(c)}
      onClose={onCerrar}
      ancho="max-w-md"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </Boton>
          {camino && (
            <Boton variante={camino === "suspender" ? "danger" : "primary"} onClick={confirmar} disabled={procesando}>
              {procesando ? "Guardando…" : camino === "suspender" ? "Suspender la clase" : "Poner reemplazo"}
            </Boton>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-2">¿Qué hacemos con esta clase?</p>
        {opcion("suspender", "Suspender la clase", `No hay clase ese día. No se pasa lista y a los ${p.alumnos} no les cuenta como falta.`)}
        {opcion("reemplazo", "Poner un reemplazo", `Otro ${p.docente} da esta clase. Él pasa la lista y marca su llegada. El pago no cambia.`)}

        {camino === "suspender" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_SUSPENSION.map((m) => (
                <BotonFila key={m} variante={motivo === m ? "soft" : "ghost"} onClick={() => setMotivo(m)}>
                  {m}
                </BotonFila>
              ))}
            </div>
            <Campo label="Motivo">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Por qué no hay clase" />
            </Campo>
          </div>
        )}
        {camino === "reemplazo" && (
          <Campo label={`¿Quién da la clase?`}>
            <Select value={suplente} onChange={(e) => setSuplente(e.target.value)} aria-label="Docente de reemplazo">
              <option value="">{docentes.cargando && !docentes.datos ? "Cargando…" : `Elegí un ${p.docente}…`}</option>
              {opciones.map((d) => (
                <option key={d.personalId} value={d.personalId}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        {camino && <p className="text-[13px] text-texto-3">Si tiene la app, le avisamos al {p.docente} por el celular.</p>}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** Un motivo corto, con las frases de siempre a un toque. */
function DialogoMotivo({
  titulo,
  subtitulo,
  texto,
  etiqueta,
  sugerencias,
  etiquetaOk,
  procesando,
  onCerrar,
  onOk,
}: {
  titulo: string;
  subtitulo: string;
  texto: string;
  etiqueta: string;
  sugerencias: string[];
  etiquetaOk: string;
  procesando: boolean;
  onCerrar: () => void;
  onOk: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={subtitulo}
      onClose={onCerrar}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton
            onClick={() => (motivo.trim().length < 3 ? setError("Escribí el motivo (o tocá uno de los de arriba).") : onOk(motivo.trim()))}
            disabled={procesando}
          >
            {procesando ? "Guardando…" : etiquetaOk}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-2">{texto}</p>
        <div className="flex flex-wrap gap-1.5">
          {sugerencias.map((m) => (
            <BotonFila key={m} variante={motivo === m ? "soft" : "ghost"} onClick={() => setMotivo(m)}>
              {m}
            </BotonFila>
          ))}
        </div>
        <Campo label={etiqueta}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
