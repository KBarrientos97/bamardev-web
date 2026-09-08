import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import type { Comanda, Mesa } from "../../types/salon";
import {
  cantidadItems,
  consumoDeMesa,
  estaOcupada,
  hace,
  itemsVivos,
  porPersona,
  subtotalItem,
} from "./logicaSalon";
import { pieDeMesa, type AccionMesa } from "./pieDeMesa";

/**
 * Todo lo de una mesa, en una hoja sobre el salón.
 *
 * Se abre tocando la mesa y responde, en este orden, lo que el mesero necesita
 * saber parado al lado del cliente: cuánto va, qué pidieron, qué falta traer y
 * qué puede hacer ahora.
 *
 * El pie cambia según el estado (ver `pieDeMesa`): en cada momento hay una
 * acción obvia y el resto pasa a segundo plano.
 */
export default function DetalleMesa({
  mesa,
  onCerrar,
  onCambio,
  onAgregarPedido,
  onAbrirMesa,
}: {
  mesa: Mesa;
  onCerrar: () => void;
  /** La mesa que devolvió el backend, ya actualizada. */
  onCambio: (mesa: Mesa, mensaje: string) => void;
  onAgregarPedido: (mesa: Mesa) => void;
  onAbrirMesa: (mesa: Mesa) => void;
}) {
  /**
   * Guard del doble toque: mientras hay una acción en curso, las demás se
   * ignoran. Un doble toque en "Pedir la cuenta" es una mesa mandada dos veces
   * a caja.
   */
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const consumo = consumoDeMesa(mesa);
  const items = cantidadItems(mesa);
  const ocupada = estaOcupada(mesa);
  const pie = pieDeMesa(mesa, fmtMoney);

  async function ejecutar(accion: AccionMesa) {
    if (procesando) return;

    if (accion === "agregar") return onAgregarPedido(mesa);
    if (accion === "abrir") return onAbrirMesa(mesa);
    // Las reservas se manejan en su propia hoja; todavía no está.
    if (accion === "reserva_cambiar" || accion === "reserva_anular") return;

    setError("");
    setProcesando(true);
    try {
      if (accion === "cuenta") {
        const m = await api.pedirCuentaMesa(mesa.id);
        onCambio(m, "Cuenta enviada a caja");
      } else if (accion === "liberar") {
        const m = await api.liberarMesa(mesa.id);
        onCambio(m, `${mesa.codigo} liberada`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción");
    } finally {
      setProcesando(false);
    }
  }

  async function marcarServida(comanda: Comanda) {
    if (procesando) return;
    setError("");
    setProcesando(true);
    try {
      const m = await api.marcarComandaServida(mesa.id, Number(comanda.id));
      onCambio(m, "Marcado como servido");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-borde-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold text-texto">{mesa.nombre}</h2>
            <p className="truncate text-xs text-texto-3">
              {ocupada && mesa.abiertaEn
                ? `${mesa.zonaNombre} · abierta hace ${hace(mesa.abiertaEn)}`
                : `${mesa.zonaNombre} · ${mesa.capacidadTotal || mesa.capacidad} lugares`}
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-texto-3 hover:bg-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-fondo px-4 py-3">
          {/* Hero del consumo: es lo primero que se pregunta el mesero. */}
          {ocupada && (
            <div className="rounded-2xl bg-slate-800 p-4 text-white">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                Consumo de la mesa
              </p>
              <p className="mt-1 text-3xl font-extrabold">{fmtMoney(consumo)}</p>
              <p className="mt-1 text-xs text-white/90">
                {mesa.comensales} {mesa.comensales === 1 ? "persona" : "personas"} · {items}{" "}
                {items === 1 ? "ítem" : "ítems"} · {fmtMoney(porPersona(mesa))} por persona
              </p>
            </div>
          )}

          {mesa.referencia && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#93C5FD] bg-[#EFF6FF] px-3.5 py-2.5 text-[13px] text-[#2563EB]">
              <Icon name="user" size={16} />
              <span>{mesa.referencia}</span>
            </div>
          )}

          {ocupada && (
            <>
              <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-texto-3">
                Pedidos de la mesa
              </p>
              {(mesa.comandas ?? []).length === 0 ? (
                <div className="rounded-xl border border-borde bg-white py-8 text-center text-[13px] text-texto-3">
                  Todavía no pidieron nada.
                </div>
              ) : (
                (mesa.comandas ?? []).map((c) => (
                  <TarjetaComanda
                    key={c.id}
                    comanda={c}
                    procesando={procesando}
                    onServida={() => marcarServida(c)}
                  />
                ))
              )}
            </>
          )}

          {error && (
            <div className="mt-3">
              <ErrorMsg>{error}</ErrorMsg>
            </div>
          )}
        </div>

        <div className="border-t border-borde bg-white p-4">
          {/* El banner explica por qué el botón de abajo está apagado: separado
              se vuelve un dato suelto más. */}
          {pie.banner && (
            <p className="mb-2 flex items-start gap-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
              <Icon name="info" size={15} />
              <span>{pie.banner}</span>
            </p>
          )}
          <Boton
            onClick={() => ejecutar(pie.principal.accion)}
            disabled={procesando || pie.principal.deshabilitado}
            className="w-full py-3 text-base"
          >
            {pie.principal.texto}
          </Boton>
          {pie.secundario && (
            <Boton
              variante="ghost"
              onClick={() => ejecutar(pie.secundario!.accion)}
              disabled={procesando || pie.secundario.deshabilitado}
              className={`mt-2 w-full ${pie.secundario.deshabilitado ? "opacity-40" : ""}`}
            >
              {pie.secundario.texto}
            </Boton>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Una comanda: la tanda que salió junta a cocina.
 *
 * Se agrupan por comanda y no en una lista corrida de productos porque así es
 * como vuelven: el mesero levanta del pase lo que salió junto, y una lista
 * plana lo obligaría a reconstruir de memoria qué iba con qué.
 */
function TarjetaComanda({
  comanda,
  procesando,
  onServida,
}: {
  comanda: Comanda;
  procesando: boolean;
  onServida: () => void;
}) {
  const vivos = itemsVivos(comanda);
  const anulados = comanda.anulados ?? [];
  const servida = comanda.estado === "SERVIDA";
  const vacia = vivos.length === 0;

  return (
    <div className="mb-2 rounded-xl border border-borde bg-white p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-texto-3">{comanda.codigo ?? `#${comanda.id}`}</span>
        <span className="min-w-0 flex-1 truncate text-texto-3">
          hace {hace(comanda.enviadaEn)}
        </span>
        <Badge estado={vacia ? "ANULADA" : servida ? "SERVIDA" : "PENDIENTE"} />
      </div>

      <div className="mt-2 space-y-1.5">
        {vivos.map((i) => (
          <div key={i.id} className="flex items-start gap-2 text-[13px]">
            {/* La cantidad va en un cuadradito y no pegada al nombre: el mesero
                cuenta los platos del pase contra esta columna, y alineados
                verticalmente se cuentan de un vistazo. */}
            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-texto">
              {fmtNum(i.cantidad)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-texto">{i.nombre}</p>
              {/* La indicación para cocina, en ámbar: es lo que hay que revisar
                  antes de llevar el plato a la mesa. */}
              {i.nota && <p className="text-[11px] text-[#D97706]">{i.nota}</p>}
            </div>
            <span className="shrink-0 font-bold text-texto">{fmtMoney(subtotalItem(i))}</span>
          </div>
        ))}

        {/* Lo anulado se muestra tachado, no se borra: sin esto, sacar el único
            producto dejaba una tarjeta vacía y parecía un error de la app. */}
        {anulados.map((i) => (
          <div key={i.id} className="flex items-start gap-2 text-[13px] text-texto-4">
            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs line-through">
              {fmtNum(i.cantidad)}
            </span>
            <p className="min-w-0 flex-1 truncate line-through">{i.nombre}</p>
            <span className="shrink-0 line-through">{fmtMoney(subtotalItem(i))}</span>
          </div>
        ))}
      </div>

      {/* "Ya lo llevé" es el único botón que el mesero toca sin mirar, así que
          va ancho y al final de la comanda a la que pertenece — no en una barra
          general, donde habría que elegir a cuál se refiere. */}
      {!servida && !vacia && (
        <Boton
          onClick={onServida}
          disabled={procesando}
          className="mt-2.5 w-full py-2 text-[13px]"
        >
          Ya lo llevé a la mesa
        </Boton>
      )}
    </div>
  );
}

function Badge({ estado }: { estado: "PENDIENTE" | "SERVIDA" | "ANULADA" }) {
  const estilo = {
    // Decir "En cocina" de algo que ya no tiene nada es peor que no decir nada:
    // el mesero se queda esperando un plato que nadie va a preparar.
    ANULADA: { texto: "Anulado", clase: "bg-[#FEF2F2] text-[#DC2626]" },
    SERVIDA: { texto: "Servido", clase: "bg-muted text-texto-3" },
    PENDIENTE: { texto: "En cocina", clase: "bg-[#FFFBEB] text-[#D97706]" },
  }[estado];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${estilo.clase}`}>
      {estilo.texto}
    </span>
  );
}
