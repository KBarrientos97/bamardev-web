import { useState } from "react";
import { Chips } from "../../components/filtros";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { esVentaDeCuotas, textoAnularCuotas } from "../../lib/academia/cobroCuotas";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { esBelleza } from "../../lib/rubro";
import { useAuth } from "../../store/AuthContext";
import { useCupo } from "../../store/useCupo";
import type { Venta } from "../../types";

/**
 * Anular una venta con motivo y PIN. Nació dentro del Historial
 * (`PantallaHistorial`) y vive aparte desde el 12-nov para que la Supervisión
 * del local anule con el MISMO diálogo: los mismos motivos, el mismo PIN, el
 * mismo aviso de por dónde vuelve la plata. Dos diálogos parecidos terminan
 * diciendo cosas distintas, y el que anula desde Supervisión es justo el dueño.
 */

/**
 * Lo que el diálogo lee de la venta. El Historial le pasa la `Venta` entera;
 * la Supervisión, lo que trae su respuesta (los pagos con el nombre del medio,
 * que es lo único que necesita para decir cuánto vuelve por QR y cuánto en
 * efectivo).
 */
export type VentaParaAnular = Pick<Venta, "id" | "comprobante" | "total" | "cuotas" | "detalles"> & {
  pagos?: { formaPago?: string; monto: number }[];
};

/** Los motivos de una anulación, en el orden en que más pasan. */
const MOTIVOS_ANULACION = [
  ["Devolución del cliente", "Devolución del cliente"],
  ["Error al cobrar", "Error al cobrar"],
  ["Producto equivocado", "Producto equivocado"],
  ["Otro", "Otro"],
] as const;
/**
 * Los de una venta de cuotas (instituto): una cuota no es un producto, así que
 * «Producto equivocado» y «Devolución del cliente» no decían qué pasó. Lista 2 #9.
 */
const MOTIVOS_ANULACION_CUOTA = [
  ["Error al cobrar", "Error al cobrar"],
  ["Se cobró dos veces", "Se cobró dos veces"],
  ["Cuota de otro estudiante", "Cuota de otro estudiante"],
  ["Otro", "Otro"],
] as const;
type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number][0] | (typeof MOTIVOS_ANULACION_CUOTA)[number][0];

/**
 * Si un pago entró por QR. Se mira por NOMBRE y no por id: `FormaPago` es una
 * tabla por negocio con id autoincremental global, así que el "QR" de un
 * cliente no tiene el mismo id que el de otro.
 */
function esPagoQr(p: { formaPago?: string }): boolean {
  return (p.formaPago ?? "").toLowerCase().includes("qr");
}

