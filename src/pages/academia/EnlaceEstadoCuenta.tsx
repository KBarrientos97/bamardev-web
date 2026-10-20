import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { abrirWhatsapp } from "../../lib/academia/vista";
import { claseBotonFila } from "./piezas";

/**
 * El pie del recibo de cuotas (E10, ronda 2): el enlace al estado de cuenta
 * público del estudiante, con su QR para escanearlo del papel. Es la medida
 * S3: el estudiante ve en su celular que su pago figura, y si la recepción
 * cobró sin registrar, reclama.
 *
 * El enlace viene en la respuesta de la venta (`cuotas[].enlacePago`,
 * contrato #39): así sale también cuando la recepción cobra una cuota de
 * otra sede, donde `GET …/enlace-pago` responde 403 `OTRA_SEDE` (B-14). Sólo
 * si la venta no lo trae (un backend anterior, `undefined`) se lo pide; con
 * `null` (el negocio no tiene subdominio) no hay pie. Si no se puede, el
 * recibo sale igual, sin este pie.
 */
export default function EnlaceEstadoCuenta({
  enlacePago,
  inscripcionId,
}: {
  /** El de la venta: string, null (no hay) o undefined (no vino: se pide). */
  enlacePago?: string | null;
  inscripcionId?: number | null;
}) {
  const [pedido, setPedido] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const enlace = enlacePago !== undefined ? enlacePago : pedido;

  useEffect(() => {
    if (enlacePago !== undefined || inscripcionId == null) return;
    let vigente = true;
    apiAcademia
      .enlacePago(inscripcionId)
      .then((r) => {
        if (vigente) setPedido(r.enlacePago);
      })
      .catch(() => {
        /* el recibo sale igual */
      });
    return () => {
      vigente = false;
    };
  }, [enlacePago, inscripcionId]);

  useEffect(() => {
    if (!enlace) return;
    let vigente = true;
    // El generador de QR se baja recién acá: el POS de los demás rubros no lo carga.
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(enlace, { errorCorrectionLevel: "M", margin: 1, width: 240 }))
      .then((png) => {
        if (vigente) setQr(png);
      })
      .catch(() => {
        /* sin QR queda el enlace escrito */
      });
    return () => {
      vigente = false;
    };
  }, [enlace]);

  if (!enlace) return null;
  const corto = enlace.replace(/^https?:\/\//, "");
  return (
    <div className="mt-2 border-t border-dashed border-borde pt-2 text-center text-xs text-texto-2" aria-label="Estado de cuenta">
      <p>Mirá tu estado de cuenta:</p>
      <p className="break-all font-semibold text-texto">{corto}</p>
      {qr && <img src={qr} alt="Código QR del estado de cuenta" className="mx-auto mt-1.5 h-24 w-24" />}
      <button
        type="button"
        onClick={() => abrirWhatsapp(`https://wa.me/?text=${encodeURIComponent(`Tu estado de cuenta: ${enlace}`)}`)}
        className={`mt-2 ${claseBotonFila("soft")} print:hidden`}
      >
        <Icon name="phone" size={15} />
        Mandar por WhatsApp
      </button>
    </div>
  );
}
