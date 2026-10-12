import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerRegalo, { type RegaloPublico } from "./VerRegalo";

/** La gift card que abre quien la recibe (IDEAS/6 #6). */

const REGALO: RegaloPublico = {
  negocio: {
    nombre: "Spa Aurora",
    subdominio: "spa-aurora",
    rubroClave: "SPA",
    color: { clave: "VERDE", hex: "#2F6F5E" },
    logoUrl: null,
  },
  diseno: "BOTANICA",
  monto: 200,
  saldo: 80,
  codigo: "K7QM-2XPA",
  venceEn: "2027-04-30",
  para: "María",
  de: "Luis",
  mensaje: "¡Feliz cumple!",
  estado: "USABLE",
};

async function abrir(cuerpo: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })),
  );
  render(
    <MemoryRouter initialEntries={["/p/spa-aurora/regalo/AbCdEfGhIjKlMnOpQrStUv"]}>
      <Routes>
        <Route path="/p/:subdominio/regalo/:token" element={<VerRegalo />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

afterEach(() => vi.unstubAllGlobals());

describe("ver una gift card", () => {
  it("muestra la tarjeta, la dedicatoria, el saldo y el código", async () => {
    await abrir(REGALO);
    expect(fetch).toHaveBeenCalledWith("/api/publico/pagina/spa-aurora/regalo/AbCdEfGhIjKlMnOpQrStUv");
    expect(screen.getByRole("heading", { name: "¡María, tenés un regalo!" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gift card de Spa Aurora por Bs 200" })).toBeInTheDocument();
    expect(screen.getByText("¡Feliz cumple!")).toBeInTheDocument();
    expect(screen.getByText("Bs 80 de Bs 200")).toBeInTheDocument();
    expect(screen.getByText("30/04/2027")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reenviar por WhatsApp" }).getAttribute("href")).toContain("wa.me");
  });

  it("si se usó toda, lo dice", async () => {
    await abrir({ ...REGALO, saldo: 0, estado: "AGOTADA" });
    expect(screen.getByText("Ya se usó completa")).toBeInTheDocument();
  });

  it("un enlace que no existe", async () => {
    await abrir({ message: "Esta página no está disponible" }, 404);
    expect(screen.getByRole("heading", { name: /no existe o el enlace está mal copiado/ })).toBeInTheDocument();
  });
});
