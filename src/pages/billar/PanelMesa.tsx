import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type NombreIcono } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { useAccionesMesa } from "./acciones";
import { etiquetaPagoFijo, fmtCobrado, fmtHace, horaDe } from "./calculo";
import { useDialogos } from "./dialogos";
import { BotonB, Circulo, EstadoBadge, Fila, Nota, Rotulo } from "./ui";
import type { VistaMesa } from "./vista";
import { cronoDe, textoMetodo } from "./vista";

/**
 * El panel de la mesa elegida (§7.1): a la derecha en pantallas anchas y como
 * hoja de abajo en tablet y celular (lo decide el tablero). Todo lo de la
 * cuenta está acá; la tarjeta es el resumen.
 */
export default function PanelMesa({ v, ahora, onCerrar }: { v: VistaMesa; ahora: number; onCerrar: () => void }) {
  const { mesa, tipo, estado, cuenta } = v;
  const { abrir } = useDialogos();
  const navigate = useNavigate();
  const acciones = useAccionesMesa()(v);
  const accion = (clave: string) => acciones.find((a) => a.clave === clave);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-borde px-5 py-4">
        <Circulo icono="bola" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold text-texto">
            Mesa {mesa.id} · {tipo.nombre}
          </h2>
          {mesa.alias && <p className="truncate text-[12px] font-semibold text-texto-2">{mesa.alias}</p>}
          <EstadoBadge estado={estado} className="mt-1" />
        </div>
        <button
          type="button"
          onClick={() => abrir({ tipo: "historial", mesaId: mesa.id })}
          aria-label={`Historial de la Mesa ${mesa.id}`}
          title="Historial de la mesa"
          className="flex h-10 w-10 items-center justify-center rounded-full text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
        >
          <Icon name="clock" size={18} />
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el panel"
          className="flex h-10 w-10 items-center justify-center rounded-full text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {cuenta && mesa.sesion ? (
          <CuentaAbierta v={v} ahora={ahora} />
        ) : estado === "libre" ? (
          <>
            <Nota icono="checkCirculo">
              <b>Mesa libre</b> hace {fmtHace(ahora - (mesa.libreDesde ?? ahora))}. Al abrirla arranca el cronómetro.
            </Nota>
            <TarjetaTarifa v={v} />
          </>
        ) : estado === "reservada" && mesa.reserva ? (
          <>
            <Nota tono="azul" icono="calendar">
              {/* Sin punto después de la hora: ya termina en "p. m." y quedaba
                  "p. m.." (prueba profunda, 18-oct; lo mismo que en Corregir inicio). */}
              Reservada para <b>{mesa.reserva.nombre}</b> a las {horaDe(mesa.reserva.hora)}
            </Nota>
            <TarjetaTarifa v={v} />
          </>
        ) : (
          <Nota tono="gris" icono="llave">
            Fuera de servicio{mesa.fueraMotivo ? `: ${mesa.fueraMotivo}` : ""}. No aparece para abrir hasta que vuelva.
          </Nota>
        )}
      </div>

      <footer className="shrink-0 space-y-3 border-t border-borde px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {cuenta ? (
          <>
            <div className="space-y-1 text-[13px]">
              {/* En el celular la hoja es baja: el desglose ya está arriba, en el bloque del tiempo y en las listas. */}
              <div className="hidden space-y-1 sm:block">
                <Fila etiqueta="Tiempo" valor={fmtMoney(cuenta.tiempoBs)} />
                <Fila etiqueta="Consumos" valor={fmtMoney(cuenta.consumosBs)} />
              </div>
              <div className="flex items-baseline justify-between sm:pt-1">
                <span className="text-[15px] font-bold uppercase text-texto">Total</span>
                <span className="text-xl font-extrabold tabular-nums text-primary-700">{fmtMoney(cuenta.total)}</span>
              </div>
              <div className="hidden sm:block">
                <Fila etiqueta="PAGADO" valor={fmtMoney(cuenta.pagado)} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-bold uppercase text-amber-800">Saldo</span>
                <span className="text-lg font-extrabold tabular-nums text-amber-800">{fmtMoney(cuenta.saldo)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <BotonB icono="plus" onClick={() => navigate(`/billar/consumo/${mesa.id}`)}>
                <span className="sm:hidden">Consumo</span>
                <span className="hidden sm:inline">Agregar consumo</span>
              </BotonB>
              <BotonB icono="billetera" disabled={cuenta.saldo <= 0} onClick={() => abrir({ tipo: "pago", mesaId: mesa.id })}>
                Registrar pago
              </BotonB>
              {estado === "pausada" ? (
                <BotonB variante="ambar" icono="play" onClick={() => accion("reanudar")?.hacer()}>
                  Reanudar
                </BotonB>
              ) : (
                <BotonB icono="pausa" onClick={() => abrir({ tipo: "pausar", mesaId: mesa.id })}>
                  Pausar
                </BotonB>
              )}
              <BotonB icono="swap" onClick={() => abrir({ tipo: "cambiar", mesaId: mesa.id })}>
                Cambiar mesa
              </BotonB>
            </div>
            <BotonB variante="verde" grande icono="check" className="w-full" onClick={() => navigate(`/billar/cerrar/${mesa.id}`)}>
              Finalizar mesa
            </BotonB>
          </>
        ) : estado === "fuera" ? (
          <BotonB variante="verde" grande icono="check" className="w-full" onClick={() => accion("volver")?.hacer()}>
            Volver a servicio
          </BotonB>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {estado === "libre" ? (
                <>
                  <BotonB icono="calendar" onClick={() => accion("reservar")?.hacer()}>
                    Reservar
                  </BotonB>
                  <BotonB icono="llave" onClick={() => accion("fuera")?.hacer()}>
                    Fuera de servicio
                  </BotonB>
                </>
              ) : (
                <BotonB icono="x" className="col-span-2" onClick={() => accion("cancelar")?.hacer()}>
                  Cancelar reserva
                </BotonB>
              )}
            </div>
            <BotonB
              variante="verde"
              grande
              icono={estado === "libre" ? "play" : "arrowRight"}
              className="w-full"
              onClick={() => abrir({ tipo: "abrir", mesaId: mesa.id })}
            >
              {estado === "libre" ? "Abrir mesa" : "Llegó · Abrir"}
            </BotonB>
          </>
        )}
      </footer>
    </div>
  );
}

