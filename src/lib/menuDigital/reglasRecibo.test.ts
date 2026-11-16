import { describe, expect, it } from "vitest";
import { aplicaDisenoRecibo, imprimeReciboSinNumero, pideDisenoRecibo, usaTickets } from "./reglasRecibo";

/**
 * Cuándo la caja usa el diseño del recibo (15-nov): el espejo de
 * `pideDisenoRecibo` / `aplicaDisenoRecibo` / `conTickets` de la app
 * (`PermisosPantallasTest.kt`).
 */

const SIN_TVS = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "fiado", "pago_qr_mixto", "recibo_pdf"];
const CON_TICKETS = [...SIN_TVS, "tickets_pedido"];
const CON_MENU = [...SIN_TVS, "menu_digital"];

describe("el diseño del recibo en la caja", () => {
  it("un restaurante sin TVs lo pide, pero sin configurarlo su recibo sale como siempre", () => {
    // Invariante: el restaurante que nunca abrió «Ticket y recibo» imprime
    // idéntico a antes (sin otra letra ni los bloques EN MESA en lugar de la M
    // y la LL), aunque la pantalla ahora sea de base.
    expect(pideDisenoRecibo(SIN_TVS, "RESTAURANTE")).toBe(true);
    expect(aplicaDisenoRecibo(SIN_TVS, "RESTAURANTE", false)).toBe(false);
    // Un backend anterior no manda el dato: lo seguro es no usarlo.
    expect(aplicaDisenoRecibo(SIN_TVS, "RESTAURANTE", undefined)).toBe(false);
  });

  it("configurado (guardó su diseño o subió su logo), lo usa", () => {
    expect(aplicaDisenoRecibo(SIN_TVS, "RESTAURANTE", true)).toBe(true);
  });

  it("con cualquiera de los extras, como hasta el 15-nov: lo usa aunque nadie lo haya tocado", () => {
    for (const plan of [CON_TICKETS, CON_MENU]) {
      expect(pideDisenoRecibo(plan, "RESTAURANTE")).toBe(true);
      expect(aplicaDisenoRecibo(plan, "RESTAURANTE", false)).toBe(true);
      expect(aplicaDisenoRecibo(plan, "RESTAURANTE", undefined)).toBe(true);
    }
    // Sin mirar el rubro, como siempre: la feature ya la ata el panel.
    expect(pideDisenoRecibo(CON_TICKETS, undefined)).toBe(true);
  });

  it.each(["FARMACIA", "MINIMARKET", "PELUQUERIA", "BILLAR", "ACADEMIA", undefined])(
    "%s sin los extras: ni lo pide ni lo usa, aunque dijera configurado",
    (rubro) => {
      expect(pideDisenoRecibo(SIN_TVS, rubro)).toBe(false);
      expect(aplicaDisenoRecibo(SIN_TVS, rubro, true)).toBe(false);
    },
  );

  it("la lista de features vacía no cuenta como extra (no falla abierto)", () => {
    expect(aplicaDisenoRecibo([], "RESTAURANTE", false)).toBe(false);
    expect(aplicaDisenoRecibo(undefined, "RESTAURANTE", false)).toBe(false);
    expect(pideDisenoRecibo([], "FARMACIA")).toBe(false);
  });
});

describe("sin tickets no hay comanda", () => {
  it("sólo el restaurante con el extra de tickets saca número", () => {
    expect(usaTickets(CON_TICKETS, "RESTAURANTE")).toBe(true);
    expect(usaTickets(CON_MENU, "RESTAURANTE")).toBe(false);
    expect(usaTickets(SIN_TVS, "RESTAURANTE")).toBe(false);
    expect(usaTickets(CON_TICKETS, "FARMACIA")).toBe(false);
  });

  it("«Imprimir solo al cobrar» sin número: el restaurante sin tickets imprime el recibo; con tickets, no", () => {
    expect(imprimeReciboSinNumero(SIN_TVS, "RESTAURANTE")).toBe(true);
    expect(imprimeReciboSinNumero(CON_MENU, "RESTAURANTE")).toBe(true);
    // Con tickets, una venta sin número es de la cola sin internet: la
    // comanda saldría sin el número.
    expect(imprimeReciboSinNumero(CON_TICKETS, "RESTAURANTE")).toBe(false);
  });

  it.each(["FARMACIA", "MINIMARKET", "BILLAR", "PELUQUERIA", "ACADEMIA", undefined])(
    "%s: como siempre, no imprime solo sin número",
    (rubro) => {
      expect(imprimeReciboSinNumero(SIN_TVS, rubro)).toBe(false);
      expect(imprimeReciboSinNumero(CON_TICKETS, rubro)).toBe(false);
    },
  );
});
