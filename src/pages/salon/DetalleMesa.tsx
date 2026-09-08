import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import type { Comanda, ItemComanda, Mesa } from "../../types/salon";
import { AnularItem, ElegirMesa, Reserva } from "./AccionesMesa";
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
  mesasDelSalon,
  onCerrar,
  onCambio,
  onAgregarPedido,
  onAbrirMesa,
}: {
  mesa: Mesa;
  /** Todo el salón: hace falta para elegir a qué mesa pasar o juntar. */
  mesasDelSalon: Mesa[];
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
  const [menu, setMenu] = useState(false);
  /** Modo "quitar producto": un tacho por línea. Ver el comentario del menú. */
  const [quitando, setQuitando] = useState(false);
  const [elegir, setElegir] = useState<"pasar" | "juntar" | null>(null);
  const [reservando, setReservando] = useState(false);
  const [anular, setAnular] = useState<{ comanda: Comanda; item: ItemComanda } | null>(
    null,
  );

  const consumo = consumoDeMesa(mesa);
  const items = cantidadItems(mesa);
  const ocupada = estaOcupada(mesa);
  const pie = pieDeMesa(mesa, fmtMoney);

  async function ejecutar(accion: AccionMesa) {
    if (procesando) return;

    if (accion === "agregar") return onAgregarPedido(mesa);
    if (accion === "abrir") return onAbrirMesa(mesa);
    if (accion === "reserva_cambiar") return setReservando(true);
    if (accion === "reserva_anular")
      return conMesa(() => api.quitarReservaMesa(mesa.id), "Reserva anulada");

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

  async function conMesa(fn: () => Promise<Mesa>, mensaje: string) {
    if (procesando) return;
    setError("");
    setProcesando(true);
    try {
      onCambio(await fn(), mensaje);
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
          {/* El menú va con fondo de botón y no tres puntos sueltos: perdido
              entre el título nadie lo encontraba. */}
          {ocupada && (
            <button
              onClick={() => setMenu((v) => !v)}
              aria-label="Más acciones"
              className="shrink-0 rounded-lg border border-borde p-2 text-texto-2 hover:bg-muted"
            >
              <Icon name="settings" size={16} />
            </button>
          )}
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-texto-3 hover:bg-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Se despliega acá adentro y no en un popup del sistema: son acciones
            que cambian plata de lugar y conviene que se vean sobre la mesa que
            las va a sufrir, no flotando en una esquina. */}
        {menu && (
          <div className="border-b border-borde-soft bg-muted">
            <OpcionMenu icono="swap" onClick={() => { setMenu(false); setElegir("pasar"); }}>
              Pasar a otra mesa
            </OpcionMenu>
            <OpcionMenu icono="plus" onClick={() => { setMenu(false); setElegir("juntar"); }}>
              Juntar con otra mesa
            </OpcionMenu>
            <OpcionMenu icono="trash" onClick={() => { setMenu(false); setQuitando(true); }}>
              Quitar un producto
            </OpcionMenu>
          </div>
        )}

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

          {quitando && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
              <Icon name="alert" size={15} />
              <span>
                Tocá el ícono rojo del producto que querés quitar. Si ya está en cocina,
                avisales.
              </span>
            </p>
          )}

          {mesa.reserva && (
            <div className="mt-3 rounded-xl border border-[#93C5FD] bg-[#EFF6FF] p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-bold text-[#2563EB]">
                <Icon name="clock" size={14} />
                {mesa.reserva.hora}
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-texto">
                {mesa.reserva.nombre}
              </p>
              <p className="text-xs text-texto-3">
                {[
                  mesa.reserva.personas
                    ? `${mesa.reserva.personas} ${mesa.reserva.personas === 1 ? "persona" : "personas"}`
                    : "",
                  mesa.reserva.telefono ?? "",
                  mesa.reserva.nota ?? "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {/* Reclamar una reserva casi siempre termina en una llamada. */}
              {mesa.reserva.telefono && (
                <a
                  href={`tel:${mesa.reserva.telefono}`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-1.5 text-[13px] font-semibold text-texto-2"
                >
                  <Icon name="phone" size={13} />
                  Llamar
                </a>
              )}
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
                    quitando={quitando}
                    onServida={() => marcarServida(c)}
                    onQuitar={(item) => setAnular({ comanda: c, item })}
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
          {pie.terciario && (
            <Boton
              variante="ghost"
              onClick={() => ejecutar(pie.terciario!.accion)}
              disabled={procesando}
              className="mt-1 w-full text-[#DC2626]"
            >
              {pie.terciario.texto}
            </Boton>
          )}
        </div>
      </div>

      {elegir && (
        <ElegirMesa
          modo={elegir}
          mesa={mesa}
          mesas={mesasDelSalon}
          procesando={procesando}
          onCerrar={() => setElegir(null)}
          onElegir={(otra) => {
            setElegir(null);
            if (elegir === "pasar")
              conMesa(
                () => api.transferirMesa(mesa.id, otra.id),
                `Consumo pasado a ${otra.codigo}`,
              );
            else
              conMesa(
                () => api.juntarMesa(mesa.id, otra.id),
                `${otra.codigo} juntada con esta`,
              );
          }}
        />
      )}

      {reservando && (
        <Reserva
          mesa={mesa}
          procesando={procesando}
          onCerrar={() => setReservando(false)}
          onGuardar={(r) => {
            setReservando(false);
            conMesa(() => api.reservarMesa(mesa.id, r), "Reserva guardada");
          }}
        />
      )}

      {anular && (
        <AnularItem
          item={anular.item}
          enCocina={anular.comanda.estado !== "SERVIDA"}
          procesando={procesando}
          onCerrar={() => setAnular(null)}
          onConfirmar={(motivo) => {
            const { comanda, item } = anular;
            setAnular(null);
            conMesa(
              () =>
                api.anularItemComanda(
                  mesa.id,
                  Number(comanda.id),
                  Number(item.id),
                  { motivo },
                ),
              `${item.nombre} quitado de la cuenta`,
            );
          }}
        />
      )}
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
  quitando,
  onServida,
  onQuitar,
}: {
  comanda: Comanda;
  procesando: boolean;
  /** Modo "quitar producto": aparece un tacho por línea. */
  quitando: boolean;
  onServida: () => void;
  onQuitar: (item: ItemComanda) => void;
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
            {/* Es un modo y no un botón por producto porque quitar es raro:
                un tacho al lado de cada línea todo el tiempo invita a tocarlo
                sin querer justo en la lista que más se toca del turno. */}
            {quitando && (
              <button
                onClick={() => onQuitar(i)}
                disabled={procesando}
                aria-label={`Quitar ${i.nombre}`}
                className="shrink-0 rounded-lg border border-[#FCA5A5] p-1.5 text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-40"
              >
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        ))}

        {/* Lo anulado se muestra tachado, no se borra: sin esto, sacar el único
            producto dejaba una tarjeta vacía y parecía un error de la app. */}
        {anulados.map((i) => (
          <div key={i.id} className="flex items-start gap-2 text-[13px] text-texto-4">
            <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs line-through">
              {fmtNum(i.cantidad)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate line-through">{i.nombre}</p>
              {/* El motivo ocupa el lugar de la nota: es lo que el dueño va a
                  querer leer después, y lo que el mesero le explica al
                  cliente. */}
              {i.motivo && <p className="text-[11px]">Anulado · {i.motivo}</p>}
            </div>
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

/** Una fila del menú de acciones de la mesa. */
function OpcionMenu({
  icono,
  onClick,
  children,
}: {
  icono: "swap" | "plus" | "trash";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-texto hover:bg-white"
    >
      <Icon name={icono} size={17} />
      {children}
    </button>
  );
}
