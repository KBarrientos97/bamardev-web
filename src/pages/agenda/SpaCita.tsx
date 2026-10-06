import { useState } from "react";
import { Icon } from "../../components/Icon";
import { apiSpa } from "../../lib/agenda/apiSpa";
import { useSpa } from "../../lib/agenda/spa";
import type { Cita } from "../../lib/agenda/tiposAgenda";
import type { ConsentimientoFaltante } from "../../lib/agenda/tiposSpa";
import { fmtFecha } from "../../lib/format";
import { editaSalud, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import FirmarConsentimiento from "./FirmarConsentimiento";
import { Rotulo } from "./piezas";

/** Estados en los que todavía se atiende: ahí importa si falta una firma. */
const POR_ATENDER = ["SOLICITADA", "RESERVADA", "CONFIRMADA", "EN_ESPERA", "EN_COLA", "EN_ATENCION"];

/**
 * Lo que la fase 3 le suma al detalle de la cita: el aviso de los
 * consentimientos que faltan firmar (con el botón para firmar ahí mismo) y
 * el saldo de paquetes del cliente para los servicios de esta cita.
 *
 * Sin las features no hace ni un pedido: un negocio que no las tiene ve el
 * detalle de siempre.
 */
export default function SpaCita({ cita }: { cita: Cita }) {
  const spa = useSpa();
  const { usuario } = useAuth();
  const [firmando, setFirmando] = useState<ConsentimientoFaltante | null>(null);
  const clienteId = cita.cliente.id;
  const porAtender = POR_ATENDER.includes(cita.estado);
  const veSalud = tienePermiso(usuario, "cliente.ver_salud", true);
  // Ver la salud no alcanza para tomar la firma (S2SEG-18): la recepción ve
  // el aviso de lo que falta, pero firma el dueño o el profesional del
  // cliente, como pide el backend.
  const puedeFirmar = editaSalud(usuario);

  const pendientes = useApi(
    () =>
      spa.consentimientos && porAtender
        ? apiSpa.pendientesDeCita(cita.id).then((r) => r.faltan)
        : Promise.resolve([] as ConsentimientoFaltante[]),
    [cita.id, spa.consentimientos, porAtender],
  );
  // QA S2-13: lo que la ficha de salud dice que impide o condiciona el
  // tratamiento, a la vista de quien atiende (como las alergias). Sólo para
  // quien ve datos de salud y mientras la cita está por atenderse.
  const salud = useApi(
    () =>
      spa.consentimientos && porAtender && veSalud && clienteId != null
        ? Promise.resolve()
            .then(() => apiSpa.saludDelCliente(clienteId))
            .then((r) => r.ficha)
            .catch(() => null)
        : Promise.resolve(null),
    [clienteId, spa.consentimientos, porAtender, veSalud],
  );
  const paquetes = useApi(
    () =>
      spa.paquetes && clienteId != null
        ? apiSpa.paquetesDelCliente(clienteId).catch(() => [])
        : Promise.resolve([]),
    [clienteId, spa.paquetes],
  );

  const servicios = new Set(cita.lineas.map((l) => l.servicioId));
  const saldos = (paquetes.datos ?? [])
    .filter((p) => p.estado === "ACTIVO" && !p.vencido)
    .flatMap((p) =>
      p.items
        .filter((i) => servicios.has(i.servicioId) && i.restantes > 0)
        .map((i) => ({ paquete: p, item: i })),
    );
  const faltan = pendientes.datos ?? [];
  const ficha = salud.datos ?? null;
  const avisosSalud = [
    ficha?.contraindicaciones ? `Contraindicaciones: ${ficha.contraindicaciones}` : "",
    ficha?.medicamentos ? `Medicamentos: ${ficha.medicamentos}` : "",
    ficha?.embarazo ? "Embarazada" : "",
  ].filter(Boolean);

  if (!faltan.length && !saldos.length && !avisosSalud.length) return null;

  return (
    <section className="space-y-2.5">
      {avisosSalud.length > 0 && (
        <div className="rounded-xl bg-danger-bg px-3 py-2 text-[13px] text-danger-text">
          <p className="font-bold">Ficha de salud</p>
          {avisosSalud.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      )}
      {faltan.length > 0 && (
        <div role="alert" className="space-y-2 rounded-xl bg-warning-bg p-3 text-warning-text">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Icon name="alert" size={17} />
            Falta el consentimiento firmado
          </p>
          <ul className="space-y-1.5">
            {faltan.map((f) => (
              <li key={f.servicioId} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1">{f.servicio}</span>
                {puedeFirmar && clienteId != null && (
                  <button
                    type="button"
                    onClick={() => setFirmando(f)}
                    className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1 font-bold hover:bg-white"
                  >
                    Firmar ahora
                  </button>
                )}
              </li>
            ))}
          </ul>
          {clienteId == null && (
            <p className="text-[12px]">La cita no tiene ficha de cliente: creala con su teléfono para guardar la firma.</p>
          )}
        </div>
      )}
      {saldos.length > 0 && (
        <div className="space-y-1.5">
          <Rotulo>Paquetes del cliente</Rotulo>
          <ul className="space-y-1 text-[13px] text-texto-2">
            {saldos.map(({ paquete, item }) => (
              <li key={`${paquete.id}-${item.servicioId}`} className="rounded-lg bg-primary-50 px-3 py-2 text-primary-700">
                <span className="font-semibold">{paquete.nombre}</span>: quedan {item.restantes} de {item.servicio} · vence el{" "}
                {fmtFecha(`${paquete.ultimoDia}T12:00:00`)}
              </li>
            ))}
          </ul>
          {/* Lo que va a pasar al cobrar, sólo si todavía se cobra: en una cita
              ya completada se leía como si faltara (QA DIA-18b). */}
          {[...POR_ATENDER, "POR_COBRAR"].includes(cita.estado) && (
            <p className="text-[12px] text-texto-3">Al cobrar la cita se descuenta una sesión en vez de cobrarla.</p>
          )}
        </div>
      )}
      {firmando && clienteId != null && (
        <FirmarConsentimiento
          clienteId={clienteId}
          citaId={cita.id}
          faltante={firmando}
          nombreCliente={cita.cliente.nombre}
          onClose={() => setFirmando(null)}
          onFirmado={() => {
            setFirmando(null);
            pendientes.recargar();
          }}
        />
      )}
    </section>
  );
}
