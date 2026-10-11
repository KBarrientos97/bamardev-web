import type { Promocion, TipoPromocion } from "./tipos";

/**
 * Textos de promociones y de campañas, puros para poder probarlos.
 *
 * El envío por WhatsApp es un enlace `wa.me` (aprobado; la API de WhatsApp es
 * deuda técnica): abre el WhatsApp del negocio con el texto escrito y la
 * persona lo manda.
 */

export const TIPOS: { valor: TipoPromocion; etiqueta: string; ayuda: string }[] = [
  { valor: "PORCENTAJE", etiqueta: "Porcentaje", ayuda: "20 % en una categoría o en toda la compra" },
  { valor: "MONTO", etiqueta: "Monto fijo", ayuda: "Bs 10 menos por unidad o en la compra" },
  { valor: "PRECIO_ESPECIAL", etiqueta: "Precio especial", ayuda: "El artículo cuesta Bs X durante la promo" },
  { valor: "NXM", etiqueta: "Lleva N, paga M", ayuda: "2x1, 3x2: el más barato sale gratis" },
];

export const DIAS_SEMANA = [
  { n: 1, corto: "Lu" },
  { n: 2, corto: "Ma" },
  { n: 3, corto: "Mi" },
  { n: 4, corto: "Ju" },
  { n: 5, corto: "Vi" },
  { n: 6, corto: "Sá" },
  { n: 7, corto: "Do" },
];

/** Plantillas que precargan el formulario (§4.1: "simple de configurar"). */
export const PLANTILLAS: { nombre: string; datos: Partial<Promocion> }[] = [
  { nombre: "2x1 los martes", datos: { nombre: "2x1 los martes", tipo: "NXM", llevaN: 2, pagaM: 1, diasSemana: [2] } },
  {
    nombre: "Happy hour",
    datos: { nombre: "Happy hour", tipo: "PORCENTAJE", valor: 20, horaDesde: "15:00", horaHasta: "18:00" },
  },
  {
    nombre: "Bs 10 menos desde Bs 100",
    datos: { nombre: "Bs 10 menos desde Bs 100", tipo: "MONTO", alcance: "TICKET", valor: 10, minimoCompra: 100 },
  },
  {
    nombre: "Cupón de bienvenida",
    datos: {
      nombre: "Cupón de bienvenida",
      tipo: "PORCENTAJE",
      valor: 10,
      alcance: "TICKET",
      disparo: "CODIGO",
      usosPorCliente: 1,
    },
  },
];

/** Reemplaza `{nombre}` (y lo que venga) en una plantilla de mensaje. */
export function rellenar(texto: string, datos: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (todo, clave: string) => datos[clave] ?? todo);
}

/** El primer nombre, para que el saludo suene a persona: "Ana Rojas" → "Ana". */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/** `https://wa.me/<número>?text=<texto>`; el número ya con código de país. */
export function enlaceWhatsapp(numero: string, texto: string): string {
  const digitos = numero.replace(/\D/g, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

/** "Ma, Ju · 15:00-18:00" — la ventana de la promo en una línea corta. */
export function resumenVentana(p: Pick<Promocion, "diasSemana" | "horaDesde" | "horaHasta">): string {
  const partes: string[] = [];
  if (p.diasSemana.length && p.diasSemana.length < 7) {
    partes.push(
      [...p.diasSemana]
        .sort()
        .map((d) => DIAS_SEMANA.find((x) => x.n === d)?.corto ?? d)
        .join(", "),
    );
  }
  if (p.horaDesde && p.horaHasta) partes.push(`${p.horaDesde}-${p.horaHasta}`);
  return partes.join(" · ") || "Todos los días";
}

export const ESTADO_VISIBLE: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" | "rojo" | "azul" }> = {
  ACTIVA: { texto: "Activa", tono: "verde" },
  PAUSADA: { texto: "Pausada", tono: "amarillo" },
  PROGRAMADA: { texto: "Programada", tono: "azul" },
  FINALIZADA: { texto: "Terminada", tono: "gris" },
  AGOTADA: { texto: "Agotada", tono: "rojo" },
  ARCHIVADA: { texto: "Archivada", tono: "gris" },
};
