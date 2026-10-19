import { NavLink } from "react-router-dom";
import { Icon, type NombreIcono } from "../../../components/Icon";
import { useAuth } from "../../../store/AuthContext";

/**
 * La barra de abajo del docente en el celular (E11a, E16): sus tres lugares a
 * un toque, como en el lienzo. En escritorio no hace falta: está el menú. Cada
 * entrada aparece sólo si su sección existe (permiso y feature).
 */
export default function NavDocente() {
  const { puede } = useAuth();
  const items: { a: string; label: string; icono: NombreIcono; visible: boolean }[] = [
    { a: "/academia/mis-clases", label: "Mis clases", icono: "calendar", visible: puede("academia_mis_clases") },
    { a: "/academia/notas", label: "Notas", icono: "edit", visible: puede("academia_notas") },
    { a: "/academia/mi-planilla", label: "Mi planilla", icono: "billetera", visible: puede("academia_mi_planilla") },
  ];
  const visibles = items.filter((i) => i.visible);
  if (visibles.length < 2) return null;
  return (
    <nav aria-label="Secciones del docente" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-borde-soft bg-white md:hidden">
      {visibles.map((i) => (
        <NavLink
          key={i.a}
          to={i.a}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? "text-primary-700" : "text-texto-3"}`
          }
        >
          <Icon name={i.icono} size={20} />
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
