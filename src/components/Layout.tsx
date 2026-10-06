import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { iniciales } from "../lib/format";
import { tituloDe, useMenu } from "../lib/menu";
import { etiquetaRol } from "../lib/permisos";
import { useAuth } from "../store/AuthContext";
import AvisoLicencia from "./AvisoLicencia";
import { Icon } from "./Icon";
import MenuLateral from "./MenuLateral";

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
  const { usuario, negocio } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [colapsada, setColapsada] = useState(leerColapsada);
  const menu = useMenu();

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
      <div className={compacta ? "flex justify-center" : "flex items-center gap-3"}>
        {/* Sobre la barra teñida, el degradado de marca se perdía: un
            recuadro claro lo despega del fondo. */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-barra-texto">
          <Icon name="archive" size={21} strokeWidth={2.2} />
        </div>
        {!compacta && (
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold text-barra-texto">
              {negocio?.nombre ?? "BamarDev"}
            </h2>
            <span className="text-xs text-barra-texto-2">
              {usuario ? etiquetaRol(usuario.rol, negocio) : ""}
            </span>
          </div>
        )}
      </div>
      <div
        className={[
          "mt-4 flex items-center rounded-xl bg-white/10 py-2.5",
          compacta ? "justify-center px-0" : "gap-3 px-3",
        ].join(" ")}
        title={compacta ? (usuario?.nombre ?? usuario?.username) : undefined}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-barra-texto">
          {iniciales(usuario?.nombre ?? usuario?.username)}
        </span>
        {!compacta && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-barra-texto">
              {usuario?.nombre ?? usuario?.username}
            </p>
            <p className="truncate text-xs text-barra-texto-2">{usuario?.username}</p>
          </div>
        )}
      </div>
    </div>
  );

  // 100dvh y no 100vh: en el celular `vh` mide el viewport con la barra del
  // navegador retraída, así que con la barra visible el layout quedaba más alto
  // que la pantalla y, por el overflow-hidden, ese sobrante no se podía
  // scrollear. Ahí abajo viven "Confirmar cobro" y "Cerrar caja".
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-fondo print:h-auto print:overflow-visible print:bg-white">
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
        <MenuLateral menu={menu} compacta={colapsada} onNavegar={() => setAbierto(false)} />

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

      {/* Drawer en móvil */}
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setAbierto(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-barra shadow-2xl">
            {encabezado(false)}
            <MenuLateral menu={menu} compacta={false} onNavegar={() => setAbierto(false)} />
          </aside>
        </div>
      )}

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

        <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
