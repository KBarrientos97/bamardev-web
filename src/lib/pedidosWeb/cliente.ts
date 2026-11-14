/**
 * Lo que el navegador del cliente recuerda de sus pedidos (sin cuenta): sus
 * datos para la próxima vez y el pedido que tiene en curso, para la franja
 * «Tenés un pedido en curso» si vuelve a la página del local.
 */

/** El WhatsApp boliviano de 8 dígitos que empieza con 6 o 7 (el backend lo exige), o null. */
export function telefonoDe8(texto: string): string | null {
  let d = texto.replace(/\D/g, "");
  if (d.startsWith("591") && d.length === 11) d = d.slice(3);
  return /^[67]\d{7}$/.test(d) ? d : null;
}

export interface DatosCliente {
  nombre: string;
  telefono: string;
  direccion: string;
  referencia: string;
  tipo: "DELIVERY" | "RECOGER";
}

/**
 * La misma clave que ya usaba el carrito de WhatsApp (`pedido-datos:`): quien
 * ya había pedido por WhatsApp tiene su nombre y su dirección de antes. La
 * entrega vieja se llama `RETIRO`.
 */
const claveDatos = (sub: string) => `pedido-datos:${sub}`;

export function leerDatosCliente(sub: string): DatosCliente {
  const vacio: DatosCliente = { nombre: "", telefono: "", direccion: "", referencia: "", tipo: "DELIVERY" };
  try {
    const v = JSON.parse(localStorage.getItem(claveDatos(sub)) ?? "null") as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return vacio;
    const t = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    return {
      nombre: t(v.nombre, 60),
      telefono: t(v.telefono, 20),
      direccion: t(v.direccion, 200),
      referencia: t(v.referencia, 200),
      tipo: v.entrega === "RETIRO" || v.entrega === "RECOGER" ? "RECOGER" : "DELIVERY",
    };
  } catch {
    return vacio;
  }
}

export function guardarDatosCliente(sub: string, d: DatosCliente): void {
  try {
    localStorage.setItem(
      claveDatos(sub),
      JSON.stringify({
        nombre: d.nombre,
        telefono: d.telefono,
        direccion: d.direccion,
        referencia: d.referencia,
        entrega: d.tipo === "RECOGER" ? "RETIRO" : "DELIVERY",
      }),
    );
  } catch {
    // Sin storage: se piden de nuevo la próxima vez.
  }
}

export interface PedidoEnCurso {
  token: string;
  numero: number;
}

const claveCurso = (sub: string) => `pedido-curso:${sub}`;

export function guardarPedidoEnCurso(sub: string, p: PedidoEnCurso): void {
  try {
    localStorage.setItem(claveCurso(sub), JSON.stringify(p));
  } catch {
    // Sin storage: el enlace del seguimiento sigue funcionando, sólo no se recuerda.
  }
}

export function leerPedidoEnCurso(sub: string): PedidoEnCurso | null {
  try {
    const v = JSON.parse(localStorage.getItem(claveCurso(sub)) ?? "null") as Partial<PedidoEnCurso> | null;
    return v && typeof v.token === "string" && v.token.length > 0 && typeof v.numero === "number"
      ? { token: v.token, numero: v.numero }
      : null;
  } catch {
    return null;
  }
}

export function olvidarPedidoEnCurso(sub: string): void {
  try {
    localStorage.removeItem(claveCurso(sub));
  } catch {
    /* nada que olvidar */
  }
}

/** Un identificador por intento de pedido: reintentar el mismo no lo duplica. */
export function nuevoRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* sin crypto.randomUUID (http o navegador viejo) */
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
