import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { iniciales } from "../lib/format";
import { etiquetaRol, type Seccion } from "../lib/permisos";
import { useAuth } from "../store/AuthContext";
import { Icon, type NombreIcono } from "./Icon";

interface ItemNav {
  a: string;
  label: string;
  icono: NombreIcono;
  seccion: Seccion;
  /** Se dibuja indentado bajo Inventario. */
  sub?: boolean;
}

const ITEMS: ItemNav[] = [
  { a: "/pos", label: "Punto de venta", icono: "cart", seccion: "pos" },
  { a: "/reparto", label: "Mis entregas", icono: "truck", seccion: "reparto" },
  { a: "/inventario", label: "Inventario", icono: "archive", seccion: "inventario" },
  { a: "/inventario/productos", label: "Artículos", icono: "box", seccion: "productos", sub: true },
  { a: "/inventario/categorias", label: "Categorías", icono: "grid", seccion: "productos", sub: true },
  { a: "/inventario/insumos", label: "Insumos", icono: "sack", seccion: "insumos", sub: true },
  { a: "/inventario/almacenes", label: "Almacenes", icono: "warehouse", seccion: "almacenes", sub: true },
  { a: "/inventario/movimientos", label: "Movimientos", icono: "swap", seccion: "movimientos", sub: true },
  { a: "/creditos", label: "Cuentas por cobrar", icono: "dollar", seccion: "creditos" },
  { a: "/reportes", label: "Reportes", icono: "chart", seccion: "reportes" },
  { a: "/usuarios", label: "Usuarios", icono: "users", seccion: "usuarios" },
];

/**
 * Título de la barra móvil. Se queda con la ruta MÁS LARGA que coincide:
 * "/inventario/productos" empieza con "/inventario", y quedarse con la
 * primera mostraría "Inventario" estando en Artículos.
 */
function tituloDe(items: ItemNav[], pathname: string): string {
  let mejor: ItemNav | null = null;
  for (const i of items) {
    if (pathname === i.a || pathname.startsWith(`${i.a}/`)) {
      if (!mejor || i.a.length > mejor.a.length) mejor = i;
    }
  }
  return mejor?.label ?? "BamarDev";
}

export default function Layout() {
  const { usuario, negocio, logout, puede } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const location = useLocation();

  const visibles = ITEMS.filter((i) => puede(i.seccion));

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
      {visibles.map((item) => (
        <NavLink
          key={item.a}
          to={item.a}
          end={item.a === "/inventario"}
          onClick={() => setAbierto(false)}
          className={({ isActive }) =>
            [
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              item.sub ? "ml-3 text-[13px]" : "",
              isActive
                ? "bg-primary-50 text-primary-700"
                : "text-texto-2 hover:bg-muted",
            ].join(" ")
          }
        >
          <Icon name={item.icono} size={item.sub ? 17 : 19} />
          <span>{item.label}</span>
        </NavLink>
      ))}

      <div className="my-2 border-t border-borde-soft" />

      <button
        onClick={logout}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-danger-bg hover:text-danger-text"
      >
        <Icon name="logout" size={19} />
        <span>Cerrar sesión</span>
      </button>
    </nav>
  );

  const encabezado = (
    <div className="border-b border-borde-soft px-4 pb-4 pt-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-marca text-white">
          <Icon name="archive" size={21} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-texto">
            {negocio?.nombre ?? "BamarDev"}
          </h2>
          <span className="text-xs text-texto-3">
            {usuario ? etiquetaRol(usuario.rol) : ""}
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {iniciales(usuario?.nombre ?? usuario?.username)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-texto">
            {usuario?.nombre ?? usuario?.username}
          </p>
          <p className="truncate text-xs text-texto-3">{usuario?.username}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-fondo">
      {/* Barra lateral fija en escritorio */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-borde bg-white lg:flex">
        {encabezado}
        {nav}
      </aside>

      {/* Drawer en móvil */}
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setAbierto(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-2xl">
            {encabezado}
            {nav}
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
            {tituloDe(visibles, location.pathname)}
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
