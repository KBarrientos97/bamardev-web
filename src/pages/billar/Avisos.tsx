import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { publicarContadorBillar } from "../../lib/billar/contador";
import { fmtMoney } from "../../lib/format";
import { desbloquearAudio, hablar, marcarAvisado, nivelAlcanzado, textosAviso, yaAvisado, zumbido } from "./alertas";
import { fmtTarifaCorta, segundosJugados } from "./calculo";
import { useDialogos } from "./dialogos";
import { ModalAbrir, ModalExtender } from "./ModalTiempo";
import { ModalAvisos } from "./ModalesCaja";
import { ModalCambiar, ModalMotivo, ModalPago, ModalPin, ModalReservar } from "./ModalesMesa";
import { ModalHistorial, ModalTicket, ModalVenta } from "./ModalesVenta";
import { useAhora } from "./reloj";
import { billar, leerBillar, tipoDe, useBillar, type Toast } from "./store";

/**
 * El motor de los avisos de tiempo fijo (§6). Revisa cada segundo, avisa una
 * vez por umbral y sesión, y publica el contador del menú. Va montado en todas
 * las pantallas del billar: el aviso llega aunque el cajero esté en Ventas.
 */
export function MotorAvisos() {
  const ahora = useAhora();

  // El navegador no deja sonar nada hasta el primer toque: se desbloquea ahí.
  useEffect(() => {
    const una = () => void desbloquearAudio();
    document.addEventListener("pointerdown", una, { once: true });
    return () => document.removeEventListener("pointerdown", una);
  }, []);

  useEffect(() => {
    const e = leerBillar();
    let alerta = false;
    for (const m of e.mesas) {
      const s = m.sesion;
      if (m.estado !== "abierta" || !s?.prepago || s.pausedAt) continue;
      const restante = s.prepago.min * 60 - segundosJugados(s, ahora);
      if (restante <= Math.max(0, ...e.ajustes.avisos) * 60) alerta = true;
      const nivel = nivelAlcanzado(restante, e.ajustes.avisos);
      if (nivel === null || yaAvisado(m.id, s.id, nivel)) continue;
      marcarAvisado(m.id, s.id, nivel, e.ajustes.avisos);
      const t = textosAviso(m.id, restante, s.prepago.min / 60, fmtTarifaCorta(tipoDe(e, m).tarifa));
      billar.avisar({
        tono: nivel > 1 ? "ambar" : "rojo",
        titulo: t.titulo,
        texto: t.texto,
        accion: { tipo: "extender", mesaId: m.id },
      });
      if (!e.ajustes.silencio) {
        const dura = e.ajustes.sonido ? zumbido(nivel) : 0;
        if (e.ajustes.voz) hablar(t.voz, dura + 0.2);
      }
    }
    publicarContadorBillar({ abiertas: e.mesas.filter((m) => m.estado === "abierta").length, alerta });
  }, [ahora]);

  return null;
}

const TONO_TOAST: Record<Toast["tono"], { caja: string; circulo: string; icono: "relojArena" | "alert" | "check" }> = {
  ambar: { caja: "border-amber-200", circulo: "bg-amber-100 text-amber-700", icono: "relojArena" },
  rojo: { caja: "border-rose-200", circulo: "bg-rose-100 text-rose-700", icono: "alert" },
  verde: { caja: "border-primary-200", circulo: "bg-primary-50 text-primary-700", icono: "check" },
};

/** Los avisos flotantes de arriba a la derecha. Se van solos a los 15 s. */
export function Toasts() {
  const { toasts } = useBillar();
  const { abrir } = useDialogos();
  const navigate = useNavigate();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[360px]"
    >
      {toasts.map((t) => (
        <UnToast
          key={t.id}
          t={t}
          onAccion={() => {
            billar.descartar(t.id);
            const a = t.accion;
            if (!a) return;
            if (a.tipo === "extender") abrir({ tipo: "extender", mesaId: a.mesaId });
            else if (a.tipo === "ver") navigate(`/billar?mesa=${a.mesaId}`);
            else abrir({ tipo: "ticket", codigo: a.codigo });
          }}
        />
      ))}
    </div>
  );
}

