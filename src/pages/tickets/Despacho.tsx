import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { apiTickets } from "../../lib/apiTickets";
import { fmtCantidad } from "../../lib/format";
import { numeroTicket } from "../../lib/tickets/llamado";
import type { ItemTicket, TicketPedido } from "../../types/tickets";
import { cronometro, demora, listos as soloListos, preparando as soloPreparando, useTableroTickets } from "./useTableroTickets";

/**
 * Despacho: quien entrega los pedidos que salen de la cocina.
 *
 * Cada pedido cobrado en caja aparece solo, con su número grande, el
 * cronómetro y lo que hay que armar separado en "en mesa" y "para llevar",
 * con las notas resaltadas. Un toque en "Listo · llamar" y la TV lo llama con
 * voz; cuando el cliente se lo lleva, "Entregado". El teclado de la derecha
 * llama por número sin buscar la tarjeta (en una PC, también con el teclado
 * físico: los números, Enter y Borrar).
 *
 * Oscura a propósito: queda todo el día prendida al lado de la cocina, y lo
 * único que tiene que saltar a la vista son los números y lo atrasado.
 */
type Filtro = "todos" | "preparando" | "listos";

export default function Despacho({
  onSalir,
}: {
  /**
   * El acceso de despacho (la tablet de la cocina) no tiene menú: sale desde
   * acá. Pide confirmar, porque volver a entrar es tipear la contraseña.
   */
  onSalir?: () => void;
} = {}) {
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  const { datos, error, desfase, aplicar, recargar } = useTableroTickets();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aviso, setAviso] = useState<{ texto: string; tono: "ok" | "error"; deshacer?: () => void } | null>(null);
  const ahora = useAhoraCadaSegundo() + desfase;

  // El aviso se va solo: el de "entregado" deja unos segundos para deshacer.
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), aviso.deshacer ? 7000 : 4000);
    return () => clearTimeout(id);
  }, [aviso]);

  const correr = useCallback(
    async (accion: () => Promise<TicketPedido>, exito: (t: TicketPedido) => typeof aviso) => {
      try {
        const t = await aplicar(accion);
        setAviso(exito(t));
        return true;
      } catch (e) {
        setAviso({ texto: e instanceof Error ? e.message : "No se pudo hacer", tono: "error" });
        return false;
      }
    },
    [aplicar],
  );

  const llamar = (t: TicketPedido) =>
    correr(
      () => (t.estado === "PREPARANDO" ? apiTickets.listo(t.id) : apiTickets.llamar(t.id)),
      (r) => ({ texto: `${numeroTicket(r.numero)} llamado en la pantalla`, tono: "ok" }),
    );
  const entregar = (t: TicketPedido) =>
    correr(
      () => apiTickets.entregar(t.id),
      (r) => ({
        texto: `${numeroTicket(r.numero)} entregado`,
        tono: "ok",
        deshacer: () =>
          void correr(
            () => apiTickets.reabrir(r.id),
            (x) => ({ texto: `${numeroTicket(x.numero)} volvió a listos`, tono: "ok" }),
          ),
      }),
    );
  const llamarNumero = (n: number) =>
    correr(
      () => apiTickets.llamarNumero(n),
      (r) => ({ texto: `${numeroTicket(r.numero)} llamado en la pantalla`, tono: "ok" }),
    );

  const tickets = datos?.tickets ?? [];
  const enCocina = soloPreparando(tickets);
  const paraEntregar = soloListos(tickets);
  const visibles =
    filtro === "preparando" ? enCocina : filtro === "listos" ? paraEntregar : [...enCocina, ...paraEntregar];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0F1A15] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-[#FFC800] sm:text-2xl">
            <Icon name="fuego" size={24} />
            Despacho · pedidos
          </h1>
          <p className="mt-0.5 text-[13px] text-white/60">
            {error && !datos ? (
              "Sin conexión con el servidor"
            ) : (
              <>
                {enCocina.length} en preparación · {paraEntregar.length} listos por entregar
                {error && <span className="text-amber-300"> · sin conexión, se reintenta solo</span>}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white/5 p-1 text-[13px] font-semibold">
            {(
              [
                ["todos", "Todos"],
                ["preparando", `Preparando ${enCocina.length}`],
                ["listos", `Listos ${paraEntregar.length}`],
              ] as [Filtro, string][]
            ).map(([f, texto]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  filtro === f ? "bg-emerald-500 text-[#06281D]" : "text-white/70 hover:text-white"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
          <BotonPantallaCompleta />
          {onSalir &&
            (confirmandoSalir ? (
              <span className="flex items-center gap-1.5 rounded-xl border border-white/15 p-1 text-[13px] font-semibold">
                <span className="px-2 text-white/80">¿Salir?</span>
                <button
                  type="button"
                  onClick={onSalir}
                  className="rounded-lg bg-red-500/90 px-3 py-1.5 text-white hover:bg-red-500"
                >
                  Sí, salir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoSalir(false)}
                  className="rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoSalir(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[13px] font-semibold text-white/85 hover:bg-white/10"
              >
                <Icon name="logout" size={16} />
                Salir
              </button>
            ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {!datos ? (
            <p className="py-16 text-center text-white/60">{error || "Cargando los pedidos…"}</p>
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-white/60">
              <Icon name="ticket" size={44} strokeWidth={1.6} />
              <p className="mt-3 text-lg font-semibold">Sin pedidos por despachar</p>
              <p className="mt-1 text-sm">Lo que se cobra en caja aparece acá solo.</p>
            </div>
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))] sm:gap-4">
              {visibles.map((t) => (
                <TarjetaPedido key={t.id} t={t} ahora={ahora} onLlamar={() => llamar(t)} onEntregar={() => entregar(t)} />
              ))}
            </div>
          )}
        </div>
        <aside className="shrink-0 border-t border-white/10 p-3 sm:p-4 lg:w-[300px] lg:border-l lg:border-t-0">
          <TecladoLlamar onLlamar={llamarNumero} />
        </aside>
      </div>

      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div
            role="status"
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-2xl ${
              aviso.tono === "ok" ? "bg-emerald-500 text-[#06281D]" : "bg-red-600 text-white"
            }`}
          >
            <Icon name={aviso.tono === "ok" ? "check" : "alert"} size={18} />
            {aviso.texto}
            {aviso.deshacer && (
              <button
                type="button"
                onClick={() => {
                  const d = aviso.deshacer;
                  setAviso(null);
                  d?.();
                }}
                className="rounded-lg bg-black/15 px-2.5 py-1 underline-offset-2 hover:underline"
              >
                Deshacer
              </button>
            )}
          </div>
        </div>
      )}
      {/* Recargar a mano no hace falta (se refresca solo), pero si el wifi
          volvió y el equipo no se enteró, un toque lo trae. */}
      {error && datos && (
        <button type="button" onClick={() => void recargar()} className="sr-only">
          Reintentar
        </button>
      )}
    </div>
  );
}

const CAJA_DEMORA = {
  normal: "border-white/10",
  tarde: "border-amber-400",
  muy_tarde: "border-red-500",
} as const;
const CABEZA_DEMORA = {
  normal: "bg-white/5",
  tarde: "bg-amber-900/40",
  muy_tarde: "bg-red-900/50",
} as const;

function TarjetaPedido({
  t,
  ahora,
  onLlamar,
  onEntregar,
}: {
  t: TicketPedido;
  ahora: number;
  onLlamar: () => Promise<boolean>;
  onEntregar: () => Promise<boolean>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const listo = t.estado === "LISTO";
  const minutos = Math.floor((ahora - Date.parse(t.creadoEn)) / 60_000);
  const d = listo ? "normal" : demora(minutos);
  const enMesa = t.items.filter((i) => i.consumo === "MESA");
  const llevar = t.items.filter((i) => i.consumo !== "MESA");

  // Un toque = una acción: mientras va al servidor el botón no admite otro.
  const una = (fn: () => Promise<boolean>) => async () => {
    if (ocupado) return;
    setOcupado(true);
    await fn();
    setOcupado(false);
  };

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-[#16241D] ${listo ? "border-emerald-500/50" : CAJA_DEMORA[d]}`}
    >
      <div className={`flex items-center justify-between px-4 py-2.5 ${listo ? "bg-emerald-900/40" : CABEZA_DEMORA[d]}`}>
        <span className="font-mono text-[40px] font-black leading-none tabular-nums text-[#FFC800]">
          {numeroTicket(t.numero)}
        </span>
        {listo ? (
          <span className="text-lg font-extrabold tracking-widest text-emerald-300">LISTO</span>
        ) : (
          <span className={`font-mono text-2xl font-bold tabular-nums ${d === "normal" ? "text-white/85" : d === "tarde" ? "text-amber-300" : "text-red-300"}`}>
            {cronometro(t.creadoEn, ahora)}
          </span>
        )}
      </div>
      <div className="flex-1 space-y-2 px-4 py-3">
        {enMesa.length > 0 && <GrupoItems tipo="MESA" items={enMesa} />}
        {llevar.length > 0 && <GrupoItems tipo="LLEVAR" items={llevar} />}
      </div>
      <div className="flex gap-2 px-3 pb-3">
        {listo ? (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={una(onLlamar)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-2 py-3 text-[15px] font-bold text-white transition hover:bg-white/15 active:scale-[0.98] disabled:opacity-60"
            >
              <Icon name="volumen" size={17} />
              Llamar otra vez
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={una(onEntregar)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-2 py-3 text-[15px] font-extrabold text-[#06281D] transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60"
            >
              <Icon name="check" size={17} strokeWidth={2.6} />
              Entregado
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={ocupado}
            onClick={una(onLlamar)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-lg font-extrabold tracking-wide text-[#06281D] transition hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60"
          >
            <Icon name="bell" size={19} strokeWidth={2.4} />
            LISTO · LLAMAR
          </button>
        )}
      </div>
    </article>
  );
}

function GrupoItems({ tipo, items }: { tipo: "MESA" | "LLEVAR"; items: ItemTicket[] }) {
  return (
    <div>
      <span
        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-extrabold tracking-[0.12em] ${
          tipo === "MESA" ? "border border-emerald-400 text-emerald-300" : "bg-[#FFC800] text-[#1A1A1A]"
        }`}
      >
        {tipo === "MESA" ? "EN MESA" : "PARA LLEVAR"}
      </span>
      <ul className="mt-1.5 space-y-1">
        {items.map((i, k) => (
          <li key={k}>
            <p className="flex gap-2.5 text-[19px] leading-snug">
              <span className="w-9 shrink-0 font-mono font-black text-white/90">{fmtCantidad(i.cantidad)}×</span>
              <span className="min-w-0 font-semibold">{i.producto}</span>
            </p>
            {i.nota && (
              <span className="ml-11 mt-0.5 inline-block rounded-md bg-[#FFC800] px-2 py-0.5 text-[15px] font-bold text-[#1A1A1A]">
                {i.nota}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * El teclado de despacho: el número del ticket y "Llamar en pantalla". Si se
 * preparaba, queda listo; si ya estaba listo, lo vuelve a llamar. En una PC
 * también anda con el teclado físico (fuera de cualquier campo de texto).
 */
function TecladoLlamar({ onLlamar }: { onLlamar: (n: number) => Promise<boolean> }) {
  const [digitos, setDigitosEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  // Lo escrito vive también en una ref: "72⏎" tecleado de corrido llega antes
  // de que la pantalla se vuelva a dibujar, y el Enter leía el número de antes
  // (vacío) y no llamaba a nadie.
  const escrito = useRef("");
  const enVuelo = useRef(false);
  const setDigitos = useCallback((d: string) => {
    escrito.current = d;
    setDigitosEstado(d);
  }, []);

  const enviar = useCallback(async () => {
    const n = Number(escrito.current);
    if (!n || enVuelo.current) return;
    enVuelo.current = true;
    setOcupado(true);
    const ok = await onLlamar(n);
    enVuelo.current = false;
    setOcupado(false);
    if (ok) setDigitos("");
  }, [onLlamar, setDigitos]);

  const tecla = useCallback(
    (k: string) => {
      const d = escrito.current;
      if (k === "C") return setDigitos("");
      if (k === "⌫") return setDigitos(d.slice(0, -1));
      if (d.length < 6) setDigitos(d + k);
    },
    [setDigitos],
  );

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") tecla("⌫");
      else if (e.key === "Escape") tecla("C");
      else if (e.key === "Enter") void enviar();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [tecla, enviar]);

  const visor = digitos ? digitos.padStart(4, "0") : "";
  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-[#16241D] p-4">
      <p className="text-[12px] font-bold tracking-[0.14em] text-white/60">LLAMAR UN NÚMERO</p>
      <div className="mt-3 flex h-20 items-center justify-center rounded-xl bg-black/40 font-mono text-5xl font-black tracking-[0.2em] text-[#FFC800]">
        {visor || <span className="tracking-[0.35em] text-[#FFC800]/70">----</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => tecla(k)}
            aria-label={k === "⌫" ? "Borrar" : k === "C" ? "Limpiar" : k}
            className={`flex h-14 items-center justify-center rounded-xl text-2xl font-bold transition active:scale-95 ${
              k === "C" || k === "⌫" ? "bg-white/5 text-white/70 hover:bg-white/10" : "bg-white/10 hover:bg-white/15"
            }`}
          >
            {k === "⌫" ? <Icon name="borrar" size={24} /> : k}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!digitos || ocupado}
        onClick={() => void enviar()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC800] py-3.5 text-lg font-extrabold text-[#1A1A1A] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
      >
        <Icon name="bell" size={19} strokeWidth={2.4} />
        {ocupado ? "Llamando…" : "Llamar en pantalla"}
      </button>
      <p className="mt-2 text-[12px] leading-snug text-white/55">
        Escribí el número del ticket y tocá «Llamar». Suena y aparece en la TV.
      </p>
    </div>
  );
}

/** Pantalla completa: en la tablet de despacho, sin la barra del navegador. */
function BotonPantallaCompleta() {
  const [activa, setActiva] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const alCambiar = () => setActiva(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  if (typeof document === "undefined" || !document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      onClick={() =>
        void (activa ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)
      }
      className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[13px] font-semibold text-white/85 hover:bg-white/10"
    >
      <Icon name="maximizar" size={16} />
      {activa ? "Salir de pantalla completa" : "Pantalla completa"}
    </button>
  );
}

function useAhoraCadaSegundo(): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

