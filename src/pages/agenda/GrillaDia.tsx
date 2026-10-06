import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Vacio } from "../../components/ui";
import { clasesBloque, ETIQUETA_ESTADO, sePuedeMover, vaEnGrilla } from "../../lib/agenda/estadosCita";
import {
  aMinutos,
  deMinutos,
  fechaNegocio,
  horaNegocio,
  minutosDelDia,
} from "../../lib/agenda/horaAgenda";
import type { Bloqueo, Cita, LineaCita, RecursoDelDia } from "../../lib/agenda/tiposAgenda";
import { AvatarRecurso } from "./piezas";

/** 96 px por hora, como el lienzo: una cita de 15 min todavía se lee. */
export const PX_POR_MIN = 1.6;
const ANCHO_HORAS = 64;
/** Sin horarios cargados se muestra un día de salón típico. */
const DIA_POR_DEFECTO = { desde: 8 * 60, hasta: 20 * 60 };

interface Arrastre {
  lineaId: number;
  deltaMin: number;
  /** Corrimiento horizontal hasta la columna destino, en px. */
  dx: number;
  recursoId: number;
}

/**
 * La grilla del día (A1): una columna por profesional con su horario en
 * blanco, las citas encima con el color del estado y una franja del color del
 * profesional, los bloqueos rayados y la línea de "ahora".
 *
 * Es una grilla propia y no una librería de calendario: las vistas por recurso
 * de FullCalendar son de pago (licencia comercial), react-big-calendar trae su
 * propio CSS y localizador y habría que pisarle casi todo para que se vea como
 * el lienzo y siga el tema del negocio. Lo que hace falta acá —columnas fijas
 * de un día, arrastre vertical y entre columnas— son unas pocas cuentas.
 *
 * Arrastrar es sólo con mouse: en un celular o una tablet el dedo tiene que
 * poder deslizar la agenda sin agarrar una cita. Ahí se mueve desde el
 * detalle, con formulario.
 */
