import { fmtMoney } from "../../lib/format";
import { FormCobro } from "./Cobro";
import { ModalPin } from "./ModalesMesa";
import { billar } from "./store";
import type { VentaBillar } from "./tipos";
import { useCobro } from "./useCobro";
import { textoMetodo } from "./vista";

/** "Efectivo Bs 30,00 + QR Bs 20,00". */
const textoPagos = (pagos: VentaBillar["pagos"]) =>
  pagos.map((p) => `${textoMetodo(p)} ${fmtMoney(p.monto)}`).join(" + ");

/**
 * Corregir el medio de pago de una venta del turno (marcó efectivo y era QR,
 * mixto mal repartido) sin anularla: el total no cambia, sólo por dónde entró.
 *
 * Antes la única salida era anular, y en una venta de mesa el tiempo no se
 * puede volver a cobrar (pedido del dueño, 17-oct). Es el mismo cobro de
 * siempre —por QR hay que confirmar que entró, como al cobrar— con el PIN de
 * un encargado y un motivo. El backend (`CorreccionPagoBillarService`) lo
 * deja sólo con la caja abierta y lo anota en "Pausas y ajustes".
 */
export function ModalCorregirPago({ venta: v, onClose }: { venta: VentaBillar; onClose: () => void }) {
  const cobro = useCobro(v.total);
  const actual = textoPagos(v.pagos);
  return (
    <ModalPin
      accion={`Corregir el pago de ${v.codigo} · ${fmtMoney(v.total)}`}
      detalle={`Figura: ${actual}. El total no cambia, sólo por dónde entró la plata. Se puede mientras la caja siga abierta y queda registrado quién lo pidió, quién autorizó y por qué.`}
      motivos={["Marcó efectivo y era QR", "Marcó QR y era efectivo", "Mixto mal repartido"]}
      permiso="ventas.anular"
      bloqueado={!cobro.pago}
      onClose={onClose}
      onAutorizar={async (motivo, cred) => {
        if (!cobro.pago) return;
        const corregida = await billar.corregirPago(v.id, cobro.pago, motivo, cred);
        onClose();
        billar.avisar({
          tono: "verde",
          titulo: corregida ? `Pago de ${v.codigo} corregido` : "No había nada que corregir",
          texto: corregida
            ? "El arqueo de la caja ya cuenta el medio correcto."
            : `La venta ya figuraba así: ${actual}.`,
        });
      }}
    >
      <div className="mt-4">
        <p className="mb-2 text-[13px] font-semibold text-texto-2">Cómo pagó en realidad</p>
        <FormCobro cobro={cobro} />
      </div>
    </ModalPin>
  );
}
