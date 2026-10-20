import { Icon, type NombreIcono } from "../../components/Icon";
import { QrParaCobrar } from "../../components/QrCobro";
import { Input } from "../../components/ui";
import { parsearMonto } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { round2 } from "./calculo";
import { montoCorto, sugerencias, type EstadoCobro, type Metodo } from "./useCobro";

/**
 * El nombre del campo del efectivo. "Recibido" a secas no decía de quién ni de
 * qué, y al lado de "Monto a cobrar" se confundían (el dueño, 19-oct). Los
 * avisos que mandan a escribir ahí (`avisoCuentaRecalculada`) lo nombran igual.
 */
export const ETIQUETA_RECIBIDO = "Efectivo entregado por el cliente";

/**
 * El cambio (o lo que falta) en la barra de abajo de un modal de cobro, al lado
 * del botón: es lo último que mira el cajero antes de confirmar, y con el
 * teclado abierto el recuadro del formulario quedaba tapado. Nada mientras no
 * se escribió lo recibido, o si no es en efectivo.
 */
export function CambioDelCobro({ cobro: c }: { cobro: EstadoCobro }) {
  if (c.metodo !== "Efectivo" || c.sinRecibido || c.monto <= 0) return null;
  const falta = c.falta > 0;
  return (
    <p
      role="status"
      className={`mr-auto flex items-baseline gap-2 self-center ${falta ? "text-rose-700" : "text-primary-700"}`}
    >
      <span className="text-[12px] font-bold uppercase tracking-wider">{falta ? "Falta" : "Cambio"}</span>
      <span className="text-xl font-extrabold tabular-nums">{fmtMoney(falta ? c.falta : c.cambio)}</span>
    </p>
  );
}

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

/**
 * @param cambioEnElPie el cambio (o lo que falta) lo muestra la barra de abajo
 *   del modal (`CambioDelCobro`): acá no se repite.
 */
export function FormCobro({ cobro, cambioEnElPie = false }: { cobro: EstadoCobro; cambioEnElPie?: boolean }) {
  const c = cobro;
  const fmt = (n: number) => fmtMoney(n);
  return (
    <div className="space-y-4">
      {c.editable && (
        <div>
          {/* Lo que se paga en ESTA vez, no la cuenta entera: "Monto a cobrar"
              se leía como el saldo de la mesa (el dueño, 19-oct). */}
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Monto a pagar ahora</p>
          <CampoBs etiqueta="Monto a pagar ahora" valor={c.montoTexto} onCambiar={c.setMontoTexto} autoFocus />
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
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">{ETIQUETA_RECIBIDO}</p>
          {/* El total no va de placeholder: en gris parecía escrito y el
              cajero cobraba sin contar (QA del dueño, 17-oct). */}
          <CampoBs
            etiqueta={ETIQUETA_RECIBIDO}
            valor={c.recibidoTexto}
            onCambiar={c.setRecibidoTexto}
            placeholder="¿Cuánto te dio?"
          />
          {/* Lo justo y los billetes que lo cubren, a partir de lo que se paga
              AHORA (en un adelanto, lo escrito arriba; ver `sugerencias`). */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => c.setRecibidoTexto(String(c.monto))}
              disabled={c.monto <= 0}
              className="min-h-9 rounded-full px-3.5 text-[13px] font-semibold tabular-nums text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted disabled:opacity-50"
            >
              {c.monto > 0 ? `Justo (${montoCorto(c.monto)})` : "Justo"}
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
              {cambioEnElPie
                ? "Escribí cuánto te dio el cliente (o tocá «Justo» o un billete) y abajo sale el cambio."
                : "Escribí cuánto te dio el cliente (o tocá «Justo») y acá sale el cambio."}
            </div>
          ) : cambioEnElPie ? null : c.falta > 0 ? (
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
              {/* Con un efectivo negativo mostraba un QR mayor que el total. */}
              {fmt(Math.min(c.monto, Math.max(0, round2(c.monto - (parsearMonto(c.efectivoTexto) ?? 0)))))}
            </span>
          </div>
          {c.montoQr > 0 && c.montoQr < c.monto ? (
            <div className="mt-3">
              <QrParaCobrar confirmado={c.qrConfirmado} onConfirmar={c.confirmarQr} monto={fmt(c.montoQr)} />
            </div>
          ) : (
            c.efectivoTexto.trim() === "" && (
              // Sin el efectivo no se sabe por cuánto es el QR, y mostrarlo por el
              // total invitaba a pagar todo por QR. No salía nada y parecía que el
              // mixto no tenía QR (QA del dueño, 19-oct): se dice dónde va a salir.
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-borde bg-muted px-4 py-3 text-[13px] text-texto-3">
                <Icon name="qr" size={22} className="shrink-0 text-texto-4" />
                <span>Escribí cuánto paga en efectivo y acá sale el QR por el resto.</span>
              </div>
            )
          )}
          {/* Las dos partes van con algo: con 0 en efectivo decía "tiene que
              ser menos que el total", que ya lo es (prueba profunda, 18-oct). */}
          {c.efectivoTexto.trim() !== "" && !(c.montoQr > 0 && c.montoQr < c.monto) && (
            <p className="mt-1.5 text-xs text-rose-700">
              {(parsearMonto(c.efectivoTexto) ?? 0) > 0
                ? `El efectivo tiene que ser menos que ${fmt(c.monto)}: lo demás va por QR.`
                : "Escribí cuánto va en efectivo (más de Bs 0): lo demás va por QR. Si es todo por QR, elegí «QR»."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

