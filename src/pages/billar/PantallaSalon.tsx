import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import { fmtCrono, horaDe, promoPara } from "./calculo";
import { useAhora } from "./reloj";
import { mesasEnUso, useBillar, useSondeoBillar } from "./store";
import { vistaDe, type VistaMesa } from "./vista";

/**
 * La pantalla del salón (§7.11): para una TV, a pantalla completa, con el
 * tiempo de cada mesa y SIN montos ni datos del cajero. Sale con Escape.
 *
 * Se abre desde el tablero, con la sesión del cajero, y se mantiene al día
 * sola: va fuera del Layout, así que pide el tablero por su cuenta. La TV sin
 * sesión (con la llave de `/publico/billar/salon/:token`, que el backend ya
 * tiene) todavía no tiene pantalla en la web.
 */
export default function PantallaSalon() {
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const { negocio } = useAuth();
  useSondeoBillar(negocio?.alias);
  const vistas = mesasEnUso(e).map((m) => vistaDe(e, m, ahora));
  const libres = vistas.filter((v) => v.estado === "libre").length;

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") navigate("/billar");
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [navigate]);

  const [hora, sufijo] = partirHora(horaDe(ahora));

  return (
    <div className="flex min-h-dvh flex-col bg-[#06281D] px-5 py-5 text-white sm:px-8 sm:py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-wide sm:text-3xl">{negocio?.nombre ?? "Billar"}</h1>
          <p className="text-base font-semibold text-emerald-300 sm:text-lg">
            {/* Sin tablero todavía (cargando, o falló) no hay mesas: "Todas
                las mesas ocupadas" se leía en la tele mientras cargaba. */}
            {!e.cargado || vistas.length === 0
              ? " "
              : libres === 0
                ? "Todas las mesas ocupadas"
                : `${libres} ${libres === 1 ? "mesa libre" : "mesas libres"} · pedila en caja`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-4xl font-extrabold tabular-nums sm:text-5xl">
            {hora}
            <span className="ml-2 text-xl font-bold sm:text-2xl">{sufijo}</span>
          </p>
          <button
            type="button"
            onClick={() => navigate("/billar")}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/85 ring-1 ring-inset ring-white/20 hover:bg-white/10"
          >
            <Icon name="close" size={15} />
            Salir
          </button>
        </div>
      </header>

      {!e.cargado && <p className="mt-10 text-center text-lg text-white/70">{e.error ?? "Cargando las mesas…"}</p>}
      <div className="mt-6 grid flex-1 content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))] sm:gap-5">
        {vistas.map((v) => (
          <TarjetaTv key={v.mesa.id} v={v} />
        ))}
      </div>

      <footer className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 pt-4 text-[15px] text-white/80">
        {Object.values(e.tipos).map((t) => {
          const promo = promoPara(t, Number.POSITIVE_INFINITY);
          return (
            <p key={t.id}>
              <b className="text-white">{t.nombre}</b> {fmtMoney(t.tarifa)}/h
              {t.paquetes.map((p) => ` · ${p.h} h ${fmtMoney(p.precio)}`).join("")}
              {promo && (
                <b className="text-amber-300">
                  {" "}
                  · {promo.nombre} −{promo.pct} %
                </b>
              )}
            </p>
          );
        })}
      </footer>
    </div>
  );
}

function partirHora(texto: string): [string, string] {
  const i = texto.indexOf(" ");
  return i < 0 ? [texto, ""] : [texto.slice(0, i), texto.slice(i + 1)];
}

const TV: Record<VistaMesa["estado"], { caja: string; pill: string; etiqueta: string }> = {
  libre: { caja: "border-emerald-400 bg-[#0B4A33]", pill: "bg-emerald-300 text-emerald-950", etiqueta: "Libre" },
  juego: { caja: "border-emerald-800 bg-[#0A3627]", pill: "bg-emerald-400 text-emerald-950", etiqueta: "En juego" },
  vence: { caja: "border-amber-400 bg-[#4A3306]", pill: "bg-amber-400 text-amber-950", etiqueta: "Por vencer" },
  cumplido: { caja: "border-rose-400 bg-[#4C1020] animate-pulse", pill: "bg-rose-400 text-rose-950", etiqueta: "Tiempo cumplido" },
  pausada: { caja: "border-white/10 bg-[#0A3627]/70", pill: "bg-white/15 text-white/80", etiqueta: "Pausada" },
  reservada: { caja: "border-blue-300 bg-[#122A55]", pill: "bg-blue-300 text-blue-950", etiqueta: "Reservada" },
  fuera: { caja: "border-white/5 bg-[#0A3627]/40", pill: "bg-white/10 text-white/50", etiqueta: "Fuera de servicio" },
};

function TarjetaTv({ v }: { v: VistaMesa }) {
  const estilo = TV[v.estado];
  const s = v.mesa.sesion;
  const c = v.cuenta;
  const apagada = v.estado === "fuera";
  let grande: string;
  let chico: string;
  let progreso: number | null = null;
  let color = "text-white";

  if (c && s) {
    if (s.prepago && c.restante !== null) {
      const horas = s.prepago.min / 60;
      if (c.restante > 0) {
        grande = fmtCrono(c.restante);
        chico = `Le quedan · tiempo fijo ${horas} h`;
        progreso = Math.max(0, Math.min(1, c.restante / (s.prepago.min * 60)));
      } else {
        grande = `+${fmtCrono(-c.restante)}`;
        chico = "Tiempo cumplido · pasá por caja";
      }
    } else {
      grande = fmtCrono(c.secs);
      chico = "Tiempo jugado · libre";
    }
    if (v.estado === "vence") color = "text-amber-300";
    if (v.estado === "cumplido") color = "text-rose-300";
    if (v.estado === "pausada") {
      color = "text-white/50";
      chico = "Pausada";
    }
  } else if (v.estado === "libre") {
    grande = "LIBRE";
    chico = `${v.tipo.nombre} · ${fmtMoney(v.tipo.tarifa)}/h`;
  } else if (v.estado === "reservada" && v.mesa.reserva) {
    grande = partirHora(horaDe(v.mesa.reserva.hora))[0];
    chico = `Reservada · ${v.mesa.reserva.nombre}`;
  } else {
    grande = "—";
    chico = "Fuera de servicio";
    color = "text-white/40";
  }

  return (
    <div className={`flex min-h-[190px] flex-col rounded-2xl border-2 px-6 py-5 ${estilo.caja}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={`whitespace-nowrap text-[26px] font-extrabold uppercase ${apagada ? "text-white/40" : ""}`}>Mesa {v.mesa.id}</p>
        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-extrabold uppercase tracking-wide ${estilo.pill}`}>
          {estilo.etiqueta}
        </span>
      </div>
      <p className={`mt-3 text-[clamp(40px,4.2vw,58px)] font-extrabold leading-none tabular-nums ${color}`}>{grande}</p>
      <p className={`mt-2 text-[15px] font-semibold ${apagada ? "text-white/40" : "text-white/85"}`}>{chico}</p>
      {progreso !== null && (
        <div className="mt-auto pt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className={`h-full rounded-full ${v.estado === "vence" ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ width: `${progreso * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
