import { useState } from "react";
import { fmtHora, fmtMoney } from "../../lib/format";
import { descartar, useColaOffline } from "../../lib/offline/cola";
import { ventaSinInternet } from "../../lib/offline/modo";
import type { Venta } from "../../types";
import { Icon } from "../Icon";
import { Badge, Confirmar } from "../ui";

/**
 * Las ventas cobradas sin internet en "Ventas del turno" (PLAN-IOS F3), arriba
 * de las del servidor, como en Android (`HistorialDia`): cada una con
 * "Sin subir" y su ticket local. Una rechazada dice por qué y se puede sacar
 * de la lista después de cargarla a mano.
 *
 * Fuera de la app instalada del iPhone no dibuja nada.
 */
export default function VentasSinSubir({ onVerTicket }: { onVerTicket: (v: Venta) => void }) {
  const cola = useColaOffline();
  const [sacando, setSacando] = useState<string | null>(null);
  if (!ventaSinInternet() || cola.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-texto-4">
        Cobradas sin internet ({cola.length})
      </h2>
      <ul className="space-y-2">
        {cola.map((v) => {
          const rechazada = v.estado === "RECHAZADA";
          return (
            <li key={v.id} className="card p-3.5">
              <button
                type="button"
                onClick={() => onVerTicket(v.recibo)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    rechazada ? "bg-danger-bg text-danger-text" : "bg-warning-bg text-warning-text"
                  }`}
                >
                  <Icon name={rechazada ? "alert" : "clock"} size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-texto">Sin sincronizar</span>
                    {rechazada ? (
                      <Badge tono="rojo">No se pudo subir</Badge>
                    ) : (
                      <Badge tono="amarillo">Sin subir</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-texto-3">
                    {fmtHora(v.cuerpo.fechaCliente)} · {v.recibo.detalles?.length ?? 0}{" "}
                    {(v.recibo.detalles?.length ?? 0) === 1 ? "artículo" : "artículos"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-texto">{fmtMoney(v.recibo.total)}</span>
              </button>
              {rechazada && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-borde-soft pt-2 text-xs">
                  <p className="min-w-0 flex-1 text-danger-text">
                    {v.ultimoError ?? "El servidor no la aceptó."} Volvé a cargarla a mano.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSacando(v.id)}
                    className="rounded-lg border border-borde px-2.5 py-1 font-semibold text-texto-2 hover:bg-muted"
                  >
                    Ya la cargué
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Confirmar
        abierto={sacando !== null}
        titulo="¿Sacarla de la lista?"
        texto="Hacelo sólo si ya la volviste a cargar como una venta nueva: después no se puede recuperar."
        etiquetaOk="Sacar"
        onCancel={() => setSacando(null)}
        onOk={() => {
          const id = sacando;
          setSacando(null);
          if (id) void descartar(id);
        }}
      />
    </section>
  );
}
