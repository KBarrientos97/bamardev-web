import { Icon } from "../Icon";
import { AVISO_ROL_SIN_PERMISOS } from "../../lib/roles";

/**
 * Un rol sin permisos (un cargo descriptivo, "Ayudante") deja entrar a la
 * persona a una pantalla vacía y le ocupa un lugar del cupo (QA R1 W-10). No
 * se prohíbe —puede ser a propósito—, pero se avisa antes de crear la cuenta
 * (Usuarios › Nuevo, Personal › Darle acceso).
 */
export default function AvisoSinPermisos() {
  return (
    <p
      role="status"
      className="mt-2 flex items-start gap-2 rounded-xl bg-warning-bg px-3 py-2 text-xs text-warning-text"
    >
      <Icon name="alert" size={15} className="mt-px shrink-0" />
      <span>{AVISO_ROL_SIN_PERMISOS}</span>
    </p>
  );
}
