import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  aplanar,
  contieneRuta,
  esActivo,
  TITULO_BLOQUE,
  type Menu,
  type NodoMenu,
} from "../lib/menu";
import { useContadorSolicitudes } from "../lib/agenda/contadorSolicitudes";
import { useAuth } from "../store/AuthContext";
import { Icon } from "./Icon";

/**
 * La navegación de la barra lateral: bloques con rótulo, grupos que se
 * despliegan y, en escritorio, la versión de sólo íconos.
 *
 * Cómo se maneja un grupo (Inventario, Movimientos):
 *   • El NOMBRE lleva a su pantalla y además lo despliega. Nunca lo cierra:
 *     quien entra a Inventario quiere ver qué hay adentro, y que el mismo clic
 *     a veces abra y a veces cierre obliga a mirar antes de tocar.
 *   • La FLECHA de la derecha es la que abre y cierra, sin navegar.
 *   • Con teclado: Enter sobre el nombre navega; Enter o Espacio sobre la
 *     flecha despliega; las flechas ↑ ↓ recorren el menú, → abre (o entra al
 *     primer hijo) y ← cierra (o vuelve al padre).
 *
 * Pueden quedar varios grupos abiertos a la vez (no es acordeón): en farmacia
 * se trabaja mucho entre Movimientos y Medicamentos, y que abrir uno cierre el
 * otro sólo agrega clics.
 *
 * En la barra de sólo íconos no hay grupos que desplegar: se ven todos los
 * íconos, como antes. Esconder pantallas detrás de una flecha que en 68 px no
 * entra dejaría lugares a los que no se puede llegar sin ensanchar la barra.
 */
