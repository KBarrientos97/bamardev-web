import { useEffect, useRef, useState } from "react";
import { Buscador } from "./filtros";
import { Icon } from "./Icon";
import { AvisoOk, Boton, Campo, ErrorMsg, Input, Select, useAviso } from "./ui";
import { api } from "../lib/api";
import { categoriaConNombre } from "../lib/gastos";
import { contiene } from "../lib/texto";
import type { CategoriaGasto, TipoCostoGasto } from "../types";

/**
 * Las categorías de gasto desde el formulario que las usa: elegir una, crear
 * la que falta, renombrar o retirar las que creó el negocio y corregir si
 * cualquiera —también las del pack— es fija o variable.
 *
 * Es el `SeleccionarCategoriaDialog` de la app (G-03). El formulario de la web
 * sólo tenía el desplegable con lo que mandaba el backend: no había dónde
 * crear "Música en vivo" ni cómo decir que el gas de una pollería con garrafa
 * por contrato es un fijo, aunque el backend ya lo aceptaba.
 *
 * Vive DENTRO del formulario —que cambia su cuerpo por este panel y después lo
 * vuelve a mostrar— y no en otra pantalla ni en un popup encima:
 *
 * - crear una categoría pasa en el momento de necesitarla, a mitad de un
 *   gasto, e irse a otra pantalla perdía lo escrito;
 * - un popup sobre otro se cierra de a dos con Escape (cada `Modal` escucha la
 *   tecla), y el que se iba con él era el formulario a medio llenar.
 *
 * La farmacia no lo usa: administra las suyas desde su propia pantalla
 * (`GastosFarmacia`) y su formulario queda como estaba.
 */

/** Desde cuántas vale el buscador: con menos, todas entran a la vista. Lo mismo que la app. */
const MINIMO_PARA_BUSCAR = 10;

/** Lo que pide el backend (`@MinLength(2)`): con una letra no se distingue nada. */
const MINIMO_NOMBRE = 2;

const NOMBRE_TIPO: Record<TipoCostoGasto, string> = { FIJO: "Fijo", VARIABLE: "Variable" };

/**
 * Lo que decide NO es mensual contra ocasional, que es como suele pensarlo el
 * dueño: el alquiler es fijo y mensual, y la comisión de delivery también
 * llega todos los meses y es variable, porque sin ventas no se paga. Los
 * textos son los de la app.
 */
const TIPOS: readonly { tipo: TipoCostoGasto; descripcion: string }[] = [
  { tipo: "FIJO", descripcion: "Lo pagás vendas o no: alquiler, sueldos, el contador." },
  {
    tipo: "VARIABLE",
    descripcion: "Sube y baja con las ventas: gas, descartables, comisión de delivery.",
  },
];

type Vista =
  | { cual: "lista" }
  | { cual: "nueva" }
  | { cual: "tipo"; codigo: string }
  | { cual: "editar"; codigo: string };

/** La lista con `c` puesta: reemplaza la del mismo código o la agrega al final. */
function conCategoria(lista: CategoriaGasto[], c: CategoriaGasto): CategoriaGasto[] {
  return lista.some((x) => x.codigo === c.codigo)
    ? lista.map((x) => (x.codigo === c.codigo ? { ...x, ...c } : x))
    : [...lista, c];
}

/**
 * El campo «Categoría» de los formularios de gasto: el desplegable de siempre
 * y, si el formulario lo ofrece, la puerta al panel.
 *
 * Sin `onAdministrar` (la farmacia) se dibuja exactamente como antes.
 */
