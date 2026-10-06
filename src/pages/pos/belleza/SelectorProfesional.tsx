import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { Select } from "../../../components/ui";
import {
  llevaProfesional,
  profesionalDe,
  profesionalDeTodos,
  type AsignacionProfesional,
  type ProfesionalPos,
} from "../../../lib/agenda/ventaDirecta";
import type { LineaCarrito } from "../useCarrito";

/**
 * "¿Quién atendió?" en una venta directa del POS (N2-13): un selector para
 * toda la venta —lo normal en el mostrador: un cliente, una persona— y, si en
 * la venta hay más de un servicio, "Por servicio" para cambiarlo en alguno.
 *
 * Elegir no es obligatorio: sin nadie, la venta sale como siempre (precio de
 * lista, sin comisión ni propina). Sólo aparece en un negocio con agenda, con
 * algún servicio en el carrito y sin una cita cobrándose.
 */
export function SelectorProfesional({
  lineas,
  profesionales,
  asignacion,
  onCambiar,
}: {
  lineas: LineaCarrito[];
  profesionales: ProfesionalPos[];
  asignacion: AsignacionProfesional;
  onCambiar: (a: AsignacionProfesional) => void;
}) {
  const servicios = lineas.filter((l) => llevaProfesional(l.producto));
  const cambiados = servicios.some((l) => l.producto.id in asignacion.porServicio);
  const [porServicio, setPorServicio] = useState(cambiados);
  if (!servicios.length || !profesionales.length) return null;

  const valor = (id: number | null) => (id == null ? "" : String(id));
  const leer = (v: string) => (v === "" ? null : Number(v));
  // QA PER-07: si "Por servicio" los separó, arriba dice "Varios".
  const deTodos = profesionalDeTodos(
    servicios.map((l) => l.producto.id),
    asignacion,
  );
  const opciones = (
    <>
      <option value="">Sin asignar</option>
      {profesionales.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </>
  );

  return (
    <div className="space-y-2 rounded-xl border border-borde bg-white px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="profesional-venta" className="flex items-center gap-2 text-sm font-bold text-texto">
          <Icon name="user" size={17} />
          ¿Quién atendió?
        </label>
        <Select
          id="profesional-venta"
          aria-label="Profesional de la venta"
          className="min-w-0 flex-1 sm:max-w-xs"
          value={deTodos === "VARIOS" ? "VARIOS" : valor(deTodos)}
          // Elegir arriba es "uno para todo": vale para todos los servicios,
          // también los que se habían cambiado a mano. Si no, con "Varios"
          // elegir a alguien no cambiaba lo que el selector mostraba.
          onChange={(e) => onCambiar({ general: leer(e.target.value), porServicio: {} })}
        >
          {deTodos === "VARIOS" && (
            <option value="VARIOS" disabled>
              Varios
            </option>
          )}
          {opciones}
        </Select>
        {servicios.length > 1 && (
          <button
            type="button"
            onClick={() => {
              // Al cerrar "Por servicio" vuelve a valer uno para todo.
              if (porServicio) onCambiar({ ...asignacion, porServicio: {} });
              setPorServicio(!porServicio);
            }}
            className="rounded-lg px-2 py-1 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
          >
            {porServicio ? "Uno para todo" : "Por servicio"}
          </button>
        )}
      </div>
      {porServicio && servicios.length > 1 && (
        <ul className="space-y-1.5">
          {servicios.map((l) => (
            <li key={l.producto.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-texto-2">{l.producto.nombre}</span>
              <Select
                aria-label={`Profesional de ${l.producto.nombre}`}
                className="w-40 shrink-0 sm:w-48"
                value={valor(profesionalDe(l.producto.id, asignacion))}
                onChange={(e) =>
                  onCambiar({
                    ...asignacion,
                    porServicio: { ...asignacion.porServicio, [l.producto.id]: leer(e.target.value) },
                  })
                }
              >
                {opciones}
              </Select>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-texto-3">
        Con su precio, su comisión y la propina para quien lo hizo. Sin asignar, la venta sale como siempre.
      </p>
    </div>
  );
}
