import { useState } from "react";
import { Campo, Input } from "../../components/ui";
import TarjetaRegalo from "../../components/regalos/TarjetaRegalo";
import { DISENOS_REGALO, esDiseno, NOMBRE_DISENO, type DisenoRegalo } from "../../lib/regalos/disenos";
import type { CambiosPagina, ConfigRegalos } from "../../lib/pagina/tipos";
import Seccion from "./Seccion";

/**
 * "Pedidos y gift cards" en el editor de Mi página (IDEAS/6 #1 y #6):
 *
 * · Pedidos por WhatsApp: el catálogo arma el pedido y lo manda al WhatsApp
 *   de la página.
 * · Gift cards: qué montos sugerir, si se acepta otro monto, cuáles de los 10
 *   diseños ofrecer (pintados con TU color y los motivos de TU rubro), cuál va
 *   primero, la vigencia y las condiciones.
 *
 * Todo entra al borrador de la página y se guarda con «Guardar cambios».
 */

const MONTO_MIN = 10;
const MONTO_MAX = 10_000;
const MAX_MONTOS = 6;

const DEFECTO: ConfigRegalos = {
  activo: false,
  montos: [],
  montoLibre: true,
  disenos: [],
  diseno: null,
  vigenciaDias: null,
  condiciones: null,
};

