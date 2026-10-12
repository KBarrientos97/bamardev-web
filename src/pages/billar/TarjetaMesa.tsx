import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { useAccionesMesa, type AccionMesa } from "./acciones";
import { fmtCobrado, fmtHace, fmtTarifaCorta, horaDe } from "./calculo";
import { ESTADOS } from "./estilos";
import { BotonB, EstadoBadge, Fila } from "./ui";
import type { VistaMesa } from "./vista";
import { cronoDe } from "./vista";

/**
 * Una mesa en el tablero (§7.1, vista Mapa). Tocarla la selecciona y abre el
 * panel; el botón de abajo hace lo más común en ese estado sin abrir nada.
 */
export default function TarjetaMesa({
  v,
  ahora,
  seleccionada,
  onSeleccionar,
}: {
  v: VistaMesa;
  ahora: number;
  seleccionada: boolean;
  onSeleccionar: () => void;
}) {
  const acciones = useAccionesMesa()(v);
  const { mesa, tipo, estado, cuenta } = v;
  const s = mesa.sesion;
  const estilo = ESTADOS[estado];
  const apagada = estado === "fuera";

  return (
    <article
      className={[
        "group relative flex min-h-[250px] cursor-pointer flex-col rounded-2xl border-2 p-3 text-left transition-shadow sm:min-h-[262px] sm:p-4",
        estilo.tarjeta,
        seleccionada ? "shadow-lg ring-2 ring-primary/40 ring-offset-2 ring-offset-fondo" : "hover:shadow-md",
      ].join(" ")}
      onClick={onSeleccionar}
    >
      {/* El borde que late cuando se cumplió el tiempo (§3). */}
      {estado === "cumplido" && (
        <span aria-hidden className="pointer-events-none absolute -inset-0.5 animate-pulse rounded-2xl ring-4 ring-rose-300" />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Un botón de verdad para el teclado: la tarjeta entera es para el mouse. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeleccionar();
            }}
            className={`text-[15px] font-extrabold uppercase tracking-wide focus-visible:underline focus-visible:outline-none ${
              apagada ? "text-slate-400" : "text-texto"
            }`}
            aria-pressed={seleccionada}
          >
            Mesa {mesa.id}
          </button>
          {mesa.alias && <p className="truncate text-[12px] font-semibold text-texto-2">{mesa.alias}</p>}
          <p className={`text-[12px] ${apagada ? "text-slate-400" : "text-texto-3"}`}>
            {tipo.nombre} · {fmtTarifaCorta(tipo.tarifa)}
          </p>
        </div>
        <MenuMesa acciones={acciones} visible={seleccionada} nombre={`Mesa ${mesa.id}`} />
      </div>

      <EstadoBadge estado={estado} className="mt-2 self-start" />

      {cuenta && s ? (
        <>
          <p className={`mt-2 text-[26px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[30px] ${estilo.crono}`}>
            {cronoDe(v)}
          </p>
          <p className={`mt-1.5 flex items-center gap-1 text-[12px] ${subColor(estado)}`}>
            {subLinea(v)}
          </p>
          <div className="my-3 border-t border-black/5" />
          <div className="space-y-0.5 text-[13px]">
            <Fila etiqueta="Tiempo" valor={fmtMoney(cuenta.tiempoBs)} />
            <Fila etiqueta="Consumos" valor={fmtMoney(cuenta.consumosBs)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-extrabold tabular-nums text-primary-700">{fmtMoney(cuenta.total)}</span>
            {cuenta.pagado > 0 &&
              (cuenta.saldo > 0 ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  FALTA <span className="tabular-nums">{fmtMoney(cuenta.saldo)}</span>
                </span>
              ) : (
                <span className="rounded-md bg-primary-100 px-2 py-0.5 text-[11px] font-bold uppercase text-primary-700">
                  Pagado
                </span>
              ))}
          </div>
        </>
      ) : estado === "libre" ? (
        <>
          <p className="mt-3 text-[13px] text-texto-2">
            Libre hace {fmtHace(ahora - (mesa.libreDesde ?? ahora))}
          </p>
          <p className="mt-3 text-[12px] text-texto-3">Lista para abrir. Se cobra cada {tipo.fraccion} min.</p>
        </>
      ) : estado === "reservada" && mesa.reserva ? (
        <>
          <p className="mt-3 text-[26px] font-extrabold leading-none text-blue-800">{horaDe(mesa.reserva.hora)}</p>
          <p className="mt-1.5 flex items-center gap-1 text-[12px] text-blue-700">
            <Icon name="user" size={12} />
            {mesa.reserva.nombre}
          </p>
        </>
      ) : (
        <p className="mt-3 flex items-center gap-1 text-[12px] text-slate-400">
          <Icon name="llave" size={12} />
          {mesa.fueraMotivo || "Fuera de servicio"}
        </p>
      )}

      {acciones[0] && estado !== "fuera" && (
        <div className="mt-auto pt-4">
          <BotonB
            variante={varianteDe(estado)}
            icono={acciones[0].icono}
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              acciones[0].hacer();
            }}
          >
            {etiquetaCorta(acciones[0])}
          </BotonB>
        </div>
      )}
    </article>
  );
}

