import type { ReactNode } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { PESTANAS_CONFIG_ACADEMIA, RUTA_SEDES } from "../../../lib/academia/vista";
import type { Seccion } from "../../../lib/permisos";
import { useAuth } from "../../../store/AuthContext";
import PrimerosPasos from "../PrimerosPasos";

/**
 * La Configuración del instituto (dueño, 26-oct): lo que no se usa todos los
 * días —cursos, sedes, la planilla de los docentes y los ajustes— sale del
 * menú y queda en UNA entrada, con una pestaña por pantalla. Así el menú
 * queda con lo del día a día.
 *
 * Cada pestaña es la pantalla de siempre en su misma ruta: los enlaces que ya
 * llevaban a "/configuracion/carreras" o a la planilla siguen andando, y cada
 * una pide su sección (quien no la tiene no ve la pestaña).
 */
const NOMBRE: Partial<Record<Seccion, (p: ReturnType<typeof usePalabras>) => string>> = {
  academia_carreras: (p) => p.Carreras,
  academia_planilla: (p) => `Planilla ${p.docente}s`,
  academia_ajustes: () => "Ajustes",
};

/** Las pestañas que comparten sección con otra (Sedes y Ajustes) se nombran por su ruta. */
const NOMBRE_POR_RUTA: Record<string, (p: ReturnType<typeof usePalabras>) => string> = { [RUTA_SEDES]: (p) => p.Sedes };

/**
 * La barra de pestañas, arriba de la pantalla, con la Configuración rápida a
 * la derecha (L1). Con una sola pestaña no hay barra: el botón queda solo,
 * arriba a la derecha.
 */
function Pestanas() {
  const { puede } = useAuth();
  const p = usePalabras();
  const visibles = PESTANAS_CONFIG_ACADEMIA.filter((t) => puede(t.seccion));
  if (visibles.length < 2) {
    return (
      // `empty:hidden`: sin pasos pendientes el botón no se dibuja y no queda un hueco.
      <div className="mx-auto flex w-full max-w-6xl justify-end px-4 pt-4 empty:hidden sm:px-6 lg:px-8">
        <PrimerosPasos />
      </div>
    );
  }
  return (
    <nav aria-label="Configuración del instituto" className="border-b border-borde-soft bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Las pestañas corren de costado en el celular en vez de partirse en dos
            renglones; el botón queda fijo a la derecha, fuera de ese scroll. */}
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {visibles.map((t) => (
            <NavLink
              key={t.a}
              to={t.a}
              className={({ isActive }) =>
                `shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  isActive ? "border-primary text-primary-700" : "border-transparent text-texto-3 hover:text-texto"
                }`
              }
            >
              {NOMBRE_POR_RUTA[t.a]?.(p) ?? NOMBRE[t.seccion]?.(p) ?? t.a}
            </NavLink>
          ))}
        </div>
        <div className="shrink-0 py-1.5 empty:hidden">
          <PrimerosPasos />
        </div>
      </div>
    </nav>
  );
}

/**
 * Envuelve una pantalla de la configuración con sus pestañas. Sólo en el
 * instituto: fuera de la academia no hay pestañas ni «Configuración rápida».
 */
export function ConPestanasConfig({ children }: { children: ReactNode }) {
  const { rubro } = useAuth();
  if (rubro !== "ACADEMIA") return <>{children}</>;
  return (
    <>
      <Pestanas />
      {children}
    </>
  );
}

/** "/academia/configuracion": la primera pestaña que cada quien puede ver. */
export function InicioConfig() {
  const { puede } = useAuth();
  const primera = PESTANAS_CONFIG_ACADEMIA.find((t) => puede(t.seccion));
  return <Navigate to={primera?.a ?? "/"} replace />;
}
