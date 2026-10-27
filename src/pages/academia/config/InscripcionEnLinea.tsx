import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { condicionesInscripcionEnLinea, faltantes, type CondicionEnLinea } from "../../../lib/academia/inscripcionEnLinea";
import type { AjustesAcademia, Carrera } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { claseBotonFila } from "../piezas";

/**
 * C7 · la tarjeta «Inscripción en línea» de Ajustes. Para que la página reciba
 * inscripciones tienen que estar prendidas cinco cosas en cinco lugares
 * (el plan, Ajustes, cada curso, Mi página y el grupo); si una falta, la página
 * «no anda» y nadie sabe cuál. Acá se ve el estado de cada una (✔ / ✖) con el
 * botón a la pantalla que la corrige. No pide nada nuevo al backend: junta lo
 * que Ajustes y Cursos ya cargan, más la lista de grupos.
 */
/** «las cinco», pero «las cuatro» cuando el backend no manda si la página está publicada (ronda 1, W12). */
const NUMEROS: Record<number, string> = { 3: "las tres", 4: "las cuatro", 5: "las cinco" };

export function InscripcionEnLinea({
  ajustes,
  cursos,
  onActivarRecibir,
}: {
  ajustes: AjustesAcademia | null;
  cursos: Carrera[] | null | "error";
  /** El mismo interruptor «Recibir inscripciones desde la página» de arriba. */
  onActivarRecibir: () => void;
}) {
  const p = usePalabras();
  const { negocio } = useAuth();
  // Los grupos: «al menos uno abierto». Un fallo no esconde la tarjeta, la deja en «no se pudo comprobar».
  const grupos = useApi(async () => (await apiAcademia.grupos({ pageSize: 100 })).items, []);
  const condiciones = condicionesInscripcionEnLinea({
    features: negocio?.features,
    ajustes,
    cursos,
    grupos: grupos.error ? "error" : grupos.datos,
    palabras: { carreras: p.carreras, Carreras: p.Carreras },
  });
  const faltan = faltantes(condiciones).length;
  const sabe = condiciones.every((c) => c.ok !== null);

  return (
    <div role="group" aria-label="Inscripción en línea" className="mt-4 rounded-xl border border-borde-soft bg-muted/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-texto">Inscripción en línea</h3>
        {sabe && (
          <span
            data-testid="resumen-en-linea"
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${faltan ? "bg-warning-bg text-warning-text" : "bg-emerald-50 text-emerald-700"}`}
          >
            {faltan ? (faltan === 1 ? "Falta 1 cosa" : `Faltan ${faltan} cosas`) : "Todo listo"}
          </span>
        )}
      </div>
      <p className="mb-3 mt-1 text-[13px] text-texto-3">
        Para que la página reciba inscripciones tienen que estar {NUMEROS[condiciones.length] ?? `las ${condiciones.length}`}. Si una falla, la página no anda.
      </p>
      <ul className="divide-y divide-borde-soft">
        {condiciones.map((c) => (
          <Fila key={c.clave} c={c} onActivarRecibir={onActivarRecibir} />
        ))}
      </ul>
    </div>
  );
}

function Fila({ c, onActivarRecibir }: { c: CondicionEnLinea; onActivarRecibir: () => void }) {
  const estado = c.ok === true ? "Listo" : c.ok === false ? "Falta" : "Sin comprobar";
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          c.ok === true ? "bg-emerald-100 text-emerald-700" : c.ok === false ? "bg-danger-bg text-danger-text" : "bg-slate-100 text-texto-4"
        }`}
      >
        {c.ok === true ? <Icon name="check" size={13} /> : c.ok === false ? <Icon name="x" size={13} /> : <span className="text-xs">?</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-texto">
          <span className="sr-only">{estado}: </span>
          {c.titulo}
        </span>
        <span className="block text-[13px] text-texto-3">{c.detalle}</span>
      </span>
      {c.arreglo?.a && (
        <Link to={c.arreglo.a} className={claseBotonFila("ghost")}>
          {c.arreglo.texto}
          <Icon name="chevronRight" size={15} />
        </Link>
      )}
      {c.arreglo?.accion === "activar-recibir" && (
        <button type="button" onClick={onActivarRecibir} className={claseBotonFila("soft")}>
          {c.arreglo.texto}
        </button>
      )}
    </li>
  );
}
