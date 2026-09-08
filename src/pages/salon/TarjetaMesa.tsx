import { Icon } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import type { Mesa } from "../../types/salon";
import { ETIQUETA_ESTADO } from "../../types/salon";
import {
  COLOR_MESA,
  comandasPendientes,
  consumoDeMesa,
  etiquetaMesa,
  hace,
} from "./logicaSalon";

/**
 * Una mesa del salón.
 *
 * Está pensada para leerse de lejos y de reojo, caminando: primero el código (a
 * dónde ir), después el color (qué pasa ahí) y recién después los números. Por
 * eso el código va grande arriba a la izquierda y el badge de estado enfrente
 * — es lo único que se alcanza a ver con el celular en la mano y una bandeja
 * en la otra.
 *
 * El alto es fijo para que la grilla no quede escalonada: una mesa libre tiene
 * menos texto que una ocupada y, sin altura mínima, las filas quedaban
 * desparejas y costaba barrerlas con la vista.
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
  const libre = mesa.estado === "LIBRE";
  const consumo = consumoDeMesa(mesa);
  const pendientes = comandasPendientes(mesa).length;
  const esMia = mesa.meseroId != null && mesa.meseroId === miMeseroId;
  const tiempo = hace(mesa.abiertaEn);

  return (
    <div className="relative">
      <button
        onClick={() => onClick(mesa)}
        className={[
          "flex min-h-[132px] w-full flex-col rounded-2xl border p-3 text-left transition-shadow hover:shadow-md",
          color.fondo,
          color.borde,
          // La mesa libre lleva el borde punteado: no tiene color propio
          // porque no está pasando nada en ella.
          libre ? "border-dashed" : "",
        ].join(" ")}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xl font-extrabold text-texto">
            {etiquetaMesa(mesa)}
          </span>
          <span
            className={`shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold ${color.texto}`}
          >
            {ETIQUETA_ESTADO[mesa.estado]}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1 text-xs text-texto-3">
          <Icon name="users" size={13} />
          <span>
            {mesa.comensales}/{mesa.capacidadTotal || mesa.capacidad}
          </span>
        </div>

        {/* Empuja el pie hacia abajo para que todas las tarjetas cierren igual */}
        <div className="flex-1" />

        {/* Lo que va consumido: es lo segundo que mira el mesero después del
            estado. En una mesa libre no existe, y ahí va el CTA en su lugar. */}
        {!libre && consumo > 0 && (
          <p className="truncate text-[15px] font-extrabold text-texto">{fmtMoney(consumo)}</p>
        )}

        {mesa.reserva && (
          <p className="truncate text-xs font-semibold text-[#2563EB]">
            {mesa.reserva.hora} · {mesa.reserva.nombre}
          </p>
        )}

        {!libre && (tiempo || esMia) && (
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-texto-3">
            <span className="min-w-0 flex-1 truncate">{tiempo}</span>
            {esMia && <span className="shrink-0">Mi mesa</span>}
          </div>
        )}

        {libre && (
          <span className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
            <Icon name="plus" size={13} />
            Tomar pedido
          </span>
        )}
      </button>

      {/* Cuántas comandas hay que llevarle a ESTA mesa. Va flotando sobre la
          esquina porque es lo único de la tarjeta que exige moverse ahora
          mismo, y adentro del cuerpo se perdía entre los otros números. */}
      {pendientes > 0 && (
        <span className="pointer-events-none absolute -top-1.5 right-2 flex min-w-[22px] items-center gap-1 rounded-full bg-[#D97706] px-2 py-0.5 text-[10px] font-bold text-white shadow">
          <Icon name="alert" size={11} />
          {pendientes}
        </span>
      )}
    </div>
  );
}
