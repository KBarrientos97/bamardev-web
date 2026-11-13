import { describe, expect, it } from "vitest";
import { fmtMontoCliente } from "./format";
import { enlaceWhatsApp, esMensajeClasico, mensajePedido, pedidoDeVenta, type PedidoParaMensaje } from "./mensajePedido";
import type { Venta } from "../types";

/** El WhatsApp al cliente por su pedido: el mismo texto que la app. */

const DELIVERY: PedidoParaMensaje = {
  comprobante: "V-000012",
  tipoPedido: "DELIVERY",
  lineas: [{ cantidad: 2, nombre: "Broaster económico", total: 34 }],
  total: 34,
  tarifaEnvio: 6,
  totalACobrar: 40,
  prepagado: false,
};

describe("fmtMontoCliente", () => {
  it("un monto entero sale sin decimales", () => {
    // Kevin, 15-oct: "Bs 40.00" se lee como cuarenta mil en Bolivia.
    expect(fmtMontoCliente(40)).toBe("Bs 40");
    expect(fmtMontoCliente(0)).toBe("Bs 0");
  });

  it("con centavos van los dos decimales, con punto y sin separador de miles", () => {
    expect(fmtMontoCliente(40.5)).toBe("Bs 40.50");
    expect(fmtMontoCliente(0.1 + 0.2)).toBe("Bs 0.30");
    expect(fmtMontoCliente(1250.5)).toBe("Bs 1250.50");
  });

  it("un total con ruido de punto flotante no muestra centavos que no hay", () => {
    expect(fmtMontoCliente(39.999999999)).toBe("Bs 40");
  });
});

describe("mensajePedido", () => {
  it("a domicilio: el texto de la app, con el nombre del negocio", () => {
    expect(mensajePedido(DELIVERY, "Pollos Don Omar")).toBe(
      [
        "🐔 Pollos Don Omar 👋",
        "¡Hola! Te escribimos por tu pedido V-000012. 🛵",
        "🛒 *Resumen de tu pedido:*\n• 2 × Broaster económico — Bs 34",
        "💰 Total del pedido: Bs 34\n🛵 Costo de envío: Bs 6\n💵 *Total a pagar: Bs 40*",
        "📍 ¡Nuestro delivery ya llegó a tu ubicación y está esperándote afuera para entregarte tu pedido!",
        "¡Gracias por elegir Pollos Don Omar! ❤️🍗",
      ].join("\n\n"),
    );
  });

  it("para recoger no dice que el delivery llegó ni cobra envío", () => {
    const texto = mensajePedido({ ...DELIVERY, tipoPedido: "RECOGER", totalACobrar: 34 }, "Pollo Kiki");
    expect(texto).not.toContain("ya llegó");
    expect(texto).not.toContain("Costo de envío");
    expect(texto).toContain("¡Gracias por elegir Pollo Kiki!");
  });

  it("sin nombre de negocio no firma con el de otro", () => {
    const texto = mensajePedido(DELIVERY, "  ");
    expect(texto.startsWith("¡Hola!")).toBe(true);
    expect(texto).toContain("¡Gracias por elegirnos!");
  });

  it("ya pagado en caja lo aclara en el total", () => {
    const texto = mensajePedido({ ...DELIVERY, prepagado: true, totalACobrar: 6 }, "Pollos Don Omar");
    expect(texto).toContain("💰 Total del pedido: Bs 34 (ya pagado en caja)");
  });

  it("el enlace lleva el mensaje escrito", () => {
    expect(enlaceWhatsApp("59170000000", "¡Hola! 40")).toBe(
      "https://wa.me/59170000000?text=%C2%A1Hola!%2040",
    );
  });
});

