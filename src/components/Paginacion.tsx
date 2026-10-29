import type { ReactNode } from "react";
import { FILAS_POR_PAGINA, numerosDePagina } from "../lib/paginado";
import { Icon } from "./Icon";

/**
 * Paginación de las listas largas (PLAN-ACADEMIAS §5, "Reglas de todas las
 * pantallas"): aparece desde 21 filas. En escritorio, una barra al pie con
 * "Mostrando 1–20 de N", las páginas con ‹ › y las filas por página (20, 50 o
 * 100). En el celular, un botón "Ver N más" al final de la lista, que suma la
 * página siguiente debajo de lo que ya se ve en vez de reemplazarlo.
 *
 * El corte es del backend (`?page=&pageSize=`); este componente sólo dibuja
 * y avisa. `usePaginado` lleva la cuenta.
 */

/** Hasta acá no hay barra: la regla es "desde 21 filas". */
const SIN_PAGINAR_HASTA = 20;

export function Paginacion({
  total,
  page,
  pageSize,
  mostrados,
  cargando,
  onPage,
  onPageSize,
  onVerMas,
  extra,
}: {
  total: number;
  page: number;
  pageSize: number;
  /** Cuántas filas tiene hoy la lista del celular (con las sumadas). */
  mostrados: number;
  cargando?: boolean;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
  onVerMas: () => void;
  /** Lo que se dice al lado del "Mostrando…" (el pie del grupo, por ejemplo). */
  extra?: ReactNode;
}) {
  if (total <= SIN_PAGINAR_HASTA) {
    return extra ? <p className="px-1 text-[13px] text-texto-3">{extra}</p> : null;
  }
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(total, page * pageSize);
  const faltan = Math.max(0, total - mostrados);

  return (
    <>
      <div className="hidden flex-wrap items-center justify-between gap-3 px-1 pt-1 text-[13px] text-texto-2 md:flex">
        <span>
          Mostrando {desde}–{hasta} de {total}
          {extra ? <> · {extra}</> : null}
        </span>
        <nav aria-label="Paginación" className="flex items-center gap-1">
          <BotonPagina etiqueta="Página anterior" disabled={page <= 1 || cargando} onClick={() => onPage(page - 1)}>
            <Icon name="chevronLeft" size={16} />
          </BotonPagina>
          {numerosDePagina(page, paginas).map((n, i) =>
            n === null ? (
              <span key={`hueco-${i}`} className="px-1 text-texto-4" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-current={n === page ? "page" : undefined}
                onClick={() => n !== page && onPage(n)}
                disabled={cargando}
                className={`h-9 min-w-9 rounded-lg px-2 font-semibold tabular-nums transition-colors ${
                  n === page ? "bg-primary-boton text-white" : "text-texto-2 hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <BotonPagina etiqueta="Página siguiente" disabled={page >= paginas || cargando} onClick={() => onPage(page + 1)}>
            <Icon name="chevronRight" size={16} />
          </BotonPagina>
        </nav>
        <label className="flex items-center gap-2">
          Por página
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="cursor-pointer rounded-lg border border-borde bg-white px-2 py-1.5 text-texto outline-none focus:border-primary"
          >
            {FILAS_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {faltan > 0 && (
        <button
          type="button"
          onClick={onVerMas}
          disabled={cargando}
          className="w-full rounded-xl border border-borde bg-white py-3 text-sm font-semibold text-texto-2 hover:bg-muted disabled:opacity-60 md:hidden"
        >
          {cargando ? "Cargando…" : `Ver ${Math.min(faltan, pageSize)} más`}
        </button>
      )}
    </>
  );
}

function BotonPagina({
  etiqueta,
  disabled,
  onClick,
  children,
}: {
  etiqueta: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white text-texto-2 transition-colors enabled:hover:bg-muted disabled:text-texto-4"
    >
      {children}
    </button>
  );
}
