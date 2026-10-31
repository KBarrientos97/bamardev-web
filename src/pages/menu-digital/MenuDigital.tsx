import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Boton, Confirmar, ErrorMsg } from "../../components/ui";
import { apiMenuDigital, urlApi } from "../../lib/apiMenuDigital";
import { apiTickets } from "../../lib/apiTickets";
import { fmtMoney } from "../../lib/format";
import { paginar, platosDeLaPantalla } from "../../lib/menuDigital/paginar";
import { prepararImagen } from "../../lib/pagina/imagen";
import { useAuth } from "../../store/AuthContext";
import {
  DISENOS_MENU,
  ETIQUETAS_PLATO,
  TEMAS_MENU,
  TEXTO_ETIQUETA,
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

  const cargar = useCallback(() => {
    setError("");
    apiMenuDigital
      .editor()
      .then(setDatos)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el menú"));
    apiTickets
      .llave()
      .then((r) => setLlave(r.llave))
      .catch(() => undefined);
  }, []);
  useEffect(cargar, [cargar]);

  const cambiarPlato = useCallback((p: PlatoMenu) => {
    setDatos((d) => (d ? { ...d, platos: d.platos.map((x) => (x.id === p.id ? p : x)) } : d));
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
          <PestanasTickets<Pestana>
            opciones={[
              { valor: "pantallas", texto: "Pantallas", icono: "pantalla" },
              { valor: "platos", texto: "Platos y fotos", icono: "camara" },
            ]}
            valor={pestana}
            onCambiar={setPestana}
          />
        </header>
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
  onPantallas,
}: {
  datos: EditorMenu;
  llave: string | null;
  onLlave: (l: string) => void;
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
            <p className="truncate px-1 text-[12px] text-texto-3">
              {NOMBRE_DISENO[p.diseno].texto} · {NOMBRE_TEMA[p.tema]}
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

/** La miniatura de una TV: su primera página. */
function VistaPantalla({ pantalla, datos }: { pantalla: PantallaMenu; datos: EditorMenu }) {
  const vis = platosDeLaPantalla(pantalla, datos.platos, datos.categorias);
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
  guardado,
  onCambiar,
  onEliminar,
}: {
  pantalla: PantallaMenu;
  datos: EditorMenu;
  llave: string | null;
  onLlave: (l: string) => void;
  guardado: "" | "guardando" | "guardado" | "error";
  onCambiar: (parcial: Partial<PantallaMenu>) => void;
  onEliminar: () => void;
}) {
  const { negocio } = useAuth();
  const vis = useMemo(() => platosDeLaPantalla(p, datos.platos, datos.categorias), [p, datos]);
  const paginas = useMemo(() => paginar(p, vis.platos, vis.categorias), [p, vis]);
  const [pagina, setPagina] = useState<number | "auto">("auto");
  const [auto, setAuto] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (pagina !== "auto" || paginas.length < 2) return;
    const id = setInterval(() => setAuto((a) => (a + 1) % paginas.length), p.rotarSeg * 1000);
    return () => clearInterval(id);
  }, [pagina, paginas.length, p.rotarSeg]);

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
  const enlace = (l: string) => `${window.location.origin}/tv/menu/${l}/${p.numero}`;
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
      <div className="min-w-0">
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
            <TableroMenu
              datos={{ negocio: negocio?.nombre ?? "", pantalla: p, url: urlApi, logo: datos.logo }}
              pagina={paginas[indice]}
              paginaActual={indice}
              totalPaginas={paginas.length}
            />
          </LienzoTv>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-texto-3">
              {vis.platos.length} {vis.platos.length === 1 ? "plato" : "platos"} · {paginas.length}{" "}
              {paginas.length === 1 ? "página" : "páginas"}
              {!datos.logo && " · sin logo (se carga en Configuración del recibo)"}
            </p>
            {paginas.length > 1 && (
              <Segmentado<number | "auto">
                etiqueta="Página"
                valor={pagina}
                onCambiar={setPagina}
                opciones={[{ valor: "auto", texto: "Auto" }, ...paginas.map((_, i) => ({ valor: i, texto: String(i + 1) }))]}
              />
            )}
          </div>
          <p className="mt-2 text-[12px] text-texto-3">
            En el televisor: abrí el enlace y hacé doble clic para verlo en pantalla completa. Si no entra todo, pasa de
            página solo.
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
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DISENOS_MENU.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={p.diseno === d}
                onClick={() => onCambiar({ diseno: d })}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2.5 text-[12px] font-semibold ${
                  p.diseno === d ? "border-primary-boton text-primary-700" : "border-borde text-texto-2 hover:bg-muted"
                }`}
              >
                <Icon name={NOMBRE_DISENO[d].icono} size={22} />
                {NOMBRE_DISENO[d].texto}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-texto-3">{NOMBRE_DISENO[p.diseno].ayuda}</p>
        </Tarjeta>

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
                    const nuevas = toggle(base, c.id);
                    onCambiar({ categorias: nuevas.length === datos.categorias.length ? [] : nuevas });
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
          <p className="mb-2 text-[12px] text-texto-3">Apagá un plato para ocultarlo sólo en esta TV.</p>
          <ul className="max-h-72 divide-y divide-borde overflow-y-auto pr-1">
            {datos.platos
              .filter((x) => x.enMenu && (p.categorias.length === 0 || (x.categoriaId != null && p.categorias.includes(x.categoriaId))))
              .map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2">
                  <Miniatura plato={x} lado={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">{x.nombre}</span>
                    <span className="block text-[12px] text-texto-3">
                      {fmtMoney(x.precio)} · {x.foto ? "con foto" : "sin foto"}
                    </span>
                  </span>
                  <SiNoChico activo={!p.ocultos.includes(x.id)} onCambiar={() => onCambiar({ ocultos: toggle(p.ocultos, x.id) })} etiqueta={x.nombre} />
                </li>
              ))}
          </ul>
        </Tarjeta>

        <Tarjeta titulo="Ajustes">
          <SiNo etiqueta="Mostrar logo" activo={p.logo} onCambiar={(v) => onCambiar({ logo: v })} />
          <SiNo etiqueta="Mostrar fotos" activo={p.fotos} onCambiar={(v) => onCambiar({ fotos: v })} />
          <SiNo etiqueta="Mostrar descripciones" activo={p.descripciones} onCambiar={(v) => onCambiar({ descripciones: v })} />
          <SiNo etiqueta="Etiquetas (Más vendido…)" activo={p.etiquetas} onCambiar={(v) => onCambiar({ etiquetas: v })} />
          <SiNo
            etiqueta="Agotados tachados"
            detalle="Apagado, el agotado no sale"
            activo={p.agotadosTachados}
            onCambiar={(v) => onCambiar({ agotadosTachados: v })}
          />
          {p.diseno === "fotos" && (
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
          <FilaAjuste etiqueta="Cambiar página cada">
            <Segmentado
              etiqueta="Cambiar página cada"
              valor={p.rotarSeg}
              onCambiar={(v) => onCambiar({ rotarSeg: v })}
              opciones={[8, 12, 20, 30].map((n) => ({ valor: n, texto: `${n} s` }))}
            />
          </FilaAjuste>
          <Boton variante="ghost" icono="trash" className="mt-3 w-full text-danger-text" onClick={onEliminar}>
            Eliminar esta pantalla
          </Boton>
        </Tarjeta>
      </div>
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
  const archivo = useRef<HTMLInputElement>(null);
  useEffect(() => setDescripcion(p.descripcion ?? ""), [p.descripcion]);

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    onError("");
    try {
      onPlato(await apiMenuDigital.subirFoto(p.id, await prepararImagen(f, "plato")));
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
  return plato.foto ? (
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