export default function MenuLateral({
  menu,
  compacta,
  onNavegar,
  onCambiarPassword,
}: {
  menu: Menu;
  compacta: boolean;
  /** Cierra el cajón del celular al elegir una pantalla. */
  onNavegar: () => void;
  /** "Cambiar mi contraseña": el formulario vive en el Layout (ver ahí). */
  onCambiarPassword?: () => void;
}) {
  const { logout } = useAuth();
  const uid = useId();
  const navRef = useRef<HTMLElement>(null);
  const { bloques, pathname } = menu;
  // Con un solo bloque (el repartidor, que ve "Mis entregas" y nada más) el
  // rótulo no separa nada de nada.
  const conTitulos = bloques.length > 1;
  // Solicitudes online por atender (A9): el número va al lado del ítem.
  const solicitudes = useContadorSolicitudes(menu.planos.some((n) => n.item.seccion === "solicitudes"));
  const contadorDe = (n: NodoMenu) => (n.item.seccion === "solicitudes" ? solicitudes : 0);
  // Las solicitudes viven dentro del grupo Agenda: cerrado, el grupo muestra
  // las pendientes en vez de cuántas pantallas guarda, o nadie las vería.
  const pendientesEn = (n: NodoMenu): number =>
    contadorDe(n) + n.hijos.reduce((t, h) => t + pendientesEn(h), 0);

  // Tooltip propio para la barra de íconos: el `title` del navegador tarda un
  // segundo en salir y no aparece con el teclado. Va con posición fija porque
  // la navegación scrollea y recortaría cualquier cosa que se asome por el
  // costado.
  const [tip, setTip] = useState<{ texto: string; top: number; left: number } | null>(null);
  const mostrarTip = (texto: string) =>
    compacta
      ? {
          onMouseEnter: (e: MouseEvent<HTMLElement>) => ubicarTip(texto, e.currentTarget),
          onFocus: (e: FocusEvent<HTMLElement>) => ubicarTip(texto, e.currentTarget),
          onMouseLeave: () => setTip(null),
          onBlur: () => setTip(null),
        }
      : {};
  const ubicarTip = (texto: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ texto, top: r.top + r.height / 2, left: r.right + 10 });
  };

  // Al abrir el cajón del celular (o cargar una pantalla honda), la pantalla
  // actual puede quedar debajo del pliegue con Inventario desplegado: se la
  // trae a la vista para que el menú diga "estás acá" sin tener que buscarlo.
  // Sólo al montar: después, el scroll es del usuario.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const navegar = (n: NodoMenu) => {
    // Al ir a un grupo, se despliega. En la barra de íconos también: así, al
    // ensancharla, el grupo en el que se está ya aparece abierto.
    if (n.hijos.length) menu.abrir(n.id);
    setTip(null);
    onNavegar();
  };

  /** Las filas recorribles con ↑ ↓, sin las de un grupo cerrado. */
  const filas = () =>
    Array.from(navRef.current?.querySelectorAll<HTMLElement>("[data-fila]") ?? []).filter(
      (f) => !f.closest("[inert]"),
    );

  const teclas = (e: KeyboardEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    const id = el.dataset.navId;
    if (!id) return;
    const lista = filas();
    const i = lista.findIndex((f) => f.dataset.navId === id);
    const enfocar = (f: HTMLElement | undefined) => {
      if (!f) return;
      e.preventDefault();
      f.focus();
    };

    switch (e.key) {
      case "ArrowDown":
        return enfocar(lista[i + 1]);
      case "ArrowUp":
        return enfocar(lista[i - 1]);
      case "Home":
        return enfocar(lista[0]);
      case "End":
        return enfocar(lista[lista.length - 1]);
    }
    if (compacta) return;

    const esGrupo = el.dataset.grupo === "1";
    if (e.key === "ArrowRight" && esGrupo) {
      e.preventDefault();
      if (!menu.estaAbierto(id)) menu.abrir(id);
      else enfocar(lista[i + 1]);
    } else if (e.key === "ArrowLeft") {
      if (esGrupo && menu.estaAbierto(id)) {
        e.preventDefault();
        menu.cerrar(id);
      } else if (el.dataset.padre) {
        enfocar(lista.find((f) => f.dataset.navId === el.dataset.padre));
      }
    }
  };

  // El anillo va por dentro (`ring-inset`): la navegación corta lo que se sale
  // de costado, y un foco a medio dibujar es casi lo mismo que no tenerlo.
  const foco =
    "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-barra-texto";

  /** Color del texto: el activo y el grupo que lo contiene van en blanco. */
  const tono = (encendido: boolean) =>
    encendido ? "text-barra-texto" : "text-barra-texto-2 hover:text-barra-texto";

  const icono = (n: NodoMenu, chico: boolean) => <Icon name={n.item.icono} size={chico ? 17 : 19} />;

  /** En la barra de íconos no se ve el grupo: va el nombre completo. */
  const nombre = (n: NodoMenu) => n.item.titulo ?? n.item.label;

  /** Barra de íconos: todo el árbol en una columna. */
  const nodoCompacto = (n: NodoMenu, padre: NodoMenu | null) => {
    const activo = !n.esTitulo && esActivo(n.item, pathname);
    const dentro = !activo && n.hijos.length > 0 && contieneRuta(n, pathname);
    return (
      <li key={n.id}>
        <Link
          to={n.item.a}
          onClick={() => navegar(n)}
          // En la barra de íconos el número es sólo un punto: el lector de
          // pantalla igual tiene que oír cuántas hay (QA PER-09).
          aria-label={contadorDe(n) > 0 ? `${nombre(n)}, ${contadorDe(n)} por atender` : nombre(n)}
          aria-current={activo ? "page" : undefined}
          data-fila=""
          data-nav-id={n.id}
          {...mostrarTip(nombre(n))}
          className={[
            "flex items-center justify-center rounded-xl py-2.5 transition-colors",
            foco,
            activo ? "bg-barra-activo text-barra-texto" : `hover:bg-barra-activo ${tono(dentro)}`,
          ].join(" ")}
        >
          <span className="relative">
            {icono(n, !!padre)}
            {contadorDe(n) > 0 && (
              <span aria-hidden className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-white ring-2 ring-barra" />
            )}
          </span>
        </Link>
      </li>
    );
  };

  const nodo = (n: NodoMenu, padre: NodoMenu | null) => {
    const activo = !n.esTitulo && esActivo(n.item, pathname);
    const esHijo = padre !== null;

    if (n.hijos.length === 0) {
      return (
        <li key={n.id}>
          <Link
            to={n.item.a}
            onClick={() => navegar(n)}
            aria-current={activo ? "page" : undefined}
            data-fila=""
            data-nav-id={n.id}
            data-padre={padre?.id}
            className={[
              "relative flex items-center rounded-xl font-semibold transition-colors",
              foco,
              esHijo ? "gap-2.5 px-2 py-2 text-[13px]" : "gap-3 px-3 py-2.5 text-sm",
              // Dentro de un grupo, el activo además enciende su tramo de la
              // guía vertical: se ve de un vistazo en qué rama se está.
              esHijo && activo
                ? "before:absolute before:-left-[6px] before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-barra-texto"
                : "",
              // Sobre la barra de color: el activo se marca con un bloque más
              // claro y blanco pleno; el resto va en el gris teñido, que
              // mantiene 4.5:1 contra el fondo.
              activo ? "bg-barra-activo text-barra-texto" : `hover:bg-barra-activo ${tono(false)}`,
            ].join(" ")}
          >
            {icono(n, esHijo)}
            {/* Sin `truncate`: un nombre que no entra baja de renglón. Cortado
                en "Ingreso de merca…" ya no se sabe qué pantalla es. */}
            <span className="min-w-0 leading-snug">{n.item.label}</span>
            {contadorDe(n) > 0 && (
              <span
                className="ml-auto rounded-full bg-barra-texto px-1.5 text-[11px] font-bold leading-[18px] text-barra tabular-nums"
                aria-label={`${contadorDe(n)} por atender`}
              >
                {contadorDe(n)}
              </span>
            )}
          </Link>
        </li>
      );
    }

    const abierto = menu.estaAbierto(n.id);
    const dentro = !activo && contieneRuta(n, pathname);
    const panel = `${uid}-grupo-${n.id}`;
    return (
      <li key={n.id}>
        <div
          className={[
            "group/fila flex items-center rounded-xl transition-colors",
            activo ? "bg-barra-activo" : "hover:bg-barra-activo",
          ].join(" ")}
        >
          <Link
            to={n.item.a}
            onClick={() => navegar(n)}
            aria-current={activo ? "page" : undefined}
            data-fila=""
            data-nav-id={n.id}
            data-grupo="1"
            data-padre={padre?.id}
            className={[
              "flex min-w-0 flex-1 items-center rounded-xl font-semibold transition-colors",
              foco,
              esHijo ? "gap-2.5 py-2 pl-2 text-[13px]" : "gap-3 py-2.5 pl-3 text-sm",
              activo || dentro ? "text-barra-texto" : "text-barra-texto-2 group-hover/fila:text-barra-texto",
            ].join(" ")}
          >
            {icono(n, esHijo)}
            <span className="min-w-0 leading-snug">{n.item.label}</span>
            {/* Cerrado, el grupo dice cuántas pantallas guarda. Lo que hay
                por atender va en la píldora blanca; el número de pantallas,
                en cambio, es un dato tenue y sin fondo: con el mismo estilo,
                un "Agenda 6" se leía como seis solicitudes (QA PER-09). Si
                la pantalla abierta es una de ellas, el número se aclara: es
                el "estás acá adentro" cuando el hijo no se ve. */}
            {!abierto && pendientesEn(n) > 0 && (
              <span
                className="ml-auto rounded-full bg-barra-texto px-1.5 text-[11px] font-bold leading-[18px] text-barra tabular-nums"
                aria-label={`${pendientesEn(n)} por atender`}
              >
                {pendientesEn(n)}
              </span>
            )}
            {!abierto && pendientesEn(n) === 0 && (
              <span
                aria-hidden="true"
                title={`${n.hijos.length} pantallas`}
                className={[
                  "ml-auto px-1 text-[10px] font-medium leading-[18px] tabular-nums",
                  dentro ? "text-barra-texto" : "text-barra-texto-2 opacity-70",
                ].join(" ")}
              >
                {n.hijos.length}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => menu.alternar(n.id)}
            aria-expanded={abierto}
            aria-controls={panel}
            aria-label={`Submenú de ${n.item.label}`}
            data-nav-id={n.id}
            data-grupo="1"
            data-padre={padre?.id}
            className={[
              "mx-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/15",
              foco,
              activo || dentro ? "text-barra-texto" : "text-barra-texto-2 group-hover/fila:text-barra-texto",
            ].join(" ")}
          >
            <Icon
              name="chevronRight"
              size={16}
              className={[
                "transition-transform duration-200 motion-reduce:transition-none",
                abierto ? "rotate-90" : "",
              ].join(" ")}
            />
          </button>
        </div>
        {/* El alto se anima con la fila de la grilla (0fr ↔ 1fr): no hace
            falta medir el contenido, y sirve igual cuando el plan agrega o
            saca un hijo con el grupo abierto. Cerrado queda `inert`: sus
            enlaces no se alcanzan con Tab ni los lee el lector de pantalla. */}
        <div
          id={panel}
          inert={!abierto}
          aria-hidden={abierto ? undefined : true}
          className={[
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="min-h-0 overflow-hidden">
            <ul
              className={[
                "my-0.5 flex flex-col gap-0.5 border-l border-white/15 pl-1",
                // La guía nace debajo del ícono del padre. La sangría es la
                // justa: dos niveles adentro, "Ingreso de mercadería" tiene
                // que seguir entrando entero en los 256 px de la barra.
                esHijo ? "ml-[16px]" : "ml-[21px]",
              ].join(" ")}
            >
              {n.hijos.map((h) => nodo(h, n))}
            </ul>
          </div>
        </div>
      </li>
    );
  };

  /** En la barra de íconos, el árbol se aplana pero cada hijo sabe su padre. */
  const compactos = (nodos: NodoMenu[]) => {
    const padres = new Map<NodoMenu, NodoMenu>();
    for (const p of aplanar(nodos)) for (const h of p.hijos) padres.set(h, p);
    // Un grupo sin pantalla propia (Agenda, Equipo) lleva a la de su primer
    // hijo: en la columna de íconos sería el mismo destino dos veces.
    return aplanar(nodos)
      .filter((n) => n.item.seccion)
      .map((n) => nodoCompacto(n, padres.get(n) ?? null));
  };

  return (
    <nav
      ref={navRef}
      aria-label="Menú principal"
      onKeyDown={teclas}
      onScroll={() => setTip(null)}
      className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden p-3"
    >
      {bloques.map((b, i) => {
        const rotulo = `${uid}-bloque-${b.bloque}`;
        return (
          <div
            key={b.bloque}
            className={
              i === 0 ? "" : compacta ? "mt-2 border-t border-white/15 pt-2" : "mt-4"
            }
          >
            {conTitulos && !compacta && (
              <p
                id={rotulo}
                className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-barra-texto-2"
              >
                {TITULO_BLOQUE[b.bloque]}
              </p>
            )}
            <ul
              aria-labelledby={conTitulos && !compacta ? rotulo : undefined}
              className="flex flex-col gap-0.5"
            >
              {compacta ? compactos(b.nodos) : b.nodos.map((n) => nodo(n, null))}
            </ul>
          </div>
        );
      })}

      <div className="my-2 border-t border-white/15" />

      {/* Lo de la cuenta de quien está sentado, para cualquier rol: cambiar
          la propia clave no depende de administrar usuarios (API-12). */}
      {onCambiarPassword && (
        <button
          type="button"
          onClick={() => {
            setTip(null);
            onCambiarPassword();
          }}
          aria-label={compacta ? "Cambiar mi contraseña" : undefined}
          data-fila=""
          data-nav-id="mi-password"
          {...mostrarTip("Cambiar mi contraseña")}
          className={[
            "flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold text-barra-texto-2 transition-colors hover:bg-white/10 hover:text-barra-texto",
            foco,
            compacta ? "justify-center px-0" : "px-3",
          ].join(" ")}
        >
          <Icon name="lock" size={19} />
          {!compacta && <span>Cambiar mi contraseña</span>}
        </button>
      )}

      <button
        type="button"
        onClick={logout}
        aria-label={compacta ? "Cerrar sesión" : undefined}
        data-fila=""
        data-nav-id="salir"
        {...mostrarTip("Cerrar sesión")}
        className={[
          "flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold text-barra-texto-2 transition-colors hover:bg-danger hover:text-white",
          foco,
          compacta ? "justify-center px-0" : "px-3",
        ].join(" ")}
      >
        <Icon name="logout" size={19} />
        {!compacta && <span>Cerrar sesión</span>}
      </button>

      {compacta && tip && (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-texto px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          {tip.texto}
        </div>
      )}
    </nav>
  );
}
