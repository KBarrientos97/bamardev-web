import type { NombreIcono } from "../../../components/Icon";
import { useAuth } from "../../../store/AuthContext";

/** Los lugares de la barra de abajo del docente que su sesión puede ver (ver `NavDocente`). */
export function useItemsDocente() {
  const { puede } = useAuth();
  const items: { a: string; label: string; icono: NombreIcono; visible: boolean }[] = [
    { a: "/academia/mis-clases", label: "Mis clases", icono: "calendar", visible: puede("academia_mis_clases") },
    { a: "/academia/notas", label: "Notas", icono: "edit", visible: puede("academia_notas") },
  ];
  return items.filter((i) => i.visible);
}

/** ¿Se dibuja la barra de abajo del docente? (con menos de dos lugares, no). */
export function useHayNavDocente() {
  return useItemsDocente().length >= 2;
}

