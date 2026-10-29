import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { tituloDe, useMenu } from "../lib/menu";
import { etiquetaRol } from "../lib/permisos";
import { useAuth } from "../store/AuthContext";
import AvisoLicencia from "./AvisoLicencia";
import FranjaIntentosPin from "./seguridad/FranjaIntentosPin";
import CajonMovil from "./CajonMovil";
import CambiarMiPassword from "./CambiarMiPassword";
import { useCerrarSesion } from "./CerrarSesion";
import { BarraCupo } from "./ChipCupo";
import { HojaCupoHost } from "./ComprarCreditos";
import { Icon } from "./Icon";
import { esIOS } from "../lib/pwa/entorno";
import { useInstalarDisponible, useOfrecerInstalarUnaVez } from "../lib/pwa/guia";
import { usePwa } from "../lib/pwa/pwa";
import { useMotorOffline } from "../lib/offline/motor";
import { useCreditosDesdeUrl } from "../lib/useCreditosDesdeUrl";
import { AvisoVersionNueva, HojaInstalar } from "./InstalarApp";
import MenuLateral from "./MenuLateral";

/**
 * Billar: los avisos de tiempo fijo y el tablero al día en todas las
 * pantallas, no sólo en /billar (ver pages/billar/DeFondo). Se baja aparte y
 * sólo se monta si el usuario ve el billar: los demás rubros no cargan nada.
 */
const BillarDeFondo = lazy(() => import("../pages/billar/DeFondo"));

/**
 * Preferencia de barra colapsada. Es del dispositivo y no del usuario: en la
 * tablet del mostrador conviene tenerla colapsada aunque el mismo dueño la use
 * ancha en su laptop, así que no viaja al backend.
 */
const COLAPSADA_KEY = "bamardev.sidebar.colapsada";

/**
 * Sin almacenamiento (modo privado, cuota llena) la barra arranca ancha y el
 * botón sigue andando: sólo se pierde el recuerdo entre recargas.
 */
