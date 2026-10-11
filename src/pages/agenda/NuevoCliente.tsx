import { useState } from "react";
import { createPortal } from "react-dom";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { apiAgenda, clienteDelConflicto, mensajeDe } from "../../lib/agenda/apiAgenda";
import type { ClienteFicha } from "../../lib/agenda/tiposAgenda";
import { apiCrm } from "../../lib/crm/apiCrm";

/**
 * Lo que se escribió en un buscador de clientes, repartido para el alta:
 * con dígitos es un teléfono, si no, un nombre. Así quien buscó "7001 2345"
 * o "Rosa" y no la encontró no lo tiene que tipear de nuevo.
 */
function inicialesDeBusqueda(texto: string): { nombre: string; telefono: string } {
  const t = texto.trim();
  return /\d/.test(t) ? { nombre: "", telefono: t } : { nombre: t, telefono: "" };
}

/**
 * Alta de un cliente sin cita (QA DIA-09), con lo mismo que pide "Nueva cita":
 * nombre y teléfono (es para avisarle), y si acepta promociones (el CSV y el
 * WhatsApp de Marketing sólo usan a quien dijo que sí). Un teléfono que ya es
 * de alguien no crea otro: ofrece usar esa ficha.
 *
 * La usan Clientes y los buscadores de cliente del POS ("El paquete queda a
 * nombre de", "Asociar cliente"): a quien llega a comprar un bono sin cita no
 * hay que inventarle una para tenerlo como cliente.
 */
export default function NuevoCliente({
  textoBuscado = "",
  etiquetaExistente = (nombre) => `Abrir la ficha de ${nombre}`,
  onClose,
  onListo,
}: {
  /** Lo que se había escrito en el buscador: precarga nombre o teléfono. */
  textoBuscado?: string;
  /** El botón que usa la ficha que ya tenía ese teléfono. */
  etiquetaExistente?: (nombre: string) => string;
  onClose: () => void;
  /** `aviso` vacío = se eligió una ficha que ya existía. */
  onListo: (c: ClienteFicha, aviso: string) => void;
}) {
  const [inicial] = useState(() => inicialesDeBusqueda(textoBuscado));
  const [nombre, setNombre] = useState(inicial.nombre);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [promos, setPromos] = useState<"" | "si" | "no">("");
  const [existente, setExistente] = useState<ClienteFicha | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const digitos = telefono.replace(/\D/g, "");

  const guardar = async () => {
    setError("");
    setExistente(null);
    if (nombre.trim().length < 2) return setError("Poné el nombre del cliente.");
    if (digitos.length < 7) return setError("Poné el teléfono del cliente: es para avisarle de sus citas.");
    setEnviando(true);
    try {
      const c = await apiAgenda.crearCliente({ nombre: nombre.trim(), telefono: digitos });
      let aviso = `"${c.nombre}" quedó como cliente.`;
      if (promos) {
        try {
          await apiCrm.marketing(c.id, promos === "si");
        } catch {
          aviso += " No se pudo guardar si acepta promociones: marcalo desde Clientes que no vuelven.";
        }
      }
      onListo(c, aviso);
    } catch (e) {
      const ya = clienteDelConflicto(e);
      if (ya) {
        setExistente(ya);
        setError(`Ese teléfono ya es de ${ya.nombre}.`);
      } else {
        setError(mensajeDe(e, "No se pudo crear el cliente"));
      }
    } finally {
      setEnviando(false);
    }
  };

  // En el body y no donde se abre: el buscador del carrito vive dentro del
  // `<dl>` de los totales, y un diálogo ahí adentro es marcado inválido.
  return createPortal(
    <Modal
      abierto
      titulo="Nuevo cliente"
      subtitulo="Sin agendarle una cita."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={enviando}>
            {enviando ? "Guardando…" : "Crear cliente"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Teléfono" hint="Para avisarle de sus citas por WhatsApp.">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="70012345"
            autoFocus={!inicial.telefono}
          />
        </Campo>
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!!inicial.telefono} />
        </Campo>
        <Campo label="¿Acepta recibir promociones?" hint="Sólo a quien dijo que sí se le escribe con promociones.">
          <Select
            value={promos}
            onChange={(e) => setPromos(e.target.value as "" | "si" | "no")}
            aria-label="¿Acepta recibir promociones?"
          >
            <option value="">No se le preguntó</option>
            <option value="si">Sí, acepta</option>
            <option value="no">No</option>
          </Select>
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
        {existente && (
          <Boton variante="soft" onClick={() => onListo(existente, "")}>
            {etiquetaExistente(existente.nombre)}
          </Boton>
        )}
      </div>
    </Modal>,
    document.body,
  );
}

/**
 * "Sin resultados" en un buscador de clientes y, para quien puede crear
 * fichas, el atajo al alta (QA DIA-09). Antes el buscador no decía nada: ni
 * que no había nadie ni cómo crearlo.
 */
export function SinResultadosCliente({
  puedeCrear,
  onCrear,
  compacto = false,
}: {
  puedeCrear: boolean;
  onCrear: () => void;
  compacto?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-borde ${
        compacto ? "px-2.5 py-1.5" : "px-3 py-2"
      }`}
    >
      <span className="text-[13px] text-texto-3">Sin resultados</span>
      {puedeCrear && (
        <button
          type="button"
          onClick={onCrear}
          className="rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
        >
          + Nuevo cliente
        </button>
      )}
    </div>
  );
}
