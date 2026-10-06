import { Icon } from "../../../components/Icon";
import { Input } from "../../../components/ui";
import { aMinutos, erroresTramos } from "../../../lib/agenda/horarios";
import type { Tramo } from "../../../lib/agenda/tiposConfigAgenda";

/** "13:00" + 60 → "14:00", sin pasar de 23:59. */
function sumarMin(hora: string, min: number): string {
  const m = Math.min(aMinutos(hora) + min, 23 * 60 + 59);
  if (Number.isNaN(m)) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * El tramo que se propone al tocar "Agregar": el primero, de 9 a 13; los
 * siguientes, una hora después del último (el almuerzo) y por cuatro horas.
 * Es lo que se carga en la mayoría de los salones y ahorra tipear.
 */
function siguiente(tramos: Tramo[]): Tramo {
  const ultimo = tramos[tramos.length - 1];
  if (!ultimo || !ultimo.hasta) return { desde: "09:00", hasta: "13:00" };
  const desde = sumarMin(ultimo.hasta, 60);
  return { desde, hasta: sumarMin(desde, 240) };
}

/**
 * Los tramos de un día (semana tipo o excepción): varios por día, con el
 * almuerzo como el hueco entre dos. Avisa abajo si un tramo termina antes de
 * empezar o si dos se pisan; quien lo usa no guarda mientras haya errores.
 */
export default function EditorTramos({
  tramos,
  onChange,
  etiqueta,
}: {
  tramos: Tramo[];
  onChange: (t: Tramo[]) => void;
  /** El día, para los lectores de pantalla: "Lunes". */
  etiqueta: string;
}) {
  const errores = erroresTramos(tramos);
  const cambiar = (i: number, campo: keyof Tramo, valor: string) =>
    onChange(tramos.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  return (
    <div className="space-y-2">
      {tramos.length === 0 && <p className="text-[13px] text-texto-4">No trabaja</p>}
      {tramos.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="time"
            aria-label={`${etiqueta}: desde (tramo ${i + 1})`}
            value={t.desde}
            onChange={(e) => cambiar(i, "desde", e.target.value)}
            className="max-w-[8.5rem]"
          />
          <span className="text-texto-4">a</span>
          <Input
            type="time"
            aria-label={`${etiqueta}: hasta (tramo ${i + 1})`}
            value={t.hasta}
            onChange={(e) => cambiar(i, "hasta", e.target.value)}
            className="max-w-[8.5rem]"
          />
          <button
            type="button"
            onClick={() => onChange(tramos.filter((_, j) => j !== i))}
            aria-label={`${etiqueta}: quitar tramo ${i + 1}`}
            className="rounded-lg p-2.5 text-texto-4 transition-colors hover:bg-muted hover:text-danger-text"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...tramos, siguiente(tramos)])}
        className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-[13px] font-semibold text-primary-700 hover:underline"
      >
        <Icon name="plus" size={15} />
        Agregar tramo
      </button>
      {errores.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-danger-text">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
