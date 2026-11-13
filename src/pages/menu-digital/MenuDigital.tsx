import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import TelevisoresDelLocal from "../tickets/TelevisoresDelLocal";
import { SelectorLocalTickets, useLocalDeTickets } from "../tickets/useLocalDeTickets";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Boton, Confirmar, ErrorMsg } from "../../components/ui";
import { apiMenuDigital, urlApi } from "../../lib/apiMenuDigital";
import { apiTickets } from "../../lib/apiTickets";
import { fmtMoney } from "../../lib/format";
import {
  armarAnimacion,
  conAnimacion,
  DISENO_DE_RESPALDO,
  escenaDeMuestra,
  nombreDeEscena,
} from "../../lib/menuDigital/animado";
import { categoriasDeBebidas } from "../../lib/menuDigital/bebidas";
import { ordenar, paginar, platosDeLaPantalla } from "../../lib/menuDigital/paginar";
import { useRelojEscenas } from "../../lib/menuDigital/useRelojEscenas";
import { useArrastreGrilla } from "../pos/useArrastreGrilla";
import { prepararFotoPlato } from "../../lib/pagina/imagen";
import { useAuth } from "../../store/AuthContext";
import {
  ANIMADOS_MENU,
  DISENOS_MENU,
  ETIQUETAS_PLATO,
  TEMAS_MENU,
  TEXTO_ETIQUETA,
  type AnimadoMenu,
  type DisenoMenu,
  type EditorMenu,
  type EtiquetaPlato,
  type PantallaMenu,
  type PlatoMenu,
  type TemaMenu,
} from "../../types/menuDigital";
import { LienzoTv } from "../tickets/TableroTv";
import { PestanasTickets, Segmentado, SiNo, Tarjeta } from "../tickets/piezas";
import { coloresMenu } from "../../lib/menuDigital/colores";
import { TableroAnimado } from "./TableroAnimado";
import { TableroMenu } from "./TableroMenu";

/**
 * Menú digital (extra `menu_digital`): lo que se ve en los televisores del
 * local, como en un fast food. Hasta cuatro TVs, cada una con su diseño,
 * tema, categorías y platos; y la ficha de menú de cada plato (foto,
 * descripción, etiqueta, agotado de hoy).
 *
 * El nombre y el precio son los de Inventario, con candado: el menú no los
 * edita (una TV no puede anunciar un precio que la caja no cobra). Un plato
 * nuevo se crea en Inventario y aparece acá solo.
 *
 * Todo se guarda solo, un momento después del último cambio, y las TVs lo
 * toman en su vuelta siguiente (cada 30 segundos).
 */
type Pestana = "pantallas" | "platos";

export default function MenuDigital() {
  const [pestana, setPestana] = useState<Pestana>("pantallas");
  const [datos, setDatos] = useState<EditorMenu | null>(null);
  const [error, setError] = useState("");
  const [llave, setLlave] = useState<string | null>(null);
  // De qué local se ven los precios y la disponibilidad, y de cuál es el enlace de
  // la TV. Sólo la organización con 2+ locales elige (arranca en el principal, que
  // es el que el backend ya le daba); con un local, o atado a uno, `sucursalId` es
  // null y la pantalla es la de siempre.
  const local = useLocalDeTickets();
  const sucursalId = local.sucursalId;

  // Solo vale la respuesta del último pedido: al cambiar de local de prisa, la
  // lenta de antes no pisa a la nueva.
  const pedido = useRef(0);
  const cargar = useCallback(() => {
    setError("");
    const mio = ++pedido.current;
    apiMenuDigital
      .editor(sucursalId)
      .then((d) => {
        if (mio === pedido.current) setDatos(d);
      })
      .catch((e) => {
        if (mio === pedido.current) setError(e instanceof Error ? e.message : "No se pudo cargar el menú");
      });
  }, [sucursalId]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    apiTickets
      .llave()
      .then((r) => setLlave(r.llave))
      .catch(() => undefined);
  }, []);

  // La respuesta de un PATCH es el plato resuelto en el local del USUARIO (o el
  // principal), no en el que se está mirando: se quedan el precio y la
  // disponibilidad que ya estaban (§10.5) y se toma lo demás.
  const cambiarPlato = useCallback((p: PlatoMenu) => {
    setDatos((d) =>
      d
        ? {
            ...d,
            platos: d.platos.map((x) =>
              x.id === p.id ? { ...p, precio: x.precio, ...(x.disponible !== undefined ? { disponible: x.disponible } : {}) } : x,
            ),
          }
        : d,
    );
  }, []);

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-texto">Menú digital</h1>
            <p className="mt-0.5 text-sm text-texto-3">
              Lo que se ve en los televisores del local. Los cambios se publican solos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {local.elegir && (
              <SelectorLocalTickets locales={local.locales} valor={local.sucursalId} onChange={local.setLocal} />
            )}
            <PestanasTickets<Pestana>
              opciones={[
                { valor: "pantallas", texto: "Pantallas", icono: "pantalla" },
                { valor: "platos", texto: "Platos y fotos", icono: "camara" },
              ]}
              valor={pestana}
              onCambiar={setPestana}
            />
          </div>
        </header>
        {local.elegir && local.nombre && (
          <p role="note" className="mt-3 text-[13px] text-texto-3">
            Los precios y la disponibilidad son los de {local.nombre}. Marcar un plato como agotado vale para todos los locales.
          </p>
        )}
        {error && (
          <div className="mt-4">
            <ErrorMsg onReintentar={cargar}>{error}</ErrorMsg>
          </div>
        )}
        {!datos && !error && <p className="py-16 text-center text-texto-3">Cargando el menú…</p>}
        {datos && pestana === "pantallas" && (
          <PestanaPantallas
            datos={datos}
            llave={llave}
            onLlave={setLlave}
            sucursalId={sucursalId}
            onPantallas={(pantallas) => setDatos((d) => (d ? { ...d, pantallas } : d))}
          />
        )}
        {datos && pestana === "platos" && <PestanaPlatos datos={datos} onPlato={cambiarPlato} />}
      </div>
    </div>
  );
}

// ── Pantallas ─────────────────────────────────────────────────────────────

const NOMBRE_DISENO: Record<DisenoMenu, { texto: string; ayuda: string; icono: "tarjetas" | "lista" | "pantalla" }> = {
  fotos: { texto: "Fotos", ayuda: "Tarjetas con foto grande. Ideal para pocos platos.", icono: "tarjetas" },
  lista: { texto: "Lista", ayuda: "Carta clásica con precios alineados. Cabe mucho.", icono: "lista" },
  destacado: { texto: "Destacado", ayuda: "Un plato protagonista y la lista al lado.", icono: "pantalla" },
};

/**
 * Los animados (8-nov). Los quietos de arriba quedan como estaban: Kevin los
 * quiso así ("dejalos esos 3 estáticos") y estos van aparte, para todo gusto.
 */
