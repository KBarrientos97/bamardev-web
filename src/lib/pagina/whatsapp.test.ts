import { describe, expect, it } from "vitest";
import type { PaginaPublica } from "./tipos";
import { conMensajeDe, contactosWhatsapp, numeroInternacional, numeroParaEditar, numeroWhatsapp } from "./whatsapp";

/** Los WhatsApp de la página: el general y, opcional, uno por sucursal (13-oct). */

const sucursal = (nombre: string, whatsappUrl: string | null) => ({
  nombre,
  reservaSlug: null,
  direccion: null,
  telefono: null,
  horario: null,
  mapaUrl: null,
  whatsappUrl,
});

function pagina(general: string | null, sucursales: ReturnType<typeof sucursal>[]): PaginaPublica {
  return {
    subdominio: "x",
    nombre: "Pollos",
    rubro: "",
    iniciales: "P",
    descripcion: null,
    color: { clave: "VERDE", hex: "#0C7A55" },
    formaBotones: "REDONDEADO",
    tipografia: "MODERNA",
    logoUrl: null,
    portadaUrl: null,
    anuncio: null,
    reservar: false,
    destacado: general ? { id: 1, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: general, icono: null } : null,
    redes: [],
    botones: [],
    sucursales,
    pie: { atribucionUrl: "" },
    og: { titulo: "", descripcion: "", imagen: null, url: "" },
  };
}

describe("WhatsApp por sucursal", () => {
  it("sólo el general: un contacto (los botones van directo, como siempre)", () => {
    expect(contactosWhatsapp(pagina("https://wa.me/59170000001", [sucursal("Norte", null)]))).toEqual([
      { etiqueta: "General", url: "https://wa.me/59170000001" },
    ]);
  });

  it("todas con el mismo número que el general: uno solo", () => {
    const p = pagina("https://wa.me/59170000001?text=Hola", [sucursal("Norte", "https://wa.me/59170000001")]);
    expect(contactosWhatsapp(p)).toHaveLength(1);
  });

  it("dos números distintos: cada uno con el nombre de su sucursal y el general al final", () => {
    const p = pagina("https://wa.me/59170000001", [
      sucursal("Norte", "https://wa.me/59170000002"),
      sucursal("Sur", null),
      sucursal("Centro", "https://wa.me/59170000002"),
    ]);
    expect(contactosWhatsapp(p)).toEqual([
      { etiqueta: "Norte", url: "https://wa.me/59170000002" },
      { etiqueta: "General", url: "https://wa.me/59170000001" },
    ]);
  });

  it("sin general, sólo las sucursales", () => {
    const p = pagina(null, [sucursal("Norte", "https://wa.me/59170000002"), sucursal("Sur", "https://wa.me/59170000003")]);
    expect(contactosWhatsapp(p).map((c) => c.etiqueta)).toEqual(["Norte", "Sur"]);
  });

  it("el número de un enlace y el mensaje del botón tocado", () => {
    expect(numeroWhatsapp("https://wa.me/59170000001?text=Hola")).toBe("59170000001");
    expect(numeroWhatsapp("https://api.whatsapp.com/send?phone=591%2070000001")).toBe("59170000001");
    expect(conMensajeDe("https://wa.me/1?text=Quiero%20pedir", "https://wa.me/59170000002")).toBe(
      "https://wa.me/59170000002?text=Quiero%20pedir",
    );
    expect(conMensajeDe("https://wa.me/1", "https://wa.me/59170000002")).toBe("https://wa.me/59170000002");
  });

  it("el número se normaliza como en el backend y se muestra sin el 591", () => {
    expect(numeroInternacional("7012-3456")).toBe("59170123456");
    expect(numeroInternacional("+54 9 11 1234 5678")).toBe("5491112345678");
    expect(numeroInternacional("123")).toBeNull();
    expect(numeroParaEditar("59170123456")).toBe("70123456");
    expect(numeroParaEditar("5491112345678")).toBe("5491112345678");
    expect(numeroParaEditar(null)).toBe("");
  });
});
