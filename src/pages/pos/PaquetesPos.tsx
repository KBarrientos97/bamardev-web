import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { Input } from "../../components/ui";
import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { lineasConPaquete } from "../../lib/agenda/spa";
import type { CarritoCita, ClienteFicha } from "../../lib/agenda/tiposAgenda";
import { fmtFecha } from "../../lib/format";

/**
 * Las piezas del POS para los paquetes de sesiones (agenda fase 3):
 *
 *  · al cobrar una cita, qué servicios se pagan con una sesión del paquete
 *    del cliente (van a precio 0 y no entran al carrito), con la opción de
 *    cobrarlos igual y, si no queda nada que cobrar, de cerrar la cita sin
 *    pagos;
 *  · al vender un paquete, a qué cliente se le guardan las sesiones.
 */

export function SesionesDePaquete({
  cita,
  carritoVacio,
  procesando,
  onCobrarSinPaquete,
  onCompletar,
}: {
  cita: CarritoCita;
  carritoVacio: boolean;
  procesando: boolean;
  onCobrarSinPaquete: () => void;
  onCompletar: () => void;
}) {
  const cubiertas = lineasConPaquete(cita);
  if (!cubiertas.length) return null;
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary-50 px-3.5 py-2.5 text-primary-700">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Icon name="package" size={17} />
        Se descuentan del paquete
      </p>
      <ul className="space-y-0.5 text-[13px]">
        {cubiertas.map((l, i) => (
          <li key={i}>
            {l.descripcion}
            {l.recurso ? ` · ${l.recurso}` : ""} — {l.paquete!.nombre}, le quedan {l.paquete!.restantes} (vence el{" "}
            {fmtFecha(`${l.paquete!.ultimoDia}T12:00:00`)})
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {carritoVacio && (
          <button
            type="button"
            onClick={onCompletar}
            disabled={procesando}
            className="rounded-lg bg-primary-boton px-3 py-1.5 text-[13px] font-bold text-white hover:bg-primary-boton-hover disabled:opacity-50"
          >
            {procesando ? "Registrando…" : "Completar con el paquete"}
          </button>
        )}
        <button
          type="button"
          onClick={onCobrarSinPaquete}
          disabled={procesando}
          className="rounded-lg bg-white/80 px-3 py-1.5 text-[13px] font-semibold hover:bg-white disabled:opacity-50"
        >
          Cobrar sin usar el paquete
        </button>
      </div>
    </div>
  );
}

/** A quién se le vende el paquete: busca la ficha por nombre o teléfono. */
export function ClientePaquete({
  cliente,
  onElegir,
}: {
  cliente: { id: number; nombre: string } | null;
  onElegir: (c: { id: number; nombre: string } | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [opciones, setOpciones] = useState<ClienteFicha[]>([]);

  useEffect(() => {
    const q = texto.trim();
    if (cliente || q.length < 2) {
      setOpciones([]);
      return;
    }
    let vigente = true;
    const t = window.setTimeout(() => {
      apiAgenda
        .buscarClientes(q)
        .then((r) => vigente && setOpciones(r.slice(0, 6)))
        .catch(() => vigente && setOpciones([]));
    }, 300);
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [texto, cliente]);

  return (
    <div className="space-y-2 rounded-xl border border-borde bg-white px-3.5 py-2.5">
      <p className="flex items-center gap-2 text-sm font-bold text-texto">
        <Icon name="package" size={17} />
        El paquete queda a nombre de
      </p>
      {cliente ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-semibold text-texto">{cliente.nombre}</span>
          <button
            type="button"
            onClick={() => onElegir(null)}
            className="rounded-lg px-2 py-1 text-[13px] font-semibold text-texto-3 hover:bg-muted"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar cliente por nombre o teléfono"
            aria-label="Cliente del paquete"
          />
          {opciones.length > 0 && (
            <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
              {opciones.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onElegir({ id: c.id, nombre: c.nombre })}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {c.nombre}
                    {c.telefono ? <span className="text-texto-3"> · {c.telefono}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-texto-3">Sin cliente no se puede vender: las sesiones quedan en su ficha.</p>
        </>
      )}
    </div>
  );
}
