import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Vacio } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { fmtCobrado, horaDe } from "./calculo";
import { useDialogos } from "./dialogos";
import { cargarVentas, useBillar } from "./store";
import type { VentaBillar } from "./tipos";
import { BotonB, ChipFiltro, Circulo, Encabezado } from "./ui";
import { etiquetaOrigen, resumenTurno } from "./vista";

type Filtro = "todas" | "billar" | "cuentas" | "pos" | "anuladas";

const FILTROS: { clave: Filtro; etiqueta: string }[] = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "billar", etiqueta: "Billar" },
  // Las cuentas abiertas cobradas (sin mesa ni tiempo, 21-oct).
  { clave: "cuentas", etiqueta: "Cuentas" },
  // "Venta rápida", como la llaman el botón, el detalle y el ticket (prueba
  // profunda, 18-oct): "Punto de venta" es también el POS del menú.
  { clave: "pos", etiqueta: "Venta rápida" },
  { clave: "anuladas", etiqueta: "Anuladas" },
];

function pasa(v: VentaBillar, f: Filtro): boolean {
  if (f === "billar") return v.origen === "mesa" && !v.anulada;
  if (f === "cuentas") return v.origen === "cuenta" && !v.anulada;
  if (f === "pos") return v.origen === "rapida" && !v.anulada;
  if (f === "anuladas") return !!v.anulada;
  return true;
}

const unidades = (v: VentaBillar) => v.items.reduce((t, i) => t + i.cant, 0);

const iconoOrigen = (v: VentaBillar) => (v.origen === "mesa" ? "bola" : v.origen === "cuenta" ? "users" : "cart");

function detalle(v: VentaBillar): string {
  const n = unidades(v);
  const productos = n ? `${n} ${n === 1 ? "producto" : "productos"}` : "Sin consumos";
  return v.origen === "mesa" ? `Tiempo ${fmtCobrado(v.tiempoMin)} · ${productos}` : productos;
}

function metodo(v: VentaBillar): string {
  const distintos = [...new Set(v.pagos.map((p) => p.metodo))];
  if (distintos.includes("Fiado")) return "Fiado";
  return distintos.length === 1 ? distintos[0] : "Mixto";
}