const NOMBRE_ANIMADO: Record<AnimadoMenu, { texto: string; ayuda: string; icono: "video" | "girar" | "grid" }> = {
  presentacion: {
    texto: "Presentación",
    ayuda: "El logo en grande con el nombre, después cada plato solo en toda la pantalla y, al final, las bebidas en grupo.",
    icono: "video",
  },
  carrusel: {
    texto: "Carrusel",
    ayuda: "El plato protagonista va cambiando, uno por uno, y la lista de al lado marca cuál se está viendo.",
    icono: "girar",
  },
  mosaico: {
    texto: "Mosaico",
    ayuda: "Las tarjetas entran en cascada y una luz las recorre una por una, agrandando cada plato.",
    icono: "grid",
  },
};

/** "Fotos", "Carrusel": el nombre del diseño que tiene la TV. */
function nombreDelDiseno(p: PantallaMenu): string {
  const a = conAnimacion(p).animado;
  return a ? NOMBRE_ANIMADO[a].texto : NOMBRE_DISENO[p.diseno].texto;
}

const NOMBRE_TEMA: Record<TemaMenu, string> = {
  rojo: "Rojo",
  amarillo: "Amarillo",
  brasa: "Brasa",
  crema: "Crema",
  verde: "Verde",
  personalizado: "Personalizado",
};

function PestanaPantallas({
  datos,
  llave,
  onLlave,
  sucursalId,
  onPantallas,
}: {
  datos: EditorMenu;
  llave: string | null;
  onLlave: (l: string) => void;
  /** El local del enlace de la TV (null = no se agrega al enlace). */
  sucursalId: number | null;
  onPantallas: (p: PantallaMenu[]) => void;
}) {
  const navigate = useNavigate();
  const { puede } = useAuth();
  const [elegida, setElegida] = useState(datos.pantallas[0]?.numero ?? 0);
  const [guardado, setGuardado] = useState<"" | "guardando" | "guardado" | "error">("");
  const [borrar, setBorrar] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pantallas = datos.pantallas;
  const actual = pantallas.find((p) => p.numero === elegida) ?? pantallas[0] ?? null;

  /** Lo que espera su turno para guardarse (el reloj de abajo). */
  const pendiente = useRef<PantallaMenu[] | null>(null);

  /** Guarda la lista entera un momento después del último cambio. */
  const guardar = useCallback(
    (nuevas: PantallaMenu[]) => {
      onPantallas(nuevas);
      setGuardado("guardando");
      pendiente.current = nuevas;
      if (reloj.current) clearTimeout(reloj.current);
      reloj.current = setTimeout(() => {
        pendiente.current = null;
        apiMenuDigital
          .guardarPantallas(nuevas)
          .then(() => setGuardado("guardado"))
          .catch(() => setGuardado("error"));
      }, 700);
    },
    [onPantallas],
  );
  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
      // Se pasó a "Platos y fotos" (o a otra pantalla) antes de que saliera:
      // se manda ya. Cancelarlo dejaba el cambio a la vista, como guardado,
      // pero la TV nunca lo recibía y al recargar desaparecía.
      if (pendiente.current) void apiMenuDigital.guardarPantallas(pendiente.current).catch(() => undefined);
    },
    [],
  );

  const cambiar = (parcial: Partial<PantallaMenu>) => {
    if (!actual) return;
    guardar(pantallas.map((p) => (p.numero === actual.numero ? { ...p, ...parcial } : p)));
  };

  const agregar = () => {
    const libre = [1, 2, 3, 4].find((n) => !pantallas.some((p) => p.numero === n));
    if (!libre) return;
    const nueva: PantallaMenu = {
      numero: libre,
      nombre: `TV ${libre}`,
      diseno: "fotos",
      tema: "brasa",
      colores: { fondo: "#1A1210", acento: "#FF9F1C", texto: "#FFF4E6" },
      titulo: "Nuestro menú",
      subtitulo: "",
      cinta: "",
      categorias: [],
      ocultos: [],
      columnas: 4,
      tamano: "m",
      rotarSeg: 12,
      logo: true,
      fotos: true,
      descripciones: true,
      etiquetas: true,
      agotadosTachados: true,
    };
    guardar([...pantallas, nueva].sort((a, b) => a.numero - b.numero));
    setElegida(libre);
  };

  const eliminar = () => {
    if (!actual) return;
    const resto = pantallas.filter((p) => p.numero !== actual.numero);
    guardar(resto);
    setElegida(resto[0]?.numero ?? 0);
    setBorrar(false);
  };

  return (
    <div className="mt-5 space-y-5">
      {/* Arriba de todo: debajo del editor quedaba después de la columna de
          ajustes, a dos pantallas de alto, y no se encontraba dónde conectar
          la TV con el código (Kevin, 4-nov). */}
      <TelevisoresDelLocal enFila />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {pantallas.map((p) => (
          <button
            key={p.numero}
            type="button"
            onClick={() => setElegida(p.numero)}
            className={`card overflow-hidden p-2 text-left transition ${p.numero === actual?.numero ? "ring-2 ring-primary-boton" : "hover:bg-muted"}`}
          >
            <VistaPantalla pantalla={p} datos={datos} />
            <p className="mt-2 truncate px-1 text-sm font-bold text-texto">{p.nombre}</p>
            <p className="flex items-center gap-1 truncate px-1 text-[12px] text-texto-3">
              {conAnimacion(p).animado && <Icon name="play" size={11} className="shrink-0 text-primary-700" />}
              {nombreDelDiseno(p)} · {NOMBRE_TEMA[p.tema]}
            </p>
          </button>
        ))}
        {pantallas.length < 4 && (
          <button
            type="button"
            onClick={agregar}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-borde text-sm font-semibold text-texto-3 hover:bg-muted"
          >
            <Icon name="plus" size={22} />
            Agregar pantalla
          </button>
        )}
        {puede("tickets") && (
          <button
            type="button"
            onClick={() => navigate("/tickets")}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-borde bg-white text-sm font-semibold text-texto-2 hover:bg-muted"
          >
            <Icon name="ticket" size={22} />
            Pantalla de tickets
            <span className="text-[12px] font-normal text-texto-3">Números de pedido · con sonido</span>
          </button>
        )}
      </div>

      {!actual ? (
        <div className="card p-8 text-center">
          <p className="font-semibold text-texto">Todavía no hay pantallas de menú</p>
          <p className="mt-1 text-sm text-texto-3">Agregá la primera: una por cada televisor del local.</p>
          <Boton icono="plus" className="mt-4" onClick={agregar}>
            Agregar pantalla
          </Boton>
        </div>
      ) : (
        <EditorPantalla
          key={actual.numero}
          pantalla={actual}
          datos={datos}
          llave={llave}
          onLlave={onLlave}
          sucursalId={sucursalId}
          guardado={guardado}
          onCambiar={cambiar}
          onEliminar={() => setBorrar(true)}
        />
      )}
      <Confirmar
        abierto={borrar}
        titulo="¿Eliminar esta pantalla?"
        texto="El televisor que la muestra deja de mostrar el menú y avisa que la pantalla ya no está habilitada. Los platos no se tocan."
        etiquetaOk="Eliminar"
        peligroso
        onCancel={() => setBorrar(false)}
        onOk={eliminar}
      />
    </div>
  );
}

/**
 * La miniatura de una TV: su primera página o, si es animada, su primera
 * escena quieta (cuatro TVs moviéndose en una fila cansan y no dejan elegir).
 */
