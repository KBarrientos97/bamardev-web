import { useEffect, useRef, useState, type ReactNode } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, useAviso } from "../../components/ui";
import { api } from "../../lib/api";
import { configuracionEnLista, VOLVER_A_CONFIGURACION } from "../../lib/configuracion";
import {
  normalizarConfigPos,
  ordenarCategorias,
  type CobroPos,
  type ConfigPos,
  type VistaPos,
} from "../../lib/configPos";
import { plataformasPrendidas } from "../../lib/pedidosPlataforma/acceso";
import { tieneFeature } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { SiNo, Tarjeta } from "../tickets/piezas";

/**
 * Configuración › Punto de venta (pedido del 16-nov).
 *
 * El dueño vio otra caja que deja elegir cómo se ve el punto de venta y lo
 * quiso todo elegible, sin perder lo de hoy: cada opción de fábrica es el POS
 * de siempre, así que quien no entra acá no nota nada. Se elige:
 *
 *  - **La vista**: las tarjetas de siempre o una columna por categoría, en
 *    lista (la comida a un lado, las bebidas al otro). En el celular siempre
 *    son tarjetas: la lista en columnas es para pantalla grande.
 *  - **Dónde se cobra**: en la pantalla de cobro de siempre o al lado de los
 *    productos, sin cambiar de pantalla (sólo en pantalla ancha).
 *  - **Íconos y filtros**, y **el orden de las categorías**, que vale para los
 *    filtros y para las columnas.
 *  - (Delivery full, 18-nov) **Imprimir el pedido de Yango/PedidosYa** al
 *    registrarlo, sólo con alguna de esas features, y **controlar la plata de
 *    los repartidores**, sólo con `delivery`. Los dos apagados de fábrica.
 *
 * Mesa o para llevar no está acá a propósito: el dueño lo quiere como se
 * trabaja hoy (cada línea nace en mesa y el carrito lo cambia).
 *
 * Se guarda al tocar, como Tickets y despacho. Lo tocado se ve al instante y
 * viaja de a un pedido por vez: si se tocan dos cosas seguidas, la segunda sale
 * cuando vuelve la primera (dos PATCH a la vez podían llegar al revés y dejar
 * lo de antes). Si el servidor no lo guarda, la pantalla vuelve a lo último que
 * sí guardó y lo dice al lado de lo que se tocó.
 */

/** Dónde se dice que algo no se guardó: al lado de lo que se tocó, no arriba de todo. */
type Seccion = "vista" | "cobro" | "mostrar" | "orden" | "plataformas" | "repartidores";