export function CampoCategoria({
  categorias,
  valor,
  onChange,
  original,
  onAdministrar,
}: {
  categorias: CategoriaGasto[];
  valor: string;
  onChange: (codigo: string) => void;
  /** La que ya tenía el gasto (o la regla) que se edita. */
  original?: { codigo: string; nombre: string | null } | null;
  onAdministrar?: () => void;
}) {
  // Una retirada no viene en la lista, pero el gasto viejo que la usa la
  // conserva. Sin esta opción el desplegable decía "Elegí una categoría"
  // sobre un gasto que sí tenía una, y guardar la mantenía sin que la pantalla
  // lo dijera. Sólo donde se puede retirar desde el formulario (G-03): a la
  // farmacia no se le cambia nada que no pidió.
  //
  // Se ofrece aunque esté elegida otra. Atada a la elegida, cambiar el
  // desplegable por error la hacía desaparecer, y para volver a la que el
  // gasto tenía había que cancelar el formulario entero.
  const retirada =
    onAdministrar &&
    original &&
    categorias.length > 0 &&
    !categorias.some((c) => c.codigo === original.codigo)
      ? original
      : null;

  return (
    <div>
      <Campo label="Categoría">
        <Select value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">Elegí una categoría</option>
          {categorias.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre} ({c.tipoCosto === "FIJO" ? "Fijo" : "Variable"})
            </option>
          ))}
          {retirada && (
            <option value={retirada.codigo}>
              {retirada.nombre ?? retirada.codigo} (ya no se ofrece)
            </option>
          )}
        </Select>
      </Campo>
      {onAdministrar && (
        <button
          type="button"
          onClick={onAdministrar}
          className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-700 hover:underline"
        >
          <Icon name="grid" size={15} /> Crear o corregir categorías
        </button>
      )}
    </div>
  );
}

/**
 * El panel: la lista para elegir, y desde ahí el alta, el tipo y lo que se
 * hace con una propia.
 *
 * Las del pack no se renombran ni se retiran, igual que en la app: son las
 * que conoce el reporte y retirada una del pack no vuelve creándola de nuevo
 * (el backend devuelve la del pack pero la deja escondida). Su tipo sí se
 * corrige, que es el caso que importa: casi todo lo que carga un negocio es
 * del pack.
 */