export default function GrillaDia({
  fecha,
  recursos,
  citas,
  bloqueos,
  granularidad = 15,
  detalleRecurso,
  onTocarHueco,
  onAbrirCita,
  onMover,
  onArrastrando,
}: {
  fecha: string;
  recursos: RecursoDelDia[];
  citas: Cita[];
  bloqueos: Bloqueo[];
  granularidad?: number;
  /** Lo que va debajo del nombre en la cabecera ("Estilista"). */
  detalleRecurso: (r: RecursoDelDia) => string;
  onTocarHueco: (recursoId: number, hora: string) => void;
  onAbrirCita: (cita: Cita) => void;
  onMover?: (cita: Cita, lineaId: number, deltaMin: number, recursoDestinoId: number) => void;
  onArrastrando?: (si: boolean) => void;
}) {
  const columnas = useRef<Record<number, HTMLDivElement | null>>({});
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const suprimirClic = useRef(false);
  const ahora = useAhora();

  /** Minutos del día de una línea, recortada al día que se mira. */
  const enElDia = (iso: string, fin = false) =>
    fechaNegocio(iso) === fecha ? minutosDelDia(iso) : fin ? 24 * 60 : 0;

  const lineasVisibles = useMemo(
    () =>
      citas
        .filter((c) => vaEnGrilla(c.estado))
        .flatMap((c) => c.lineas.map((l) => ({ cita: c, linea: l })))
        .filter(({ linea }) => fechaNegocio(linea.inicio) === fecha || fechaNegocio(linea.fin) === fecha),
    [citas, fecha],
  );

  // El alto del día: de la primera hora en que alguien trabaja (o hay una
  // cita) a la última, redondeado a horas enteras.
  const rango = useMemo(() => {
    const ms = [
      ...recursos.flatMap((r) => r.tramos.flatMap((t) => [aMinutos(t.desde), aMinutos(t.hasta)])),
      ...lineasVisibles.flatMap(({ linea }) => [enElDia(linea.inicio), enElDia(linea.fin, true)]),
    ];
    if (ms.length === 0) return DIA_POR_DEFECTO;
    const desde = Math.floor(Math.min(...ms) / 60) * 60;
    const hasta = Math.max(desde + 60, Math.ceil(Math.max(...ms) / 60) * 60);
    return { desde, hasta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recursos, lineasVisibles, fecha]);

  const y = (min: number) => (min - rango.desde) * PX_POR_MIN;
  const alto = (rango.hasta - rango.desde) * PX_POR_MIN;
  const horas: number[] = [];
  for (let h = rango.desde; h <= rango.hasta; h += 60) horas.push(h);

  const esHoy = fecha === fechaNegocio();
  const minAhora = minutosDelDia(ahora);
  const plantilla = { gridTemplateColumns: `${ANCHO_HORAS}px repeat(${recursos.length}, minmax(150px, 1fr))` };

  if (recursos.length === 0) {
    return (
      <Vacio
        icono="users"
        titulo="Nadie con horario en esta sucursal"
        texto="Cargá los profesionales y su semana en Configurar agenda."
      />
    );
  }

  function tocarColumna(e: MouseEvent<HTMLDivElement>, r: RecursoDelDia) {
    const rect = e.currentTarget.getBoundingClientRect();
    const min = rango.desde + (e.clientY - rect.top) / PX_POR_MIN;
    const alineado = Math.floor(min / granularidad) * granularidad;
    onTocarHueco(r.id, deMinutos(Math.min(Math.max(alineado, rango.desde), rango.hasta - granularidad)));
  }

  function recursoEn(x: number): number | null {
    for (const r of recursos) {
      const el = columnas.current[r.id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x < rect.right) return r.id;
    }
    return null;
  }

  function empezar(e: PointerEvent<HTMLButtonElement>, cita: Cita, linea: LineaCita) {
    if (!onMover || e.pointerType !== "mouse" || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let movido = false;

    const mover = (ev: globalThis.PointerEvent) => {
      const dy = ev.clientY - y0;
      if (!movido && Math.abs(dy) < 5 && Math.abs(ev.clientX - x0) < 5) return;
      if (!movido) onArrastrando?.(true);
      movido = true;
      const deltaMin = Math.round(dy / PX_POR_MIN / granularidad) * granularidad;
      const destino = recursoEn(ev.clientX) ?? linea.recursoId;
      const origen = columnas.current[linea.recursoId]?.getBoundingClientRect().left ?? 0;
      const llegada = columnas.current[destino]?.getBoundingClientRect().left ?? origen;
      const a = { lineaId: linea.id, deltaMin, dx: llegada - origen, recursoId: destino };
      arrastreRef.current = a;
      setArrastre(a);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      const a = arrastreRef.current;
      arrastreRef.current = null;
      setArrastre(null);
      if (!movido || !a) return;
      onArrastrando?.(false);
      // El clic que sigue al soltar no tiene que abrir el detalle. Si el
      // navegador no lo manda (se soltó en otra columna), se olvida solo.
      suprimirClic.current = true;
      setTimeout(() => (suprimirClic.current = false), 0);
      if (a.deltaMin !== 0 || a.recursoId !== linea.recursoId) {
        onMover(cita, linea.id, a.deltaMin, a.recursoId);
      }
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  return (
    // `overflow-y-hidden`: con sólo `overflow-x-auto` el navegador también
    // scrollea en vertical por el rótulo de la última hora, que asoma medio
    // renglón debajo, y la grilla mostraba una barra que no movía nada.
    <div className="overflow-x-auto overflow-y-hidden">
      <div className="pb-3" style={{ minWidth: ANCHO_HORAS + recursos.length * 150 }}>
        <div className="grid border-b border-borde" style={plantilla}>
          <div />
          {recursos.map((r) => (
            <div key={r.id} className="flex min-w-0 items-center gap-2.5 border-l border-borde-soft p-3">
              <AvatarRecurso nombre={r.nombre} color={r.color} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-texto">{r.nombre}</p>
                <p className="truncate text-[12px] text-texto-3">
                  {r.tramos.length ? detalleRecurso(r) : "No trabaja este día"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative grid" style={plantilla}>
          <div className="relative" style={{ height: alto }}>
            {horas.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-2 text-[12px] text-texto-3"
                style={{ top: y(h) }}
              >
                {deMinutos(h)}
              </span>
            ))}
          </div>

          {recursos.map((r) => (
            <div
              key={r.id}
              ref={(el) => {
                columnas.current[r.id] = el;
              }}
              data-testid={`columna-${r.id}`}
              className="relative cursor-pointer border-l border-borde-soft bg-muted"
              style={{ height: alto }}
              onClick={(e) => tocarColumna(e, r)}
              title="Tocá un hueco para agendar"
            >
              {/* Lo que el profesional trabaja va en blanco; fuera de horario, gris. */}
              {r.tramos.map((t, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bg-white"
                  style={{ top: y(aMinutos(t.desde)), height: (aMinutos(t.hasta) - aMinutos(t.desde)) * PX_POR_MIN }}
                />
              ))}
              {horas.map((h) => (
                <div
                  key={h}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 border-t border-borde-soft"
                  style={{ top: y(h) }}
                />
              ))}

              {bloqueos
                .filter((b) => b.recursoId === r.id || b.recursoId === null)
                .map((b) => {
                  const d = Math.max(enElDia(b.inicio), rango.desde);
                  const h = Math.min(enElDia(b.fin, true), rango.hasta);
                  if (h <= d) return null;
                  return (
                    <div
                      key={b.id}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-x-1.5 cursor-default overflow-hidden rounded-[10px] border border-borde px-2 py-1 text-[12px] text-texto-3"
                      style={{
                        top: y(d),
                        height: (h - d) * PX_POR_MIN - 4,
                        backgroundImage:
                          "repeating-linear-gradient(135deg, var(--color-borde-soft) 0 8px, var(--color-borde) 8px 16px)",
                      }}
                    >
                      <span className="font-semibold">{b.motivo || "Bloqueado"}</span>
                    </div>
                  );
                })}

              {lineasVisibles
                .filter(({ linea }) => linea.recursoId === r.id)
                .map(({ cita, linea }) => {
                  const d = Math.max(enElDia(linea.inicio), rango.desde);
                  const h = Math.min(enElDia(linea.fin, true), rango.hasta);
                  const movible = !!onMover && sePuedeMover(cita.estado);
                  const enArrastre = arrastre?.lineaId === linea.id ? arrastre : null;
                  // Una cita de 30 min mide 48 px: no entran tres renglones,
                  // así que va en uno solo (hora y cliente) y el resto en el detalle.
                  const corta = (h - d) * PX_POR_MIN < 64;
                  // Mientras se arrastra, la hora del bloque es a la que va a quedar.
                  const horaBloque = enArrastre
                    ? deMinutos(minutosDelDia(linea.inicio) + enArrastre.deltaMin)
                    : horaNegocio(linea.inicio);
                  return (
                    <button
                      key={linea.id}
                      type="button"
                      aria-label={`${horaNegocio(linea.inicio)} ${cita.cliente.nombre}, ${linea.servicio}, ${ETIQUETA_ESTADO[cita.estado]}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (suprimirClic.current) return;
                        onAbrirCita(cita);
                      }}
                      onPointerDown={movible ? (e) => empezar(e, cita, linea) : undefined}
                      className={[
                        "absolute flex overflow-hidden rounded-[10px] border border-l-4 px-2 py-1 text-left",
                        corta ? "flex-row items-start gap-1.5" : "flex-col gap-0.5",
                        linea.sobreTurno ? "left-1/2 right-1" : "left-1.5 right-1.5",
                        clasesBloque(cita.estado),
                        cita.noShowSugerido ? "ring-2 ring-warning" : "",
                        movible ? "cursor-grab" : "",
                        enArrastre ? "z-20 cursor-grabbing opacity-90 shadow-lg" : "z-10",
                      ].join(" ")}
                      style={{
                        top: y(d),
                        height: Math.max((h - d) * PX_POR_MIN - 4, 18),
                        borderLeftColor: r.color || undefined,
                        transform: enArrastre
                          ? `translate(${enArrastre.dx}px, ${enArrastre.deltaMin * PX_POR_MIN}px)`
                          : undefined,
                      }}
                    >
                      {corta ? (
                        <span className="truncate text-[12px]">
                          <span className="opacity-90">{horaBloque}</span>{" "}
                          <span className="font-bold">{cita.cliente.nombre}</span> · {linea.servicio}
                        </span>
                      ) : (
                        <>
                          <span className="flex justify-between gap-1.5 text-[11px] opacity-90">
                            <span>
                              {horaBloque} – {horaNegocio(linea.fin)}
                            </span>
                            <span className="truncate font-bold">{ETIQUETA_ESTADO[cita.estado]}</span>
                          </span>
                          <span className="truncate text-[13px] font-bold">{cita.cliente.nombre}</span>
                          <span className="truncate text-[12px]">
                            {linea.servicio}
                            {linea.sobreTurno ? " · sobre-turno" : ""}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}

          {esHoy && minAhora >= rango.desde && minAhora <= rango.hasta && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 z-30 h-0.5 bg-danger"
                style={{ left: ANCHO_HORAS - 8, top: y(minAhora) }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-30 h-3 w-3 rounded-full bg-danger"
                style={{ left: ANCHO_HORAS - 14, top: y(minAhora) - 5 }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** La hora, actualizada cada minuto, para la línea de "ahora". */
function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}
