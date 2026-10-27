import type { ReactNode } from "react";
import { Navigate, NavLink } from "react-router-dom";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { PESTANAS_CONFIG_ACADEMIA } from "../../../lib/academia/vista";
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
  almacenes: (p) => p.Sedes,
  academia_planilla: (p) => `Planilla ${p.docente}s`,
  academia_ajustes: () => "Ajustes",
};

/** La barra de pestañas, arriba de la pantalla. Con una sola no se dibuja. */
function Pestanas() {
  const { puede } = useAuth();
  const p = usePalabras();
  const visibles = PESTANAS_CONFIG_ACADEMIA.filter((t) => puede(t.seccion));
  if (visibles.length < 2) return null;
  return (
    <nav aria-label="Configuración del instituto" className="border-b border-borde-soft bg-white">
      {/* Corre de costado en el celular en vez de partirse en dos renglones. */}
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
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
            {NOMBRE[t.seccion]?.(p) ?? t.a}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/**
 * Envuelve una pantalla de la configuración con sus pestañas. Sólo en el
 * instituto: Almacenes es la misma pantalla para todos los rubros, y fuera de
 * la academia se ve exactamente como siempre.
 */
export function ConPestanasConfig({ children }: { children: ReactNode }) {
  const { rubro } = useAuth();
  if (rubro !== "ACADEMIA") return <>{children}</>;
  return (
    <>
      <Pestanas />
      {/* C1: arriba de cada pestaña mientras falten pasos; `empty:hidden` por si no se dibuja nada. */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 empty:hidden sm:px-6 lg:px-8">
        <PrimerosPasos />
      </div>
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