export function DialogoAnular({
  venta,
  detalleCompleto,
  pideUsuario,
  onClose,
  onAnulada,
}: {
  venta: VentaParaAnular;
  /** Ya se leyó `GET /ventas/:id`: si no trae cuotas, la venta no cobró cuotas. */
  detalleCompleto: boolean;
  pideUsuario: boolean;
  onClose: () => void;
  onAnulada: () => void;
}) {
  const { rubro } = useAuth();
  const { aplica: conCupo, refrescarCupo } = useCupo();
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState<MotivoAnulacion | "">("");
  // Con cuotas (o sin saber qué cobró, en un instituto) los motivos de una
  // cuota; una venta de productos conserva los de siempre.
  const deCuotas = esVentaDeCuotas(venta) || (rubro === "ACADEMIA" && !detalleCompleto);
  const motivos = deCuotas ? MOTIVOS_ANULACION_CUOTA : MOTIVOS_ANULACION;
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  /**
   * Por dónde vuelve la plata: por el mismo medio por el que entró. Lo de QR
   * ya está en la cuenta del negocio y se devuelve con una transferencia: no
   * sale de la caja. Lo de efectivo sí, y la anulación ya lo descuenta del
   * arqueo del turno. Decirlo antes de confirmar es lo que evita que alguien
   * devuelva en efectivo una venta de QR y la caja cierre con un faltante.
   */
  const pagos = venta.pagos ?? [];
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const porQr = redondear(pagos.filter(esPagoQr).reduce((acc, p) => acc + p.monto, 0));
  const enEfectivo = redondear(
    pagos.filter((p) => !esPagoQr(p)).reduce((acc, p) => acc + p.monto, 0),
  );

  async function anular() {
    setError("");
    // Quedaba el quién y el cuándo, nunca el porqué: en una venta de QR el
    // porqué es toda la historia. Un toque en un chip alcanza.
    if (!motivo) return setError("Elegí el motivo: queda guardado con la anulación.");
    if (motivo === "Otro" && detalle.trim().length < 3)
      return setError("Contá en pocas palabras por qué se anula.");
    // El PIN es de 4 (18-oct); uno viejo de 5 o 6 sigue entrando.
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN tiene entre 4 y 6 dígitos.");
    if (pideUsuario && autorizador.trim().length < 3)
      return setError("Poné el usuario del encargado que autoriza.");

    const textoMotivo =
      motivo === "Otro" ? detalle.trim() : [motivo, detalle.trim()].filter(Boolean).join(" · ");

    setEnviando(true);
    try {
      await api.anularVenta(venta.id, {
        ...(pideUsuario ? { autorizadorUsername: autorizador.trim() } : {}),
        autorizadorPin: pin,
        motivo: textoMotivo,
      });
      // Plan Emprendedor (D10): la anulación devuelve el lugar del día (o
      // los créditos) y la respuesta no trae el contador. Sin pedirlo, el
      // POS seguía bloqueando con 50/50 hasta el chequeo de los 15 min.
      if (conCupo) refrescarCupo();
      onAnulada();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Anular venta"
      subtitulo={`${venta.comprobante ?? `#${venta.id}`} · ${fmtMoney(venta.total)}`}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variante="danger" onClick={anular} disabled={enviando}>
            {enviando ? "Anulando…" : "Anular"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-2">
          {/* En un salón lo que se vende es sobre todo servicios, que no tienen
              stock (QA B-21): se dice sólo lo que pasa de verdad. */}
          {textoAnularCuotas(venta, rubro, detalleCompleto) ??
            (esBelleza(rubro)
              ? "La venta queda anulada y, si tenía productos, vuelven al inventario. No se puede deshacer."
              : "La venta queda anulada y el stock vuelve al inventario. No se puede deshacer.")}
        </p>

        {(porQr > 0 || enEfectivo > 0) && (
          <ul className="space-y-1.5 rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
            {porQr > 0 && (
              <li>
                <span className="font-bold text-texto">{fmtMoney(porQr)} por QR:</span> devolvelos
                por QR o transferencia desde la cuenta del negocio. No salen de la caja.
              </li>
            )}
            {enEfectivo > 0 && (
              <li>
                <span className="font-bold text-texto">{fmtMoney(enEfectivo)} en efectivo:</span>{" "}
                salen de la caja. La anulación ya los descuenta del turno.
              </li>
            )}
          </ul>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Motivo</p>
          {/* Vacío al abrir a propósito: un motivo marcado de antemano se
              confirmaría sin leerlo, y el dato no diría nada. */}
          <Chips
            valor={motivo as MotivoAnulacion}
            opciones={motivos}
            onChange={setMotivo}
          />
          {motivo && (
            <Input
              className="mt-2"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.slice(0, 150))}
              placeholder={motivo === "Otro" ? "¿Por qué se anula?" : "Detalle (opcional)"}
              aria-label="Detalle del motivo"
              autoComplete="off"
            />
          )}
        </div>

        {pideUsuario && (
          <Campo label="Usuario que autoriza" hint="Un encargado con PIN">
            <Input
              value={autorizador}
              onChange={(e) => setAutorizador(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Campo>
        )}

        <Campo label="PIN de autorización">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoComplete="off"
            autoFocus={!pideUsuario}
            placeholder="4 dígitos"
            className="tracking-[0.3em]"
          />
        </Campo>
        {/* Fuera del label: los tests buscan el campo por su etiqueta exacta. */}
        <p className="-mt-2 text-xs text-texto-4">
          Cada intento queda registrado con tu usuario y lo ve el administrador.
        </p>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