export function PanelCategorias({
  categorias,
  elegida,
  onElegir,
  onCatalogo,
}: {
  /** El catálogo como lo tiene la pantalla. */
  categorias: CategoriaGasto[];
  /** El código elegido en el formulario; "" si todavía ninguno. */
  elegida: string;
  /** Tocar una la elige: el formulario la pone y vuelve. */
  onElegir: (c: CategoriaGasto) => void;
  /**
   * El catálogo después de un cambio, armado con lo que contestó el backend.
   * La pantalla lo guarda tal cual en vez de volver a pedirlo: el desplegable
   * lo muestra al instante y la lista no parpadea por una fila.
   */
  onCatalogo: (lista: CategoriaGasto[]) => void;
}) {
  const activas = categorias.filter((c) => c.activa !== false);
  const [vista, setVista] = useState<Vista>({ cual: "lista" });
  const [busqueda, setBusqueda] = useState("");
  /** Lo que se escribe en el alta y al renombrar. */
  const [nombre, setNombre] = useState("");
  const [tipoNueva, setTipoNueva] = useState<TipoCostoGasto>("FIJO");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  /**
   * `ocupado` llega tarde para un doble clic en el mismo tick. El backend no
   * duplica la categoría (índice único por código, y si ya existe devuelve la
   * que hay), pero el segundo POST volvía con la misma o, si los dos llegaban
   * juntos, chocaba contra el índice único: un error en el panel por una
   * categoría que sí se había creado. El candado evita ese pedido de más, y
   * lo mismo al renombrar, corregir el tipo o retirar.
   */
  const enVuelo = useRef(false);
  const [aviso, mostrarAviso] = useAviso();
  const filaElegida = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // La elegida a la vista al abrir: pintada no sirve si quedó en el renglón
    // veinte. Con `?.` porque jsdom no tiene `scrollIntoView`.
    filaElegida.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const ir = (v: Vista) => {
    setError("");
    setVista(v);
  };

  const correr = async <T,>(accion: () => Promise<T>, listo: (r: T) => void) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setOcupado(true);
    setError("");
    try {
      listo(await accion());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la categoría");
    } finally {
      enVuelo.current = false;
      setOcupado(false);
    }
  };

  const abrirNueva = () => {
    // Lo que quedó en el buscador es casi siempre el nombre que se vino a
    // crear: buscó "Peaje", no apareció, y toca agregarla.
    setNombre(busqueda.trim());
    setTipoNueva("FIJO");
    ir({ cual: "nueva" });
  };

  const crear = () => {
    const n = nombre.trim();
    if (n.length < MINIMO_NOMBRE) return setError("El nombre tiene que tener al menos dos letras.");
    // Ver `categoriaConNombre`: mandarla igual le cambiaba el tipo a la que ya
    // existía, con todos sus meses pasados.
    const yaEsta = categoriaConNombre(activas, n);
    if (yaEsta) {
      if (yaEsta.tipoCosto === tipoNueva) return onElegir(yaEsta);
      return setError(
        `«${yaEsta.nombre}» ya existe y es ${NOMBRE_TIPO[yaEsta.tipoCosto].toLowerCase()}. ` +
          `Elegila en la lista; si en tu negocio es ${NOMBRE_TIPO[tipoNueva].toLowerCase()}, ` +
          `tocá su «${NOMBRE_TIPO[yaEsta.tipoCosto]}» para corregirla.`,
      );
    }
    correr(
      () => api.crearCategoriaGasto({ nombre: n, tipoCosto: tipoNueva }),
      (creada) => {
        onCatalogo(conCategoria(categorias, creada));
        // Queda elegida y se vuelve al gasto: quien la creó la quiere usar
        // ahora, no buscarla en la lista.
        onElegir(creada);
      },
    );
  };

  const cambiarTipo = (c: CategoriaGasto, tipo: TipoCostoGasto) => {
    // Tocar el que ya tiene vuelve sin mandar nada: sería un PATCH que no
    // cambia nada y un "quedó como fijo" cuando sólo estaba mirando.
    if (tipo === c.tipoCosto) return ir({ cual: "lista" });
    correr(
      () => api.actualizarCategoriaGasto(c.codigo, { tipoCosto: tipo }),
      (r) => {
        const corregida = { ...c, ...r };
        onCatalogo(conCategoria(categorias, corregida));
        mostrarAviso(
          `«${corregida.nombre}» quedó como ${NOMBRE_TIPO[corregida.tipoCosto].toLowerCase()}`,
        );
        ir({ cual: "lista" });
      },
    );
  };

  const renombrar = (c: CategoriaGasto) => {
    const n = nombre.trim();
    if (n.length < MINIMO_NOMBRE) return setError("El nombre tiene que tener al menos dos letras.");
    // El mismo nombre no manda nada: un PATCH vacío y un "ahora se llama X"
    // con el X de antes.
    if (n === c.nombre) return ir({ cual: "lista" });
    const otra = categoriaConNombre(
      activas.filter((x) => x.codigo !== c.codigo),
      n,
    );
    if (otra) return setError(`Ya hay una categoría «${otra.nombre}».`);
    correr(
      () => api.actualizarCategoriaGasto(c.codigo, { nombre: n }),
      (r) => {
        const corregida = { ...c, ...r };
        onCatalogo(conCategoria(categorias, corregida));
        mostrarAviso(`Ahora se llama «${corregida.nombre}»`);
        ir({ cual: "lista" });
      },
    );
  };

  const retirar = (c: CategoriaGasto) => {
    // Sin segunda pregunta, como en la app: no borra nada y se deshace
    // creándola de nuevo con el mismo nombre, y las dos cosas están escritas
    // al lado del botón.
    correr(
      () => api.eliminarCategoriaGasto(c.codigo),
      () => {
        onCatalogo(categorias.filter((x) => x.codigo !== c.codigo));
        mostrarAviso(`«${c.nombre}» ya no se ofrece`);
        ir({ cual: "lista" });
      },
    );
  };

  const actual =
    vista.cual === "tipo" || vista.cual === "editar"
      ? activas.find((c) => c.codigo === vista.codigo)
      : undefined;

  if (vista.cual === "nueva") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          crear();
        }}
      >
        <Encabezado titulo="Nueva categoría" onVolver={() => ir({ cual: "lista" })} />
        <Campo label="Nombre">
          <Input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError("");
            }}
            placeholder="Ej: Música en vivo, Peaje, Uniformes"
            maxLength={60}
            autoFocus
          />
        </Campo>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">¿Cómo se comporta?</legend>
          {TIPOS.map((t) => (
            <label
              key={t.tipo}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                tipoNueva === t.tipo ? "border-primary bg-primary-50" : "border-borde"
              }`}
            >
              <input
                type="radio"
                name="tipo-categoria-nueva"
                checked={tipoNueva === t.tipo}
                onChange={() => setTipoNueva(t.tipo)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-texto">{NOMBRE_TIPO[t.tipo]}</span>
                <span className="block text-xs text-texto-3">{t.descripcion}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-texto-4">Lo usa el punto de equilibrio. Se puede corregir después.</p>
        </fieldset>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={() => ir({ cual: "lista" })} disabled={ocupado}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={ocupado}>
            {ocupado ? "Creando…" : "Crear y elegir"}
          </Boton>
        </div>
      </form>
    );
  }

  if (vista.cual === "tipo" && actual) {
    return (
      <div className="space-y-4">
        <Encabezado titulo="Fijo o variable" onVolver={() => ir({ cual: "lista" })} />
        <p className="text-sm text-texto-2">
          Cómo se comporta <strong>«{actual.nombre}»</strong>
        </p>
        <div className="space-y-2">
          {TIPOS.map((t) => {
            const esElTuyo = t.tipo === actual.tipoCosto;
            return (
              <button
                key={t.tipo}
                type="button"
                aria-pressed={esElTuyo}
                onClick={() => cambiarTipo(actual, t.tipo)}
                disabled={ocupado}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                  esElTuyo ? "border-primary bg-primary-50" : "border-borde hover:bg-muted"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-texto">{NOMBRE_TIPO[t.tipo]}</span>
                  <span className="block text-xs text-texto-3">{t.descripcion}</span>
                </span>
                {esElTuyo && <Icon name="check" size={18} />}
              </button>
            );
          })}
        </div>
        {/* Lo que justifica que esto no sea un toque que alterna: el tipo vive
            en la categoría y no copiado en cada gasto, así que corregirlo mueve
            también los meses ya cargados, y un cambio silencioso movería
            números viejos sin que nadie entienda por qué. */}
        <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-[13px] text-texto-2">
          <Icon name="info" size={16} />
          <span>
            Cambiarlo mueve también los gastos que ya cargaste en esta categoría, así que el punto de
            equilibrio de los meses pasados va a dar distinto.
          </span>
        </p>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    );
  }

  if (vista.cual === "editar" && actual) {
    return (
      <div className="space-y-4">
        <Encabezado titulo={`Editar «${actual.nombre}»`} onVolver={() => ir({ cual: "lista" })} />
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            renombrar(actual);
          }}
        >
          <Campo
            label="Nombre"
            hint="Cambiarlo no toca los gastos que ya cargaste: siguen en esta categoría y pasan a mostrarse con el nombre nuevo."
          >
            <Input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setError("");
              }}
              maxLength={60}
              autoFocus
            />
          </Campo>
          <div className="flex justify-end">
            <Boton type="submit" disabled={ocupado}>
              Guardar nombre
            </Boton>
          </div>
        </form>
        <button
          type="button"
          onClick={() => ir({ cual: "tipo", codigo: actual.codigo })}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-borde p-3 text-left text-sm hover:bg-muted"
        >
          <span className="font-semibold text-texto">Fijo o variable</span>
          <span className="text-texto-3">{NOMBRE_TIPO[actual.tipoCosto]}</span>
        </button>
        <div className="rounded-xl border border-borde p-3">
          <Boton type="button" variante="ghost" onClick={() => retirar(actual)} disabled={ocupado}>
            <Icon name="trash" size={16} /> Quitar de la lista
          </Boton>
          <p className="mt-2 text-xs text-texto-3">
            Deja de ofrecerse al cargar un gasto. Los que ya la usan no se tocan y los reportes la siguen
            mostrando con este nombre. Para recuperarla, volvé a crearla con el mismo nombre.
          </p>
        </div>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    );
  }

  const visibles = activas.filter((c) => contiene(c.nombre, busqueda.trim()));
  const buscado = busqueda.trim();

  return (
    <div className="space-y-3">
      {aviso && <AvisoOk>{aviso}</AvisoOk>}
      <div className="flex flex-wrap items-center gap-2">
        {activas.length >= MINIMO_PARA_BUSCAR && (
          <div className="flex min-w-[12rem] flex-1">
            <Buscador
              valor={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar categoría…"
              etiqueta="Buscar categoría"
            />
          </div>
        )}
        <Boton type="button" variante="soft" onClick={abrirNueva}>
          <Icon name="plus" size={16} /> Nueva categoría
        </Boton>
      </div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde p-4 text-center text-sm text-texto-3">
          Ninguna categoría coincide.{" "}
          {buscado.length >= MINIMO_NOMBRE && (
            <button type="button" onClick={abrirNueva} className="font-semibold text-primary-700 underline">
              Crear «{buscado}»
            </button>
          )}
        </div>
      ) : (
        <ul
          aria-label="Categorías de gasto"
          className="max-h-[50vh] divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde"
        >
          {visibles.map((c) => {
            const esLaElegida = c.codigo === elegida;
            return (
              <li
                key={c.codigo}
                ref={esLaElegida ? filaElegida : undefined}
                className={`flex items-center gap-2 px-2 py-1.5 ${esLaElegida ? "bg-primary-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onElegir(c)}
                  aria-current={esLaElegida || undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className={`truncate ${esLaElegida ? "font-bold text-primary-700" : "font-medium text-texto"}`}>
                    {c.nombre}
                  </span>
                  {c.propia && <span className="shrink-0 text-xs text-texto-4">propia</span>}
                  {esLaElegida && <Icon name="check" size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => ir({ cual: "tipo", codigo: c.codigo })}
                  aria-label={`${NOMBRE_TIPO[c.tipoCosto]}: corregir si ${c.nombre} es fijo o variable`}
                  title="Corregir si es fijo o variable"
                  className="shrink-0 rounded-lg border border-borde px-2 py-1 text-xs font-semibold text-texto-2 hover:bg-muted"
                >
                  {NOMBRE_TIPO[c.tipoCosto]}
                </button>
                {c.propia ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNombre(c.nombre);
                      ir({ cual: "editar", codigo: c.codigo });
                    }}
                    aria-label={`Editar ${c.nombre}`}
                    title="Renombrar o quitar de la lista"
                    className="shrink-0 rounded-lg p-1.5 text-texto-3 hover:bg-muted"
                  >
                    <Icon name="edit" size={16} />
                  </button>
                ) : (
                  // El hueco del lápiz: sin él, las pastillas de tipo de las
                  // filas propias se corren y la columna queda en zigzag.
                  <span aria-hidden="true" className="w-[28px] shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-texto-3">
        Fijo o variable lo usa el punto de equilibrio. Las que creaste vos se renombran o se quitan con
        el lápiz; las que vienen con el sistema, no.
      </p>
    </div>
  );
}

function Encabezado({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onVolver}
        aria-label="Volver a la lista de categorías"
        className="rounded-lg p-1.5 text-texto-3 hover:bg-muted"
      >
        <Icon name="arrowLeft" size={18} />
      </button>
      <h3 className="min-w-0 truncate text-sm font-bold text-texto">{titulo}</h3>
    </div>
  );
}
