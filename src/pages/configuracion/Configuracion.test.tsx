import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plantilla } from "../../test/sesiones";

/**
 * La pantalla «Configuración» del restaurante (15-nov), como la de la app:
 * título, subtítulo y una tarjeta por opción (ícono, título, para qué sirve y
 * la flecha) que lleva a la pantalla que ya existía. Qué tarjetas hay lo
 * decide `opcionesConfiguracion` (ver `menuConfiguracion.test.ts`).
 */

const sesion = vi.hoisted(() => ({
  rol: "ADMIN" as Plantilla,
  rubro: "RESTAURANTE",
  features: [] as string[],
}));

vi.mock("../../store/AuthContext", async () => {
  const { ctxDe } = await import("../../test/sesiones");
  const { puedeVer } = await import("../../lib/permisos");
  return {
    useAuth: () => {
      const c = ctxDe(sesion.rol, sesion.rubro, sesion.features);
      return { rubro: sesion.rubro, vocabulario: null, puede: (s: Parameters<typeof puedeVer>[1]) => puedeVer(c, s) };
    },
  };
});

import Configuracion from "./Configuracion";

const SIN_TVS = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "fiado", "pago_qr_mixto"];

function Donde() {
  return <p data-testid="donde">{useLocation().pathname}</p>;
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={["/configuracion"]}>
      <Routes>
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Donde />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Cada tarjeta: su título y a dónde lleva, en el orden de la pantalla. */
const tarjetas = () =>
  within(screen.getByRole("list"))
    .getAllByRole("link")
    .map((a) => [a.querySelector("span.block")?.textContent, a.getAttribute("href")]);

beforeEach(() => {
  sesion.rol = "ADMIN";
  sesion.rubro = "RESTAURANTE";
  sesion.features = SIN_TVS;
});

describe("Configuración: la lista del restaurante", () => {
  it("el título y el subtítulo de la app", () => {
    abrir();
    expect(screen.getByRole("heading", { level: 1, name: "Configuración" })).toBeInTheDocument();
    expect(screen.getByText("Lo que se ajusta del negocio.")).toBeInTheDocument();
  });

  it("un restaurante sin TVs: el recibo, el QR, el stock y las sucursales, cada uno a su pantalla", () => {
    abrir();
    expect(tarjetas()).toEqual([
      ["Ticket y recibo", "/configuracion/recibo"],
      ["QR de cobro", "/configuracion/qr-cobro"],
      ["Inventario y stock", "/configuracion/inventario"],
      ["Datos de las sucursales", "/configuracion/sucursales"],
    ]);
  });

  it("con los tickets, Tickets y despacho va segundo, como en la app", () => {
    sesion.features = [...SIN_TVS, "tickets_pedido"];
    abrir();
    expect(tarjetas().map(([t]) => t)).toEqual([
      "Ticket y recibo",
      "Tickets y despacho",
      "QR de cobro",
      "Inventario y stock",
      "Datos de las sucursales",
    ]);
  });

  it("cada tarjeta dice para qué sirve, con los textos de la app en las tres de la app", () => {
    sesion.features = [...SIN_TVS, "tickets_pedido"];
    abrir();
    for (const texto of [
      "El logo, el papel de 58 u 80 mm, la letra y qué se imprime al cobrar.",
      "Cómo se numeran los pedidos y si se usa la pantalla de Despacho.",
      "La cuenta a la que entra la plata cuando el cliente paga con QR.",
      "Si el stock frena la venta, y el conteo para volver a controlarlo.",
      "La dirección, la ubicación en el mapa y el horario de atención.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
    // Sin el pie de la app ("se cambian desde la web"): acá están en la lista.
    expect(screen.queryByText(/desde la web/)).not.toBeInTheDocument();
  });

  it("el encargado ve sólo lo suyo: el recibo", () => {
    sesion.rol = "SUPERVISOR";
    abrir();
    expect(tarjetas()).toEqual([["Ticket y recibo", "/configuracion/recibo"]]);
  });

  it("tocar una tarjeta abre su pantalla", () => {
    abrir();
    fireEvent.click(screen.getByRole("link", { name: /Inventario y stock/ }));
    expect(screen.getByTestId("donde")).toHaveTextContent("/configuracion/inventario");
  });

  it("toda la tarjeta es el enlace, con su nombre y para qué sirve", () => {
    abrir();
    const recibo = screen.getByRole("link", { name: /Ticket y recibo/ });
    expect(recibo).toHaveTextContent("El logo, el papel de 58 u 80 mm");
    // Sin «…»: el texto no se corta, baja de renglón.
    expect(recibo.innerHTML).not.toContain("truncate");
  });
});