/** Ventas del turno (§7.9): las de mesa y las rápidas, con el detalle, el ticket y anular. */
export default function VentasTurno() {
  const e = useBillar();
  const navigate = useNavigate();
  const { abrir } = useDialogos();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  // Al entrar, las del momento: las del sondeo pueden tener hasta medio minuto.
  useEffect(() => {
    void cargarVentas();
  }, []);
  const r = resumenTurno(e);
  const ventas = [...e.ventas].sort((a, b) => b.hora - a.hora);
  const visibles = ventas.filter((v) => pasa(v, filtro));
  const anular = (codigo: string) => {
    // Después de autorizar se ve el detalle, que ahora dice "Anulada"; si se
    // cancela, se vuelve a la lista. El detalle se abría de entrada debajo del
    // PIN, y al cancelar quedaba a la vista una venta que nadie había pedido
    // ver (QA del 23-oct).
    abrir({ tipo: "anularVenta", codigo, desdeLista: true });
  };

  const th = "px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-texto-3";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Ventas">
        <BotonB icono="arrowLeft" onClick={() => navigate("/billar")} aria-label="Volver al billar">
          <span className="hidden sm:inline">Volver al billar</span>
        </BotonB>
      </Encabezado>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icono="fileText" etiqueta="Ventas del turno" valor={String(r.ventas)} pie={`desde ${horaDe(e.caja.desde)}`} />
            <Kpi icono="billetera" etiqueta="Total vendido" valor={fmtMoney(r.total)} />
            <Kpi
              icono="bola"
              etiqueta="De mesas de billar"
              valor={fmtMoney(r.tiempoMesa + r.consumosMesa)}
              pie={`${r.mesasCerradas} ${r.mesasCerradas === 1 ? "mesa cerrada" : "mesas cerradas"}`}
            />
            <Kpi icono="trash" tono="gris" etiqueta="Anuladas" valor={String(r.anuladas)} pie={fmtMoney(r.anuladasBs)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
              {FILTROS.map((f) => (
                <ChipFiltro key={f.clave} activo={filtro === f.clave} etiqueta={f.etiqueta} onClick={() => setFiltro(f.clave)} />
              ))}
            </div>
            <span className="ml-auto flex items-center gap-1 text-[12px] text-texto-3">
              <Icon name="lock" size={13} />
              Anular pide PIN
            </span>
          </div>

          {visibles.length === 0 ? (
            <div className="card">
              <Vacio icono="fileText" titulo="No hay ventas acá" texto="Cambiá el filtro para ver las demás." />
            </div>
          ) : (
            <>
              {/* Celular y tablet: una tarjeta por venta, el detalle en el popup. */}
              <ul className="space-y-2 lg:hidden">
                {visibles.map((v) => (
                  <li key={v.codigo}>
                    <button
                      type="button"
                      onClick={() => abrir({ tipo: "venta", codigo: v.codigo })}
                      className={`card flex w-full items-center gap-3 px-4 py-3 text-left ${v.anulada ? "opacity-60" : ""}`}
                    >
                      <Circulo icono={iconoOrigen(v)} tono={v.anulada ? "gris" : "verde"} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-texto">
                          {v.codigo} · {etiquetaOrigen(v)}
                        </p>
                        <p className="truncate text-[12px] text-texto-3">
                          {horaDe(v.hora)} · {detalle(v)} · {metodo(v)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[14px] font-extrabold tabular-nums ${v.anulada ? "line-through" : "text-primary-700"}`}>
                          {fmtMoney(v.total)}
                        </p>
                        <EstadoVenta v={v} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="card hidden overflow-hidden lg:block">
                <table className="w-full text-[13px]">
                  <thead className="border-b border-borde">
                    <tr className="text-left">
                      <th className={`${th} pl-5`}>Código</th>
                      <th className={th}>Hora</th>
                      <th className={th}>Origen</th>
                      <th className={th}>Detalle</th>
                      <th className={th}>Método</th>
                      <th className={`${th} text-right`}>Total</th>
                      <th className={th}>Estado</th>
                      <th className={`${th} pr-5 text-right`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((v) => (
                      <tr key={v.codigo} className={`border-b border-borde-soft last:border-0 ${v.anulada ? "text-texto-4" : "text-texto"}`}>
                        <td className="py-3 pl-5 pr-3 font-bold">{v.codigo}</td>
                        <td className="px-3 tabular-nums">{horaDe(v.hora)}</td>
                        <td className="px-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Icon name={iconoOrigen(v)} size={15} />
                            {etiquetaOrigen(v)}
                          </span>
                        </td>
                        <td className="px-3 text-texto-3">{detalle(v)}</td>
                        <td className="px-3">{metodo(v)}</td>
                        <td className={`px-3 text-right font-bold tabular-nums ${v.anulada ? "line-through" : "text-primary-700"}`}>
                          {fmtMoney(v.total)}
                        </td>
                        <td className="px-3">
                          <EstadoVenta v={v} />
                        </td>
                        <td className="py-2 pl-3 pr-5">
                          <div className="flex justify-end gap-2">
                            <BotonB className="min-h-9 px-3.5 text-[13px]" onClick={() => abrir({ tipo: "venta", codigo: v.codigo })}>
                              Ver
                            </BotonB>
                            {!v.anulada && (
                              <BotonB variante="rosa" icono="trash" className="min-h-9 px-3.5 text-[13px]" onClick={() => anular(v.codigo)}>
                                Anular
                              </BotonB>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EstadoVenta({ v }: { v: VentaBillar }) {
  if (v.anulada) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold uppercase text-rose-700">
        <Icon name="x" size={11} strokeWidth={3} />
        Anulada
      </span>
    );
  }
  if (v.pagos.some((p) => p.metodo === "Fiado")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800">
        Fiado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">
      <Icon name="check" size={11} strokeWidth={3} />
      Pagada
    </span>
  );
}

function Kpi({
  icono,
  etiqueta,
  valor,
  pie,
  tono = "verde",
}: {
  icono: "fileText" | "billetera" | "bola" | "trash";
  etiqueta: string;
  valor: string;
  pie?: string;
  tono?: "verde" | "gris";
}) {
  return (
    <div className="card flex items-start gap-3 px-4 py-3.5">
      {/* En el celular el círculo le quitaba el ancho al monto: "Bs 35..." en vez
          de "Bs 358,67" (360 px). Como en el tablero, sólo desde `sm`. */}
      <span className="hidden sm:block">
        <Circulo icono={icono} tono={tono} size={36} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-texto-3 sm:text-[11px]">{etiqueta}</p>
        <p className="truncate text-lg font-extrabold tabular-nums text-texto sm:text-[22px]">{valor}</p>
        {pie && <p className="truncate text-[12px] text-texto-3">{pie}</p>}
      </div>
    </div>
  );
}