function subLinea(v: VistaMesa) {
  const c = v.cuenta!;
  const s = v.mesa.sesion!;
  const horas = s.prepago ? s.prepago.min / 60 : 0;
  switch (v.estado) {
    case "pausada":
      return (
        <>
          <Icon name="pausa" size={12} />
          {s.pauseMotivo || "En pausa"}
        </>
      );
    case "cumplido":
      return <>Tiempo cumplido · excedente a {fmtTarifaCorta(v.tipo.tarifa)}</>;
    case "vence":
      return (
        <>
          <Icon name="bell" size={12} />
          Quedan · tiempo fijo {horas} h
        </>
      );
    default:
      if (s.prepago) return <>Quedan · tiempo fijo {horas} h</>;
      return (
        <>
          Cobrado {fmtCobrado(c.cobradoMin)}
          {c.nextSecs !== null && <> · sube a la {fmtCobrado(c.nextSecs / 60)}</>}
        </>
      );
  }
}

function subColor(estado: VistaMesa["estado"]): string {
  if (estado === "vence") return "font-semibold text-amber-800";
  if (estado === "cumplido") return "font-semibold text-rose-700";
  return "text-texto-3";
}

function varianteDe(estado: VistaMesa["estado"]) {
  if (estado === "libre") return "menta" as const;
  if (estado === "vence" || estado === "pausada") return "ambar" as const;
  if (estado === "cumplido") return "rosa" as const;
  return "blanco" as const;
}

/** En la tarjeta, "Agregar consumo" no entra: dice "Consumo". */
function etiquetaCorta(a: AccionMesa): string {
  return a.clave === "consumo" ? "Consumo" : a.etiqueta;
}

/** El menú "…" con todo lo que se puede hacer con la mesa. */
export function MenuMesa({
  acciones,
  visible,
  nombre,
  alineado = "derecha",
}: {
  acciones: AccionMesa[];
  visible: boolean;
  nombre: string;
  alineado?: "derecha" | "izquierda";
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative -mr-1 -mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Más acciones de ${nombre}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((x) => !x)}
        className={`flex h-9 w-9 items-center justify-center rounded-full text-texto-3 transition hover:bg-black/5 focus-visible:opacity-100 ${
          visible || abierto ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
        }`}
      >
        <Icon name="masH" size={20} />
      </button>
      {abierto && (
        <div
          role="menu"
          className={`absolute top-10 z-30 w-52 overflow-hidden rounded-xl border border-borde bg-white py-1 shadow-xl ${
            alineado === "derecha" ? "right-0" : "left-0"
          }`}
        >
          {acciones.map((a) => (
            <button
              key={a.clave}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                a.hacer();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted"
            >
              <Icon name={a.icono} size={16} />
              {a.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
