import { useState } from "react";
import { Input } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { round2 } from "./calculo";
import { FormCobro } from "./Cobro";
import { ModalPin } from "./ModalesMesa";
import { billar, type PagoNuevo } from "./store";
import type { VentaBillar } from "./tipos";
import { Nota } from "./ui";
import { useCobro } from "./useCobro";
import { textoMetodo } from "./vista";

/** "Efectivo Bs 30,00 + QR Bs 20,00". */
const textoPagos = (pagos: VentaBillar["pagos"]) =>
  pagos.map((p) => `${textoMetodo(p)} ${fmtMoney(p.monto)}`).join(" + ");

/** Lo que va en efectivo en un cobro nuevo (todo, nada o la parte del mixto). */
const efectivoDe = (p: PagoNuevo) =>
  p.metodo === "Efectivo" ? p.monto : p.metodo === "Mixto" ? (p.partes?.efectivo ?? 0) : 0;

/**
 * Corregir el medio de pago de una venta del turno (marcó efectivo y era QR,
 * mixto mal repartido) sin anularla: el total no cambia, sólo por dónde entró.
 *
 * Antes la única salida era anular, y en una venta de mesa el tiempo no se
 * puede volver a cobrar (pedido del dueño, 17-oct). Es el mismo cobro de
 * siempre —por QR hay que confirmar que entró, como al cobrar—. Si la
 * corrección baja el efectivo que espera la caja (de efectivo a QR), que es
 * por donde se roba, pide el PIN de un encargado y el número de operación del
 * banco; si lo sube, alcanza con el motivo, para que la cajera sola lo
 * arregle antes de cerrar. Una vez por venta. Ver `CorreccionPagoBillarService`.
 */
export function ModalCorregirPago({ venta: v, onClose }: { venta: VentaBillar; onClose: () => void }) {
  const cobro = useCobro(v.total);
  const [operacion, setOperacion] = useState("");
  const actual = textoPagos(v.pagos);
  const efectivoAntes = round2(v.pagos.filter((p) => p.metodo === "Efectivo").reduce((t, p) => t + p.monto, 0));
  const baja = cobro.pago ? round2(efectivoAntes - efectivoDe(cobro.pago)) : 0;
  const pideFirma = baja > 0.005;
  return (
    <ModalPin
      accion={`Corregir el pago de ${v.codigo} · ${fmtMoney(v.total)}`}
      detalle={`Figura: ${actual}. El total no cambia, sólo por dónde entró la plata. Se corrige una sola vez y mientras la caja siga abierta, y queda registrado quién lo pidió y por qué.`}
      motivos={["Marcó efectivo y era QR", "Marcó QR y era efectivo", "Mixto mal repartido"]}
      pedirPin={pideFirma}
      permiso="ventas.anular"
      bloqueado={!cobro.pago || (pideFirma && operacion.length < 3)}
      onClose={onClose}
      onAutorizar={async (motivo, cred) => {
        if (!cobro.pago) return;
        const corregida = await billar.corregirPago(v.id, cobro.pago, motivo, cred, pideFirma ? operacion : undefined);
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
        {pideFirma && (
          <div className="mt-4 space-y-3">
            <Nota tono="ambar" icono="alert">
              Esto saca {fmtMoney(baja)} del efectivo que espera la caja: necesita el PIN de un encargado y el número de
              operación que figura en el banco.
            </Nota>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
                N.º de operación del banco (los últimos 4 alcanzan)
              </span>
              <Input
                value={operacion}
                onChange={(ev) => setOperacion(ev.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 30))}
                autoComplete="off"
                placeholder="Ej. 4821"
                aria-label="Número de operación del banco"
              />
            </label>
          </div>
        )}
      </div>
    </ModalPin>
  );
}