function UnToast({ t, onAccion }: { t: Toast; onAccion: () => void }) {
  const estilo = TONO_TOAST[t.tono];
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    reloj.current = setTimeout(() => billar.descartar(t.id), 15_000);
    return () => {
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, [t.id]);
  const etiqueta =
    t.accion?.tipo === "extender" ? "Extender" : t.accion?.tipo === "ticket" ? "Imprimir ticket" : t.accion ? "Ver mesa" : null;
  return (
    <div
      role={t.tono === "rojo" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl ${estilo.caja}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${estilo.circulo}`}>
        <Icon name={estilo.icono} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-texto">{t.titulo}</p>
        {t.texto && <p className="text-[12px] text-texto-3">{t.texto}</p>}
        {etiqueta && (
          <button type="button" onClick={onAccion} className="mt-1 text-[13px] font-bold text-primary-700 hover:underline">
            {etiqueta}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => billar.descartar(t.id)}
        aria-label="Cerrar aviso"
        className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-texto-3 hover:bg-muted"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** El diálogo de arriba de la pila (ver `dialogos.tsx`). */
export function DialogoActual() {
  const { actual, cerrar } = useDialogos();
  const e = useBillar();
  if (!actual) return null;

  const mesa = "mesaId" in actual ? e.mesas.find((m) => m.id === actual.mesaId) : undefined;
  switch (actual.tipo) {
    case "abrir":
      return mesa ? <ModalAbrir mesa={mesa} onClose={cerrar} /> : null;
    case "extender":
      return mesa ? <ModalExtender mesa={mesa} onClose={cerrar} /> : null;
    case "cambiar":
      return mesa ? <ModalCambiar mesa={mesa} onClose={cerrar} /> : null;
    case "pausar":
      return mesa ? <ModalMotivo mesa={mesa} modo="pausar" onClose={cerrar} /> : null;
    case "fuera":
      return mesa ? <ModalMotivo mesa={mesa} modo="fuera" onClose={cerrar} /> : null;
    case "reservar":
      return mesa ? <ModalReservar mesa={mesa} onClose={cerrar} /> : null;
    case "pago":
      return mesa ? <ModalPago mesa={mesa} onClose={cerrar} /> : null;
    case "historial":
      return <ModalHistorial mesaId={actual.mesaId} onClose={cerrar} />;
    case "anularConsumo": {
      const it = mesa?.sesion?.consumos.find((c) => c.id === actual.itemId);
      if (!mesa || !it) return null;
      return (
        <ModalPin
          accion={`Anular ${it.cant}× ${it.nombre} · ${fmtMoney(it.precio * it.cant)}`}
          detalle={`Mesa ${mesa.id}. El producto vuelve al stock y sale de la cuenta.`}
          motivos={["Error de carga", "Cliente devolvió", "Producto en mal estado"]}
          pedirPin={e.ajustes.pin.anularConsumo}
          onClose={cerrar}
          onAutorizar={(motivo, autorizo) => {
            billar.anularConsumo(mesa.id, it.id, motivo, autorizo);
            cerrar();
          }}
        />
      );
    }
    case "venta":
      return <ModalVenta codigo={actual.codigo} onClose={cerrar} />;
    case "ticket":
      return <ModalTicket codigo={actual.codigo} onClose={cerrar} />;
    case "anularVenta": {
      const v = e.ventas.find((x) => x.codigo === actual.codigo);
      if (!v) return null;
      return (
        <ModalPin
          accion={`Anular venta ${v.codigo} · ${fmtMoney(v.total)}`}
          detalle={`${v.origen === "rapida" ? "Venta rápida" : `Mesa ${v.mesaId}`}. Los productos vuelven al stock y el monto sale de la caja del turno.`}
          motivos={["Cobro duplicado", "Error de cobro", "Cliente devolvió"]}
          pedirPin={e.ajustes.pin.anularVenta}
          onClose={cerrar}
          onAutorizar={(motivo, autorizo) => {
            billar.anularVenta(v.codigo, motivo, autorizo);
            // Vuelve al detalle, que ahora dice "Anulada".
            cerrar();
          }}
        />
      );
    }
    case "avisos":
      return <ModalAvisos onClose={cerrar} />;
  }
}
