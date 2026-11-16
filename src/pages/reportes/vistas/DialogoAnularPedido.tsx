import { useState } from "react";
import { Chips } from "../../../components/filtros";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../../components/ui";
import { api } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { NOMBRE_PLATAFORMA, type PedidoPlataforma } from "../../../lib/pedidosPlataforma/tipos";

/**
 * Anular un pedido de Yango o PedidosYa, con motivo y PIN
 * (PLAN-PEDIDOS-PLATAFORMA §4). Es el diálogo de anular una venta
 * (`pos/DialogoAnular`) con lo que cambia en un pedido de plataforma: no hay
 * plata que devolver (nunca entró a la caja) y lo único que vuelve es el
 * stock a la sucursal del pedido.
 *
 * El backend pide el PIN siempre, también al dueño: quien autoriza con PIN se
 * autoriza a sí mismo, y al resto se le pide el usuario del encargado que
 * autoriza (`pideUsuario`, la misma regla de la anulación de ventas).
 */

/** Los motivos de siempre en un pedido de plataforma, en el orden en que más pasan. */
const MOTIVOS = [
  ["Error al cargar", "Error al cargar"],
  ["Cancelado en la app", "Cancelado en la app"],
  ["Producto equivocado", "Producto equivocado"],
  ["Otro", "Otro"],
] as const;
type Motivo = (typeof MOTIVOS)[number][0];

export default function DialogoAnularPedido({
  pedido,
  pideUsuario,
  onClose,
  onAnulado,
}: {
  pedido: PedidoPlataforma;
  pideUsuario: boolean;
  onClose: () => void;
  onAnulado: () => void;
}) {
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState<Motivo | "">("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function anular() {
    setError("");
    // Quedaba el quién y el cuándo, nunca el porqué: un toque en un chip alcanza.
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
      await api.anularPedidoPlataforma(pedido.id, {
        motivo: textoMotivo,
        ...(pideUsuario ? { autorizadorUsername: autorizador.trim() } : {}),
        autorizadorPin: pin,
      });
      onAnulado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular el pedido");
    } finally {
      setEnviando(false);
    }
  }

  const nombre = NOMBRE_PLATAFORMA[pedido.plataforma];
  return (
    <Modal
      abierto
      titulo={`Anular pedido de ${nombre}`}
      subtitulo={`${pedido.codigoExterno ? `N° ${pedido.codigoExterno}` : `#${pedido.id}`} · ${fmtMoney(pedido.total)}`}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton variante="danger" onClick={() => void anular()} disabled={enviando}>
            {enviando ? "Anulando…" : "Anular"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-2">
          El pedido deja de sumar en el reporte y el stock vuelve a {pedido.almacen.nombre}. La caja no
          se toca: este pedido nunca entró. No se puede deshacer.
        </p>

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Motivo</p>
          {/* Vacío al abrir a propósito: un motivo marcado de antemano se
              confirmaría sin leerlo, y el dato no diría nada. */}
          <Chips valor={motivo as Motivo} opciones={MOTIVOS} onChange={setMotivo} />
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
        <p className="-mt-2 text-xs text-texto-4">
          Cada intento queda registrado con tu usuario y lo ve el administrador.
        </p>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
