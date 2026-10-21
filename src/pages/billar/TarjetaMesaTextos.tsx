import { Icon } from "../../components/Icon";
import { fmtCobrado, fmtHace, fmtTarifaCorta, PAUSA_LARGA_SEG } from "./calculo";
import type { VistaMesa } from "./vista";

/**
 * Lo que dice una mesa en juego bajo el cronómetro ("Cobrado 0:30 · sube a la
 * 0:45", "Pausada · hace 4 min"…) y de qué color. Lo comparten la tarjeta del
 * tablero y la de Supervisión del administrador.
 */

export function subLinea(v: VistaMesa) {
  const c = v.cuenta!;
  const s = v.mesa.sesion!;
  const horas = s.prepago ? s.prepago.min / 60 : 0;
  switch (v.estado) {
    case "pausada":
      return (
        <>
          <Icon name="pausa" size={12} />
          {s.pauseMotivo || "En pausa"}
          {v.pausaSeg != null && <> · hace {fmtHace(v.pausaSeg * 1000)}</>}
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
          {/* Para abajo y no redondeado: el fin de una gracia no cae en minuto
              entero y "sube a la 0:38" subía a las 0:37:41 (revisión del
              18-oct). Nunca promete un minuto de más. */}
          {c.nextSecs !== null && <> · sube a la {fmtCobrado(Math.floor(c.nextSecs / 60))}</>}
        </>
      );
  }
}

export function subColor(estado: VistaMesa["estado"], pausaSeg?: number | null): string {
  if (estado === "vence") return "font-semibold text-amber-800";
  // La pausa larga, en ámbar: tiempo que no se cobra (ver PAUSA_LARGA_SEG).
  if (estado === "pausada" && (pausaSeg ?? 0) >= PAUSA_LARGA_SEG) return "font-semibold text-amber-800";
  if (estado === "cumplido") return "font-semibold text-rose-700";
  return "text-texto-3";
}
