import { esClaro } from "../tickets/llamado";
import type { PantallaMenu, TemaMenu } from "../../types/menuDigital";

/**
 * Los colores de una TV del menú: los tres del tema (o los elegidos en el
 * personalizado) y los que salen de ellos (tarjeta, borde y el texto que va
 * encima del acento, negro o blanco según cuánto brille).
 */

const TEMAS: Record<Exclude<TemaMenu, "personalizado">, { fondo: string; acento: string; texto: string }> = {
  rojo: { fondo: "#B3120F", acento: "#FFC800", texto: "#FFFFFF" },
  amarillo: { fondo: "#FFC800", acento: "#C8102E", texto: "#2A1A0A" },
  brasa: { fondo: "#1A1210", acento: "#FF9F1C", texto: "#FFF4E6" },
  crema: { fondo: "#FFF4E0", acento: "#C62828", texto: "#2B1B0E" },
  verde: { fondo: "#0B4D2C", acento: "#FFC800", texto: "#FFFFFF" },
};

export function coloresMenu(p: Pick<PantallaMenu, "tema" | "colores">) {
  const c = p.tema === "personalizado" ? p.colores : TEMAS[p.tema];
  const claro = esClaro(c.fondo);
  return {
    ...c,
    tarjeta: claro ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)",
    borde: claro ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.09)",
    sobreAcento: esClaro(c.acento) ? "#1A1A1A" : "#FFFFFF",
  };
}