function VistaPantalla({ pantalla, datos }: { pantalla: PantallaMenu; datos: EditorMenu }) {
  const vis = platosDeLaPantalla(pantalla, datos.platos, datos.categorias);
  if (conAnimacion(pantalla).animado) {
    const a = armarAnimacion(pantalla, vis.platos, vis.categorias);
    return (
      <LienzoTv modo="previa" fondo={coloresMenu(pantalla).fondo}>
        <TableroAnimado
          datos={{ negocio: "", pantalla, url: urlApi, logo: datos.logo }}
          escena={escenaDeMuestra(a.escenas)}
          vuelta={0}
          cinta={a.cinta}
          quieto
        />
      </LienzoTv>
    );
  }
  const pagina = paginar(pantalla, vis.platos, vis.categorias)[0];
  return (
    <LienzoTv modo="previa" fondo={coloresMenu(pantalla).fondo}>
      <TableroMenu
        datos={{ negocio: "", pantalla, url: urlApi, logo: datos.logo }}
        pagina={pagina}
        paginaActual={0}
        totalPaginas={1}
      />
    </LienzoTv>
  );
}

function EditorPantalla({
  pantalla: p,
  datos,
  llave,
  onLlave,
  sucursalId,
  guardado,
  onCambiar,
  onEliminar,
}: {
  pantalla: PantallaMenu;
  datos: EditorMenu;
  llave: string | null;
  onLlave: (l: string) => void;
  sucursalId: number | null;
  guardado: "" | "guardando" | "guardado" | "error";
  onCambiar: (parcial: Partial<PantallaMenu>) => void;
  onEliminar: () => void;
}) {
  const { negocio } = useAuth();
  // La TV pública muestra el local que dice el enlace (`?sucursal=`); sin él, el
  // principal. El local lo elige el encabezado de la pantalla, el mismo del editor.
  const vis = useMemo(() => platosDeLaPantalla(p, datos.platos, datos.categorias), [p, datos]);
  const paginas = useMemo(() => paginar(p, vis.platos, vis.categorias), [p, vis]);
  const [pagina, setPagina] = useState<number | "auto">("auto");
  const [auto, setAuto] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState("");

  // Los animados: la misma función que corre en la TV, con pausa y pasos a
  // mano para que el dueño vea cada escena sin esperar la vuelta entera.
  const ani = conAnimacion(p);
  const animacion = useMemo(() => (ani.animado ? armarAnimacion(p, vis.platos, vis.categorias) : null), [ani.animado, p, vis]);
  const [pausado, setPausado] = useState(false);
  const reloj = useRelojEscenas(animacion ? animacion.escenas.map((e) => e.ms) : [], pausado);
  const escena = animacion?.escenas[reloj.indice];
  const irA = reloj.ir;
  // Otro diseño, desde el principio: la escena 7 del anterior no dice nada.
  useEffect(() => {
    irA(0);
  }, [ani.animado, irA]);

  useEffect(() => {
    if (ani.animado || pagina !== "auto" || paginas.length < 2) return;
    const id = setInterval(() => setAuto((a) => (a + 1) % paginas.length), p.rotarSeg * 1000);
    return () => clearInterval(id);
  }, [ani.animado, pagina, paginas.length, p.rotarSeg]);

  const indice = pagina === "auto" ? auto % paginas.length : Math.min(pagina, paginas.length - 1);
  const asegurarLlave = async () => {
    if (llave) return llave;
    // Sin llave a mano puede ser que todavía no llegó, o que falló al traerla
    // (el wifi parpadeó al abrir): generar ahí rotaba la llave y cortaba la TV
    // de tickets y las del menú en pleno servicio. Se vuelve a preguntar y
    // sólo se genera si de verdad nunca hubo una.
    const vigente = (await apiTickets.llave()).llave;
    if (vigente) {
      onLlave(vigente);
      return vigente;
    }
    const r = await apiTickets.nuevaLlave();
    onLlave(r.llave);
    return r.llave;
  };
  const enlace = (l: string) =>
    `${window.location.origin}/tv/menu/${l}/${p.numero}${sucursalId != null ? `?sucursal=${sucursalId}` : ""}`;
  const abrir = async () => {
    try {
      window.open(enlace(await asegurarLlave()), "_blank", "noopener");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo abrir");
    }
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace(await asegurarLlave()));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setAviso("No se pudo copiar el enlace.");
    }
  };
  const toggle = (lista: number[], id: number) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      {/* La vista previa acompaña al bajar por los ajustes: la columna de la
          derecha mide dos pantallas, y al llegar a "Platos" o "Ajustes" la TV
          se iba para arriba y quedaba un hueco blanco; se tocaba algo sin ver
          qué cambiaba. Sólo a lo ancho: en una columna taparía los ajustes. */}
      <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <Tarjeta
          titulo={p.nombre}
          accion={
            <div className="flex flex-wrap items-center gap-2">
              <EstadoGuardado estado={guardado} />
              <Boton icono="arrowUpRight" className="px-3 py-2" onClick={() => void abrir()}>
                Abrir en TV
              </Boton>
              <Boton variante="ghost" icono={copiado ? "check" : "copiar"} className="px-3 py-2" onClick={() => void copiar()}>
                {copiado ? "Copiado" : "Copiar enlace"}
              </Boton>
            </div>
          }
        >
          {aviso && (
            <div className="mb-3">
              <ErrorMsg>{aviso}</ErrorMsg>
            </div>
          )}
          <LienzoTv modo="previa" fondo={coloresMenu(p).fondo}>
            {animacion ? (
              <TableroAnimado
                datos={{ negocio: negocio?.nombre ?? "", pantalla: p, url: urlApi, logo: datos.logo }}
                escena={escena}
                vuelta={reloj.vuelta}
                cinta={animacion.cinta}
                pausado={pausado}
              />
            ) : (
              <TableroMenu
                datos={{ negocio: negocio?.nombre ?? "", pantalla: p, url: urlApi, logo: datos.logo }}
                pagina={paginas[indice]}
                paginaActual={indice}
                totalPaginas={paginas.length}
              />
            )}
          </LienzoTv>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-texto-3">
              {vis.platos.length} {vis.platos.length === 1 ? "plato" : "platos"} ·{" "}
              {animacion
                ? `${animacion.escenas.length} ${animacion.escenas.length === 1 ? "escena" : "escenas"}`
                : `${paginas.length} ${paginas.length === 1 ? "página" : "páginas"}`}
              {!datos.logo && " · sin logo (se carga en Configuración del recibo)"}
            </p>
            {animacion && (
              <ControlesAnimacion
                total={animacion.escenas.length}
                indice={reloj.indice}
                pausado={pausado}
                onPausa={() => setPausado((v) => !v)}
                onIr={irA}
              />
            )}
            {!animacion && paginas.length > 1 && (
              <Segmentado<number | "auto">
                etiqueta="Página"
                valor={pagina}
                onCambiar={setPagina}
                opciones={[{ valor: "auto", texto: "Auto" }, ...paginas.map((_, i) => ({ valor: i, texto: String(i + 1) }))]}
              />
            )}
          </div>
          {animacion && escena && (
            <p className="mt-2 text-[13px] text-texto-2">
              {pausado ? "En pausa: " : "Ahora: "}
              <span className="font-semibold text-texto">{nombreDeEscena(escena)}</span>
              <span className="text-texto-3">
                {" "}
                · escena {reloj.indice + 1} de {animacion.escenas.length}
              </span>
            </p>
          )}
          <p className="mt-2 text-[12px] text-texto-3">
            En el televisor: conectalo con el código desde «TVs del local», arriba, o abrí el enlace y hacé doble clic
            para verlo en pantalla completa. {animacion ? "La pausa es sólo acá: la TV sigue sola." : "Si no entra todo, pasa de página solo."}
          </p>
        </Tarjeta>
      </div>

      <div className="space-y-4">
        <Tarjeta titulo="Nombre y diseño">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-texto-2">Nombre de la pantalla</span>
            <input
              value={p.nombre}
              maxLength={40}
              onChange={(e) => onCambiar({ nombre: e.target.value })}
              className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-sm text-texto outline-none focus:border-primary"
            />
          </label>
          <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-[0.1em] text-texto-3">Quietos</p>
          <div className="grid grid-cols-3 gap-2">
            {DISENOS_MENU.map((d) => {
              const elegido = !ani.animado && p.diseno === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => onCambiar({ diseno: d, animado: null })}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 text-[12px] font-semibold ${
                    elegido ? "border-primary-boton text-primary-700" : "border-borde text-texto-2 hover:bg-muted"
                  }`}
                >
                  <Icon name={NOMBRE_DISENO[d].icono} size={22} />
                  {NOMBRE_DISENO[d].texto}
                </button>
              );
            })}
          </div>
          <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-[0.1em] text-texto-3">Animados</p>
          <div className="grid grid-cols-3 gap-2">
            {ANIMADOS_MENU.map((a) => {
              const elegido = ani.animado === a;
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={elegido}
                  // El quieto más parecido queda guardado al lado: es lo que
                  // muestra una pestaña de la web anterior a las animaciones.
                  onClick={() => onCambiar({ animado: a, diseno: DISENO_DE_RESPALDO[a] })}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 text-[12px] font-semibold ${
                    elegido ? "border-primary-boton bg-primary-50 text-primary-700" : "border-borde text-texto-2 hover:bg-muted"
                  }`}
                >
                  <Icon name={NOMBRE_ANIMADO[a].icono} size={22} />
                  {NOMBRE_ANIMADO[a].texto}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-texto-3">{ani.animado ? NOMBRE_ANIMADO[ani.animado].ayuda : NOMBRE_DISENO[p.diseno].ayuda}</p>
        </Tarjeta>

        {ani.animado && (
          <Tarjeta titulo="Animación">
            <SiNo
              etiqueta="Presentación con el logo"
              detalle="Al empezar cada vuelta: el logo en grande, con el nombre."
              activo={ani.intro}
              onCambiar={(v) => onCambiar({ intro: v })}
            />
            {ani.intro && (
              <label className="mb-1 block">
                <span className="mb-1 block text-[12px] font-semibold text-texto-2">Nombre que se presenta</span>
                <input
                  value={ani.textoIntro}
                  maxLength={60}
                  placeholder={negocio?.nombre || "El nombre del negocio"}
                  onChange={(e) => onCambiar({ textoIntro: e.target.value })}
                  className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-sm text-texto outline-none focus:border-primary"
                />
                <span className="mt-1 block text-[12px] text-texto-3">
                  Vacío, sale el nombre del negocio.
                  {!datos.logo && " Sin logo cargado sale sólo el nombre (el logo se carga en Configuración del recibo)."}
                  {datos.logo && !p.logo && " «Mostrar logo» está apagado: sale sólo el nombre."}
                </span>
              </label>
            )}
            {ani.animado !== "mosaico" && (
              <FilaAjuste etiqueta="Cada plato dura">
                <Segmentado
                  etiqueta="Cada plato dura"
                  valor={ani.segPlato}
                  onCambiar={(v) => onCambiar({ segPlato: v })}
                  opciones={[4, 6, 8, 10].map((n) => ({ valor: n, texto: `${n} s` }))}
                />
              </FilaAjuste>
            )}
            {ani.animado !== "presentacion" && (
              <SiNo
                etiqueta="Bebidas en la cinta que corre"
                detalle="Los platos en grande y las bebidas pasando abajo con su precio. Sólo si la TV tiene de las dos."
                activo={ani.bebidasEnCinta}
                onCambiar={(v) => onCambiar({ bebidasEnCinta: v })}
              />
            )}
            <FilaAjuste etiqueta="Logo arriba a la">
              <Segmentado
                etiqueta="Logo arriba a la"
                valor={ani.ladoLogo}
                onCambiar={(v) => onCambiar({ ladoLogo: v })}
                opciones={[
                  { valor: "izquierda", texto: "Izquierda" },
                  { valor: "derecha", texto: "Derecha" },
                ]}
              />
            </FilaAjuste>
            <p className="mt-1 text-[12px] text-texto-3">
              Lo elaborado sale primero y las bebidas al final. El orden de los platos se cambia abajo, en «Platos en esta pantalla».
            </p>
          </Tarjeta>
        )}

        <Tarjeta titulo="Tema">
          <div className="grid grid-cols-3 gap-2">
            {TEMAS_MENU.map((t) => {
              const c = coloresMenu({ tema: t, colores: p.colores });
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={p.tema === t}
                  onClick={() => onCambiar({ tema: t })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2.5 text-[12px] font-semibold ${
                    p.tema === t ? "border-primary-boton text-primary-700" : "border-borde text-texto-2 hover:bg-muted"
                  }`}
                >
                  <span className="flex gap-1">
                    <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: c.fondo }} />
                    <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: c.acento }} />
                  </span>
                  {NOMBRE_TEMA[t]}
                </button>
              );
            })}
          </div>
          {p.tema === "personalizado" && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(
                [
                  ["fondo", "Fondo"],
                  ["acento", "Acento y precios"],
                  ["texto", "Texto"],
                ] as const
              ).map(([k, etiqueta]) => (
                <label key={k} className="flex flex-col items-center gap-1 text-[12px] text-texto-2">
                  <input
                    type="color"
                    value={p.colores[k]}
                    onChange={(e) => onCambiar({ colores: { ...p.colores, [k]: e.target.value.toUpperCase() } })}
                    className="h-9 w-full cursor-pointer rounded-lg border border-borde bg-white"
                  />
                  {etiqueta}
                </label>
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Textos">
          {(
            [
              ["titulo", "Título", 60],
              ["subtitulo", "Subtítulo", 80],
              ["cinta", "Cinta inferior", 120],
            ] as const
          ).map(([k, etiqueta, largo]) => (
            <label key={k} className="mb-2.5 block last:mb-0">
              <span className="mb-1 block text-[12px] font-semibold text-texto-2">{etiqueta}</span>
              <input
                value={p[k]}
                maxLength={largo}
                placeholder={k === "cinta" ? "Ej.: Pedidos y delivery 700 00000 · Paga con QR" : undefined}
                onChange={(e) => onCambiar({ [k]: e.target.value })}
                className="w-full rounded-xl border border-borde bg-white px-3 py-2 text-sm text-texto outline-none focus:border-primary"
              />
            </label>
          ))}
        </Tarjeta>

        <Tarjeta titulo="Qué categorías se muestran">
          <div className="flex flex-wrap gap-2">
            {datos.categorias.map((c) => {
              const activa = p.categorias.length === 0 || p.categorias.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => {
                    // Sin ninguna elegida se ven todas: tocar una arranca la
                    // selección con todas menos ésa.
                    const base = p.categorias.length ? p.categorias : datos.categorias.map((x) => x.id);
                    onCambiar({ categorias: categoriasParaGuardar(toggle(base, c.id), datos) });
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    activa ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-3"
                  }`}
                >
                  {c.nombre}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-texto-3">El orden en que las elegís es el orden en la TV.</p>
        </Tarjeta>

        <Tarjeta titulo="Platos en esta pantalla">
          <PlatosDeLaPantalla pantalla={p} datos={datos} onCambiar={onCambiar} />
        </Tarjeta>

        <Tarjeta titulo="Ajustes">
          <SiNo etiqueta="Mostrar logo" activo={p.logo} onCambiar={(v) => onCambiar({ logo: v })} />
          <SiNo etiqueta="Mostrar fotos" activo={p.fotos} onCambiar={(v) => onCambiar({ fotos: v })} />
          <SiNo etiqueta="Mostrar descripciones" activo={p.descripciones} onCambiar={(v) => onCambiar({ descripciones: v })} />
          <SiNo etiqueta="Etiquetas (Más vendido…)" activo={p.etiquetas} onCambiar={(v) => onCambiar({ etiquetas: v })} />
          <AjusteAgotados p={p} onCambiar={onCambiar} />
          {((p.diseno === "fotos" && !ani.animado) || ani.animado === "mosaico") && (
            <FilaAjuste etiqueta="Columnas">
              <Segmentado
                etiqueta="Columnas"
                valor={p.columnas}
                onCambiar={(v) => onCambiar({ columnas: v })}
                opciones={[2, 3, 4, 5].map((n) => ({ valor: n, texto: String(n) }))}
              />
            </FilaAjuste>
          )}
          <FilaAjuste etiqueta="Tamaño de letra">
            <Segmentado
              etiqueta="Tamaño de letra"
              valor={p.tamano}
              onCambiar={(v) => onCambiar({ tamano: v })}
              opciones={[
                { valor: "s", texto: "A-" },
                { valor: "m", texto: "A" },
                { valor: "l", texto: "A+" },
              ]}
            />
          </FilaAjuste>
          {/* En Presentación y Carrusel no hay páginas: manda «Cada plato dura». */}
          {(!ani.animado || ani.animado === "mosaico") && (
            <FilaAjuste etiqueta="Cambiar página cada">
              <Segmentado
                etiqueta="Cambiar página cada"
                valor={p.rotarSeg}
                onCambiar={(v) => onCambiar({ rotarSeg: v })}
                opciones={[8, 12, 20, 30].map((n) => ({ valor: n, texto: `${n} s` }))}
              />
            </FilaAjuste>
          )}
          <Boton variante="ghost" icono="trash" className="mt-3 w-full text-danger-text" onClick={onEliminar}>
            Eliminar esta pantalla
          </Boton>
        </Tarjeta>
      </div>
    </div>
  );
}

type ModoAgotados = "tachados" | "ocultos" | "normales";

/**
 * Cómo salen en esta TV los platos agotados (Kevin, 9-nov): tachados en gris,
 * fuera de la TV, o normales. "Normales" es para el local que no lleva el
 * stock al día: la TV de la pollería tenía media fila de gaseosas en gris con
 * "AGOTADO" porque Inventario decía cero. Lo marcado "Agotado hoy" sale
 * agotado igual, porque eso lo dijo el dueño; si no, ese botón no haría nada
 * en esta TV.
 *
 * Son dos campos y no uno por la app Android, que conoce sólo
 * `agotadosTachados` y manda la lista entera: `agotadoPorStock` va aparte y
 * la app no lo pisa.
 */
function AjusteAgotados({ p, onCambiar }: { p: PantallaMenu; onCambiar: (parcial: Partial<PantallaMenu>) => void }) {
  const modo: ModoAgotados = p.agotadoPorStock === false ? "normales" : p.agotadosTachados ? "tachados" : "ocultos";
  const detalle =
    modo === "tachados"
      ? "Salen en gris, con «Agotado»."
      : modo === "ocultos"
        ? "No salen en la TV hasta que vuelva a haber."
        : `Salen como siempre, aunque Inventario diga que no hay stock. Lo que marques «Agotado hoy» ${p.agotadosTachados ? "sí sale tachado" : "no sale"}.`;
  const elegir = (m: ModoAgotados) => {
    if (m === modo) return;
    if (m === "tachados") onCambiar({ agotadosTachados: true, agotadoPorStock: true });
    else if (m === "ocultos") onCambiar({ agotadosTachados: false, agotadoPorStock: true });
    else onCambiar({ agotadosTachados: true, agotadoPorStock: false });
  };
  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-sm font-semibold text-texto">Agotados</span>
        <Segmentado
          etiqueta="Agotados"
          valor={modo}
          onCambiar={elegir}
          opciones={[
            { valor: "tachados", texto: "Tachados" },
            { valor: "ocultos", texto: "No salen" },
            { valor: "normales", texto: "Normales" },
          ]}
        />
      </div>
      <p className="mt-1 text-[12px] text-texto-3">{detalle}</p>
    </div>
  );
}

function FilaAjuste({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-semibold text-texto">{etiqueta}</span>
      {children}
    </div>
  );
}

/**
 * Las categorías de una TV tal como se guardan. Vacío = todas, en el orden del
 * catálogo, y entra sola una categoría nueva de Inventario; por eso todas en
 * ese mismo orden vuelven a ser "vacío". Todas pero en OTRO orden quedan con
 * los ids: hasta el 8-nov también se vaciaban, y el orden que el dueño
 * acababa de elegir se perdía.
 */
function categoriasParaGuardar(ids: number[], datos: EditorMenu): number[] {
  const todas = datos.categorias.map((c) => c.id);
  return ids.length === todas.length && ids.every((id, i) => id === todas[i]) ? [] : ids;
}

type GrupoDePlatos = { id: number; nombre: string; bebidas: boolean; platos: PlatoMenu[] };

/**
 * Los platos de una TV, agrupados por categoría y en el orden de la TV (Kevin,
 * 8-nov: "destiquear todo lo que es bebidas rápido y poner sólo los platos";
 * "que cada cosa sea editable y movible").
 *
 * Los atajos de arriba eligen las CATEGORÍAS de la TV, no apagan plato por
 * plato: así una gaseosa nueva de Inventario no aparece sola en la TV de los
 * pollos. El interruptor de cada grupo, en cambio, apaga o prende sus platos
 * (los ocultos de esta TV), para cuando la categoría mezcla cosas.
 */
function PlatosDeLaPantalla({
  pantalla: p,
  datos,
  onCambiar,
}: {
  pantalla: PantallaMenu;
  datos: EditorMenu;
  onCambiar: (parcial: Partial<PantallaMenu>) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const orden = conAnimacion(p).orden;
  const enMenu = useMemo(() => datos.platos.filter((x) => x.enMenu), [datos.platos]);
  const deBebidas = useMemo(() => categoriasDeBebidas(datos.categorias, enMenu), [datos.categorias, enMenu]);

  const todas = datos.categorias.map((c) => c.id);
  const elegidas = p.categorias.length ? p.categorias : todas;
  const conPlatos = (id: number) => enMenu.some((x) => x.categoriaId === id);
  const comida = todas.filter((id) => !deBebidas.has(id) && conPlatos(id));
  const bebidas = todas.filter((id) => deBebidas.has(id) && conPlatos(id));
  /** Las de `ids`, respetando el orden que ya tenía la TV. */
  const enOrden = (ids: number[]) => [...elegidas.filter((id) => ids.includes(id)), ...ids.filter((id) => !elegidas.includes(id))];
  const iguales = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));
  const todo = p.categorias.length === 0 || todas.every((id) => p.categorias.includes(id));
  const atajos =
    comida.length > 0 && bebidas.length > 0
      ? [
          // «Todo» vuelve a lo de fábrica (vacío): el orden del catálogo, y
          // una categoría nueva de Inventario entra sola. Volver desde «Sólo
          // bebidas» dejaba las bebidas primero.
          { texto: "Todo", activo: todo, ids: [] },
          { texto: "Sólo comida", activo: !todo && iguales(p.categorias, comida), ids: enOrden(comida) },
          { texto: "Sólo bebidas", activo: !todo && iguales(p.categorias, bebidas), ids: enOrden(bebidas) },
        ]
      : [];

  const enTv = enMenu.filter((x) => p.categorias.length === 0 || (x.categoriaId != null && p.categorias.includes(x.categoriaId)));
  const grupos: GrupoDePlatos[] = elegidas
    .filter((id) => enTv.some((x) => x.categoriaId === id))
    .map((id) => ({
      id,
      nombre: datos.categorias.find((c) => c.id === id)?.nombre ?? "Otros",
      bebidas: deBebidas.has(id),
      platos: ordenar(
        enTv.filter((x) => x.categoriaId === id),
        [],
        orden,
      ),
    }));
  const sueltos = enTv.filter((x) => x.categoriaId == null);
  if (sueltos.length) grupos.push({ id: -1, nombre: "Sin categoría", bebidas: false, platos: ordenar(sueltos, [], orden) });

  /** El orden de toda la TV con el grupo que cambió; lo de otras categorías queda como estaba. */
  const ordenarGrupo = (grupo: number, ids: number[]) => {
    const armado = grupos.flatMap((g) => (g.id === grupo ? ids : g.platos.map((x) => x.id)));
    onCambiar({ orden: [...armado, ...orden.filter((id) => !armado.includes(id))] });
  };
  const moverCategoria = (id: number, paso: -1 | 1) => {
    const visibles = grupos.filter((g) => g.id > 0).map((g) => g.id);
    const i = visibles.indexOf(id);
    const j = i + paso;
    if (i < 0 || j < 0 || j >= visibles.length) return;
    [visibles[i], visibles[j]] = [visibles[j], visibles[i]];
    onCambiar({ categorias: categoriasParaGuardar([...visibles, ...elegidas.filter((x) => !visibles.includes(x))], datos) });
  };
  const ocultarGrupo = (g: GrupoDePlatos, ocultar: boolean) => {
    const ids = g.platos.map((x) => x.id);
    onCambiar({ ocultos: ocultar ? [...new Set([...p.ocultos, ...ids])] : p.ocultos.filter((id) => !ids.includes(id)) });
  };
  const categoriasConGrupo = grupos.filter((g) => g.id > 0);

  return (
    <>
      {atajos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Qué muestra esta TV">
          {atajos.map((a) => (
            <button
              key={a.texto}
              type="button"
              aria-pressed={a.activo}
              // El que ya está prendido no hace nada: «Todo» otra vez borraba
              // el orden que el dueño había acomodado con las flechas.
              onClick={() => !a.activo && onCambiar({ categorias: categoriasParaGuardar(a.ids, datos) })}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                a.activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              {a.texto}
            </button>
          ))}
        </div>
      )}
      <p className="mb-2 text-[12px] text-texto-3">
        Apagá un plato para ocultarlo sólo en esta TV. Para cambiar el orden, arrastralo desde <span aria-hidden="true">⠿</span> o usá las
        flechas.
      </p>
      <div ref={contenedor} className="max-h-[30rem] overflow-y-auto pr-1">
        {grupos.length === 0 && <p className="py-6 text-center text-sm text-texto-3">Esta TV no tiene platos para mostrar.</p>}
        {grupos.map((g) => {
          const i = categoriasConGrupo.indexOf(g);
          return (
            <GrupoPlatos
              key={g.id}
              grupo={g}
              ocultos={p.ocultos}
              contenedor={contenedor}
              onPlato={(id) => onCambiar({ ocultos: p.ocultos.includes(id) ? p.ocultos.filter((x) => x !== id) : [...p.ocultos, id] })}
              onGrupo={(ocultar) => ocultarGrupo(g, ocultar)}
              onOrden={(ids) => ordenarGrupo(g.id, ids)}
              onMover={g.id > 0 && categoriasConGrupo.length > 1 ? (paso) => moverCategoria(g.id, paso) : undefined}
              primero={i === 0}
              ultimo={i === categoriasConGrupo.length - 1}
            />
          );
        })}
      </div>
    </>
  );
}