describe("el pedido con varios locales (PLAN-SUCURSAL-TOTAL, etapa 3)", () => {
  it("dice de cuál sale, justo después del saludo", () => {
    const partes = mensajePedido({ ...DELIVERY, sucursal: "Sucursal Sur" }, "Pollos Don Omar").split("\n\n");
    expect(partes[1]).toBe("¡Hola! Te escribimos por tu pedido V-000012. 🛵");
    expect(partes[2]).toBe("🏪 Sucursal: Sucursal Sur");
  });

  it("con la palabra del rubro («Sede») la usa; sin ella, «Sucursal» como la app", () => {
    const partes = mensajePedido({ ...DELIVERY, sucursal: "Central", rotuloSucursal: "Sede" }, "Instituto").split("\n\n");
    expect(partes[2]).toBe("🏪 Sede: Central");
    expect(mensajePedido({ ...DELIVERY, sucursal: "Central" }, "X")).toContain("🏪 Sucursal: Central");
  });

  it("sin sucursal, el texto de la app no cambia ni un carácter", () => {
    expect(mensajePedido({ ...DELIVERY, sucursal: null }, "Pollos Don Omar")).toBe(mensajePedido(DELIVERY, "Pollos Don Omar"));
    expect(mensajePedido(DELIVERY, "Pollos Don Omar")).not.toContain("Sucursal");
  });

  it("`pedidoDeVenta` sólo lleva el local si se lo piden", () => {
    const v = { id: 1, comprobante: "V-1", tipoPedido: "RECOGER", detalles: [], total: 10, tarifaEnvio: 0 } as unknown as Venta;
    expect(pedidoDeVenta(v)).not.toHaveProperty("sucursal");
    expect(pedidoDeVenta(v, "Norte").sucursal).toBe("Norte");
    expect(pedidoDeVenta(v, "Norte")).not.toHaveProperty("rotuloSucursal");
    expect(pedidoDeVenta(v, "Norte", "Sede").rotuloSucursal).toBe("Sede");
  });
});

/**
 * Lo que NO puede cambiar: el texto de Pollos Don Omar (un RESTAURANTE sin variante),
 * letra por letra, con y sin la sesión completa (QA R1, N8).
 */
describe("el mensaje de Omar no cambia", () => {
  const OMAR_DELIVERY = [
    "🐔 Pollos Don Omar 👋",
    "¡Hola! Te escribimos por tu pedido V-000012. 🛵",
    "🛒 *Resumen de tu pedido:*\n• 2 × Broaster económico — Bs 34",
    "💰 Total del pedido: Bs 34\n🛵 Costo de envío: Bs 6\n💵 *Total a pagar: Bs 40*",
    "📍 ¡Nuestro delivery ya llegó a tu ubicación y está esperándote afuera para entregarte tu pedido!",
    "¡Gracias por elegir Pollos Don Omar! ❤️🍗",
  ].join("\n\n");

  it("RESTAURANTE sin variante: el texto clásico, con la sesión de Omar", () => {
    expect(mensajePedido(DELIVERY, "Pollos Don Omar", { tipoNegocio: "RESTAURANTE", variante: null })).toBe(OMAR_DELIVERY);
    expect(mensajePedido(DELIVERY, "Pollos Don Omar", { tipoNegocio: "RESTAURANTE" })).toBe(OMAR_DELIVERY);
  });

  it("sin dato del rubro (una sesión vieja, o quien no lo pasa) también es el clásico", () => {
    expect(mensajePedido(DELIVERY, "Pollos Don Omar")).toBe(OMAR_DELIVERY);
    expect(mensajePedido(DELIVERY, "Pollos Don Omar", {})).toBe(OMAR_DELIVERY);
    expect(mensajePedido(DELIVERY, "Pollos Don Omar", null)).toBe(OMAR_DELIVERY);
  });

  it("desde la caja, y aunque venga de la página, Omar sigue igual que siempre", () => {
    expect(mensajePedido(DELIVERY, "Pollos Don Omar", { tipoNegocio: "RESTAURANTE" }, "CAJA")).toBe(OMAR_DELIVERY);
    expect(mensajePedido({ ...DELIVERY, dePagina: true }, "Pollos Don Omar", { tipoNegocio: "RESTAURANTE" })).toBe(OMAR_DELIVERY);
  });

  it("aunque el pedido ya haya salido, Omar dice lo mismo (el texto clásico no mira salioEn)", () => {
    expect(mensajePedido({ ...DELIVERY, salioEn: "2026-11-13T20:00:00.000Z" }, "Pollos Don Omar", { tipoNegocio: "RESTAURANTE" })).toBe(OMAR_DELIVERY);
  });

  it("recoger y el pie sin nombre, también iguales", () => {
    const recoger = { ...DELIVERY, tipoPedido: "RECOGER", totalACobrar: 34 };
    expect(mensajePedido(recoger, "Pollos Don Omar", { tipoNegocio: "RESTAURANTE" })).toBe(mensajePedido(recoger, "Pollos Don Omar"));
    expect(mensajePedido(DELIVERY, null, { tipoNegocio: "RESTAURANTE" })).toContain("¡Gracias por elegirnos! ❤️🍗");
  });

  it("esMensajeClasico: sólo el restaurante sin variante (o sin dato)", () => {
    expect(esMensajeClasico({ tipoNegocio: "RESTAURANTE", variante: null })).toBe(true);
    expect(esMensajeClasico(undefined)).toBe(true);
    expect(esMensajeClasico({ tipoNegocio: "RESTAURANTE", variante: "POSTRES" })).toBe(false);
    expect(esMensajeClasico({ tipoNegocio: "FARMACIA" })).toBe(false);
  });
});

