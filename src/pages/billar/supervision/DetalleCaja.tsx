import { useState, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { Cargando, ErrorMsg, Modal } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { bsResta } from "../../reportes/formato";
import { apiBillar, type CajaSupervisionApi, type CobroApi, type DetalleCajaApi } from "../api";
import { BotonB, Fila, Nota, Rotulo } from "../ui";
import { IconoMedio, ListaCobros, MarcaMedio } from "./Cobros";
import { sumaCobros, tipoDeMedio, tituloDeMedio } from "./Cobros.datos";
import {
  COLOR_DIFERENCIA,
  cuentaDelEfectivo,
  montoDeRenglon,
  renglonDiferencia,
  subtituloCaja,
  textoVendido,
  type RenglonEfectivo,
} from "./DetalleCaja.datos";
import { ContenidoDetalleVenta } from "./DetalleVenta";
import { cuando, duracion, pieDelEsperado, textoDiferencia } from "./Supervision.datos";
import { useScrollDelDialogo } from "./useScrollDelDialogo";

/**
 * Una caja de la semana, entera (26-oct): qué se cobró por QR y qué en
 * efectivo, venta por venta, y la cuenta del efectivo que debía haber en el
 * cajón. Se abre tocando la caja en la lista o su renglón en la actividad.
 *
 * El pedido salió de una captura de Miguel, el administrador: "Abrió con Bs 50
 * · Vendió Bs 676 · Contó al cerrar Bs 616 · sobran Bs 10", y 50 + 676 no da
 * 616. No da porque Bs 120 se cobraron por QR: van a la cuenta, no al cajón.
 * Lo que debía haber era 50 + 556 = 606, y contó 616. Acá se ve esa cuenta
 * renglón por renglón, y cada QR con su hora y su venta para buscarlo en el
 * banco.
 *
 * Tocar un cobro abre el detalle de su venta DENTRO de este diálogo, con
 * "Volver a la caja": el Modal no tiene pila y con dos abiertos Escape
 * cerraba los dos.
 */
export function DetalleCaja({
  c,
  tipos,
  ahora,
  onClose,
}: {
  /** La fila de la lista: lo que se muestra mientras carga, y si el detalle no se puede pedir. */
  c: CajaSupervisionApi;
  tipos: Record<string, { nombre: string }>;
  ahora: number;
  onClose: () => void;
}) {
  // Se vuelve a pedir si la fila cambia con el sondeo (una caja abierta que
  // cobró otra mesa, o que se cerró mientras se miraba): el detalle no
  // contradice a la tarjeta de atrás.
  const d = useApi(() => apiBillar.detalleCaja(c.id), [c.id, c.ventas, c.anuladas, c.abierta, c.esperado]);
  const [venta, setVenta] = useState<number | null>(null);
  const { raiz, recordar } = useScrollDelDialogo(venta);
  const abrir = (id: number) => {
    recordar();
    setVenta(id);
  };

  return (
    <Modal
      abierto
      titulo={`Caja de ${c.cajero}`}
      subtitulo={subtituloCaja(c, ahora)}
      onClose={onClose}
      ancho="max-w-2xl"
      acciones={<BotonB onClick={onClose}>Cerrar</BotonB>}
    >
      <div ref={raiz}>
        {venta != null && (
          <ContenidoDetalleVenta
            consulta={{ venta }}
            tipos={tipos}
            ahora={ahora}
            volver={{ texto: "Volver a la caja", onVolver: () => setVenta(null) }}
          />
        )}
        {/* Escondida y no desmontada mientras se mira una venta: al volver, la
            lista de efectivo sigue abierta si se había abierto. */}
        <div hidden={venta != null} className="space-y-5 text-[13px]">
          <QuienYCuando c={c} ahora={ahora} />
          {d.cargando && !d.datos ? (
            <Cargando texto="Cargando lo cobrado de la caja…" />
          ) : d.error || !d.datos ? (
            <>
              <ErrorMsg onReintentar={d.recargar}>{d.error || "No se pudo cargar el detalle de la caja."}</ErrorMsg>
              {/* Lo que ya trae la lista, para que la caja no quede en blanco (ni con ceros que no son). */}
              <LoDeLaFila c={c} />
            </>
          ) : (
            <Detalle c={d.datos.caja ?? c} d={d.datos} ahora={ahora} onAbrir={abrir} />
          )}
          {c.nota && (
            <p className="border-t border-borde-soft pt-3 text-texto-2">
              <b className="font-semibold">Nota al cerrar:</b> {c.nota}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function QuienYCuando({ c, ahora }: { c: CajaSupervisionApi; ahora: number }) {
  return (
    <div className="space-y-1">
      <Fila etiqueta="Abrió" valor={`${c.cajero} · ${cuando(c.desde, ahora)}`} />
      {c.hasta != null ? (
        <Fila etiqueta="Cerró" valor={`${c.cerroPor ?? c.cajero} · ${cuando(c.hasta, ahora)} (${duracion(c.hasta - c.desde)})`} />
      ) : (
        <Fila etiqueta="Lleva" valor={duracion(ahora - c.desde)} />
      )}
    </div>
  );
}

/** Si el detalle no llega: los números que ya trae la fila de la lista, con los rótulos de la tarjeta. */
function LoDeLaFila({ c }: { c: CajaSupervisionApi }) {
  const pie = pieDelEsperado(c);
  return (
    <div className="space-y-1 border-t border-borde-soft pt-3">
      <Fila etiqueta="Vendió" valor={`${fmtMoney(c.vendido)} · ${c.ventas} ${c.ventas === 1 ? "venta" : "ventas"}`} />
      {c.cobrado && <Fila etiqueta="En efectivo" valor={fmtMoney(c.cobrado.efectivo.monto)} />}
      {c.cobrado && <Fila etiqueta="Por QR" valor={fmtMoney(c.cobrado.qr.monto)} />}
      {c.anuladas > 0 && <Fila etiqueta="Ventas anuladas" valor={String(c.anuladas)} />}
      <Fila etiqueta="Cambio inicial" valor={fmtMoney(c.inicial)} />
      {c.cena && <Fila etiqueta="Cena" valor={`${bsResta(c.cena.monto)}${c.cena.por ? ` · ${c.cena.por}` : ""}`} />}
      {c.esperado != null && <Fila etiqueta={c.abierta ? "Debería haber" : "Debía haber"} valor={fmtMoney(c.esperado)} />}
      {c.esperado != null && pie && <p className="text-right text-[12px] text-texto-3">{pie}</p>}
      {c.contado != null && <Fila etiqueta="Efectivo contado" valor={fmtMoney(c.contado)} />}
      {c.contado != null && <Fila etiqueta="Diferencia" valor={textoDiferencia(c.diferencia ?? 0)} />}
    </div>
  );
}

function Detalle({ c, d, ahora, onAbrir }: { c: CajaSupervisionApi; d: DetalleCajaApi; ahora: number; onAbrir: (ventaId: number) => void }) {
  const cobros = d.cobros ?? [];
  const qr = cobros.filter((x) => tipoDeMedio(x.medio) === "qr");
  const efectivo = cobros.filter((x) => tipoDeMedio(x.medio) === "efectivo");
  const otros = agruparOtros(cobros.filter((x) => tipoDeMedio(x.medio) !== "qr" && tipoDeMedio(x.medio) !== "efectivo"));
  const enCurso = d.enCurso ?? [];
  const anuladas = d.anuladas ?? [];
  // La cajera ya está en el título: en sus cobros sólo se nombra a otro que haya cobrado.
  const cajera = c.cajero;
  return (
    <>
      <Fichas c={c} />

      {d.arqueo && <CuentaDelCajon c={c} d={d} ahora={ahora} />}

      <Seccion medio="QR" titulo={`${tituloDeMedio("QR")} · ${fmtMoney(sumaCobros(qr))}`} pie="Va a la cuenta del negocio: cada cobro con su hora, para buscarlo en el banco.">
        <ListaCobros cobros={qr} onAbrir={onAbrir} omitirPor={cajera} vacio="No se cobró nada por QR en esta caja." />
      </Seccion>

      <Seccion medio="Efectivo" titulo={`${tituloDeMedio("Efectivo")} · ${fmtMoney(sumaCobros(efectivo))}`}>
        <ListaCobros cobros={efectivo} onAbrir={onAbrir} omitirPor={cajera} limite={10} vacio="No se cobró nada en efectivo en esta caja." />
      </Seccion>

      {otros.map((g) => (
        <Seccion key={g.medio} medio={g.medio} titulo={`${tituloDeMedio(g.medio)} · ${fmtMoney(sumaCobros(g.cobros))}`}>
          <ListaCobros cobros={g.cobros} onAbrir={onAbrir} omitirPor={cajera} />
        </Seccion>
      ))}

      {enCurso.length > 0 && (
        <Seccion
          icono="bola"
          titulo={`De mesas que siguen abiertas · ${fmtMoney(sumaCobros(enCurso))}`}
          pie="Adelantos y tiempo fijo que ya entraron a esta caja (el efectivo al cajón, el QR a tu cuenta) de mesas o cuentas que todavía no se cobraron. La venta va a aparecer cuando las cierren."
        >
          <ListaCobros cobros={enCurso} omitirPor={cajera} />
        </Seccion>
      )}

      {anuladas.length > 0 && (
        <Seccion
          icono="x"
          titulo="Ventas anuladas (no cuentan)"
          // Sin "la plata se devolvió": el sistema no lo sabe (una venta cobrada
          // dos veces se anula sin devolver nada). Y si alguna se anuló después
          // del cierre, arriba sí está, en la cuenta del efectivo: decir "no
          // están en nada de lo de arriba" contradecía ese renglón.
          pie={
            anuladas.some((a) => a.despuesDelCierre)
              ? "No suman en lo cobrado. Las que se anularon después del cierre sí contaban cuando se contó la caja: por eso están en «El efectivo de la caja»."
              : "No suman en nada de lo de arriba: ni en lo cobrado ni en lo que debía haber en la caja."
          }
        >
          <ul className="divide-y divide-borde-soft">
            {anuladas.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(a.id)}
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <Icon name="x" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-semibold text-texto">
                      {/* El código entero (se cortaba en el guion: "V-" / "000014") y
                          un espacio antes de la etiqueta, para que baje sola. */}
                      <span className="tabular-nums">{cuando(a.hora, ahora)}</span> · <span className="whitespace-nowrap">{a.codigo}</span>
                      {a.despuesDelCierre && " "}
                      {a.despuesDelCierre && (
                        <span className="ml-1 inline-block rounded bg-amber-100 px-1.5 py-px text-[11px] font-bold uppercase tracking-wide text-amber-800">
                          Después del cierre
                        </span>
                      )}
                    </span>
                    <span className="block break-words text-[12px] text-texto-3">
                      Anuló {a.quien}
                      {a.motivo ? ` · «${a.motivo}»` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-texto-3 line-through">{fmtMoney(a.total)}</span>
                  <span className="mt-0.5 shrink-0 text-texto-4">
                    <Icon name="chevronRight" size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </>
  );
}

/** Los cobros con medios que no son efectivo ni QR (tarjeta, transferencia), por medio. */
function agruparOtros(cobros: CobroApi[]): { medio: string; cobros: CobroApi[] }[] {
  const grupos = new Map<string, { medio: string; cobros: CobroApi[] }>();
  for (const x of cobros) {
    const g = grupos.get(x.medio) ?? { medio: x.medio, cobros: [] };
    g.cobros.push(x);
    grupos.set(x.medio, g);
  }
  return [...grupos.values()];
}

/** EN EFECTIVO y POR QR, lado a lado, y lo vendido abajo: lo primero que se lee de la caja. */
function Fichas({ c }: { c: CajaSupervisionApi }) {
  const co = c.cobrado;
  if (!co) return <p className="font-semibold text-texto">{textoVendido(c)}</p>;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Ficha medio="Efectivo" etiqueta="En efectivo" monto={co.efectivo.monto} cobros={co.efectivo.cobros} pie="Entra al cajón" />
        <Ficha medio="QR" etiqueta="Por QR" monto={co.qr.monto} cobros={co.qr.cobros} pie="Va a tu cuenta, no a la caja" />
        {co.otros.map((o) => (
          <Ficha key={o.nombre} medio={o.nombre} etiqueta={`Con ${o.nombre}`} monto={o.monto} cobros={o.cobros} />
        ))}
      </div>
      <p className="text-texto-2">{textoVendido(c, co)}</p>
    </div>
  );
}

function Ficha({ medio, etiqueta, monto, cobros, pie }: { medio: string; etiqueta: string; monto: number; cobros: number; pie?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
      <IconoMedio medio={medio} size={36} />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-texto-3">{etiqueta}</p>
        <p className="text-[18px] font-extrabold leading-tight tabular-nums text-texto">{fmtMoney(monto)}</p>
        <p className="text-[12px] text-texto-3">
          {cobros} {cobros === 1 ? "cobro" : "cobros"}
          {pie ? ` · ${pie}` : ""}
        </p>
      </div>
    </div>
  );
}

/**
 * El efectivo de la caja como una cuenta, renglón por renglón, que suma al
 * "Debía haber"; abajo lo contado y lo que sobró o faltó. Es la cuenta que
 * Miguel hacía a mano con la captura y no le cerraba.
 */
function CuentaDelCajon({ c, d, ahora }: { c: CajaSupervisionApi; d: DetalleCajaApi; ahora: number }) {
  const a = d.arqueo;
  const cerrada = !c.abierta;
  const cuenta = cuentaDelEfectivo(a, d.movimientos ?? [], { cerrada, anuladas: d.anuladas, ahora });
  const contado = a.contado ?? c.contado ?? null;
  const diferencia = a.diferencia ?? c.diferencia ?? null;
  const dif = diferencia != null ? renglonDiferencia(diferencia) : null;
  return (
    <section aria-label="El efectivo de la caja" className="space-y-2">
      <Rotulo icono="billetera">El efectivo de la caja</Rotulo>
      <div className="rounded-xl border border-borde-soft">
        <ul className="divide-y divide-borde-soft">
          {cuenta.renglones.map((r) => (
            <RenglonCuenta key={r.clave} r={r} />
          ))}
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t-2 border-borde bg-slate-50 px-3.5 py-2.5">
          <span className="font-bold text-texto">= {cerrada ? "Debía haber" : "Debería haber ahora"}</span>
          <span className="text-[16px] font-extrabold tabular-nums text-texto">{fmtMoney(cuenta.total)}</span>
        </div>
        {cerrada && contado != null ? (
          <div className="space-y-1 border-t border-borde-soft px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="font-semibold text-texto">Efectivo contado</span>
                <span className="block text-[12px] text-texto-3">Lo contó {c.cerroPor ?? c.cajero} al cerrar</span>
              </span>
              <span className="shrink-0 font-bold tabular-nums text-texto">{fmtMoney(contado)}</span>
            </div>
            {dif && (
              <div className={`flex items-baseline justify-between gap-3 font-bold ${COLOR_DIFERENCIA[dif.tono]}`}>
                <span>{dif.etiqueta}</span>
                <span className="tabular-nums">{dif.valor}</span>
              </div>
            )}
          </div>
        ) : (
          !cerrada && (
            <p className="border-t border-borde-soft px-3.5 py-2.5 text-[12px] text-texto-3">
              La caja sigue abierta: todavía no se contó. Es lo que {c.cajero} tiene que entregar al cerrar.
            </p>
          )
        )}
      </div>
      {cuenta.hoyDaria != null && (
        <Nota tono="azul" icono="info">
          Después del cierre cambió el arqueo
          {(d.anuladas ?? []).some((x) => x.despuesDelCierre)
            ? ` (se anuló ${(d.anuladas ?? [])
                .filter((x) => x.despuesDelCierre)
                // El código no se corta en el guion.
                .map((x) => x.codigo.replace(/-/g, "‑"))
                .join(", ")})`
            : ""}
          : si se contara hoy, debería haber <b className="whitespace-nowrap">{fmtMoney(cuenta.hoyDaria)}</b>. La diferencia de arriba es la que quedó al cerrar.
        </Nota>
      )}
    </section>
  );
}

function RenglonCuenta({ r }: { r: RenglonEfectivo }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className={`break-words font-semibold ${r.anulado ? "text-texto-3 line-through" : "text-texto"}`}>{r.etiqueta}</p>
        {r.pie && <p className="text-[12px] leading-snug text-texto-3">{r.pie}</p>}
      </div>
      <span
        className={`shrink-0 font-bold tabular-nums ${r.anulado ? "text-texto-3 line-through" : r.monto < 0 ? "text-rose-700" : "text-texto"}`}
      >
        {montoDeRenglon(r.anulado ? { monto: r.anulado.monto } : r)}
      </span>
    </li>
  );
}

/** Una sección del detalle: su rótulo (con el medio a la vista) y lo de abajo. */
function Seccion({
  medio,
  icono,
  titulo,
  pie,
  children,
}: {
  medio?: string;
  icono?: "bola" | "x";
  titulo: string;
  pie?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} className="space-y-1.5 border-t border-borde-soft pt-4">
      <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-texto-2">
        {medio ? <MarcaMedio medio={medio} size={14} /> : icono ? <Icon name={icono} size={14} /> : null}
        <span className="min-w-0 break-words">{titulo}</span>
      </h3>
      {pie && <p className="text-[12px] leading-snug text-texto-3">{pie}</p>}
      {children}
    </section>
  );
}
