import { Icon } from "../../components/Icon";
import { Badge, Boton } from "../../components/ui";
import { fmtFechaHora, fmtMoney, fmtNum } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import type { Venta } from "../../types";

/**
 * Comprobante de la venta recién cobrada. Se imprime con el diálogo del
 * navegador: `print:` deja sólo el ticket, sin la barra ni los botones.
 */
export default function PantallaRecibo({
  venta,
  onNuevaVenta,
  onHistorial,
}: {
  venta: Venta;
  onNuevaVenta: () => void;
  onHistorial: () => void;
}) {
  const { negocio, incluye } = useAuth();
  const detalles = venta.detalles ?? [];
  const pagos = venta.pagos ?? [];
  const enMesa = detalles.filter((d) => d.consumo === "MESA");
  const paraLlevar = detalles.filter((d) => d.consumo !== "MESA");

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex flex-col items-center text-center print:hidden">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
            <Icon name="check" size={28} strokeWidth={2.5} />
          </span>
          <h1 className="mt-3 text-lg font-bold text-texto">Venta registrada</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {venta.comprobante ?? `#${venta.id}`}
          </p>
        </div>

        {/* El ticket en sí: es lo único que sale impreso. */}
        <article className="card p-5 print:border-0 print:shadow-none">
          <header className="border-b border-dashed border-borde pb-3 text-center">
            <h2 className="text-base font-bold text-texto">{negocio?.nombre ?? "BamarDev"}</h2>
            <p className="mt-0.5 text-xs text-texto-3">{fmtFechaHora(venta.fecha)}</p>
            <p className="text-xs text-texto-3">
              {venta.comprobante ?? `#${venta.id}`}
              {venta.cajero ? ` · ${venta.cajero}` : ""}
            </p>
          </header>

          {enMesa.length > 0 && paraLlevar.length > 0 ? (
            <>
              <GrupoLineas titulo="En mesa" lineas={enMesa} />
              <GrupoLineas titulo="Para llevar" lineas={paraLlevar} />
            </>
          ) : (
            <GrupoLineas lineas={detalles} />
          )}

          <dl className="mt-3 space-y-1 border-t border-dashed border-borde pt-3 text-sm">
            {venta.tarifaEnvio > 0 && (
              <div className="flex justify-between text-texto-2">
                <dt>Envío</dt>
                <dd>{fmtMoney(venta.tarifaEnvio)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-texto">
              <dt>Total</dt>
              <dd>{fmtMoney(venta.total)}</dd>
            </div>
            {pagos.map((p, i) => (
              <div key={i} className="flex justify-between text-texto-2">
                <dt>{p.formaPago ?? "Pago"}</dt>
                <dd>{fmtMoney(p.monto)}</dd>
              </div>
            ))}
            {typeof venta.cambio === "number" && venta.cambio > 0 && (
              <div className="flex justify-between font-semibold text-primary-700">
                <dt>Cambio</dt>
                <dd>{fmtMoney(venta.cambio)}</dd>
              </div>
            )}
          </dl>

          {venta.credito && (
            <div className="mt-3 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
              <p className="font-bold">Venta a crédito</p>
              <p className="mt-0.5">
                {venta.credito.clienteNombre} · saldo {fmtMoney(venta.credito.saldo)}
              </p>
            </div>
          )}

          <p className="mt-4 border-t border-dashed border-borde pt-3 text-center text-xs text-texto-4">
            ¡Gracias por su compra!
          </p>
        </article>
      </div>

      <div className="flex gap-2 border-t border-borde bg-white p-4 print:hidden">
        {incluye("recibo_pdf") && (
          <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
            Imprimir
          </Boton>
        )}
        <Boton variante="ghost" onClick={onHistorial}>
          Historial
        </Boton>
        <Boton icono="plus" onClick={onNuevaVenta} className="flex-1">
          Nueva venta
        </Boton>
      </div>
    </div>
  );
}

function GrupoLineas({
  titulo,
  lineas,
}: {
  titulo?: string;
  lineas: NonNullable<Venta["detalles"]>;
}) {
  if (lineas.length === 0) return null;
  return (
    <div className="mt-3">
      {titulo && (
        <div className="mb-1.5 flex items-center gap-2">
          <Badge tono={titulo === "En mesa" ? "azul" : "gris"}>{titulo}</Badge>
        </div>
      )}
      <ul className="space-y-1.5">
        {lineas.map((d, i) => (
          <li key={i} className="flex items-start justify-between gap-3 text-[13px]">
            <div className="min-w-0">
              <p className="text-texto">
                <span className="font-bold">{fmtNum(d.cantidad)}×</span> {d.producto}
              </p>
              {d.nota && <p className="text-xs italic text-texto-3">{d.nota}</p>}
            </div>
            <span className="shrink-0 font-semibold text-texto">{fmtMoney(d.subtotal)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
