import { montoTexto, NOMBRE_DISENO, type DisenoRegalo } from "./disenos";

/** Lo que el cliente pide desde la página (IDEAS/6 #6). */
export interface PedidoRegalo {
  diseno: DisenoRegalo;
  monto: number;
  para: string;
  de: string;
  mensaje: string;
}

/** El mensaje de WhatsApp con el pedido de gift card, para quien atiende. */
export function mensajeRegalo(negocio: string, r: PedidoRegalo): string {
  const filas = [
    `Hola ${negocio}, quiero regalar una gift card:`,
    "",
    `• Monto: ${montoTexto(r.monto)}`,
    `• Diseño: ${NOMBRE_DISENO[r.diseno].nombre}`,
  ];
  if (r.para.trim()) filas.push(`• Para: ${r.para.trim()}`);
  if (r.de.trim()) filas.push(`• De: ${r.de.trim()}`);
  if (r.mensaje.trim()) filas.push(`• Dedicatoria: ${r.mensaje.trim()}`);
  filas.push("", "¿Cómo te pago?");
  return filas.join("\n");
}
