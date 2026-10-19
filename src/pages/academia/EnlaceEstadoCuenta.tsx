import { useEffect, useState } from "react";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { abrirWhatsapp } from "../../lib/academia/vista";

/**
 * El pie del recibo de cuotas (E10, ronda 2): el enlace al estado de cuenta
 * público del estudiante, con su QR para escanearlo del papel. Es la medida
 * S3: el estudiante ve en su celular que su pago figura, y si la recepción
 * cobró sin registrar, reclama.
 *
 * El enlace lo arma el backend (crea el token si falta). Si no se puede
 * pedir (otro rol, sin red), el recibo sale igual, sin este pie.
 */
export default function EnlaceEstadoCuenta({ inscripcionId }: { inscripcionId: number }) {
  const [enlace, setEnlace] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    apiAcademia
      .enlacePago(inscripcionId)
      .then(async (r) => {
        if (!vigente) return;
        setEnlace(r.enlacePago);
        // El generador de QR se baja recién acá: el POS de los demás rubros no lo carga.
        try {
          const QRCode = (await import("qrcode")).default;
          const png = await QRCode.toDataURL(r.enlacePago, { errorCorrectionLevel: "M", margin: 1, width: 240 });
          if (vigente) setQr(png);
        } catch {
          /* sin QR queda el enlace escrito */
        }
      })
      .catch(() => {
        /* el recibo sale igual */
      });
    return () => {
      vigente = false;
    };
  }, [inscripcionId]);

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
        className="mt-1.5 font-semibold text-primary-700 hover:underline print:hidden"
      >
        Mandar por WhatsApp
      </button>
    </div>
  );
}