export default function ConfigPuntoDeVenta() {
  const { rubro, fijarConfigPos, negocio } = useAuth();
  // Delivery full (18-nov): cada sección, sólo a quien tiene con qué usarla.
  // Yango y PedidosYa son extras explícitos (no fallan abiertos, como sus botones del POS).
  const conPlataformas = plataformasPrendidas(negocio?.features).length > 0;
  const conDelivery = tieneFeature(negocio?.features, "delivery");
  const estado = useApi(() => api.configPos().then(normalizarConfigPos), []);
  const categorias = useApi(() => api.getCategorias(false), []);

  /** Lo tocado que todavía no confirmó el servidor (se ve mientras viaja). */
  const [enPantalla, setEnPantalla] = useState<ConfigPos | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ en: Seccion; texto: string } | null>(null);
  const [guardado, setGuardado] = useAviso(4000);

  /** Lo último que el servidor dijo que tiene: a esto se vuelve si un cambio falla. */
  const confirmada = useRef<ConfigPos | null>(null);
  useEffect(() => {
    if (estado.datos) confirmada.current = estado.datos;
  }, [estado.datos]);
  /** Lo tocado mientras otro pedido viajaba: sale todo junto cuando vuelve. */
  const pendiente = useRef<Partial<ConfigPos> | null>(null);
  const enVuelo = useRef(false);
  /** Lo último que se tocó: ahí se dice si no se guardó. */
  const ultimoTocado = useRef<Seccion>("vista");

  const actual = enPantalla ?? estado.datos;

  const mandar = async () => {
    enVuelo.current = true;
    setGuardando(true);
    try {
      while (pendiente.current) {
        const cambios = pendiente.current;
        pendiente.current = null;
        const r = normalizarConfigPos(await api.guardarConfigPos(cambios));
        confirmada.current = r;
        // La sesión se entera ahora: el POS de este equipo cambia sin volver a entrar.
        fijarConfigPos?.(r);
        if (!pendiente.current) {
          setEnPantalla(null);
          estado.setDatos(r);
        }
      }
      setGuardado("Guardado");
    } catch (e) {
      // Lo que esperaba detrás tampoco sale: se partió de algo que no quedó.
      pendiente.current = null;
      setEnPantalla(null);
      if (confirmada.current) estado.setDatos(confirmada.current);
      setGuardado("");
      setError({
        en: ultimoTocado.current,
        texto: e instanceof Error && e.message ? e.message : "No se pudo guardar el cambio",
      });
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  const guardar = (cambios: Partial<ConfigPos>, donde: Seccion) => {
    if (!actual) return;
    setEnPantalla({ ...actual, ...cambios });
    setError(null);
    ultimoTocado.current = donde;
    pendiente.current = { ...pendiente.current, ...cambios };
    if (!enVuelo.current) void mandar();
  };

  const errorDe = (donde: Seccion) => (error?.en === donde ? <ErrorMsg>{error.texto}</ErrorMsg> : null);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Punto de venta"
        subtitulo="Cómo se ven los productos y cómo se cobra."
        // Se llega desde la lista de Configuración: la flecha vuelve ahí.
        volver={configuracionEnLista(rubro) ? VOLVER_A_CONFIGURACION : undefined}
        accion={<EstadoGuardado guardando={guardando} guardado={!!guardado} />}
      />
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !actual ? (
        <Cargando />
      ) : (
        <>
          <Tarjeta titulo="Vista de productos">
            <Opciones<VistaPos>
              etiqueta="Vista de productos"
              valor={actual.vista}
              onElegir={(vista) => vista !== actual.vista && guardar({ vista }, "vista")}
              opciones={[
                {
                  valor: "TARJETAS",
                  titulo: "Tarjetas",
                  texto: "Los productos en tarjetas, con su ícono. La de siempre.",
                  dibujo: <DibujoTarjetas />,
                },
                {
                  valor: "COLUMNAS",
                  titulo: "Columnas por categoría",
                  texto: "Una columna por categoría, en lista. Entra más a la vista. En el celular se ven las tarjetas de siempre.",
                  dibujo: <DibujoColumnas />,
                },
              ]}
            />
            {errorDe("vista")}
          </Tarjeta>

          <Tarjeta titulo="Cobro">
            <Opciones<CobroPos>
              etiqueta="Cobro"
              valor={actual.cobro}
              onElegir={(cobro) => cobro !== actual.cobro && guardar({ cobro }, "cobro")}
              opciones={[
                {
                  valor: "APARTE",
                  titulo: "En pantalla aparte",
                  texto: "Cobrar abre la pantalla de cobro. La de siempre.",
                  dibujo: <DibujoCobroAparte />,
                },
                {
                  valor: "EN_VENTA",
                  titulo: "En la misma pantalla",
                  texto:
                    "El medio de pago, el efectivo y Confirmar quedan al lado de los productos. En computadora y tablet horizontal; en el celular se cobra como siempre.",
                  dibujo: <DibujoCobroEnVenta />,
                },
              ]}
            />
            {errorDe("cobro")}
          </Tarjeta>

          <Tarjeta titulo="Qué se muestra">
            <div className="divide-y divide-borde-soft">
              <SiNo
                activo={actual.iconos}
                onCambiar={(iconos) => guardar({ iconos }, "mostrar")}
                etiqueta="Mostrar íconos de los productos"
                detalle={
                  actual.iconos
                    ? "Cada producto lleva su ícono o su foto."
                    : "Sólo el nombre y el precio: entran más productos a la vista."
                }
              />
              <SiNo
                activo={actual.filtros}
                onCambiar={(filtros) => guardar({ filtros }, "mostrar")}
                etiqueta="Mostrar filtros de categoría"
                detalle={
                  actual.filtros
                    ? "Los botones de cada categoría, arriba de los productos."
                    : "Sin los botones de categoría: se ven todos los productos y se busca con el buscador."
                }
              />
            </div>
            {errorDe("mostrar")}
          </Tarjeta>

          <Tarjeta titulo="Orden de las categorías">
            <p className="text-[13px] text-texto-2">
              El orden vale para los filtros y para las columnas del punto de venta. Las categorías nuevas aparecen al
              final.
            </p>
            <div className="mt-3">
              {categorias.error ? (
                <ErrorMsg onReintentar={categorias.recargar}>{categorias.error}</ErrorMsg>
              ) : !categorias.datos ? (
                <Cargando texto="Cargando las categorías…" />
              ) : categorias.datos.length === 0 ? (
                <p className="rounded-xl bg-muted px-3.5 py-3 text-[13px] text-texto-3">
                  Todavía no hay categorías. Se crean en Inventario, al cargar los productos.
                </p>
              ) : (
                <OrdenCategorias
                  categorias={ordenarCategorias(categorias.datos, actual.ordenCategorias)}
                  personalizado={actual.ordenCategorias.length > 0}
                  onOrdenar={(ordenCategorias) => guardar({ ordenCategorias }, "orden")}
                />
              )}
            </div>
            {errorDe("orden")}
          </Tarjeta>

          {conPlataformas && (
            <Tarjeta titulo="Pedidos de Yango y PedidosYa">
              <SiNo
                activo={actual.imprimirPlataformas}
                onCambiar={(imprimirPlataformas) => guardar({ imprimirPlataformas }, "plataformas")}
                etiqueta="Imprimir el pedido al registrarlo"
                detalle="Al registrar un pedido de Yango o PedidosYa se abre su ticket para imprimirlo. Apagado, se registra y listo, como siempre."
              />
              {errorDe("plataformas")}
            </Tarjeta>
          )}

          {conDelivery && (
            <Tarjeta titulo="Delivery propio">
              <SiNo
                activo={actual.rendirRepartidores}
                onCambiar={(rendirRepartidores) => guardar({ rendirRepartidores }, "repartidores")}
                etiqueta="Controlar la plata de los repartidores"
                detalle="Lo que el repartidor cobra en efectivo figura como plata en su poder hasta que la caja la recibe. La caja no se cierra con plata sin recibir."
              />
              {errorDe("repartidores")}
            </Tarjeta>
          )}
        </>
      )}
    </div>
  );
}

