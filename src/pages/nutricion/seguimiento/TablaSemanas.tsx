import type { ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { fmtPlata } from "../../../lib/format";
import { fechaLarga, fmtNumero } from "../../../lib/nutricion/calculo";
import {
  casilleroAmarillo,
  dosisDelRegistro,
  nombreSemana,
  pagoDelMes,
  textoKg,
  textoKgTotal,
  tituloMes,
} from "../../../lib/nutricion/seguimiento/formato";
import type { MesTratamiento, Registro, Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";
import { AMARILLO, Dosis } from "./piezas";

/**
 * La tabla como la hoja de papel (§4.2): un renglón «Inicial» y uno por
 * semana, agrupados por mes, con las columnas Semana · Peso · Kg bajado ·
 * Dosis · Observaciones · Pagos. El casillero de Pagos de la semana de pago va
 * en amarillo, esté cargada o no. Las semanas del mes que no se cargaron
 * salen tenues, con «Cargar» (así se saltea la que el paciente faltó). En la
 * tablet entra sin desplazarse de costado (Observaciones es la elástica); en
 * el celular cada semana es una tarjeta.
 */

interface Renglon {
  semana: number;
  registro: Registro | null;
  amarillo: boolean;
  /** «Toca pago» en el casillero: el mes debe, o es la semana de pago que viene. */
  tocaPago: boolean;
}

interface Grupo {
  mes: MesTratamiento;
  renglones: Renglon[];
}

/** Los meses con sus renglones (cargados y por cargar). Sin poder cargar, sólo los huecos entre semanas cargadas. */
function gruposDe(t: Tratamiento, editable: boolean): Grupo[] {
  const porSemana = new Map(t.registros.map((r) => [r.semana, r]));
  const ultima = t.resumen.semana;
  const proximo = t.resumen.proximoPago?.semana ?? null;
  return t.meses.map((mes) => {
    const renglones: Renglon[] = [];
    for (let s = mes.desdeSemana; s <= mes.hastaSemana; s++) {
      const registro = porSemana.get(s) ?? null;
      if (!registro && !editable && s > ultima) continue;
      const amarillo = registro ? registro.tocaPago : casilleroAmarillo(t.meses, s);
      renglones.push({ semana: s, registro, amarillo, tocaPago: amarillo && (mes.debe || (!registro && proximo === s)) });
    }
    return { mes, renglones };
  });
}

export default function TablaSemanas({
  tratamiento,
  mes,
  editable,
  onCorregir,
  onCargar,
}: {
  tratamiento: Tratamiento;
  /** El mes elegido en los chips (null = todo). */
  mes: number | null;
  /** Activo y con `seguimiento.editar`: se corrige tocando y se cargan las que faltan. */
  editable: boolean;
  onCorregir: (r: Registro) => void;
  onCargar: (semana: number) => void;
}) {
  const grupos = gruposDe(tratamiento, editable).filter((g) => mes == null || g.mes.mes === mes);
  return (
    <>
      {/* La tablet y la PC: la tabla entera, sin desplazarse de costado. */}
      <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] md:table">
        <caption className="sr-only">Las semanas del tratamiento, como la hoja de papel</caption>
        <colgroup>
          <col className="w-[5.75rem]" />
          <col className="w-[4.25rem]" />
          <col className="w-[7.25rem]" />
          <col className="w-[7.25rem]" />
          <col />
          <col className="w-[9.75rem]" />
        </colgroup>
        <thead>
          <tr className="bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-texto-4">
            <th scope="col" className="px-3 py-2.5 pl-4 sm:pl-5">
              Semana
            </th>
            <th scope="col" className="whitespace-nowrap px-2.5 py-2.5" title="Peso, en kg">
              Peso
            </th>
            <th scope="col" className="px-2.5 py-2.5">
              Kg bajado
            </th>
            <th scope="col" className="px-2.5 py-2.5">
              Dosis
            </th>
            <th scope="col" className="px-2.5 py-2.5">
              Observaciones
            </th>
            <th scope="col" className="px-3 py-2.5 pr-4 sm:pr-5">
              Pagos
            </th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.mes.mes}>
            <tr>
              <th scope="rowgroup" colSpan={6} className="border-t border-borde bg-primary-50/50 px-4 py-2 text-left sm:px-5">
                <EncabezadoMes mes={g.mes} />
              </th>
            </tr>
            {g.renglones.map((r) =>
              r.registro ? (
                <FilaCargada key={r.semana} r={r} registro={r.registro} editable={editable} onCorregir={onCorregir} />
              ) : (
                <tr key={r.semana} className="text-texto-4">
                  <td className="border-t border-borde-soft px-3 py-2 pl-4 align-middle sm:pl-5">
                    {/* Sin partir, como en los cargados: «Semana» / «11» en dos renglones (desde la 10, en todos los tamaños). */}
                    <span className="block whitespace-nowrap font-semibold">{nombreSemana(r.semana)}</span>
                    <span className="block whitespace-nowrap text-[11px]">por cargar</span>
                  </td>
                  <td colSpan={4} className="border-t border-borde-soft px-2.5 py-2 align-middle">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onCargar(r.semana)}
                        aria-label={`Cargar la ${nombreSemana(r.semana).toLowerCase()}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed border-borde px-3 text-[13px] font-semibold text-texto-3 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 lg:min-h-9"
                      >
                        <Icon name="plus" size={14} />
                        Cargar
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <CeldaPagos r={r} />
                </tr>
              ),
            )}
          </tbody>
        ))}
      </table>

      {/* El celular: cada semana es una tarjeta. */}
      <div className="space-y-4 p-3 md:hidden">
        {grupos.map((g) => (
          <section key={g.mes.mes} aria-label={tituloMes(g.mes)} className="space-y-2">
            <div className="rounded-xl bg-primary-50/60 px-3 py-2">
              <EncabezadoMes mes={g.mes} />
            </div>
            <ul className="space-y-2">
              {g.renglones.map((r) => (
                <li key={r.semana} data-semana={r.registro ? r.semana : undefined}>
                  {r.registro ? (
                    <TarjetaCargada r={r} registro={r.registro} editable={editable} onCorregir={onCorregir} />
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-dashed border-borde px-3 py-2 text-texto-4">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{nombreSemana(r.semana)}</span>
                        <span className="block text-[12px]">por cargar</span>
                        {r.amarillo && <MarcaPago tocaPago={r.tocaPago} />}
                      </span>
                      {editable && (
                        <button
                          type="button"
                          onClick={() => onCargar(r.semana)}
                          aria-label={`Cargar la ${nombreSemana(r.semana).toLowerCase()}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-50 px-3 text-[13px] font-semibold text-primary-700"
                        >
                          <Icon name="plus" size={14} />
                          Cargar
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** «Mes 2 · Semanas 5 a 9» y, a la derecha, «Pagado: Bs 630 ✓» o «Falta pagar». */
function EncabezadoMes({ mes }: { mes: MesTratamiento }) {
  const pagado = pagoDelMes(mes.pagado) > 0;
  return (
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-[13px] font-bold normal-case tracking-normal text-texto">{tituloMes(mes)}</span>
      {mes.debe ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger-text">
          <Icon name="alert" size={13} />
          Falta pagar
        </span>
      ) : pagado ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary-700">
          Pagado: {fmtPlata(mes.pagado.total)}
          <Icon name="check" size={14} strokeWidth={2.5} />
        </span>
      ) : mes.pagado.total > 0 ? (
        <span className="whitespace-nowrap text-xs font-semibold text-texto-3">Pagado: {fmtPlata(mes.pagado.total)}</span>
      ) : null}
    </span>
  );
}

/** Lo que se pagó en la semana, un renglón por concepto, y la nota en gris. */
function Pagos({ r }: { r: Registro }) {
  const lineas: [string, number | null][] = [
    ["Medicamento", r.pagoMedicamento],
    ["Control", r.pagoControl],
    ["Otro", r.pagoOtro],
  ];
  const con = lineas.filter(([, n]) => n != null && n > 0) as [string, number][];
  if (!con.length && !r.pagoNota) return null;
  return (
    <span className="block space-y-0.5 text-[12px]">
      {con.map(([k, n]) => (
        <span key={k} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-texto-3">{k}</span>
          <span className="ml-auto whitespace-nowrap text-[13px] font-semibold tabular-nums text-texto">{fmtPlata(n)}</span>
        </span>
      ))}
      {r.pagoNota && <span className="block break-words text-[12px] text-texto-4">{r.pagoNota}</span>}
    </span>
  );
}

/** «Toca pago», en el casillero amarillo, mientras el mes debe. */
function MarcaPago({ tocaPago }: { tocaPago: boolean }) {
  if (!tocaPago) return null;
  return <span className="mt-0.5 inline-block text-[12px] font-bold text-yellow-800">Toca pago</span>;
}

function CeldaPagos({ r }: { r: Renglon }) {
  return (
    <td className={`border-t border-borde-soft px-3 py-2 pr-4 align-top sm:pr-5 ${r.amarillo ? AMARILLO : ""}`}>
      {r.registro && <Pagos r={r.registro} />}
      <MarcaPago tocaPago={r.tocaPago} />
      {!r.registro?.pagoMedicamento && !r.registro?.pagoControl && !r.registro?.pagoOtro && !r.registro?.pagoNota && !r.tocaPago && (
        <span className="text-texto-4">—</span>
      )}
    </td>
  );
}

function DosisDeLaSemana({ registro, apilada = true }: { registro: Registro; apilada?: boolean }): ReactNode {
  if (registro.sinDosis) {
    return (
      <span className="block">
        <span className="inline-flex whitespace-nowrap rounded-md bg-warning-bg px-1.5 py-0.5 text-[12px] font-semibold text-warning-text">No se aplicó</span>
        {registro.motivoSinDosis && <span className="mt-0.5 block break-words text-[12px] text-texto-3">{registro.motivoSinDosis}</span>}
      </span>
    );
  }
  const d = dosisDelRegistro(registro);
  return d ? <Dosis dosis={d} apilada={apilada} /> : <span className="text-texto-4">—</span>;
}

/**
 * «Kg bajado» (§7, Kevin 23-nov): lo principal es el cambio contra el peso
 * anterior («Bajó 0,7», «Subió 0,3», «Igual»), con palabras y no sólo con
 * color; debajo, chico, el total desde el inicio («2,1 desde el inicio»).
 */
export function KgDeLaSemana({ registro }: { registro: Pick<Registro, "kgSemana" | "kgBajados"> }) {
  const semana = textoKg(registro.kgSemana);
  const total = textoKgTotal(registro.kgBajados);
  if (!semana && !total) return <span className="text-texto-4">—</span>;
  return (
    <span className="block">
      {semana ? (
        <span className={`block whitespace-nowrap font-semibold tabular-nums ${TONO_KG[semana.tono]}`}>{semana.texto}</span>
      ) : (
        <span className="block text-texto-4">—</span>
      )}
      {total && <span className="mt-0.5 block text-[12px] leading-snug text-texto-3">{total}</span>}
    </span>
  );
}

/** Bajó en el verde de la marca, subió en tono de alerta, igual en gris: el color acompaña a la palabra. */
const TONO_KG = { bajo: "text-primary-700", subio: "text-danger-text", igual: "text-texto-3" } as const;

function FilaCargada({ r, registro, editable, onCorregir }: { r: Renglon; registro: Registro; editable: boolean; onCorregir: (r: Registro) => void }) {
  return (
    <tr
      // Para dejarla a la vista («Ver la hoja» después de una semana repetida).
      data-semana={registro.semana}
      onClick={editable ? () => onCorregir(registro) : undefined}
      className={`transition-colors ${editable ? "cursor-pointer hover:bg-muted" : ""}`}
    >
      <td className="border-t border-borde-soft px-3 py-2.5 pl-4 align-top sm:pl-5">
        {editable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCorregir(registro);
            }}
            aria-label={`Corregir la ${nombreSemana(registro.semana).toLowerCase()}`}
            className="-mx-1 -my-0.5 block rounded-md px-1 py-0.5 text-left hover:text-primary-700"
          >
            <NombreYFecha registro={registro} />
          </button>
        ) : (
          <NombreYFecha registro={registro} />
        )}
      </td>
      <td className="border-t border-borde-soft px-2.5 py-2.5 align-top font-semibold tabular-nums text-texto">
        {registro.pesoKg != null ? fmtNumero(registro.pesoKg, 2) : <span className="font-normal text-texto-4">—</span>}
      </td>
      <td className="border-t border-borde-soft px-2.5 py-2.5 align-top">
        <KgDeLaSemana registro={registro} />
      </td>
      <td className="border-t border-borde-soft px-2.5 py-2.5 align-top">
        <DosisDeLaSemana registro={registro} />
      </td>
      <td className="border-t border-borde-soft px-2.5 py-2.5 align-top text-texto-2">
        {registro.observaciones ? <span className="block whitespace-pre-line break-words">{registro.observaciones}</span> : <span className="text-texto-4">—</span>}
      </td>
      <CeldaPagos r={r} />
    </tr>
  );
}

