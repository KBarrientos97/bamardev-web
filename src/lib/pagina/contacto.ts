import type { PaginaPublica } from "./tipos";

/**
 * Cómo contactar al negocio para ejercer sus derechos: su WhatsApp, su
 * teléfono o su correo de la página, en ese orden. Nunca el contacto que
 * BamarDev tiene del dueño (es un dato interno).
 */
export function contactoDe(p: PaginaPublica): { texto: string; url: string } | null {
  const todos = [...(p.destacado ? [p.destacado] : []), ...p.redes, ...p.botones];
  const wa = todos.find((e) => e.tipo === "WHATSAPP");
  if (wa) return { texto: "por WhatsApp", url: wa.url };
  const tel = p.sucursales.find((s) => s.telefono);
  if (tel?.telefono) return { texto: `al ${tel.telefono}`, url: `tel:${tel.telefono.replace(/\s/g, "")}` };
  const correo = todos.find((e) => e.tipo === "CORREO");
  if (correo) return { texto: correo.url.replace(/^mailto:/, ""), url: correo.url };
  return null;
}