export default function EditorPedidosRegalos({
  guardado,
  pedidosGuardado,
  borrador,
  cambiar,
  negocio,
  rubro,
  color,
  fotoUrl,
  conGiftCards,
  conPedidos,
  conWhatsapp,
}: {
  guardado: ConfigRegalos | undefined;
  pedidosGuardado: boolean | undefined;
  borrador: CambiosPagina;
  cambiar: (c: CambiosPagina) => void;
  negocio: string;
  rubro: string;
  color: string;
  fotoUrl: string | null;
  /** El negocio tiene la feature `gift_cards` (emitirlas en el POS). */
  conGiftCards: boolean;
  /** El negocio tiene el extra `pedidos_whatsapp` (el carrito de la página). */
  conPedidos: boolean;
  /** La página tiene un WhatsApp: adónde llegan pedidos y pedidos de gift card. */
  conWhatsapp: boolean;
}) {
  const g = guardado ?? DEFECTO;
  const r: ConfigRegalos = {
    activo: borrador.regalosActivo ?? g.activo,
    montos: borrador.regalosMontos ?? g.montos,
    montoLibre: borrador.regalosMontoLibre ?? g.montoLibre,
    disenos: borrador.regalosDisenos ?? g.disenos,
    diseno: borrador.regalosDiseno !== undefined ? borrador.regalosDiseno : g.diseno,
    vigenciaDias: borrador.regalosVigenciaDias !== undefined ? borrador.regalosVigenciaDias : g.vigenciaDias,
    condiciones: borrador.regalosCondiciones !== undefined ? borrador.regalosCondiciones : g.condiciones,
  };
  const pedidos = borrador.pedidosWhatsapp ?? pedidosGuardado ?? false;
  // Vacío = todos (así lo guarda el backend).
  const ofrecidos: DisenoRegalo[] = r.disenos.filter(esDiseno).length ? r.disenos.filter(esDiseno) : [...DISENOS_REGALO];
  const porDefecto: DisenoRegalo = esDiseno(r.diseno) && ofrecidos.includes(r.diseno) ? r.diseno : ofrecidos[0];
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [errorMonto, setErrorMonto] = useState("");

  const alternarDiseno = (d: DisenoRegalo) => {
    const lista = ofrecidos.includes(d) ? ofrecidos.filter((x) => x !== d) : [...ofrecidos, d];
    if (!lista.length) return; // al menos uno
    // Todos elegidos se guarda como "todos" (vacío): si mañana hay uno nuevo, entra.
    const orden = DISENOS_REGALO.filter((x) => lista.includes(x));
    cambiar({
      regalosDisenos: orden.length === DISENOS_REGALO.length ? [] : orden,
      ...(r.diseno && !lista.includes(r.diseno as DisenoRegalo) ? { regalosDiseno: null } : {}),
    });
  };

  const agregarMonto = () => {
    const n = Math.round(Number(nuevoMonto.replace(",", ".")));
    if (!Number.isFinite(n) || n < MONTO_MIN || n > MONTO_MAX) {
      setErrorMonto(`Entre Bs ${MONTO_MIN} y Bs ${MONTO_MAX.toLocaleString("es-BO")}.`);
      return;
    }
    if (r.montos.length >= MAX_MONTOS) {
      setErrorMonto(`Hasta ${MAX_MONTOS} montos.`);
      return;
    }
    setErrorMonto("");
    setNuevoMonto("");
    cambiar({ regalosMontos: [...new Set([...r.montos, n])].sort((a, b) => a - b) });
  };

  return (
    <Seccion titulo="Pedidos y gift cards">
      {!conWhatsapp && (
        <p className="-mt-2 rounded-xl bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
          Agregá tu WhatsApp en «Redes y botones»: ahí te llegan los pedidos y las gift cards.
        </p>
      )}

      {conPedidos ? (
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={pedidos}
            onChange={(ev) => cambiar({ pedidosWhatsapp: ev.target.checked })}
          />
          <span>
            <strong className="block text-sm text-texto">Recibir pedidos por WhatsApp</strong>
            <span className="text-[13px] text-texto-3">
              Tus clientes suman productos del catálogo y te llega el pedido escrito, con el total.
            </span>
          </span>
        </label>
      ) : (
        // Sin el extra la página no muestra el carrito aunque el interruptor
        // esté prendido (lo decide el backend): no se ofrece un control que
        // no tendría efecto.
        <p className="text-[13px] text-texto-3">
          <strong className="text-texto">Pedidos por WhatsApp</strong>: tus clientes arman el pedido
          desde tu catálogo y te llega escrito, con el total. Es un extra: pedilo a BamarDev para
          activarlo.
        </p>
      )}

      {conGiftCards ? (
        <div className="space-y-4 border-t border-borde pt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={r.activo}
              onChange={(ev) => cambiar({ regalosActivo: ev.target.checked })}
            />
            <span>
              <strong className="block text-sm text-texto">Ofrecer gift cards en tu página</strong>
              <span className="text-[13px] text-texto-3">
                El cliente elige diseño y monto y te la pide por WhatsApp; la emitís en Gift cards con ese diseño y le mandás el
                enlace para reenviar.
              </span>
            </span>
          </label>

          {r.activo && (
            <>
              <Campo label="Montos sugeridos" hint={errorMonto || "Los que aparecen como botones (hasta 6)."}>
                <div className="flex flex-wrap items-center gap-2">
                  {r.montos.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1 rounded-full border border-borde bg-white px-3 py-1 text-sm">
                      Bs {m.toLocaleString("es-BO")}
                      <button
                        type="button"
                        aria-label={`Quitar Bs ${m}`}
                        onClick={() => cambiar({ regalosMontos: r.montos.filter((x) => x !== m) })}
                        className="text-texto-3 hover:text-danger-text"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <Input
                    aria-label="Nuevo monto"
                    inputMode="numeric"
                    placeholder="Ej.: 100"
                    value={nuevoMonto}
                    onChange={(ev) => setNuevoMonto(ev.target.value.replace(/[^\d.,]/g, ""))}
                    onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), agregarMonto())}
                    className="!w-28"
                  />
                  <button type="button" onClick={agregarMonto} className="rounded-lg border border-borde px-3 py-1.5 text-sm font-semibold">
                    Agregar
                  </button>
                </div>
              </Campo>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={r.montoLibre || r.montos.length === 0}
                  disabled={r.montos.length === 0}
                  onChange={(ev) => cambiar({ regalosMontoLibre: ev.target.checked })}
                />
                Aceptar otro monto (el cliente lo escribe)
              </label>

              <div>
                <div className="mb-1.5 text-[13px] font-semibold text-texto-2">
                  Diseños ({ofrecidos.length} de {DISENOS_REGALO.length})
                </div>
                <p className="mb-2 text-[13px] text-texto-3">
                  Con tu color y los motivos de tu rubro. Tocá para ofrecerlo o no; la estrella marca el que aparece primero.
                </p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Diseños de gift card">
                  {DISENOS_REGALO.map((d) => {
                    const on = ofrecidos.includes(d);
                    return (
                      <li key={d} className={`rounded-xl border p-2 ${on ? "border-primary" : "border-borde opacity-60"}`}>
                        <button
                          type="button"
                          onClick={() => alternarDiseno(d)}
                          aria-pressed={on}
                          aria-label={`${NOMBRE_DISENO[d].nombre}: ${on ? "ofrecido" : "no ofrecido"}`}
                          className="block w-full"
                        >
                          <TarjetaRegalo
                            datos={{ diseno: d, rubro, color, negocio, monto: r.montos[0] ?? 100, para: "Ana", de: "Luis", fotoUrl }}
                          />
                        </button>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-texto">{NOMBRE_DISENO[d].nombre}</span>
                          {on && (
                            <button
                              type="button"
                              onClick={() => cambiar({ regalosDiseno: d })}
                              aria-label={`Que ${NOMBRE_DISENO[d].nombre} aparezca primero`}
                              aria-pressed={porDefecto === d}
                              className={`text-base leading-none ${porDefecto === d ? "text-warning-text" : "text-texto-4"}`}
                            >
                              ★
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Vigencia (días)" hint="Vacío = no vence. Se informa al cliente.">
                  <Input
                    aria-label="Vigencia en días"
                    inputMode="numeric"
                    value={r.vigenciaDias ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value.replace(/\D/g, "");
                      cambiar({ regalosVigenciaDias: v ? Math.min(730, Number(v)) : null });
                    }}
                    placeholder="Ej.: 180"
                  />
                </Campo>
                <Campo label="Condiciones (opcional)" hint={`${(r.condiciones ?? "").length} de 300`}>
                  <Input
                    aria-label="Condiciones"
                    maxLength={300}
                    value={r.condiciones ?? ""}
                    onChange={(ev) => cambiar({ regalosCondiciones: ev.target.value || null })}
                    placeholder="Ej.: no incluye productos de venta"
                  />
                </Campo>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="border-t border-borde pt-3 text-[13px] text-texto-3">
          Las gift cards son parte del módulo de Gift cards: pedilo a BamarDev para ofrecerlas en tu página.
        </p>
      )}
    </Seccion>
  );
}