/** Tarifa, regla y paquetes de la mesa: lo que el cajero le dice al cliente. */
function TarjetaTarifa({ v }: { v: VistaMesa }) {
  const t = v.tipo;
  const promos = t.promos.filter((p) => p.activa);
  return (
    <div className="space-y-1.5 rounded-xl border border-borde bg-muted px-4 py-3 text-[13px]">
      <Fila etiqueta="Tarifa" valor={`${fmtMoney(t.tarifa)}/h`} />
      <Fila etiqueta="Regla" valor={`cada ${t.fraccion} min · mín. ${t.minimo} min · ${t.tolerancia} min tolerancia`} />
      <Fila etiqueta="Tiempo fijo" valor={t.paquetes.map((p) => `${p.h} h ${fmtMoney(p.precio)}`).join(" · ")} />
      {promos.map((p) => (
        <Fila key={p.id} etiqueta={<span className="text-primary-700">{p.nombre}</span>} valor={<span className="text-primary-700">−{p.pct} % en el tiempo</span>} />
      ))}
    </div>
  );
}

function CuentaAbierta({ v, ahora }: { v: VistaMesa; ahora: number }) {
  const { mesa, tipo, estado } = v;
  const s = mesa.sesion!;
  const c = v.cuenta!;
  const { abrir } = useDialogos();
  const bloque = {
    juego: "border-primary-200 bg-primary-50",
    vence: "border-amber-200 bg-amber-50",
    cumplido: "border-rose-200 bg-rose-50",
    pausada: "border-slate-200 bg-slate-50",
  }[estado as "juego" | "vence" | "cumplido" | "pausada"];
  const fijo = s.prepago;
  const rotulo = !fijo ? "Tiempo jugado" : (c.restante ?? 0) > 0 ? "Tiempo restante" : "Tiempo cumplido · excedente";
  const termina = fijo && !s.pausedAt && c.restante !== null ? ahora + c.restante * 1000 : null;

  return (
    <>
      <section className={`rounded-2xl border px-4 py-3.5 ${bloque}`}>
        <Rotulo
          icono={fijo ? "relojArena" : "clock"}
          extra={
            fijo ? (
              <button
                type="button"
                onClick={() => abrir({ tipo: "extender", mesaId: mesa.id })}
                className="rounded-full bg-white px-3 py-1 text-[12px] font-bold normal-case tracking-normal text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-100"
              >
                + Extender
              </button>
            ) : undefined
          }
        >
          {rotulo}
        </Rotulo>
        <p className={`mt-1 text-[34px] font-extrabold leading-tight tracking-tight tabular-nums ${estado === "pausada" ? "text-slate-400" : estado === "cumplido" ? "text-rose-700" : estado === "vence" ? "text-amber-800" : "text-texto"}`}>
          {cronoDe(v)}
        </p>
        <div className="mt-2 space-y-1 text-[13px]">
          <Fila
            etiqueta="Inicio"
            valor={
              <span className="inline-flex items-center gap-2">
                {horaDe(s.start)}
                <button
                  type="button"
                  onClick={() => abrir({ tipo: "editarInicio", mesaId: mesa.id })}
                  className="text-[12px] font-semibold text-texto-3 underline-offset-2 hover:text-texto hover:underline"
                >
                  Corregir
                </button>
              </span>
            }
          />
          <Fila etiqueta="Tarifa" valor={`${fmtMoney(tipo.tarifa)}/h · cada ${tipo.fraccion} min`} />
          {fijo ? (
            <>
              <Fila
                etiqueta="Tiempo fijo"
                valor={`${fijo.min / 60} h · ${fmtMoney(fijo.precio)} · ${etiquetaPagoFijo(s)}`}
              />
              {termina && <Fila etiqueta="Termina" valor={horaDe(termina)} />}
              {c.excedenteMin > 0 && (
                <Fila etiqueta="Excedente" valor={`${fmtCobrado(c.excedenteMin)} → ${fmtMoney(c.excedenteBs)}`} />
              )}
              {(c.restante ?? 1) <= 0 && c.nextSecs !== null && (
                <Fila etiqueta="Siguiente tramo" valor={`a la ${fmtCobrado(Math.floor(c.nextSecs / 60))} → ${fmtMoney(c.nextBs ?? 0)}`} />
              )}
            </>
          ) : (
            <>
              <Fila etiqueta="Tiempo cobrado" valor={`${fmtCobrado(c.cobradoMin)} → ${fmtMoney(c.tiempoBs)}`} />
              {/* El tiempo de arriba (y el del tramo siguiente) ya viene con la
                  promo. Decía "−Bs 6" como si faltara restarlo: el cajero le
                  decía 48 al cliente y el cierre cobraba 54. */}
              {c.promo && (
                <Fila
                  etiqueta={<span className="font-semibold text-primary-700">{c.promo.nombre}</span>}
                  valor={
                    <span className="text-primary-700">
                      −{c.promo.pct} % · ya descontado {fmtMoney(c.promo.descuento)}
                    </span>
                  }
                />
              )}
              {s.prev && (
                <Fila etiqueta="Traído de otra mesa" valor={`${fmtCobrado(s.prev.min)} → ${fmtMoney(s.prev.bs)}`} />
              )}
              {c.nextSecs !== null && !s.pausedAt && (
                <Fila etiqueta="Siguiente tramo" valor={`a la ${fmtCobrado(Math.floor(c.nextSecs / 60))} → ${fmtMoney(c.nextBs ?? 0)}`} />
              )}
            </>
          )}
          {s.pausedAt && (
            <Fila etiqueta="En pausa" valor={`desde ${horaDe(s.pausaDesde ?? s.pausedAt)} · ${s.pauseMotivo ?? ""}`} />
          )}
        </div>
      </section>

      {(s.cliente || (s.garantia && s.garantia !== "Ninguna") || s.nota) && (
        <section className="space-y-1 rounded-xl border border-borde px-4 py-3 text-[13px]">
          {s.cliente && <Fila etiqueta="Cliente" valor={s.cliente} />}
          {s.garantia && s.garantia !== "Ninguna" && <Fila etiqueta="Garantía" valor={s.garantia} />}
          {s.nota && <Fila etiqueta="Nota" valor={s.nota} />}
        </section>
      )}

      <section>
        <Rotulo icono="cart" extra={fmtMoney(c.consumosBs)}>
          Consumos
        </Rotulo>
        {s.consumos.length === 0 ? (
          <p className="mt-2 text-[13px] text-texto-3">Sin consumos todavía.</p>
        ) : (
          <ul className="mt-2 divide-y divide-borde-soft">
            {s.consumos.map((it) => (
              <li key={it.id} className={`group flex items-center gap-3 py-2.5 ${it.anulado ? "opacity-50" : ""}`}>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-1 text-[12px] font-bold text-texto-2">
                  {it.cant}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] font-semibold text-texto ${it.anulado ? "line-through" : ""}`}>
                    {it.nombre}
                  </p>
                  <p className="text-[11px] text-texto-3">
                    {fmtMoney(it.precio)} c/u · {horaDe(it.hora)}
                    {it.anulado && " · anulado"}
                  </p>
                </div>
                <span className="text-[13px] font-bold tabular-nums text-texto">{fmtMoney(it.precio * it.cant)}</span>
                {!it.anulado && (
                  <button
                    type="button"
                    onClick={() => abrir({ tipo: "anularConsumo", mesaId: mesa.id, itemId: it.id })}
                    aria-label={`Anular ${it.nombre}`}
                    title="Anular (pide PIN)"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-texto-4 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Rotulo icono="billetera" extra={fmtMoney(c.pagado)}>
          Pagos
        </Rotulo>
        {s.pagos.length === 0 ? (
          <p className="mt-2 text-[13px] text-texto-3">Sin pagos todavía.</p>
        ) : (
          <ul className="mt-2 divide-y divide-borde-soft">
            {s.pagos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <IconoPago metodo={p.metodo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-texto">{p.nota ?? "Pago"}</p>
                  <p className="text-[11px] text-texto-3">
                    {textoMetodo(p)} · {horaDe(p.hora)}
                  </p>
                </div>
                <span className="text-[13px] font-bold tabular-nums text-texto">{fmtMoney(p.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sólo en los primeros 5 minutos desde que se abrió y sin consumos: después,
          o si ya consumieron, no es un error y se cobra (`v.anulable`). */}
      {v.anulable && (
        <button
          type="button"
          onClick={() => abrir({ tipo: "anularMesa", mesaId: mesa.id })}
          className="flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-rose-700 hover:underline"
        >
          <Icon name="trash" size={15} />
          Anular mesa (se abrió por error)
        </button>
      )}
    </>
  );
}

const ICONO_PAGO: Record<string, NombreIcono> = { Efectivo: "coins", QR: "qr", Mixto: "billetera", Fiado: "fileText" };

function IconoPago({ metodo }: { metodo: string }): ReactNode {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
      <Icon name={ICONO_PAGO[metodo] ?? "coins"} size={15} />
    </span>
  );
}