/** «Guardando…» mientras viaja y «Guardado» un rato después: los cambios se guardan solos. */
function EstadoGuardado({ guardando, guardado }: { guardando: boolean; guardado: boolean }) {
  return (
    <p role="status" aria-live="polite" className="flex min-h-9 items-center text-[13px] font-semibold">
      {guardando ? (
        <span className="flex items-center gap-2 text-texto-3">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-200 border-t-primary" />
          Guardando…
        </span>
      ) : guardado ? (
        <span className="flex items-center gap-1.5 text-primary-700">
          <Icon name="check" size={16} />
          Guardado
        </span>
      ) : null}
    </p>
  );
}

interface Opcion<T extends string> {
  valor: T;
  titulo: string;
  texto: string;
  dibujo: ReactNode;
}

/**
 * Dos opciones grandes, cada una con un dibujito de cómo queda: «columnas» o
 * «en la misma pantalla» dicho en palabras no se entiende hasta verlo.
 */
function Opciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onElegir,
}: {
  etiqueta: string;
  opciones: Opcion<T>[];
  valor: T;
  onElegir: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid gap-3 sm:grid-cols-2">
      {opciones.map((o) => {
        const elegida = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={elegida}
            onClick={() => onElegir(o.valor)}
            className={`flex min-h-24 items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
              elegida ? "border-primary bg-primary-50" : "border-borde bg-white hover:border-primary-200 hover:bg-muted"
            }`}
          >
            <span aria-hidden="true" className="shrink-0">
              {o.dibujo}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold leading-snug text-texto">{o.titulo}</span>
                {/* El punto del radio: la elegida se nota también sin el color. */}
                <span
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                    elegida ? "border-primary-boton" : "border-borde"
                  }`}
                >
                  {elegida && <span className="h-2 w-2 rounded-full bg-primary-boton" />}
                </span>
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-texto-3">{o.texto}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Las categorías con ↑ ↓, como el orden de las categorías de Mi página. */
function OrdenCategorias({
  categorias,
  personalizado,
  onOrdenar,
}: {
  categorias: { id: number; nombre: string }[];
  /** Si el dueño ya eligió un orden: sólo entonces hay "orden de siempre" al que volver. */
  personalizado: boolean;
  onOrdenar: (ids: number[]) => void;
}) {
  const ids = categorias.map((c) => c.id);
  const mover = (i: number, paso: -1 | 1) => {
    const nuevo = [...ids];
    [nuevo[i], nuevo[i + paso]] = [nuevo[i + paso], nuevo[i]];
    onOrdenar(nuevo);
  };
  return (
    <>
      <ol aria-label="Orden de las categorías" className="divide-y divide-borde overflow-hidden rounded-xl border border-borde">
        {categorias.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-5 shrink-0 text-right text-xs font-semibold text-texto-4">{i + 1}</span>
            <span className="min-w-0 flex-1 break-words text-sm font-semibold text-texto">{c.nombre}</span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Subir la categoría ${c.nombre}`}
                title="Antes"
                disabled={i === 0}
                onClick={() => mover(i, -1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
              >
                <Icon name="arrowUp" size={17} />
              </button>
              <button
                type="button"
                aria-label={`Bajar la categoría ${c.nombre}`}
                title="Después"
                disabled={i === categorias.length - 1}
                onClick={() => mover(i, 1)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
              >
                <Icon name="arrowDown" size={17} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      {personalizado && (
        <Boton variante="ghost" className="mt-3" onClick={() => onOrdenar([])}>
          Volver al orden de siempre
        </Boton>
      )}
    </>
  );
}

// ── Los dibujitos ─────────────────────────────────────────────────────────
// Esquemas, no capturas: con los colores del negocio y sin texto, para que se
// lean igual en cualquier rubro y con cualquier paleta.

function Pantallita({ children }: { children: ReactNode }) {
  return <span className="flex h-14 w-20 gap-1 rounded-lg border border-borde bg-white p-1.5">{children}</span>;
}

function DibujoTarjetas() {
  return (
    <Pantallita>
      <span className="grid flex-1 grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex items-start rounded-[3px] bg-primary-100 p-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        ))}
      </span>
    </Pantallita>
  );
}

function DibujoColumnas() {
  return (
    <Pantallita>
      {[4, 3, 2].map((filas, i) => (
        <span key={i} className="flex flex-1 flex-col gap-[3px]">
          <span className="h-1.5 rounded-sm bg-primary" />
          {Array.from({ length: filas }, (_, j) => (
            <span key={j} className="h-1 rounded-full bg-primary-200" />
          ))}
        </span>
      ))}
    </Pantallita>
  );
}

/** Los productos y el carrito; al lado, la pantalla de cobro a la que se pasa. */
function DibujoCobroAparte() {
  return (
    <span className="flex h-14 w-20 items-center gap-0.5">
      <span className="flex h-full flex-1 gap-0.5 rounded-md border border-borde bg-white p-1">
        <span className="grid flex-1 grid-cols-2 gap-0.5">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="rounded-[2px] bg-primary-100" />
          ))}
        </span>
        <span className="w-1.5 rounded-[2px] bg-borde" />
      </span>
      <Icon name="arrowRight" size={10} className="shrink-0 text-texto-4" />
      <span className="flex h-full flex-1 flex-col justify-end gap-0.5 rounded-md border border-borde bg-white p-1">
        <span className="h-2 rounded-[2px] bg-primary-200" />
        <span className="h-1.5 rounded-[2px] bg-primary-boton" />
      </span>
    </span>
  );
}

/** Los productos y, al costado, el carrito con el cobro y su botón al pie. */
function DibujoCobroEnVenta() {
  return (
    <Pantallita>
      <span className="grid flex-[2] grid-cols-2 gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="rounded-[3px] bg-primary-100" />
        ))}
      </span>
      <span className="flex flex-1 flex-col gap-[3px] rounded-[3px] border border-borde p-0.5">
        <span className="h-1 rounded-full bg-borde" />
        <span className="h-1 rounded-full bg-borde" />
        <span className="mt-auto h-1.5 rounded-[2px] bg-primary-200" />
        <span className="h-2 rounded-[2px] bg-primary-boton" />
      </span>
    </Pantallita>
  );
}
