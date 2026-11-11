import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import type { Mesa } from "../../types/salon";
import { ETIQUETA_ESTADO } from "../../types/salon";
import {
  COLOR_MESA,
  inicialesDe,
  comandasPendientes,
  consumoDeMesa,
  etiquetaMesa,
  hace,
  nivelDeEspera,
} from "./logicaSalon";

/** El color del tiempo según cuánto lleva la mesa (`nivelDeEspera`). */
const COLOR_ESPERA = {
  normal: "text-texto-3",
  larga: "font-bold text-warning-text",
  muyLarga: "font-bold text-danger-text",
} as const;

/**
 * Una mesa con gente (o reservada).
 *
 * Está pensada para leerse de lejos y de reojo, caminando: primero el código (a
 * dónde ir), después el estado y el nombre del cliente, y recién después los
 * números — es lo que se alcanza a ver con el celular en la mano y una bandeja
 * en la otra.
 *
 * El nombre del cliente va acá desde el 10-nov: se pedía al abrir la mesa
 * "para encontrarla cuando el salón está lleno" y sólo se veía al entrar a
 * ella (UX-MESEROS §1).
 *
 * El alto es fijo para que la grilla no quede escalonada.
 */
export default function TarjetaMesa({
  mesa,
  miMeseroId,
  onClick,
}: {
  mesa: Mesa;
  miMeseroId?: number | null;
  onClick: (mesa: Mesa) => void;
}) {
  const color = COLOR_MESA[mesa.estado];
  const pagada = mesa.estado === "PAGADA";
  const consumo = consumoDeMesa(mesa);
  const pendientes = comandasPendientes(mesa).length;
  const esMia = mesa.meseroId != null && mesa.meseroId === miMeseroId;
  const tiempo = hace(mesa.abiertaEn);
  const espera = pagada ? "normal" : nivelDeEspera(mesa.abiertaEn);
  // Lo que falta llevar manda sobre el borde: es lo único de la tarjeta que
  // exige moverse ahora mismo. La cuenta pedida ya trae su rojo.
  const borde = pendientes > 0 && mesa.estado !== "CUENTA" ? "border-warning-borde" : color.borde;

  return (
    <div className="relative">
      <button
        onClick={() => onClick(mesa)}
        className={`flex min-h-[148px] w-full flex-col gap-1 rounded-2xl border-[1.5px] bg-white p-3 text-left transition-shadow hover:shadow-md ${borde}`}
      >
        <div className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xl font-extrabold text-texto">
            {etiquetaMesa(mesa)}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${color.chip}`}>
            {pagada ? "Por liberar" : ETIQUETA_ESTADO[mesa.estado]}
          </span>
        </div>

        {mesa.referencia && (
          <p className="w-full truncate text-sm font-bold text-texto">{mesa.referencia}</p>
        )}

        <div className="flex items-center gap-1 text-xs text-texto-2">
          <Icon name="users" size={13} />
          <span className="truncate">
            {mesa.comensales}/{mesa.capacidadTotal || mesa.capacidad}
            {/* Si no es mía van las iniciales del que la atiende: así el mesero
                sabe a quién preguntarle sin abrir la mesa. */}
            {mesa.meseroNombre && ` · ${esMia ? "Mi mesa" : inicialesDe(mesa.meseroNombre)}`}
          </span>
        </div>

        {mesa.reserva && (
          <p className="w-full truncate text-xs font-semibold text-texto-2">
            <Icon name="clock" size={12} className="mr-1 inline" />
            {mesa.reserva.hora} · {mesa.reserva.nombre}
            {mesa.reserva.personas ? ` (${mesa.reserva.personas})` : ""}
          </p>
        )}

        {pendientes > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning-borde bg-warning-suave px-2 py-0.5 text-[11px] font-bold text-warning-text">
            <Icon name="bell" size={11} />
            {pendientes === 1 ? "1 para llevar" : `${pendientes} para llevar`}
          </span>
        )}

        {/* Empuja el pie hacia abajo para que todas las tarjetas cierren igual */}
        <div className="flex-1" />

        <div className="flex w-full items-end justify-between gap-2">
          {pagada ? (
            // Ya se cobró: lo que falta es levantarla, no el monto.
            <span className="flex items-center gap-1 text-xs font-bold text-texto-2">
              <Icon name="check" size={13} />
              Tocá para liberar
            </span>
          ) : (
            consumo > 0 && (
              <span className="truncate text-base font-extrabold text-texto">{fmtMoney(consumo)}</span>
            )
          )}
          {tiempo && (
            <span className={`ml-auto flex shrink-0 items-center gap-1 text-xs ${COLOR_ESPERA[espera]}`}>
              <Icon name="clock" size={12} />
              {tiempo}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

/**
 * Una mesa libre: chica, de a cuatro por fila.
 *
 * De una mesa libre no hay nada que leer más que su código y cuántos entran.
 * Ocupaba lo mismo que una con gente, y con un salón a medio llenar la primera
 * pantalla eran todas libres (UX-MESEROS §1).
 */
export function TarjetaMesaLibre({
  mesa,
  onClick,
}: {
  mesa: Mesa;
  onClick: (mesa: Mesa) => void;
}) {
  const lugares = mesa.capacidadTotal || mesa.capacidad;
  return (
    <button
      onClick={() => onClick(mesa)}
      aria-label={`Abrir ${etiquetaMesa(mesa)}, ${lugares} lugares`}
      className="flex min-h-[60px] w-full flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed border-texto-4 bg-white px-1 py-1.5 hover:bg-primary-50"
    >
      <span className="max-w-full truncate text-[15px] font-extrabold text-texto">
        {etiquetaMesa(mesa)}
      </span>
      <span className="text-[11px] text-texto-3">{lugares} lug.</span>
    </button>
  );
}
