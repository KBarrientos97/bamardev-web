import { Icon } from "../../components/Icon";
import { lineasDeChoques, type EstadoChoques } from "../../lib/academia/choques";
import { usePalabras } from "../../lib/academia/usePalabras";

/** Cuántos renglones se muestran: el resto se cuenta, para no tapar el botón de guardar. */
const MAX_LINEAS = 3;

/**
 * C10 · el aviso de choques al armar o editar un grupo: dice qué aula o qué
 * docente ya está ocupado en ese horario, SIN bloquear nada (decide quien
 * arma el grupo). Va arriba de los botones del panel; quien lo usa pone
 * «Guardar igual» en el botón cuando `estado.choques` no es null.
 *
 * `estado` es lo que devuelve `useChoques`. Si el aviso no se puede traer, se
 * dice en gris y se guarda igual.
 */
export function AvisoChoques({ estado, aula }: { estado: EstadoChoques; aula?: string | null }) {
  const p = usePalabras();
  const { choques, falla } = estado;

  if (falla) {
    return (
      <p className="text-xs text-texto-3">
        No pudimos revisar si el aula o el {p.docente} ya están ocupados en ese horario. Podés guardar igual.
      </p>
    );
  }
  if (!choques) return null;
  const lineas = lineasDeChoques(choques, { aula, docente: p.docente });
  return (
    <div
      role="alert"
      className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-warning/40 bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon name="alert" size={15} />
        Ojo: hay un choque de horario
      </p>
      <ul className="list-disc space-y-0.5 pl-5">
        {lineas.slice(0, MAX_LINEAS).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {lineas.length > MAX_LINEAS && <p>…y {lineas.length - MAX_LINEAS} más.</p>}
      <p className="text-xs">Podés guardar igual si es a propósito.</p>
    </div>
  );
}
