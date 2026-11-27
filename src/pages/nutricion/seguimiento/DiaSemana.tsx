import { useRef, useState } from "react";
import { Icon } from "../../../components/Icon";
import { Modal } from "../../../components/ui";
import { enfocaSolo } from "../../../lib/nutricion/foco";
import { apiSeguimiento, hojaDesactualizada } from "../../../lib/nutricion/seguimiento/api";
import { DIAS_SEMANA, esDiaSemana, pluralDia, vieneLos } from "../../../lib/nutricion/seguimiento/dias";
import type { Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";

/**
 * El día de la semana en que viene el paciente (CONTRATO-nutricion-seguimiento-23nov
 * §11): la doctora guarda el vial de cada paciente en una caja por día y, al
 * cargar la dosis, tiene que VER qué día es el suyo. Las piezas: la pastilla
 * «Viene los martes» (la hoja del paciente y la hoja «Semana N»), los seis
 * botones de «Iniciar / Editar tratamiento» y el diálogo «¿Qué día viene?».
 */

/**
 * La pastilla: el azul `info` del tema, distinto del verde de «Mes N» y de los
 * avisos de pago (rojo y amarillo). Su propio tamaño (13 px), sin heredar el del
 * título, y nunca partida en dos renglones: si no entra, baja entera.
 */
const PASTILLA =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-info-bg px-2.5 py-1 text-[13px] font-medium leading-4 tracking-normal text-info-text ring-1 ring-inset ring-info-text/20";

/**
 * «📅 Viene los **martes**». Con `onCambiar` (quien puede editar) es un botón con
 * el lápiz, de 44 px de alto para el dedo (la pastilla adentro, del mismo
 * tamaño), que abre «¿Qué día viene?». Sin día (null, o un backend anterior que
 * no lo manda), nada.
 */
export function ChipDia({ dia, onCambiar, className = "" }: { dia: number | null | undefined; onCambiar?: () => void; className?: string }) {
  const plural = pluralDia(dia);
  if (!plural) return null;
  const contenido = (
    <>
      {/* En un teléfono muy angosto (menos de 352 px) no entraba con los dos íconos al lado del nombre: el del calendario se va. */}
      <Icon name="calendar" size={14} className="shrink-0 max-[351px]:hidden" />
      <span>
        Viene los <strong className="font-bold">{plural}</strong>
      </span>
      {onCambiar && <Icon name="edit" size={13} className="shrink-0 opacity-75" />}
    </>
  );
  if (!onCambiar) return <span className={`${PASTILLA} ${className}`}>{contenido}</span>;
  return (
    <button
      type="button"
      onClick={onCambiar}
      aria-label={`Cambiar el día: viene los ${plural}`}
      title="Cambiar el día que viene"
      className={`group/dia inline-flex min-h-11 shrink-0 items-center rounded-full outline-none lg:min-h-9 ${className}`}
    >
      <span className={`${PASTILLA} transition-shadow group-hover/dia:ring-info-text/45 group-focus-visible/dia:ring-2 group-focus-visible/dia:ring-info-text/60`}>
        {contenido}
      </span>
    </button>
  );
}

/** El marcado como el de `BotonesUnidad`: verde con borde; sin marcar, blanco. */
const marcadoONo = (marcado: boolean) =>
  marcado ? "border-primary bg-primary-50 text-primary-700" : "border-borde bg-white text-texto-2 hover:border-primary-200 hover:bg-muted";

/**
 * «Día que viene (opcional)» de «Iniciar / Editar tratamiento»: seis botones en
 * una fila, «Lun · Mar · Mié…» en el teléfono y el nombre entero desde `sm`.
 * Ninguno marcado al iniciar (tampoco el de hoy); un toque marca y otro sobre
 * el marcado lo desmarca. `valor`: "" o "1".."6", como en el formulario.
 */
export function BotonesDia({ valor, onElegir }: { valor: string; onElegir: (valor: string) => void }) {
  return (
    <div role="group" aria-label="Día que viene" className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {DIAS_SEMANA.map((d) => {
        const marcado = valor === String(d.dia);
        return (
          <button
            key={d.dia}
            type="button"
            aria-pressed={marcado}
            aria-label={d.nombre}
            onClick={() => onElegir(marcado ? "" : String(d.dia))}
            className={`min-h-12 min-w-0 whitespace-nowrap rounded-xl border-2 px-1 text-[15px] font-semibold transition-colors ${marcadoONo(marcado)}`}
          >
            <span className="sm:hidden">{d.corto}</span>
            <span className="max-sm:hidden">{d.nombre}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * «¿Qué día viene?» (§11.2 b): los seis días en botones grandes (3 × 2), marcado
 * el que tiene. Un toque en un día GUARDA y cierra, con el aviso «Viene los
 * martes.»; el que ya tiene, cierra sin llamar. «Sin día fijo» (sólo si tiene
 * uno) lo quita. Mientras guarda, todo quieto; si falla, el error adentro y no
 * se cierra (un 404 / 409 deja la hoja de atrás para volver a leer). Son
 * botones: no sube el teclado; en la PC, el foco en el día que tiene (o en el
 * lunes) para elegir con el teclado.
 */
export function DialogoDia({
  t,
  pacienteNombre,
  onCerrar,
  onGuardado,
  onDesactualizada,
}: {
  t: Pick<Tratamiento, "id" | "diaSemana">;
  pacienteNombre: string;
  onCerrar: () => void;
  onGuardado: (t: Tratamiento, aviso: string) => void;
  /** El servidor dijo que la hoja de atrás quedó vieja (404 / 409): se vuelve a leer al cerrar. */
  onDesactualizada?: () => void;
}) {
  const actual = esDiaSemana(t.diaSemana) ? t.diaSemana : null;
  const [guardando, setGuardando] = useState(false);
  // Al toque, sin esperar el dibujo: dos toques seguidos no lo mandan dos veces.
  const enCurso = useRef(false);
  const [error, setError] = useState("");
  const [focoSolo] = useState(enfocaSolo);

  async function elegir(dia: number | null) {
    if (enCurso.current) return;
    if (dia === actual) {
      onCerrar();
      return;
    }
    enCurso.current = true;
    setGuardando(true);
    setError("");
    try {
      const nuevo = await apiSeguimiento.cambiarTratamiento(t.id, { diaSemana: dia });
      onGuardado(nuevo, dia == null ? "Sin día fijo." : `${vieneLos(dia)}.`);
    } catch (e) {
      if (hojaDesactualizada(e)) onDesactualizada?.();
      setError(e instanceof Error ? e.message : "No se pudo guardar el día.");
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal abierto titulo="¿Qué día viene?" subtitulo={pacienteNombre} onClose={guardando ? sinCerrar : onCerrar} ancho="max-w-sm">
      <div className="space-y-3">
        <div role="group" aria-label="Día que viene" className="grid grid-cols-3 gap-2">
          {DIAS_SEMANA.map((d) => {
            const marcado = actual === d.dia;
            return (
              <button
                key={d.dia}
                type="button"
                aria-pressed={marcado}
                disabled={guardando}
                autoFocus={focoSolo && d.dia === (actual ?? 1)}
                onClick={() => void elegir(d.dia)}
                className={`min-h-12 min-w-0 whitespace-nowrap rounded-xl border-2 px-2 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${marcadoONo(marcado)}`}
              >
                {d.nombre}
              </button>
            );
          })}
        </div>
        {actual != null && (
          <button
            type="button"
            disabled={guardando}
            onClick={() => void elegir(null)}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-texto-3 transition-colors hover:bg-muted hover:text-texto-2 disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-9"
          >
            <Icon name="close" size={14} />
            Sin día fijo
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

const sinCerrar = () => {};