function leerColapsada(): boolean {
  try {
    return localStorage.getItem(COLAPSADA_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Layout() {
  const { usuario, negocio, puede } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [colapsada, setColapsada] = useState(leerColapsada);
  // Acá y no en el menú: en el celular, abrir el formulario cierra el cajón,
  // y con él se desmontaría el menú y el formulario adentro.
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const cambiarPassword = () => {
    setAbierto(false);
    setCambiandoPassword(true);
  };
  // "Cerrar sesión" con la caja abierta (restaurante): el aviso vive acá por lo
  // mismo que la contraseña, y cierra el cajón antes de salir. Dentro del
  // cajón quedaba encerrado en sus 288 px (el cajón se mueve con `transform`).
  const sesion = useCerrarSesion({ antesDeAvisar: () => setAbierto(false) });
  const menu = useMenu();
  const vende = puede("pos") || puede("billar");
  // La cola de ventas cobradas sin internet sube desde acá, con cualquier
  // pantalla abierta (sólo en la app instalada del iPhone, PLAN-IOS F3).
  useMotorOffline();
  // `?creditos=comprar` (la push del cupo) abre la hoja de comprar créditos.
  // Acá y no en una pantalla: llega a cualquiera, y la hoja vive en el Layout.
  useCreditosDesdeUrl();
  // "Instalar en el celular" (PLAN-IOS): desde el menú, y una vez sola al
  // entrar desde un celular o tablet que todavía no la tiene instalada.
  const instalarDisponible = useInstalarDisponible();
  const [instalando, setInstalando] = useState(false);
  const [ofrecida, cerrarOfrecida] = useOfrecerInstalarUnaVez();
  // Deslizar desde el borde izquierdo abre el menú, salvo en Safari sin
  // instalar: ahí ese gesto es "volver" del navegador.
  const { instalada } = usePwa();
  const bordeLibre = instalada || !esIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const abrirInstalar = () => {
    setAbierto(false);
    setInstalando(true);
  };

  useEffect(() => {
    try {
      localStorage.setItem(COLAPSADA_KEY, colapsada ? "1" : "0");
    } catch {
      // Ver `leerColapsada`.
    }
  }, [colapsada]);

  // Escape cierra el cajón del celular, como cualquier panel que se abre
  // encima: con teclado (o un lector de pantalla) no hay fondo que tocar.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const encabezado = (compacta: boolean) => (
    <div
      className={[
        "border-b border-white/15 pb-4 pt-5",
        compacta ? "px-2" : "px-4",
      ].join(" ")}
    >
      {/* Un solo bloque (el dueño, 26-oct): el negocio y, debajo y discretos,
          quién está y con qué rol. Antes había además una tarjeta con las
          iniciales, el nombre y el usuario: dos cajas para decir lo mismo. */}
      <div
        className={compacta ? "flex justify-center" : "flex items-start gap-3"}
        title={compacta ? `${negocio?.nombre ?? "BamarDev"} · ${usuario?.nombre ?? usuario?.username ?? ""}` : undefined}
      >
        {/* Sobre la barra teñida, el degradado de marca se perdía: un
            recuadro claro lo despega del fondo. */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-barra-texto">
          <Icon name="archive" size={21} strokeWidth={2.2} />
        </div>
        {!compacta && (
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight text-barra-texto">
              {negocio?.nombre ?? "BamarDev"}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-barra-texto-2">{usuario?.nombre ?? usuario?.username}</p>
            <p className="truncate text-[11px] text-barra-texto-2 opacity-80">
              {/* La del login manda: es el nombre del rol en este negocio
                  ("Recepción", "Barbero"); sin ella, la de siempre. */}
              {usuario ? usuario.rolNombre?.trim() || etiquetaRol(usuario.rol, negocio) : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // 100dvh y no 100vh: en el celular `vh` mide el viewport con la barra del
  // navegador retraída, así que con la barra visible el layout quedaba más alto
  // que la pantalla y, por el overflow-hidden, ese sobrante no se podía
  // scrollear. Ahí abajo viven "Confirmar cobro" y "Cerrar caja".
  //
  // Los `safe-area` son para la app instalada en el iPhone (viewport-fit=cover,
  // ver lib/pwa): sin ellos esos botones quedan debajo de la barrita de inicio.
  // En el navegador y en los equipos sin notch valen 0.
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-fondo pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:h-auto print:overflow-visible print:bg-white print:p-0">
      {/* Barra lateral fija en escritorio. Colapsada deja sólo los íconos:
          en la tablet del mostrador esos 256 px son casi un cuarto del ancho,
          y la grilla de productos del POS los aprovecha. */}
      <aside
        className={[
          "relative hidden shrink-0 flex-col bg-barra transition-[width] duration-200 lg:flex print:hidden",
          colapsada ? "w-[68px]" : "w-64",
        ].join(" ")}
      >
        {encabezado(colapsada)}
        <MenuLateral
          menu={menu}
          compacta={colapsada}
          onNavegar={() => setAbierto(false)}
          onCambiarPassword={cambiarPassword}
          onInstalar={instalarDisponible ? abrirInstalar : undefined}
          onCerrarSesion={sesion.pedir}
          cerrandoSesion={sesion.revisando}
        />

        {/* Montado sobre el borde derecho para no restarle alto a la
            navegación, que con Inventario abierto ya llega larga. */}
        <button
          onClick={() => setColapsada((v) => !v)}
          aria-label={colapsada ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!colapsada}
          title={colapsada ? "Expandir menú" : "Colapsar menú"}
          className="absolute -right-3 top-7 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-barra-activo text-barra-texto shadow-sm transition-colors hover:bg-barra"
        >
          <Icon name={colapsada ? "chevronRight" : "chevronLeft"} size={15} />
        </button>
      </aside>

      {/* Drawer en móvil: sigue al dedo (ver CajonMovil). */}
      <CajonMovil
        abierto={abierto}
        onAbrir={() => setAbierto(true)}
        onCerrar={() => setAbierto(false)}
        desdeElBorde={bordeLibre}
      >
        {encabezado(false)}
        <MenuLateral
          menu={menu}
          compacta={false}
          onNavegar={() => setAbierto(false)}
          onCambiarPassword={cambiarPassword}
          onInstalar={instalarDisponible ? abrirInstalar : undefined}
          onCerrarSesion={sesion.pedir}
          cerrandoSesion={sesion.revisando}
        />
      </CajonMovil>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: sólo hace falta el botón de menú en móvil */}
        <header className="flex items-center gap-3 border-b border-borde bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setAbierto(true)}
            aria-label="Abrir menú"
            className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
          >
            <Icon name="menu" size={22} />
          </button>
          <span className="text-[15px] font-bold text-texto">
            {tituloDe(menu.planos, menu.pathname)}
          </span>
        </header>

        {/* Fuera del <main> con scroll: el aviso de vencimiento tiene que
            quedar a la vista aunque la pantalla esté scrolleada. */}
        <AvisoLicencia />
        {/* Los PIN mal escritos, para quien administra los PIN (18-oct). La
            TV del salón va fuera del Layout: ahí no sale. */}
        <FranjaIntentosPin />
        {/* Plan Emprendedor: el chip de ventas y los avisos del cupo, en
            todas las pantallas. Sin cupo (Básico, Profesional) no dibuja
            nada. Quien atiende el billar también vende: abrir una mesa y la
            venta rápida consumen del mismo cupo. */}
        <BarraCupo
          chip={vende ? "VENTA" : undefined}
          avisos={[
            ...(vende ? (["VENTA"] as const) : []),
            ...(puede("hoy") || puede("agenda") ? (["CITA"] as const) : []),
          ]}
        />

        {/* `relative` para que lo `absolute` sin otro ancla (los `sr-only` de
            Primeros pasos, Inscripción en línea, Cobranza…) se acomode dentro
            de este scroll. Sin él se ubicaba contra la ventana, en su lugar del
            contenido —1.676 px en Ajustes de academia, con 945 de ventana—, y
            el documento crecía hasta ahí: al llegar al final con la rueda se
            corría la app entera hacia arriba y abajo quedaba un hueco vacío.
            Al imprimir vuelve a `static`: el ticket del POS (`#area-impresion`,
            absolute arriba a la izquierda) tiene que anclarse al papel y no a
            este `<main>`, que en el ancho del rollo queda debajo de la cabecera
            móvil y de los avisos, y lo bajaba unos 16 mm. */}
        <main className="relative min-h-0 flex-1 overflow-y-auto print:static print:overflow-visible">
          <Outlet />
        </main>
      </div>

      {cambiandoPassword && <CambiarMiPassword onClose={() => setCambiandoPassword(false)} />}
      {sesion.dialogo}
      {(instalando || ofrecida) && (
        <HojaInstalar
          onClose={() => {
            setInstalando(false);
            cerrarOfrecida();
          }}
        />
      )}
      <AvisoVersionNueva />
      {/* La hoja de comprar créditos: la piden el chip, el POS y la agenda. */}
      <HojaCupoHost />
      {puede("billar") && (
        <Suspense fallback={null}>
          <BillarDeFondo />
        </Suspense>
      )}
    </div>
  );
}
