import { useState } from "react";
import { fechaNegocio } from "../lib/agenda/horaAgenda";
import { avisosDe, marcarCerrado, proyectar, sinCerrar, textoChip } from "../lib/cupo";
import { abrirHojaCupo } from "../lib/hojaCupo";
import { pendientesDeHoy, useColaOffline } from "../lib/offline/cola";
import { useAuth } from "../store/AuthContext";
import { useCupo } from "../store/useCupo";
import type { UnidadCupo } from "../types";
import { Icon } from "./Icon";

/**
 * El chip del Plan Emprendedor: "Hoy 32/50 · Créditos 240" en el POS y
 * "Citas hoy 12/25 · Créditos 240" en la agenda (§5.1). Tocarlo abre la hoja
 * de compra.
 *
 * Sin cupo (Básico, Profesional, backend viejo) devuelve null: ni un píxel de
 * diferencia para Omar.
 */
export default function ChipCupo({ unidad, className = "" }: { unidad: UnidadCupo; className?: string }) {
  const { cupo, aplica } = useCupo();
  const cola = useColaOffline();
  if (!aplica || !cupo) return null;
  const pendientes = unidad === "VENTA" ? pendientesDeHoy(cola) : 0;
  const { contador, creditos } = textoChip(cupo, unidad, undefined, pendientes);
  const p = proyectar(cupo, unidad, { pendientes });
  const negativo = cupo.creditos.saldo < 0;
  // Verde mientras sobra; ámbar desde el 80 % o ya usando créditos; rojo
  // cuando no queda nada (la próxima se bloquea).
  const tono = !p.puede
    ? "border-danger-text/30 bg-danger-bg text-danger-text"
    : p.limite != null && (p.usaCreditos || p.usadas >= Math.ceil(p.limite * 0.8))
      ? "border-warning/40 bg-warning-bg text-warning-text"
      : "border-primary/30 bg-primary-50 text-primary-700";
  return (
    <button
      type="button"
      onClick={() => abrirHojaCupo({ unidad })}
      title="Comprar créditos"
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 ${tono} ${className}`}
    >
      <Icon name="coins" size={14} />
      <span className="truncate">
        {contador && <>{contador} · </>}
        <span className={negativo ? "font-bold text-danger-text" : undefined}>{creditos}</span>
      </span>
    </button>
  );
}

/**
 * La franja del Layout, junto al aviso de licencia: el chip de ventas para
 * quien vende y, debajo, los avisos del día (§5.1). Va arriba del contenido y
 * no adentro del POS por lo mismo que el aviso de licencia: queda a la vista
 * en el celular, con la pantalla scrolleada y en TODAS las pantallas (el POS,
 * el billar, el Dashboard).
 *
 * Cada aviso queda a la vista hasta que lo cierran; cerrado, vuelve al día
 * siguiente o, el del saldo, si el saldo sigue bajando (ver `sinCerrar`).
 * Antes se gastaba al mostrarse, en la primera pantalla después del login, y
 * el cajero del POS o del billar no lo veía nunca (QA del 19-oct).
 *
 * Sin cupo no dibuja nada, ni siquiera el borde.
 */
export function BarraCupo({ chip, avisos }: { chip?: UnidadCupo; avisos: UnidadCupo[] }) {
  const { cupo, aplica } = useCupo();
  const auth = useAuth() as Partial<ReturnType<typeof useAuth>>;
  // Las marcas de "lo cerró" viven en el navegador. Con el negocio en la
  // clave, otro negocio Emprendedor en la misma máquina ve los suyos; con el
  // usuario, que el dueño cierre el aviso no se lo esconde al cajero que se
  // sienta después en la misma caja.
  const dueno = `${auth.negocio?.id ?? ""}:${auth.usuario?.id ?? ""}`;
  // Sólo para volver a mirar las marcas al cerrar uno: el aviso se calcula de
  // nuevo en cada render con el contador de ahora (una venta, el chequeo de
  // 15 min), así que el texto nunca queda viejo.
  const [, setCerrados] = useState(0);

  const hoy = fechaNegocio();
  const visible = aplica
    ? (sinCerrar(
        avisos.flatMap((u) => avisosDe(cupo, u, hoy)).map((a) => ({ ...a, clave: `${dueno}:${a.clave}` })),
        hoy,
      )[0] ?? null)
    : null;

  const cerrar = () => {
    if (!visible) return;
    marcarCerrado(visible, hoy);
    setCerrados((n) => n + 1);
  };

  if (!aplica || (!chip && !visible)) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-borde bg-white px-4 py-1.5 print:hidden">
      {visible && (
        <p
          role="status"
          className="flex min-w-0 flex-1 basis-60 items-center gap-2 rounded-lg bg-warning-bg px-3 py-1.5 text-[13px] font-semibold text-warning-text"
        >
          <Icon name="info" size={16} />
          <span className="min-w-0 flex-1">{visible.texto}</span>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-md p-1 hover:bg-warning-text/10"
          >
            <Icon name="close" size={14} />
          </button>
        </p>
      )}
      {chip && <ChipCupo unidad={chip} />}
    </div>
  );
}