function GrupoPlatos({
  grupo,
  ocultos,
  contenedor,
  onPlato,
  onGrupo,
  onOrden,
  onMover,
  primero,
  ultimo,
}: {
  grupo: GrupoDePlatos;
  ocultos: number[];
  contenedor: React.RefObject<HTMLDivElement | null>;
  onPlato: (id: number) => void;
  onGrupo: (ocultar: boolean) => void;
  onOrden: (ids: number[]) => void;
  /** Sin esto, la categoría no se mueve (es la única, o son los sin categoría). */
  onMover?: (paso: -1 | 1) => void;
  primero: boolean;
  ultimo: boolean;
}) {
  const ids = grupo.platos.map((x) => x.id);
  // El mismo arrastre de la grilla del POS: con el mouse se agarra y se mueve;
  // con el dedo, se mantiene apretado. Cada grupo con el suyo: un plato no se
  // pasa de categoría arrastrándolo.
  const arrastre = useArrastreGrilla({ ids, onReordenar: onOrden, contenedor });
  const porId = new Map(grupo.platos.map((x) => [x.id, x]));
  const lista = arrastre.orden.map((id) => porId.get(id)).filter((x): x is PlatoMenu => !!x);
  const visibles = grupo.platos.filter((x) => !ocultos.includes(x.id)).length;
  const mover = (id: number, paso: -1 | 1) => {
    const i = ids.indexOf(id);
    const j = i + paso;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const nuevo = [...ids];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    onOrden(nuevo);
  };

  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-borde bg-white py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-bold uppercase tracking-[0.08em] text-texto-2">{grupo.nombre}</span>
          <span className="block text-[11px] text-texto-3">
            {visibles} de {grupo.platos.length} en la TV{grupo.bebidas ? " · bebidas" : ""}
          </span>
        </span>
        {onMover && (
          <span className="flex">
            <Flecha arriba deshabilitada={primero} etiqueta={`Subir ${grupo.nombre}`} onClick={() => onMover(-1)} />
            <Flecha deshabilitada={ultimo} etiqueta={`Bajar ${grupo.nombre}`} onClick={() => onMover(1)} />
          </span>
        )}
        <SiNoChico activo={visibles > 0} onCambiar={() => onGrupo(visibles > 0)} etiqueta={`Todos los de ${grupo.nombre}`} />
      </div>
      <ul className="divide-y divide-borde">
        {lista.map((x, i) => {
          // El arrastre arranca sólo desde la manija: en toda la fila, apretar
          // el interruptor y correr un poco el mouse levantaba el plato.
          const { onPointerDown, onContextMenu, onDragStart, ...fila } = arrastre.props(x.id);
          return (
            <li key={x.id} {...fila} className="flex items-center gap-2 bg-white py-2">
              <span
                onPointerDown={onPointerDown}
                onContextMenu={onContextMenu}
                onDragStart={onDragStart}
                title="Arrastrar para cambiar el orden"
                aria-hidden="true"
                className="cursor-grab touch-none select-none px-0.5 text-lg leading-none text-texto-4"
              >
                ⠿
              </span>
              <Miniatura plato={x} lado={36} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${ocultos.includes(x.id) ? "text-texto-3 line-through" : "text-texto"}`}>{x.nombre}</span>
                <span className="block text-[12px] text-texto-3">
                  {fmtMoney(x.precio)} · {x.foto ? "con foto" : "sin foto"}
                </span>
              </span>
              <span className="flex flex-col">
                <Flecha arriba chica deshabilitada={i === 0} etiqueta={`Subir ${x.nombre}`} onClick={() => mover(x.id, -1)} />
                <Flecha chica deshabilitada={i === lista.length - 1} etiqueta={`Bajar ${x.nombre}`} onClick={() => mover(x.id, 1)} />
              </span>
              <SiNoChico activo={!ocultos.includes(x.id)} onCambiar={() => !arrastre.ignorarClic() && onPlato(x.id)} etiqueta={x.nombre} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Flecha({
  arriba = false,
  chica = false,
  deshabilitada,
  etiqueta,
  onClick,
}: {
  arriba?: boolean;
  chica?: boolean;
  deshabilitada: boolean;
  etiqueta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={deshabilitada}
      onClick={onClick}
      className={`rounded text-texto-3 hover:bg-muted disabled:opacity-30 ${chica ? "p-0" : "p-1"}`}
    >
      <Icon name="chevronDown" size={chica ? 14 : 16} className={arriba ? "rotate-180" : undefined} />
    </button>
  );
}

/** Debajo de la TV animada: escena anterior, pausa, siguiente y desde el principio. */
function ControlesAnimacion({
  total,
  indice,
  pausado,
  onPausa,
  onIr,
}: {
  total: number;
  indice: number;
  pausado: boolean;
  onPausa: () => void;
  onIr: (i: number) => void;
}) {
  const boton = "flex h-8 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-white hover:text-texto";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Animación">
      <button type="button" className={boton} aria-label="Escena anterior" title="Escena anterior" onClick={() => onIr((indice - 1 + total) % total)}>
        <Icon name="chevronLeft" size={17} />
      </button>
      <button
        type="button"
        className={`${boton} ${pausado ? "bg-white text-primary-700 shadow-sm" : ""}`}
        aria-label={pausado ? "Seguir" : "Pausar"}
        title={pausado ? "Seguir" : "Pausar"}
        onClick={onPausa}
      >
        <Icon name={pausado ? "play" : "pausa"} size={16} />
      </button>
      <button type="button" className={boton} aria-label="Escena siguiente" title="Escena siguiente" onClick={() => onIr((indice + 1) % total)}>
        <Icon name="chevronRight" size={17} />
      </button>
      <button type="button" className={boton} aria-label="Desde el principio" title="Desde el principio" onClick={() => onIr(0)}>
        <Icon name="girar" size={15} />
      </button>
    </div>
  );
}

// ── Platos y fotos ────────────────────────────────────────────────────────

type Filtro = "todos" | "sinFoto" | "agotados" | number;

function PestanaPlatos({ datos, onPlato }: { datos: EditorMenu; onPlato: (p: PlatoMenu) => void }) {
  const navigate = useNavigate();
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [error, setError] = useState("");

  const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = normal(buscar.trim());
  const lista = datos.platos.filter(
    (p) =>
      (!q || normal(p.nombre).includes(q)) &&
      (filtro === "todos" ||
        (filtro === "sinFoto" && !p.foto) ||
        (filtro === "agotados" && p.agotado) ||
        (typeof filtro === "number" && p.categoriaId === filtro)),
  );
  const chips: { valor: Filtro; texto: string; cuantos: number }[] = [
    { valor: "todos", texto: "Todos", cuantos: datos.platos.length },
    { valor: "sinFoto", texto: "Sin foto", cuantos: datos.platos.filter((p) => !p.foto).length },
    { valor: "agotados", texto: "Agotados", cuantos: datos.platos.filter((p) => p.agotado).length },
    ...datos.categorias.map((c) => ({ valor: c.id as Filtro, texto: c.nombre, cuantos: datos.platos.filter((p) => p.categoriaId === c.id).length })),
  ];

  const editar = async (p: PlatoMenu, cambios: Parameters<typeof apiMenuDigital.editarPlato>[1]) => {
    setError("");
    try {
      onPlato(await apiMenuDigital.editarPlato(p.id, cambios));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-borde bg-white px-3 py-2.5">
          <Icon name="search" size={17} className="text-texto-3" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar plato"
            className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none"
          />
        </label>
        <Boton icono="plus" onClick={() => navigate("/inventario/productos")}>
          Nuevo plato (en Inventario)
        </Boton>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={String(c.valor)}
            type="button"
            onClick={() => setFiltro(c.valor)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
              filtro === c.valor ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {c.texto}
            <span className={`rounded-full px-1.5 text-[11px] ${filtro === c.valor ? "bg-white/20" : "bg-muted"}`}>{c.cuantos}</span>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-texto-3">
        <Icon name="lock" size={12} className="mr-1 inline" />
        El nombre y el precio vienen de Inventario y se cambian allá: la TV muestra siempre lo que cobra la caja.
      </p>
      <p className="text-[12px] text-texto-3">
        <Icon name="camara" size={12} className="mr-1 inline" />
        Una foto con fondo blanco o de un solo color (una cartulina, un mantel liso) se sube sin el fondo y en la TV sale sólo el plato. Con la mesa de fondo sale enmarcada.
      </p>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <ul className="card divide-y divide-borde">
        {lista.length === 0 && <li className="p-8 text-center text-sm text-texto-3">No hay platos con ese filtro.</li>}
        {lista.map((p) => (
          <FilaPlato key={p.id} plato={p} onEditar={(c) => void editar(p, c)} onPlato={onPlato} onError={setError} />
        ))}
      </ul>
    </div>
  );
}

function FilaPlato({
  plato: p,
  onEditar,
  onPlato,
  onError,
}: {
  plato: PlatoMenu;
  onEditar: (cambios: Parameters<typeof apiMenuDigital.editarPlato>[1]) => void;
  onPlato: (p: PlatoMenu) => void;
  onError: (e: string) => void;
}) {
  const [descripcion, setDescripcion] = useState(p.descripcion ?? "");
  const [subiendo, setSubiendo] = useState(false);
  // El último archivo elegido y qué se hizo con su fondo: con eso se puede
  // volver a subirlo con o sin fondo sin pedirle que lo elija otra vez.
  const [ultimo, setUltimo] = useState<File | null>(null);
  const [fondo, setFondo] = useState<"quitado" | "con-fondo" | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  useEffect(() => setDescripcion(p.descripcion ?? ""), [p.descripcion]);

  const subir = async (f: File | undefined, sacarFondo = true) => {
    if (!f) return;
    setSubiendo(true);
    onError("");
    try {
      const preparada = await prepararFotoPlato(f, sacarFondo);
      onPlato(await apiMenuDigital.subirFoto(p.id, preparada.blob));
      setUltimo(f);
      setFondo(preparada.fondoQuitado ? "quitado" : sacarFondo ? null : "con-fondo");
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };
  const quitar = async () => {
    try {
      onPlato(await apiMenuDigital.quitarFoto(p.id));
      setUltimo(null);
      setFondo(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo quitar la foto");
    }
  };

  // En una fila sólo con lugar (xl): los controles miden ~820 px y en una
  // tablet (o una laptop con el menú abierto) "En menú" quedaba cortado a la
  // derecha. Con menos, la foto y el nombre van arriba y los controles debajo.
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 xl:flex-nowrap">
      <button
        type="button"
        onClick={() => archivo.current?.click()}
        title={p.foto ? "Cambiar foto" : "Agregar foto"}
        className="relative shrink-0 rounded-xl"
      >
        <Miniatura plato={p} lado={64} />
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-texto text-white shadow">
          <Icon name={subiendo ? "relojArena" : "camara"} size={13} />
        </span>
      </button>
      <input
        ref={archivo}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void subir(e.target.files?.[0])}
      />
      <div className="min-w-[180px] flex-1">
        <p className="font-semibold text-texto">{p.nombre}</p>
        <input
          value={descripcion}
          maxLength={140}
          placeholder="Descripción para la TV (ej.: con papas y ensalada)"
          onChange={(e) => setDescripcion(e.target.value)}
          onBlur={() => descripcion.trim() !== (p.descripcion ?? "") && onEditar({ descripcion: descripcion.trim() || null })}
          className="mt-0.5 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-texto-2 outline-none hover:border-borde focus:border-primary focus:bg-white"
        />
        <p className="px-1 text-[12px] text-texto-3">
          {p.categoria ?? "Sin categoría"}
          {p.foto && (
            <button type="button" onClick={() => void quitar()} className="ml-2 font-semibold text-texto-3 underline-offset-2 hover:underline">
              Quitar foto
            </button>
          )}
        </p>
        {/* Lo de sacarle el fondo se dice y se puede deshacer: la varita a
            veces se come el borde blanco de un plato blanco sobre blanco, y el
            dueño tiene que poder dejar la foto como la sacó. */}
        {ultimo && fondo === "quitado" && (
          <p className="px-1 text-[12px] text-texto-2">
            Le sacamos el fondo: en la TV sale sólo el plato.
            <button
              type="button"
              disabled={subiendo}
              onClick={() => void subir(ultimo, false)}
              className="ml-2 font-semibold text-primary-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Dejarlo con su fondo
            </button>
          </p>
        )}
        {ultimo && fondo === "con-fondo" && (
          <p className="px-1 text-[12px] text-texto-2">
            Quedó con su fondo, enmarcada.
            <button
              type="button"
              disabled={subiendo}
              onClick={() => void subir(ultimo, true)}
              className="ml-2 font-semibold text-primary-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Sacarle el fondo
            </button>
          </p>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap xl:gap-3">
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[13px] font-bold text-texto-2">
          <Icon name="lock" size={12} />
          {fmtMoney(p.precio)}
        </span>
        <select
          value={p.etiqueta ?? ""}
          onChange={(e) => onEditar({ etiqueta: (e.target.value || null) as EtiquetaPlato | null })}
          aria-label="Etiqueta"
          className="shrink-0 rounded-lg border border-borde bg-white px-2 py-1.5 text-[13px] text-texto"
        >
          <option value="">Sin etiqueta</option>
          {ETIQUETAS_PLATO.map((e) => (
            <option key={e} value={e}>
              {TEXTO_ETIQUETA[e]}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={p.destacado}
          title="Plato destacado (protagonista del diseño Destacado)"
          onClick={() => onEditar({ destacado: !p.destacado })}
          className={`shrink-0 rounded-lg px-2 py-1.5 text-[13px] font-semibold ${p.destacado ? "bg-amber-100 text-amber-800" : "text-texto-3 hover:bg-muted"}`}
        >
          ★ Destacado
        </button>
        <button
          type="button"
          aria-pressed={p.agotadoHoy}
          title="Se tacha en las TVs hasta mañana"
          onClick={() => onEditar({ agotado: !p.agotadoHoy })}
          className={`shrink-0 rounded-lg px-2 py-1.5 text-[13px] font-semibold ${
            p.agotadoHoy ? "bg-danger-bg text-danger-text" : p.agotado ? "bg-muted text-texto-3" : "text-texto-3 hover:bg-muted"
          }`}
        >
          {p.agotadoHoy ? "Agotado hoy" : p.agotado ? "Sin stock" : "Marcar agotado"}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[12px] text-texto-3">En menú</span>
          <SiNoChico activo={p.enMenu} onCambiar={() => onEditar({ enMenu: !p.enMenu })} etiqueta={`${p.nombre} en el menú`} />
        </div>
      </div>
    </li>
  );
}

function Miniatura({ plato, lado }: { plato: PlatoMenu; lado: number }) {
  // Sin fondo va sobre el mismo fondito que el ícono: así se ve qué quedó del
  // plato y qué se borró, antes de mirarlo en la TV.
  return plato.foto && plato.fotoSinFondo ? (
    <span className="flex items-center justify-center rounded-xl bg-amber-50" style={{ width: lado, height: lado }}>
      <img src={urlApi(plato.foto)} alt="" className="object-contain" style={{ width: lado * 0.9, height: lado * 0.9 }} />
    </span>
  ) : plato.foto ? (
    <img src={urlApi(plato.foto)} alt="" className="rounded-xl object-cover" style={{ width: lado, height: lado }} />
  ) : (
    <span className="flex items-center justify-center rounded-xl bg-amber-50" style={{ width: lado, height: lado }}>
      <IconoProducto nombre={plato.nombre} icono={plato.icono} categoria={plato.categoria} size={Math.round(lado * 0.8)} />
    </span>
  );
}

function SiNoChico({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={onCambiar}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors"
      style={{ background: activo ? "var(--color-primary-boton)" : "#CBD5E1" }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150"
        style={{ left: activo ? 18 : 2 }}
      />
    </button>
  );
}

function EstadoGuardado({ estado }: { estado: "" | "guardando" | "guardado" | "error" }) {
  if (!estado) return null;
  return (
    <span className={`text-[12px] font-semibold ${estado === "error" ? "text-danger-text" : estado === "guardado" ? "text-primary-700" : "text-texto-3"}`}>
      {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : "No se guardó"}
    </span>
  );
}
