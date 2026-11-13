import { fmtFecha, fmtMoney } from "./format";
import { Telefono } from "./telefono";
import type { Venta } from "../types";

/**
 * El recibo por WhatsApp (Derick, 04-nov): un texto con lo que se pagó, para
 * mandarlo desde la pantalla del recibo sin descargar la imagen y adjuntarla a
 * mano. Por `wa.me` no se puede adjuntar un archivo; en un cobro de cuotas el
 * enlace al estado de cuenta hace de comprobante: ahí el estudiante ve que su
 * pago figura.
 */
export function mensajeRecibo(venta: Venta, negocio: string, sucursal?: string | null, rotulo = "Sucursal"): string {
  const cuotas = venta.cuotas ?? [];
  const nombre = venta.pagadorCuotas?.nombre ?? cuotas[0]?.alumno ?? venta.clienteNombre ?? null;
  const renglones: string[] = [];
  renglones.push(`Hola${nombre ? ` ${primerNombre(nombre)}` : ""}, gracias por tu pago${negocio ? ` en ${negocio}` : ""}.`);
  renglones.push(`Recibo ${venta.comprobante ?? `#${venta.id}`} · ${fmtFecha(venta.fecha)}`);
  // El local, sólo si el negocio tiene varios (quien llama decide; ver `useLocalDelPapel`).
  // `rotulo` es la palabra del rubro («Sede» en un instituto); por defecto, la de siempre.
  if (sucursal) renglones.push(`${rotulo}: ${sucursal}`);
  renglones.push("");
  if (cuotas.length) {
    for (const c of cuotas) renglones.push(`• ${c.carrera ? `${c.carrera} · ` : ""}${c.concepto}: ${fmtMoney(c.cobrado)}`);
  } else {
    for (const d of venta.detalles ?? []) renglones.push(`• ${d.cantidad} × ${d.producto ?? "Artículo"}: ${fmtMoney(d.subtotal)}`);
  }
  renglones.push(`Total: ${fmtMoney(venta.total + (venta.tarifaEnvio ?? 0))}`);
  const ultima = cuotas.at(-1);
  if (ultima) {
    renglones.push("");
    if (ultima.saldoCurso > 0) {
      renglones.push(`Te queda por pagar ${fmtMoney(ultima.saldoCurso)}.`);
      if (ultima.proximaCuota) renglones.push(`Próxima cuota: ${fmtMoney(ultima.proximaCuota.monto)}, vence el ${fmtFecha(`${ultima.proximaCuota.vence}T12:00:00`)}.`);
    } else {
      renglones.push("Quedaste al día con el curso.");
    }
    const enlace = cuotas.find((c) => c.enlacePago)?.enlacePago;
    if (enlace) renglones.push(`Tu estado de cuenta: ${enlace}`);
  }
  return renglones.join("\n");
}

/**
 * El `wa.me` con el mensaje. Con el teléfono de quien pagó (el tutor o el
 * alumno en un cobro de cuotas, el cliente del pedido en el POS) abre su chat;
 * sin teléfono, WhatsApp pide elegir el contacto.
 */
export function whatsappDelRecibo(venta: Venta, negocio: string, sucursal?: string | null, rotulo = "Sucursal"): string {
  const numero = Telefono.paraWhatsApp(venta.telefonoPagador ?? venta.clienteTelefono);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensajeRecibo(venta, negocio, sucursal, rotulo))}`;
}

/** "Molina, Rosa" → "Rosa"; "Rosa Molina" → "Rosa". */
function primerNombre(nombre: string): string {
  const despuesDeComa = nombre.includes(",") ? nombre.split(",")[1] : nombre;
  return despuesDeComa.trim().split(/\s+/)[0] || nombre.trim();
}