describe("el mensaje de otros rubros y variantes no habla de pollo (QA R1, N8)", () => {
  const POSTRES = { tipoNegocio: "RESTAURANTE", variante: "POSTRES" };

  // Un pedido de la página: el texto sigue el momento, con las frases de la app.
  const DE_PAGINA = { ...DELIVERY, dePagina: true };

  it("Postres: emoji de postre, ni pollo ni «ya llegó»", () => {
    const t = mensajePedido(DE_PAGINA, "El Ganadero", POSTRES);
    expect(t).toContain("🍮 El Ganadero 👋");
    expect(t).toContain("¡Gracias por elegir El Ganadero! ❤️🍮");
    expect(t).not.toMatch(/🐔|🍗/);
    expect(t).not.toMatch(/ya llegó/);
  });

  it("pedido de la página antes de «Ya salí»: está por salir", () => {
    expect(mensajePedido(DE_PAGINA, "El Ganadero", POSTRES)).toContain("🛵 ¡Tu pedido ya está por salir hacia tu ubicación!");
  });

  it("pedido de la página que ya salió: va en camino", () => {
    const t = mensajePedido({ ...DE_PAGINA, salioEn: "2026-11-13T20:00:00.000Z" }, "El Ganadero", POSTRES);
    expect(t).toContain("🛵 ¡Tu pedido ya va en camino hacia tu ubicación!");
    expect(t).not.toMatch(/ya llegó/);
  });

  it("delivery cargado a mano: el repartidor escribe en la puerta, «ya llegó» (igual que la app)", () => {
    expect(mensajePedido(DELIVERY, "El Ganadero", POSTRES)).toContain("📍 ¡Nuestro delivery ya llegó a tu ubicación");
  });

  it("desde la caja no se habla de la llegada", () => {
    const t = mensajePedido(DE_PAGINA, "El Ganadero", POSTRES, "CAJA");
    expect(t).not.toMatch(/ya llegó|por salir|en camino hacia/);
    expect(mensajePedido(DELIVERY, "El Ganadero", POSTRES, "CAJA")).not.toMatch(/ya llegó/);
  });

  it("otro rubro (una farmacia): neutro, sin pollo", () => {
    const t = mensajePedido(DE_PAGINA, "Farmacia Sol", { tipoNegocio: "FARMACIA" });
    expect(t).toContain("🛍️ Farmacia Sol 👋");
    expect(t).toContain("¡Gracias por elegir Farmacia Sol! ❤️");
    expect(t).not.toMatch(/🐔|🍗|ya llegó/);
  });

  it("el resto del mensaje (resumen, totales, local) es el mismo", () => {
    const t = mensajePedido({ ...DELIVERY, sucursal: "Norte" }, "El Ganadero", POSTRES);
    expect(t).toContain("🛒 *Resumen de tu pedido:*\n• 2 × Broaster económico — Bs 34");
    expect(t).toContain("💵 *Total a pagar: Bs 40*");
    expect(t).toContain("🏪 Sucursal: Norte");
  });

  it("para recoger no hay línea de entrega", () => {
    const t = mensajePedido({ ...DELIVERY, tipoPedido: "RECOGER" }, "El Ganadero", POSTRES);
    expect(t).not.toContain("📍");
  });

  it("pedidoDeVenta pasa cuándo salió el repartidor si el pedido vino de la página", () => {
    const v = { id: 5, comprobante: "V-5", tipoPedido: "DELIVERY", detalles: [], total: 10, tarifaEnvio: 0, totalACobrar: 10, prepagado: false, pedidoWeb: { salioEn: "2026-11-13T20:00:00.000Z" } } as unknown as Venta;
    expect(pedidoDeVenta(v).salioEn).toBe("2026-11-13T20:00:00.000Z");
    expect(pedidoDeVenta({ ...v, pedidoWeb: null } as unknown as Venta)).not.toHaveProperty("salioEn");
  });
});
