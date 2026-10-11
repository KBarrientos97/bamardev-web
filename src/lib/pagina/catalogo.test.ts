import { describe, expect, it } from "vitest";
import { enlaceWhatsapp, formatoPrecio, moverA, urlConsultaWhatsapp, validarItem } from "./catalogo";
import type { EnlacePublico, PaginaPublica } from "./tipos";

describe("catálogo", () => {
  it("el precio: sin decimales si es redondo, con dos si no, y «Desde»", () => {
    expect(formatoPrecio(80)).toBe("Bs 80");
    expect(formatoPrecio(80.5)).toBe("Bs 80,50");
    expect(formatoPrecio(80, true)).toBe("Desde Bs 80");
    expect(formatoPrecio(null)).toBeNull();
    expect(formatoPrecio(null, true)).toBeNull();
  });

  it("valida como el backend: título 1–60, precio > 0 con hasta 2 decimales, coma o punto", () => {
    const v = (titulo: string, precio: string, descripcion = "") => validarItem({ titulo, precio, descripcion });
    expect(v("Uñas", "80,50")).toEqual({ errores: {}, precio: 80.5 });
    expect(v("Uñas", "")).toEqual({ errores: {}, precio: null });
    expect(v("  ", "").errores.titulo).toBe("Escribí un título.");
    expect(v("Uñas", "0").errores.precio).toMatch(/mayor a 0/);
    expect(v("Uñas", "80.555").errores.precio).toMatch(/2 decimales/);
    expect(v("Uñas", "1000000").errores.precio).toMatch(/máximo/);
    expect(v("Uñas", "80 Bs").errores.precio).toMatch(/sólo el número/);
    expect(v("Uñas", "-5").errores.precio).toMatch(/sólo el número/);
    expect(v("Uñas", "", "x".repeat(141)).errores.descripcion).toBeDefined();
    expect(v("x".repeat(61), "").errores.titulo).toBeDefined();
  });

  it("mover un id a otro lugar corre a los demás", () => {
    expect(moverA([1, 2, 3], 1, 2)).toEqual([2, 3, 1]);
    expect(moverA([1, 2, 3], 3, 0)).toEqual([3, 1, 2]);
    expect(moverA([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("consultar por WhatsApp agrega el mensaje y respeta los demás parámetros", () => {
    expect(urlConsultaWhatsapp("https://wa.me/59170123456", "Uñas acrílicas")).toBe(
      "https://wa.me/59170123456?text=Hola%2C%20me%20interesa%3A%20U%C3%B1as%20acr%C3%ADlicas",
    );
    // El saludo genérico del enlace se reemplaza; el teléfono queda.
    expect(urlConsultaWhatsapp("https://api.whatsapp.com/send?phone=59170123456&text=Hola", "Corte")).toBe(
      "https://api.whatsapp.com/send?phone=59170123456&text=Hola%2C%20me%20interesa%3A%20Corte",
    );
    expect(urlConsultaWhatsapp("no es una url", "Corte")).toBe("no es una url");
  });

  it("el WhatsApp del negocio: el principal, o el primero de los botones y las redes", () => {
    const wa = (id: number): EnlacePublico => ({ id, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: `https://wa.me/${id}`, icono: null });
    const fb: EnlacePublico = { id: 9, tipo: "FACEBOOK", etiqueta: "Facebook", url: "https://facebook.com/x", icono: null };
    const pagina = (p: Partial<PaginaPublica>) => ({ destacado: null, botones: [], redes: [], ...p }) as PaginaPublica;
    expect(enlaceWhatsapp(pagina({ destacado: wa(1), redes: [wa(2)] }))?.id).toBe(1);
    expect(enlaceWhatsapp(pagina({ destacado: fb, redes: [fb, wa(2)] }))?.id).toBe(2);
    expect(enlaceWhatsapp(pagina({ redes: [fb] }))).toBeNull();
  });
});
