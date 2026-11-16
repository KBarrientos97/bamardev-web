import { ApiError, request } from "./api";

/**
 * Los íconos propios del negocio («Mis íconos», 16-nov), con sesión: piden el
 * permiso de crear y editar productos. Aparte de `api.ts` por lo mismo que
 * `apiMenuDigital.ts`; y aparte de `iconosPropios.ts`, que es puro y lo usa la
 * TV pública sin sesión.
 */

export interface IconoPropio {
  id: number;
  /** `mio:<token>`: lo que se guarda en el `icono` del producto. */
  llave: string;
  /** Para buscarlo en el selector. */
  nombre: string;
  /** `/publico/iconos/<token>`, relativa a la base del API. */
  ruta: string;
  /** Cuántos productos vigentes del negocio lo tienen puesto. */
  enUso: number;
}

export interface MisIconos {
  /** Cuántos puede tener el negocio (200). */
  tope: number;
  /** Los más nuevos primero. */
  iconos: IconoPropio[];
}

/**
 * El 413 lo corta el servidor antes de llegar al controlador (multer) y viene
 * en inglés. Con la imagen preparada en el navegador no debería pasar.
 */
const enEspanol = (e: unknown): never => {
  if (e instanceof ApiError && e.status === 413) {
    throw new ApiError("La imagen pesa demasiado. Probá con otra.", 413, e.detalle);
  }
  throw e;
};

export const apiIconos = {
  listar: () => request<MisIconos>("/iconos-propios"),
  /** Un archivo por pedido: «hasta 10 por tanda» lo cumple el que los sube, de a uno. */
  subir: (archivo: Blob, nombre: string) => {
    const f = new FormData();
    // El nombre del archivo no le importa al backend (mira el contenido); la
    // extensión acompaña el tipo para que el multipart sea coherente.
    f.append("archivo", archivo, archivo.type === "image/png" ? "icono.png" : "icono.webp");
    f.append("nombre", nombre);
    return request<IconoPropio>("/iconos-propios", { method: "POST", body: f }).catch(enEspanol);
  },
  renombrar: (id: number, nombre: string) =>
    request<IconoPropio>(`/iconos-propios/${id}`, { method: "PATCH", body: JSON.stringify({ nombre }) }),
  /** Devuelve cuántos productos lo usaban: quedan sin ícono (vuelven a sus iniciales). */
  borrar: (id: number) => request<{ productos: number }>(`/iconos-propios/${id}`, { method: "DELETE" }),
};