function NombreYFecha({ registro }: { registro: Registro }) {
  return (
    <>
      <span className="block whitespace-nowrap font-bold text-texto">{nombreSemana(registro.semana)}</span>
      <span className="block whitespace-nowrap text-[12px] tabular-nums text-texto-3">{fechaLarga(registro.fecha)}</span>
    </>
  );
}

function TarjetaCargada({ r, registro, editable, onCorregir }: { r: Renglon; registro: Registro; editable: boolean; onCorregir: (r: Registro) => void }) {
  const pagos = <Pagos r={registro} />;
  const cuerpo = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="text-[15px] font-bold text-texto">{nombreSemana(registro.semana)}</span>
          <span className="ml-2 text-[13px] tabular-nums text-texto-3">{fechaLarga(registro.fecha)}</span>
        </span>
        {editable && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-3">
            <Icon name="edit" size={15} />
          </span>
        )}
      </span>
      <span className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Peso</span>
          <span className="block font-semibold tabular-nums text-texto">{registro.pesoKg != null ? `${fmtNumero(registro.pesoKg, 2)} kg` : "—"}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Kg bajado</span>
          <KgDeLaSemana registro={registro} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Dosis</span>
          <DosisDeLaSemana registro={registro} />
        </span>
      </span>
      {registro.observaciones && (
        <span className="mt-2 block whitespace-pre-line break-words text-[13px] text-texto-2">{registro.observaciones}</span>
      )}
      {(r.amarillo || registro.pagoMedicamento || registro.pagoControl || registro.pagoOtro || registro.pagoNota) && (
        <span className={`mt-2 block rounded-lg px-2.5 py-2 text-[13px] ${r.amarillo ? AMARILLO : "bg-muted"}`}>
          <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-texto-4">Pagos</span>
          {pagos}
          <MarcaPago tocaPago={r.tocaPago} />
        </span>
      )}
    </>
  );
  const clase = "block w-full rounded-xl border border-borde bg-white px-3 py-2.5 text-left";
  return editable ? (
    <button type="button" onClick={() => onCorregir(registro)} title={`Corregir la ${nombreSemana(registro.semana).toLowerCase()}`} className={`${clase} transition-colors active:bg-muted`}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}
