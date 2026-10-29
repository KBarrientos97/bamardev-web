import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { Boton, Modal } from "./ui";

/**
 * Una fila que en el celular no se parte en renglones: se desliza de costado
 * (decisión del dueño, 13-oct; ver PLAN-TABLAS-MOVIL). Partida, con varios
 * grupos de filtros, ocupaba media pantalla antes del primer dato. Desde `md`
 * (tablet y computadora) sigue como siempre, en renglones.
 *
 * Sin barra de scroll a la vista: el chip cortado contra el borde ya dice que
 * hay más. Con `!`: el `* { scrollbar-width: thin }` de index.css no está en
 * una capa y le ganaba a la utilidad. Para filas armadas a mano (los períodos
 * de Reportes, los temas de la agenda) que no usan `Chips`.
 */
export const FILA_DESLIZABLE =
  "max-md:flex-nowrap max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[scrollbar-width:none]! max-md:[&::-webkit-scrollbar]:hidden max-md:[&>*]:shrink-0";

/**
 * Dónde se dibujan los chips: sueltos (su propia fila), dentro de la fila de
 * una `FilaFiltros` (se disuelven en ella) o dentro de la hoja de Filtros
 * (en renglones, que ahí sobra alto).
 */
type Lugar = "suelto" | "fila" | "hoja";
const LugarChips = createContext<Lugar>("suelto");

/**
 * Con más de dos grupos, en el celular no van a la vista sino detrás de un
 * botón "Filtros" (decisión del dueño, 13-oct: la fila deslizable con tres o
 * cuatro grupos no le gustó). Con uno o dos, la fila deslizable alcanza.
 */
const MAX_GRUPOS_A_LA_VISTA = 2;

type PropsChips = {
  titulo?: string;
  valor: string;
  opciones: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
};

/** El primer chip es el "todos": un grupo está activo si se eligió otro. */
const activo = (g: PropsChips) => g.opciones.length > 0 && g.valor !== g.opciones[0][0];

/**
 * ¿Es un grupo de chips? Se mira la forma de sus props (`opciones` y
 * `onChange`) y no el tipo del componente: el selector de sede de academias
 * llega armado desde un hook y es un `Chips` igual.
 */
const esGrupo = (e: ReactElement): e is ReactElement<PropsChips> => {
  const p = e.props as Partial<PropsChips> | null;
  return !!p && Array.isArray(p.opciones) && typeof p.onChange === "function";
};

/**
 * Varios grupos de chips (sucursal, tipo, estado, origen…).
 *
 * En el celular: con uno o dos grupos, una sola fila deslizable con una
 * rayita entre grupos; con más, un botón "Filtros" que abre la hoja con todos
 * (cada grupo con su `titulo`). Desde `md` siempre como antes: cada grupo en
 * su renglón, separados como los separaba el contenedor de la pantalla.
 */
export function FilaFiltros({
  children,
  separacion = "md:space-y-3",
}: {
  children: ReactNode;
  /** El aire entre renglones desde md: el que les daba el contenedor de la pantalla. */
  separacion?: string;
}) {
  const hijos = Children.toArray(children).filter(isValidElement);
  const grupos = hijos.filter(esGrupo);
  // Un buscador o un desplegable metido acá no es un grupo de chips: no tiene
  // `opciones` y el botón Filtros se caía al leerlas (QA ronda 2, B-01: la
  // pantalla Estudiantes entera). Se dibujan aparte, siempre a la vista, y no
  // cuentan para el tope de grupos.
  const sueltos = hijos.filter((h) => !esGrupo(h));
  if (sueltos.length) {
    return (
      <div className="space-y-3">
        {grupos.length > 0 && <FilaFiltros separacion={separacion}>{grupos}</FilaFiltros>}
        <div className="flex flex-wrap gap-2">{sueltos}</div>
      </div>
    );
  }

  if (grupos.length > MAX_GRUPOS_A_LA_VISTA) {
    return (
      // Un solo elemento para el `space-y` de la pantalla: dos hermanos (uno
      // escondido) dejaban un margen de más debajo del botón.
      <div>
        <BotonFiltros grupos={grupos} />
        <div className={`hidden md:block ${separacion}`}>{grupos}</div>
      </div>
    );
  }

  return (
    <LugarChips.Provider value="fila">
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
    </LugarChips.Provider>
  );
}

/**
 * El botón del celular y su hoja. Los filtros se aplican al tocarlos (la
 * lista de atrás ya cambia); "Ver resultados" sólo cierra. Al lado del botón,
 * en una línea, lo que está filtrando: sin abrir la hoja se sabe qué se ve.
 */
function BotonFiltros({ grupos }: { grupos: ReactElement<PropsChips>[] }) {
  const [abierta, setAbierta] = useState(false);
  const activos = grupos.filter((g) => activo(g.props));
  const resumen = activos
    .map((g) => g.props.opciones.find(([k]) => k === g.props.valor)?.[1])
    .filter(Boolean)
    .join(" · ");
  const limpiar = () => {
    for (const g of activos) g.props.onChange(g.props.opciones[0][0]);
  };

  return (
    <div className="flex min-w-0 items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-haspopup="dialog"
        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
          activos.length
            ? "bg-primary-boton text-white"
            : "border border-borde bg-white text-texto-2 hover:bg-muted"
        }`}
      >
        <Icon name="filter" size={15} />
        Filtros
        {activos.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-primary-boton">
            {activos.length}
          </span>
        )}
      </button>
      {resumen ? (
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-texto-3">{resumen}</span>
          <button type="button" onClick={limpiar} className="shrink-0 text-xs font-semibold text-texto-2 underline">
            Limpiar
          </button>
        </>
      ) : (
        <span className="text-xs text-texto-4">Sin filtros</span>
      )}

      {abierta && (
        <Modal
          abierto
          titulo="Filtros"
          onClose={() => setAbierta(false)}
          ancho="max-w-md"
          acciones={
            <>
              <Boton variante="ghost" onClick={limpiar} disabled={!activos.length}>
                Limpiar
              </Boton>
              <Boton onClick={() => setAbierta(false)}>Ver resultados</Boton>
            </>
          }
        >
          <LugarChips.Provider value="hoja">
            <div className="space-y-4">
              {grupos.map((g, i) => (
                <section key={i} className="space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-texto-3">
                    {g.props.titulo ?? "Filtro"}
                  </h3>
                  {g}
                </section>
              ))}
            </div>
          </LugarChips.Provider>
        </Modal>
      )}
    </div>
  );
}

/** Fila de chips de filtro, como los del diseño. */
export function Chips<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  /**
   * Cómo se llama el grupo (Tipo, Estado…). Sólo se ve en la hoja de Filtros
   * del celular, donde los grupos ya no están a la vista uno bajo el otro.
   */
  titulo?: string;
  valor: NoInfer<T>;
  opciones: readonly (readonly [T, string])[];
  onChange: (v: NoInfer<T>) => void;
}) {
  const lugar = useContext(LugarChips);
  const fila = lugar === "fila" ? "max-md:contents" : lugar === "hoja" ? "" : FILA_DESLIZABLE;
  return (
    <div className={`flex flex-wrap gap-2 ${fila}`}>
      {opciones.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          aria-pressed={valor === k}
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
  etiqueta,
  autoFocus,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** El nombre accesible del campo, si el placeholder solo no dice qué se busca. */
  etiqueta?: string;
  autoFocus?: boolean;
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
        aria-label={etiqueta}
        autoFocus={autoFocus}
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
