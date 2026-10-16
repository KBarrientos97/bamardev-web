import { describe, expect, it } from "vitest";
import { fmtMontoCliente } from "./format";
import { enlaceWhatsApp, mensajePedido, type PedidoParaMensaje } from "./mensajePedido";

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
