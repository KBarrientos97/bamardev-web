import { NavLink } from "react-router-dom";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { useAuth } from "../../../store/AuthContext";

/**
 * La barra de abajo del docente en el celular (E11a): sus lugares a un toque,
 * como en el lienzo. "Mi planilla" ya no está: la planilla es sólo del
 * administrador (D1, reunión con Derick del 22-oct). En escritorio no hace falta: está el menú. Cada
 * entrada aparece sólo si su sección existe (permiso y feature).
 *
 * Mide 57 px de alto (1 de borde + 2 × 4 de relleno + 48 del botón): la barra
 * de "Guardar lista" de PasarLista se apoya justo encima (`bottom-[57px]`).
 */
export default function NavDocente() {
  const { puede } = useAuth();
  const items: { a: string; label: string; icono: NombreIcono; visible: boolean }[] = [
    { a: "/academia/mis-clases", label: "Mis clases", icono: "calendar", visible: puede("academia_mis_clases") },
    { a: "/academia/notas", label: "Notas", icono: "edit", visible: puede("academia_notas") },
  ];
  const visibles = items.filter((i) => i.visible);
  if (visibles.length < 2) return null;
  return (
    <nav
      aria-label="Secciones del docente"
      className="fixed inset-x-0 bottom-0 z-20 flex gap-1 border-t border-borde-soft bg-white px-2 py-1 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:hidden"
    >
      {visibles.map((i) => (
        <NavLink
          key={i.a}
          to={i.a}
          className={({ isActive }) =>
            `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-0.5 text-[11px] font-semibold transition-colors ${
              isActive ? "bg-primary-50 text-primary-700" : "text-texto-3 hover:bg-muted"
            }`
          }
        >
          <Icon name={i.icono} size={20} />
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
