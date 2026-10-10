import { useEffect, useState } from "react";
import { fechaNegocio } from "../lib/agenda/horaAgenda";
import { avisosDe, marcarMostrado, proyectar, sinMostrar, textoChip, type AvisoCupo } from "../lib/cupo";
import { abrirHojaCupo } from "../lib/hojaCupo";
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
  if (!aplica || !cupo) return null;
  const { contador, creditos } = textoChip(cupo, unidad);
  const p = proyectar(cupo, unidad);
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
 * quien vende y, debajo, los avisos del día (§5.1), cada uno una sola vez.
 * Va arriba del contenido y no adentro del POS por lo mismo que el aviso de
 * licencia: queda a la vista en el celular y con la pantalla scrolleada.
 *
 * Sin cupo no dibuja nada, ni siquiera el borde.
 */
export function BarraCupo({ chip, avisos }: { chip?: UnidadCupo; avisos: UnidadCupo[] }) {
  const { cupo, aplica } = useCupo();
  // Las marcas de "ya se mostró" viven en el navegador: sin el negocio en la
  // clave, si en la misma máquina entraba otro negocio Emprendedor el mismo
  // día, no veía ninguno de los avisos que ya había visto el anterior.
  const negocioId = (useAuth() as Partial<ReturnType<typeof useAuth>>).negocio?.id ?? "";
  const [visible, setVisible] = useState<AvisoCupo | null>(null);
  const clave = avisos.join(",");

  // Cuando cambia el contador (una venta, el chequeo de 15 min) se mira si
  // hay un aviso nuevo. Se marca al mostrarlo: "una vez por día" es que salga
  // una vez, no que el cajero tenga que cerrarlo para que cuente.
  useEffect(() => {
    if (!aplica || visible) return;
    const hoy = fechaNegocio();
    const unidades = clave ? (clave.split(",") as UnidadCupo[]) : [];
    const pendientes = sinMostrar(
      unidades.flatMap((u) => avisosDe(cupo, u, hoy)).map((a) => ({ ...a, clave: `${negocioId}:${a.clave}` })),
      hoy,
    );
    if (!pendientes.length) return;
    marcarMostrado(pendientes[0].clave, hoy);
    setVisible(pendientes[0]);
  }, [cupo, aplica, visible, clave, negocioId]);

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
            onClick={() => setVisible(null)}
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
