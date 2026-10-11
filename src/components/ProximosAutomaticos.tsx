import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtMoney } from "../lib/format";
import { hoyIso, proximosAutomaticos } from "../lib/gastos";
import { useApi } from "../lib/useApi";
import { Icon } from "./Icon";

/** Cuántas se muestran; el resto se ve en Gastos automáticos. */
const MAXIMO = 3;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "Hoy", "Mañana" o "1 oct": la fecha se lee de un vistazo al lado del concepto. */
function cuando(iso: string, hoy: string): string {
  if (iso === hoy) return "Hoy";
  const [a, m, d] = hoy.split("-").map(Number);
  const manana = new Date(a, m - 1, d + 1);
  const [, mm, dd] = iso.split("-").map(Number);
  if (manana.getMonth() + 1 === mm && manana.getDate() === dd) return "Mañana";
  return `${dd} ${MESES[mm - 1]}`;
}

/**
 * El aviso de lo que los gastos automáticos van a cargar pronto, arriba de la
 * lista de Gastos operativos.
 *
 * Responde la pregunta de quien acaba de crear una regla y no la ve en la
 * lista: no está porque todavía no es un gasto, y el día que dice aparece
 * como pendiente. Hasta entonces no suma en ningún total.
 *
 * Si las reglas no se pueden leer no se muestra nada: es un aviso, y un error
 * acá no tiene que tapar la lista de gastos.
 */
export function ProximosAutomaticos({
  mes,
  sucursalId,
}: {
  /** El mes que se está mirando, `yyyy-MM`. */
  mes: string;
  sucursalId: number | null;
}) {
  const reglas = useApi(() => api.getPlantillasGasto(sucursalId), [sucursalId]);
  const hoy = hoyIso();
  const proximos = proximosAutomaticos(reglas.datos ?? [], mes, hoy);
  if (proximos.length === 0) return null;

  const resto = proximos.length - MAXIMO;

  return (
    <section
      aria-label="Próximos gastos automáticos"
      className="rounded-xl border border-dashed border-primary-200 bg-white p-3.5 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-primary-700">
          <Icon name="swap" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-texto">Se cargan solos pronto</h2>
          <p className="mt-0.5 text-xs text-texto-3">
            Ese día aparecen en la lista como pendientes. Hasta entonces no suman.
          </p>
        </div>
      </div>
      <ul className="mt-2.5 divide-y divide-borde-soft">
        {proximos.slice(0, MAXIMO).map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-14 shrink-0 font-semibold text-primary-700">
              {cuando(p.proximaCarga!, hoy)}
            </span>
            <span className="min-w-0 flex-1 truncate text-texto">{p.concepto}</span>
            <span className="shrink-0 font-semibold text-texto">
              {p.monto == null ? "A confirmar" : fmtMoney(p.monto)}
            </span>
          </li>
        ))}
      </ul>
      {resto > 0 && (
        <Link
          to="/gastos/automaticos"
          className="mt-1 inline-block text-xs font-semibold text-primary-700 hover:underline"
        >
          {resto === 1 ? "Y 1 más" : `Y ${resto} más`} en Gastos automáticos
        </Link>
      )}
    </section>
  );
}
