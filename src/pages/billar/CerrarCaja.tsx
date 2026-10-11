import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { parsearMonto } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { horaDe, round2 } from "./calculo";
import { CampoBs } from "./Cobro";
import { CajaCerradaAviso } from "./ModalesCaja";
import { useAhora } from "./reloj";
import { billar, useBillar } from "./store";
import { BotonB, EstadoBadge, Encabezado, Fila, Tarjeta } from "./ui";
import { nombreMesa, resumenTurno, vistaDe } from "./vista";

/**
 * Cerrar caja (§7.13): el resumen del turno y el arqueo del efectivo.
 *
 * Las mesas abiertas no impiden cerrar: pasan al turno siguiente con su saldo
 * (así lo muestra la captura; la spec decía lo contrario y se eligió la
 * captura: en un billar el turno cambia con mesas en juego). Lo que esas
 * mesas ya pagaron sí está en este cajón y entra en el efectivo esperado.
 *
 * MAQUETA: con el backend es el cierre de caja del POS, con el billar
 * desglosado (`GET /billar/caja/resumen`).
 */
export default function CerrarCaja() {
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const [contado, setContado] = useState("");

  if (!e.caja.abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Cerrar caja" />
        <CajaCerradaAviso />
      </div>
    );
  }

  const r = resumenTurno(e);
  const esperado = round2(e.caja.inicial + r.efectivo);
  const cuenta = parsearMonto(contado);
  const diferencia = cuenta === null ? null : round2(cuenta - esperado);
  const abiertas = e.mesas.filter((m) => m.estado === "abierta").map((m) => vistaDe(e, m, ahora));
  const porCobrar = round2(abiertas.reduce((t, v) => t + (v.cuenta?.saldo ?? 0), 0));

  const cerrar = () => {
    if (diferencia === null) return;
    billar.cerrarCaja();
    billar.avisar({
      tono: diferencia === 0 ? "verde" : "rojo",
      titulo: "Caja cerrada",
      texto:
        diferencia === 0
          ? `Cuadró: ${fmtMoney(esperado)} en efectivo.`
          : diferencia > 0
            ? `Sobraron ${fmtMoney(diferencia)} en efectivo.`
            : `Faltaron ${fmtMoney(-diferencia)} en efectivo.`,
    });
    navigate("/billar");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Cerrar caja" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <Link
            to="/billar"
            className="inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-texto-3 hover:text-texto"
          >
            <Icon name="arrowLeft" size={16} />
            Volver al billar
          </Link>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Tarjeta icono="fileText" titulo="Resumen del turno" extra={`desde ${horaDe(e.caja.desde)}`}>
                <div className="space-y-1.5 text-[13px]">
                  <Fila etiqueta="Fondo inicial" valor={fmtMoney(e.caja.inicial)} />
                  <Fila etiqueta="Ventas en efectivo" valor={fmtMoney(r.efectivo)} />
                  <Fila etiqueta="Ventas por QR" valor={fmtMoney(r.qr)} />
                  <Fila etiqueta="A crédito (fiado)" valor={fmtMoney(r.fiado)} />
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-borde-soft pt-3">
                  <span className="text-[15px] font-semibold text-texto">Efectivo esperado</span>
                  <span className="text-xl font-extrabold tabular-nums text-texto">{fmtMoney(esperado)}</span>
                </div>
                {r.adelantos > 0 && (
                  <p className="mt-2 text-xs text-texto-4">
                    Incluye {fmtMoney(r.adelantos)} cobrados a mesas que siguen abiertas (adelantos y tiempo fijo).
                  </p>
                )}
              </Tarjeta>

              <Tarjeta icono="bola" titulo="Billar en este turno">
                <div className="space-y-1.5 text-[13px]">
                  <Fila etiqueta="Tiempo de mesas" valor={fmtMoney(r.tiempoMesa)} />
                  <Fila etiqueta="Consumos en mesas" valor={fmtMoney(r.consumosMesa)} />
                  <Fila etiqueta="Mesas cerradas" valor={r.mesasCerradas} />
                  <Fila etiqueta="Ventas rápidas" valor={`${r.rapidas} · ${fmtMoney(r.rapidasBs)}`} />
                  <Fila etiqueta="Ventas anuladas" valor={`${r.anuladas} · ${fmtMoney(r.anuladasBs)}`} />
                </div>
              </Tarjeta>
            </div>

            <div className="space-y-4">
              {abiertas.length > 0 && (
                <section className="rounded-2xl border border-amber-300 bg-amber-50 p-3 sm:p-4">
                  <p className="flex items-start gap-2 px-1 pb-3 text-[13px] font-semibold text-amber-800">
                    <span className="mt-px shrink-0">
                      <Icon name="alert" size={16} />
                    </span>
                    <span>
                      {abiertas.length === 1 ? "1 mesa abierta" : `${abiertas.length} mesas abiertas`} ·{" "}
                      {fmtMoney(porCobrar)} por cobrar · pasan al siguiente turno
                    </span>
                  </p>
                  <ul className="divide-y divide-borde-soft rounded-xl bg-white">
                    {abiertas.map((v) => (
                      <li key={v.mesa.id}>
                        <Link
                          to={`/billar?mesa=${v.mesa.id}`}
                          className="flex min-h-12 items-center gap-3 px-3.5 py-2 text-[13px] hover:bg-muted"
                        >
                          <span className="min-w-0 truncate font-bold text-texto">{nombreMesa(v.mesa)}</span>
                          <EstadoBadge estado={v.estado} />
                          <span className="ml-auto shrink-0 text-texto-3">
                            Saldo{" "}
                            <b className="tabular-nums text-texto">{fmtMoney(v.cuenta?.saldo ?? 0)}</b>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="card space-y-3 p-4 sm:p-5">
                <div>
                  <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Contá el efectivo</p>
                  <CampoBs
                    etiqueta="Efectivo contado"
                    valor={contado}
                    onCambiar={setContado}
                    placeholder={String(esperado)}
                  />
                  <p className="mt-1.5 text-xs text-texto-4">Billetes y monedas en el cajón, incluido el fondo inicial.</p>
                </div>
                {diferencia !== null && (
                  <div
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                      diferencia === 0
                        ? "border-primary-200 bg-primary-50 text-primary-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <span className="text-[12px] font-bold uppercase tracking-wider">
                      {diferencia === 0 ? "Cuadra" : diferencia > 0 ? "Sobra" : "Falta"}
                    </span>
                    <span className="text-xl font-extrabold tabular-nums">{fmtMoney(Math.abs(diferencia))}</span>
                  </div>
                )}
                <BotonB
                  variante="verde"
                  grande
                  icono="lock"
                  className="w-full"
                  disabled={diferencia === null}
                  onClick={cerrar}
                >
                  Cerrar caja
                </BotonB>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
