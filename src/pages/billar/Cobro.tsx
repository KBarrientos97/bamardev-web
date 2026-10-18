import { Icon, type NombreIcono } from "../../components/Icon";
import { QrParaCobrar } from "../../components/QrCobro";
import { Input } from "../../components/ui";
import { parsearMonto } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { round2 } from "./calculo";
import { sugerencias, type EstadoCobro, type Metodo } from "./useCobro";

/**
 * Cobrar: efectivo (con lo recibido y el vuelto), QR o mixto (§7.5). Lo usan
 * el tiempo fijo cobrado al abrir o al extender, el pago parcial, el cierre de
 * la mesa y la venta rápida.
 *
 * El QR es el del negocio y el mismo `QrParaCobrar` del POS: hasta que el
 * cajero confirma que vio el pago, no se puede cobrar.
 */

const METODOS: { metodo: Metodo; icono: NombreIcono }[] = [
  { metodo: "Efectivo", icono: "coins" },
  { metodo: "QR", icono: "qr" },
  { metodo: "Mixto", icono: "billetera" },
];

/** Prefijo "Bs" adentro del campo, como en la maqueta. */
export function CampoBs({
  valor,
  onCambiar,
  placeholder,
  etiqueta,
  autoFocus,
}: {
  valor: string;
  onCambiar: (t: string) => void;
  placeholder?: string;
  etiqueta: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-texto-4">
        Bs
      </span>
      <Input
        type="number"
        aria-label={etiqueta}
        value={valor}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onCambiar(e.target.value)}
        className="h-12 pl-10 text-lg font-semibold tabular-nums"
      />
    </div>
  );
}

export function FormCobro({ cobro }: { cobro: EstadoCobro }) {
  const c = cobro;
  const fmt = (n: number) => fmtMoney(n);
  return (
    <div className="space-y-4">
      {c.editable && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Monto a cobrar</p>
          <CampoBs etiqueta="Monto a cobrar" valor={c.montoTexto} onCambiar={c.setMontoTexto} autoFocus />
          <p className="mt-1 text-xs text-texto-4">
            {c.monto > c.tope ? `No puede pasar el saldo de ${fmt(c.tope)}.` : `Saldo de la mesa: ${fmt(c.tope)}.`}
          </p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Método de pago</p>
        <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-3 gap-2">
          {METODOS.map((m) => {
            const activo = c.metodo === m.metodo;
            return (
              <button
                key={m.metodo}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => c.setMetodo(m.metodo)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[13px] font-semibold transition-colors ${
                  activo
                    ? "border-primary bg-primary-50 text-primary-700"
                    : "border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                <Icon name={m.icono} size={20} />
                {m.metodo}
              </button>
            );
          })}
        </div>
      </div>

      {c.metodo === "Efectivo" && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Recibido</p>
          {/* El total no va de placeholder: en gris parecía escrito y el
              cajero cobraba sin contar (QA del dueño, 17-oct). */}
          <CampoBs
            etiqueta="Recibido"
            valor={c.recibidoTexto}
            onCambiar={c.setRecibidoTexto}
            placeholder="¿Cuánto te dio?"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => c.setRecibidoTexto(String(c.monto))}
              className="min-h-9 rounded-full px-3.5 text-[13px] font-semibold text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
            >
              Justo
            </button>
            {sugerencias(c.monto).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => c.setRecibidoTexto(String(s))}
                className="min-h-9 rounded-full px-3.5 text-[13px] font-semibold tabular-nums text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
              >
                Bs {s}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-texto-4">Contá el efectivo antes de confirmar.</p>
          {c.sinRecibido ? (
            <div className="mt-3 rounded-xl border border-borde bg-muted px-4 py-3 text-[13px] text-texto-3">
              Escribí cuánto te dio el cliente (o tocá «Justo») y acá sale el cambio.
            </div>
          ) : c.falta > 0 ? (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-rose-700">Falta</span>
              <span className="text-xl font-extrabold tabular-nums text-rose-700">{fmt(c.falta)}</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-wider text-primary-700">Cambio</span>
              <span className="text-xl font-extrabold tabular-nums text-primary-700">{fmt(c.cambio)}</span>
            </div>
          )}
        </div>
      )}

      {c.metodo === "QR" && c.monto > 0 && (
        <QrParaCobrar confirmado={c.qrConfirmado} onConfirmar={c.confirmarQr} monto={fmt(c.montoQr)} />
      )}

      {c.metodo === "Mixto" && (
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">En efectivo</p>
          <CampoBs etiqueta="En efectivo" valor={c.efectivoTexto} onCambiar={c.setEfectivoTexto} />
          <div className="mt-3 flex items-center justify-between rounded-xl border border-borde bg-muted px-4 py-3 text-sm">
            <span className="font-semibold text-texto-2">Por QR</span>
            <span className="font-bold tabular-nums text-texto">
              {fmt(Math.max(0, round2(c.monto - (parsearMonto(c.efectivoTexto) ?? 0))))}
            </span>
          </div>
          {c.montoQr > 0 && c.montoQr < c.monto && (
            <div className="mt-3">
              <QrParaCobrar confirmado={c.qrConfirmado} onConfirmar={c.confirmarQr} monto={fmt(c.montoQr)} />
            </div>
          )}
          {c.efectivoTexto.trim() !== "" && !(c.montoQr > 0 && c.montoQr < c.monto) && (
            <p className="mt-1.5 text-xs text-rose-700">
              El efectivo tiene que ser menos que {fmt(c.monto)}: lo demás va por QR.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

