import { describe, expect, it } from "vitest";
import { errorDeEnlace, esExterno, entregaDe, nombreServicio, ofreceDelivery, urlDeQr } from "./entrega";
import { fraseDe } from "./estado";
import { evaluarSucursales, motivoSinCobertura } from "./sucursal";
import type { SucursalPedido } from "./tipos";

/**
 * El delivery por un servicio externo (PLAN-DELIVERY-EXTERNO, 14-nov): el
 * nombre del servicio, qué sucursales ofrecen delivery, el enlace de
 * seguimiento y las frases del seguimiento del cliente.
 */

const TARIFA = { tramos: [{ hastaKm: 2, base: 7 }, { hastaKm: null, porKm: 2 }], maxKm: 12 };
const suc = (extra: Partial<SucursalPedido> = {}): SucursalPedido => ({
  id: 3,
  nombre: "Las Brisas",
  latitud: -17.75,
  longitud: -63.18,
  abierta: true,
  tarifa: TARIFA,
  ...extra,
});
const PIN = { latitud: -17.77, longitud: -63.18 };

describe("nombreServicio y esExterno", () => {
  it("sin nombre, Yango; con nombre, el que escribió el negocio", () => {
    expect(nombreServicio(null)).toBe("Yango");
    expect(nombreServicio(undefined)).toBe("Yango");
    expect(nombreServicio("   ")).toBe("Yango");
    expect(nombreServicio("  PedidosYa ")).toBe("PedidosYa");
  });

  it("sólo EXTERNO es externo; un backend viejo (sin dato) es propio", () => {
    expect(esExterno("EXTERNO")).toBe(true);
    expect(esExterno("PROPIO")).toBe(false);
    expect(esExterno(undefined)).toBe(false);
    expect(entregaDe(null)).toEqual({ modo: "PROPIO", servicio: null });
    expect(entregaDe({ entrega: { modo: "EXTERNO", servicio: "Yango" } }).modo).toBe("EXTERNO");
  });
});

describe("ofreceDelivery y las sucursales", () => {
  it("sin el dato `delivery` (backend viejo) vale tener punto en el mapa", () => {
    expect(ofreceDelivery(suc())).toBe(true);
    expect(ofreceDelivery(suc({ latitud: null, longitud: null }))).toBe(false);
  });

  it("`delivery: false` la deja sólo para recoger aunque tenga mapa", () => {
    const [e] = evaluarSucursales(PIN, [suc({ delivery: false })]);
    expect(e.delivery).toBe(false);
    expect(e.atiende).toBe(false);
    expect(motivoSinCobertura(PIN, [suc({ delivery: false })])).toBe("Este local todavía no hace entregas a domicilio. Podés pasar a recoger tu pedido.");
  });

  it("con servicio externo la tarifa viene null: atiende, sin envío calculado ni tope", () => {
    const [e] = evaluarSucursales(PIN, [suc({ tarifa: null, delivery: true })]);
    expect(e.atiende).toBe(true);
    expect(e.envio).toBeNull();
    expect(e.distanciaKm).not.toBeNull();
  });

  it("cerrada con servicio externo no atiende", () => {
    const [e] = evaluarSucursales(PIN, [suc({ tarifa: null, delivery: true, abierta: false })]);
    expect(e.atiende).toBe(false);
  });
});

describe("urlDeQr", () => {
  it("una URL completa se deja como está", () => {
    expect(urlDeQr("https://api.bamardev.com/api/publico/pedidos/x/y/qr", "/api")).toBe("https://api.bamardev.com/api/publico/pedidos/x/y/qr");
  });

  it("una ruta de la API se cuelga de la base", () => {
    expect(urlDeQr("/publico/pedidos/x/y/qr", "https://api-qa.bamardev.com/api")).toBe("https://api-qa.bamardev.com/api/publico/pedidos/x/y/qr");
    expect(urlDeQr("/publico/pedidos/x/y/qr", "/api")).toBe("/api/publico/pedidos/x/y/qr");
  });

  it("una ruta que ya trae /api se resuelve contra el origen de la API", () => {
    expect(urlDeQr("/api/publico/pedidos/x/y/qr", "https://api-qa.bamardev.com/api")).toBe("https://api-qa.bamardev.com/api/publico/pedidos/x/y/qr");
  });
});

describe("errorDeEnlace", () => {
  it("vacío es válido (es opcional) y https:// también", () => {
    expect(errorDeEnlace("")).toBeNull();
    expect(errorDeEnlace("   ")).toBeNull();
    expect(errorDeEnlace("https://yango.com/track/abc")).toBeNull();
  });

  it("sin https, con espacios o de más de 500 caracteres, no", () => {
    expect(errorDeEnlace("http://yango.com/x")).toMatch(/https:\/\//);
    expect(errorDeEnlace("yango.com/x")).toMatch(/https:\/\//);
    expect(errorDeEnlace("https://yango.com/a b")).toMatch(/https:\/\//);
    expect(errorDeEnlace(`https://yango.com/${"a".repeat(500)}`)).toMatch(/largo/);
  });
});

describe("las frases del seguimiento con un servicio externo (§2.5)", () => {
  const externo = { modo: "EXTERNO" as const, servicio: null };

  it("aceptado y sin pago: pide pagar con el QR", () => {
    expect(fraseDe({ tipo: "DELIVERY", estado: "ACEPTADO", entrega: externo, pago: { pendiente: true, monto: 109, qrUrl: "/x" } })).toBe(
      "Pagá Bs 109 con este QR para que salga tu pedido",
    );
  });

  it("aceptado y pagado", () => {
    expect(fraseDe({ tipo: "DELIVERY", estado: "ACEPTADO", entrega: externo })).toBe("¡Pago recibido! Lo estamos preparando.");
  });

  it("en camino: no nombra al servicio (al cliente le llega «delivery»), ni el por defecto ni otro", () => {
    expect(fraseDe({ tipo: "DELIVERY", estado: "EN_CAMINO", entrega: externo })).toBe("Tu pedido va en camino.");
    expect(fraseDe({ tipo: "DELIVERY", estado: "EN_CAMINO", entrega: { modo: "EXTERNO", servicio: "PedidosYa" } })).toBe("Tu pedido va en camino.");
  });

  it("con repartidores propios, las frases de siempre", () => {
    expect(fraseDe({ tipo: "DELIVERY", estado: "ACEPTADO" })).toBe("¡Aceptado! Lo estamos preparando.");
    expect(fraseDe({ tipo: "DELIVERY", estado: "EN_CAMINO", entrega: { modo: "PROPIO", servicio: null } })).toBe("Tu pedido va en camino.");
  });
});
