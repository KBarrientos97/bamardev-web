import { useEffect, useMemo, useState } from "react";
import {
  capitalizar,
  diaCorto,
  fechaLarga,
  fechaNegocio,
  minutosDelDia,
  sumarDias,
} from "../lib/agenda/horaAgenda";
import { apiReserva, type DiaDisponible, type ProfesionalPublico } from "./apiReserva";
import { Aviso } from "./piezas";
import { horaCorta } from "./util";

/** Los días que se piden de una vez (una semana a la vista). */
const DIAS_POR_PAGINA = 7;

/**
 * P3 y P4 del lienzo (ReservaHorario): con quién, qué día y a qué hora. Lo usa
 * la reserva y también "Cambiar día u hora" del enlace de gestión.
 *
 * Nunca muestra quién tiene las otras citas: el backend sólo manda inicios
 * libres. Los días sin lugar se ven tachados para que nadie los toque de más.
 */
export default function SelectorHorario({
  sub,
  sucursal,
  servicioIds,
  profesionales,
  profesional,
  onProfesional,
  inicio,
  onInicio,
  primeraFecha,
  ultimaFecha,
  token,
  version = 0,
}: {
  sub: string;
  sucursal: string;
  servicioIds: number[];
  /** Ya filtrados: los que hacen TODOS los servicios elegidos. */
  profesionales: ProfesionalPublico[];
  profesional: number | null;
  onProfesional: (id: number | null) => void;
  inicio: string | null;
  onInicio: (iso: string | null) => void;
  primeraFecha: string;
  ultimaFecha: string;
  /** Al reprogramar: la cita propia no choca consigo misma. */
  token?: string;
  /** Cambiarlo vuelve a pedir la disponibilidad (después de un 409). */
  version?: number;
}) {
  const hoy = fechaNegocio();
  const inicioRango = primeraFecha > hoy ? primeraFecha : hoy;
  const [desde, setDesde] = useState(inicioRango);
  const [dias, setDias] = useState<DiaDisponible[] | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [error, setError] = useState("");
  const clave = servicioIds.join(",");

  useEffect(() => {
    let vigente = true;
    setDias(null);
    setError("");
    apiReserva
      .disponibilidad(sub, {
        sucursal,
        servicios: clave.split(",").map(Number),
        profesional,
        desde,
        dias: DIAS_POR_PAGINA,
        token,
      })
      .then((r) => {
        if (!vigente) return;
        setDias(r.dias);
        // Se queda en el día elegido si sigue a la vista; si no, el primero
        // con lugar (así nadie arranca mirando un día lleno).
        setFecha((actual) => {
          if (actual && r.dias.some((d) => d.fecha === actual)) return actual;
          return r.dias.find((d) => d.inicios.length)?.fecha ?? r.dias[0]?.fecha ?? null;
        });
      })
      .catch((e: Error) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [sub, sucursal, clave, profesional, desde, token, version]);

  const delDia = useMemo(() => dias?.find((d) => d.fecha === fecha)?.inicios ?? [], [dias, fecha]);
  const manana = delDia.filter((iso) => minutosDelDia(iso) < 12 * 60);
  const tarde = delDia.filter((iso) => minutosDelDia(iso) >= 12 * 60);

  // Si la hora elegida dejó de estar libre (otro día, otra persona), se suelta.
  useEffect(() => {
    if (inicio && dias && !dias.some((d) => d.inicios.includes(inicio))) onInicio(null);
  }, [dias, inicio, onInicio]);

  const anterior = sumarDias(desde, -DIAS_POR_PAGINA);
  const hayAnterior = desde > inicioRango;
  const siguiente = sumarDias(desde, DIAS_POR_PAGINA);
  const haySiguiente = siguiente <= ultimaFecha;

  return (
    <div className="flex flex-col gap-[18px]">
      {profesionales.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-label="Con quién">
          <h2 className="text-lg font-bold">¿Con quién?</h2>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <ChipProfesional
              nombre="Cualquiera"
              iniciales="★"
              elegido={profesional == null}
              onClick={() => onProfesional(null)}
            />
            {profesionales.map((p) => (
              <ChipProfesional
                key={p.id}
                nombre={p.nombre}
                iniciales={iniciales(p.nombre)}
                elegido={profesional === p.id}
                onClick={() => onProfesional(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2.5" aria-label="Qué día">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">¿Qué día?</h2>
          <div className="flex gap-1">
            <FlechaSemana
              etiqueta="Semana anterior"
              disabled={!hayAnterior}
              onClick={() => setDesde(anterior < inicioRango ? inicioRango : anterior)}
            >
              ‹
            </FlechaSemana>
            <FlechaSemana etiqueta="Semana siguiente" disabled={!haySiguiente} onClick={() => setDesde(siguiente)}>
              ›
            </FlechaSemana>
          </div>
        </div>
        {dias === null && !error ? (
          <p className="py-3 text-[13px] text-[#6B7280]" role="status">
            Buscando horarios libres…
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {(dias ?? []).map((d) => {
              const lleno = d.inicios.length === 0;
              const elegido = d.fecha === fecha;
              const [, , num] = d.fecha.split("-");
              return (
                <button
                  key={d.fecha}
                  type="button"
                  disabled={lleno}
                  aria-pressed={elegido}
                  aria-label={`${capitalizar(fechaLarga(d.fecha))}${lleno ? ", sin lugar" : ""}`}
                  onClick={() => setFecha(d.fecha)}
                  className={`flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl text-[#374151] ${
                    elegido
                      ? "bg-primary-boton text-white"
                      : lleno
                        ? "border border-[#F0F1F4] bg-[#F9FAFB] text-[#9CA3AF] line-through"
                        : "border border-[#E5E7EB] bg-white"
                  }`}
                >
                  <span className="text-[11px]">{diaCorto(d.fecha)}</span>
                  <strong className="text-[15px]">{Number(num)}</strong>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2.5" aria-label="A qué hora">
        <h2 className="text-lg font-bold">¿A qué hora?</h2>
        <Aviso>{error}</Aviso>
        {fecha && dias && (
          <span className="text-[13px] text-[#6B7280]">
            {capitalizar(fechaLarga(fecha))} · sólo se muestran horarios libres
          </span>
        )}
        {dias && fecha && !delDia.length && (
          <p className="rounded-xl bg-[#F9FAFB] px-3.5 py-3 text-[13px] text-[#4B5563]">
            No quedan horarios libres este día. Probá con otro
            {profesional != null ? " o con «Cualquiera»" : ""}.
          </p>
        )}
        {[
          ["MAÑANA", manana],
          ["TARDE", tarde],
        ].map(([titulo, horas]) =>
          (horas as string[]).length ? (
            <div key={titulo as string} className="flex flex-col gap-2">
              <h3 className="mt-1 text-xs tracking-[0.06em] text-[#6B7280]">{titulo as string}</h3>
              <div className="grid grid-cols-4 gap-2">
                {(horas as string[]).map((iso) => {
                  const elegida = iso === inicio;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={elegida}
                      onClick={() => onInicio(iso)}
                      className={`h-11 rounded-[10px] text-sm ${
                        elegida ? "bg-primary-boton font-bold text-white" : "border border-[#E5E7EB] bg-white text-[#374151]"
                      }`}
                    >
                      {horaCorta(iso)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null,
        )}
      </section>
    </div>
  );
}

function ChipProfesional({
  nombre,
  iniciales,
  elegido,
  onClick,
}: {
  nombre: string;
  iniciales: string;
  elegido: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onClick}
      className={`flex min-w-[76px] flex-none flex-col items-center gap-1.5 rounded-[14px] px-2 py-2.5 ${
        elegido ? "border-2 border-primary bg-primary-50 text-primary-700" : "border border-[#E5E7EB] bg-white text-[#374151]"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold ${
          elegido ? "bg-primary-boton text-white" : "bg-[#F3F4F6] text-[#374151]"
        }`}
      >
        {iniciales}
      </span>
      <span className="text-[13px]">{nombre}</span>
    </button>
  );
}

function FlechaSemana({
  etiqueta,
  disabled,
  onClick,
  children,
}: {
  etiqueta: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] text-lg text-[#374151] disabled:opacity-40"
    >
      {children}
    </button>
  );
}


function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? "?").slice(0, 2);
  return letras.toUpperCase();
}
