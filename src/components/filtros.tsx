import { Children, createContext, useContext, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

/**
 * Una fila que en el celular no se parte en renglones: se desliza de costado
 * (decisión del dueño, 13-oct; ver PLAN-TABLAS-MOVIL). Partida, con tres o
 * cuatro grupos de filtros, ocupaba media pantalla antes del primer dato.
 * Desde `md` (tablet y computadora) sigue como siempre, en renglones.
 *
 * Sin barra de scroll a la vista: el chip cortado contra el borde ya dice que
 * hay más. Con `!`: el `* { scrollbar-width: thin }` de index.css no está en
 * una capa y le ganaba a la utilidad. Para filas armadas a mano (los períodos de Reportes, los temas de
 * la agenda) que no usan `Chips`.
 */
export const FILA_DESLIZABLE =
  "max-md:flex-nowrap max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[scrollbar-width:none]! max-md:[&::-webkit-scrollbar]:hidden max-md:[&>*]:shrink-0";

/** Dentro de una `FilaFiltros`: los chips no arman su propia fila en el celular. */
const EnFilaFiltros = createContext(false);

/**
 * Varios grupos de chips (tipo, estado, origen…) en UNA sola fila deslizable
 * en el celular, con una rayita entre grupo y grupo. En `md` en adelante cada
 * grupo vuelve a su renglón, separados como antes (`md:space-y-3`, que es lo
 * que les daba el `space-y-3` del contenedor de las pantallas).
 */
export function FilaFiltros({
  children,
  separacion = "md:space-y-3",
}: {
  children: ReactNode;
  /** El aire entre renglones desde md: el que les daba el contenedor de la pantalla. */
  separacion?: string;
}) {
  const grupos = Children.toArray(children).filter(Boolean);
  return (
    <EnFilaFiltros.Provider value>
      <div className={`flex gap-2 ${FILA_DESLIZABLE} md:block ${separacion}`}>
        {grupos.map((g, i) => (
          // `contents` en el celular (los chips pasan a ser de la fila) y
          // `block` desde md, para que el `space-y-3` los separe.
          <span key={i} className="contents md:block">
            {i > 0 && <span aria-hidden="true" className="my-1.5 w-px shrink-0 bg-borde md:hidden" />}
            {g}
          </span>
        ))}
      </div>
    </EnFilaFiltros.Provider>
  );
}

/** Fila de chips de filtro, como los del diseño. */
export function Chips<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  valor: NoInfer<T>;
  opciones: readonly (readonly [T, string])[];
  onChange: (v: NoInfer<T>) => void;
}) {
  const enFila = useContext(EnFilaFiltros);
  return (
    <div className={`flex flex-wrap gap-2 ${enFila ? "max-md:contents" : FILA_DESLIZABLE}`}>
      {opciones.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            valor === k
              ? "bg-primary-boton text-white"
              : "border border-borde bg-white text-texto-2 hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Buscador({
  valor,
  onChange,
  placeholder = "Buscar…",
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-4">
        <Icon name="search" size={17} />
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-borde bg-white py-2.5 pl-10 pr-9 text-sm outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
      />
      {valor && (
        <button
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2.5 text-texto-4 hover:bg-muted"
        >
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}

/** Encabezado de página con título, conteo y acción principal. */
export function EncabezadoPagina({
  titulo,
  subtitulo,
  accion,
  volver,
}: {
  titulo: string;
  subtitulo?: string;
  accion?: ReactNode;
  /**
   * Pantalla a la que se vuelve, para las que cuelgan de otra (Gastos
   * automáticos cuelga de Gastos operativos). El menú no las lista, así que
   * sin esto la única salida era el botón "atrás" del navegador.
   */
  volver?: { a: string; etiqueta: string };
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      {/* `basis-48` y no `basis-0`: el título se reserva un ancho mínimo, y
          cuando la acción no entra al lado (un celular con "Nuevo gasto
          automático") baja de renglón. Con `basis-0` era el título el que se
          achicaba, y quedaba "Gastos aut…". */}
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
        {volver && (
          <Link
            to={volver.a}
            aria-label={volver.etiqueta}
            title={volver.etiqueta}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-borde bg-white text-texto-2 transition-colors hover:bg-muted"
          >
            <Icon name="arrowLeft" size={18} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-texto">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>}
        </div>
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </header>
  );
}
