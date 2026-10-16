import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RutasBillar from "./RutasBillar";

// La primera vez se transforma todo el billar: en una máquina cargada pasa los 5 s.
vi.setConfig({ testTimeout: 60_000 });

/**
 * El tablero con varias sucursales (13-oct), sin datos reales: el backend y
 * la lista de sucursales son de mentira. Lo que se mira es lo que ve el dueño
 * y lo que se le pide al backend; un negocio de un solo local no ve nada nuevo.
 */

const request = vi.hoisted(() => vi.fn());
const sucursales = vi.hoisted(() => ({ elegir: false }));
const servidor = vi.hoisted(() => ({ tableroDe: 1, cajaEn: 1 as number | null }));
/** Un negocio distinto por test: el store es de módulo y se vacía al cambiar de negocio. */
const sesion = vi.hoisted(() => ({ alias: "billar-tablero-0" }));

vi.mock("../../lib/api", async (original) => ({
  ...(await original<typeof import("../../lib/api")>()),
  request,
  api: { getFormasPago: vi.fn(async () => []) },
}));

vi.mock("../../lib/useSucursales", () => ({
  useSucursales: () => ({
    elegir: sucursales.elegir,
    sucursales: [
      { id: 1, nombre: "Centro", esPrincipal: true, activo: true, tipo: "SUCURSAL" },
      { id: 2, nombre: "Norte", esPrincipal: false, activo: true, tipo: "SUCURSAL" },
    ],
    sugerida: { id: 1, nombre: "Centro" },
  }),
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, sucursalId: null, sucursal: null, permisos: ["billar.operar"] },
    negocio: { alias: sesion.alias, nombre: "Billar de prueba" },
  }),
}));

const NOMBRES: Record<number, string> = { 1: "Centro", 2: "Norte" };

function responder(url: string) {
  if (url.startsWith("/billar/tablero")) {
    const m = /sucursalId=(\d+)/.exec(url);
    const id = m ? Number(m[1]) : servidor.tableroDe;
    return {
      ahora: Date.now(),
      sucursal: { id, nombre: NOMBRES[id] ?? "Principal" },
      caja: { abierta: true, id: 9, desde: Date.now() - 3_600_000, inicial: 100, sucursalId: servidor.cajaEn },
      ajustes: { avisos: [10, 5, 1], sonido: false, voz: false, pin: { anularConsumo: true, anularMesa: true }, tieneTokenSalon: false },
      tipos: [{ id: "pool", nombre: "Pool", tarifa: 20, fraccion: 15, tolerancia: 3, minimo: 30, paquetes: [], promos: [] }],
      mesas: [],
    };
  }
  return [];
}

const urls = () => request.mock.calls.map((c) => c[0] as string);

async function montar() {
  const vista = render(
    <MemoryRouter initialEntries={["/billar"]}>
      <Routes>
        <Route path="/billar/*" element={<RutasBillar />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  await screen.findByRole("heading", { name: /Billar/ });
  return vista;
}

let vuelta = 0;
beforeEach(() => {
  sesion.alias = `billar-tablero-${++vuelta}`;
  request.mockReset();
  request.mockImplementation(async (url: string) => responder(url));
  localStorage.clear();
  sucursales.elegir = false;
  servidor.tableroDe = 1;
  servidor.cajaEn = 1;
});

afterEach(() => {
  document.querySelectorAll("[data-dialogo-de-prueba]").forEach((n) => n.remove());
});

describe("Tablero: la sucursal", () => {
  it("un negocio de un solo local no ve selector y pide el tablero como siempre", async () => {
    servidor.cajaEn = null;
    await montar();
    expect(screen.queryByRole("combobox", { name: "Sucursal" })).toBeNull();
    expect(urls().filter((u) => u.startsWith("/billar/tablero"))).toEqual(["/billar/tablero"]);
    expect(screen.getByRole("button", { name: "Venta rápida" })).toBeInTheDocument();
  });

  it("el dueño con varios locales elige en el encabezado, y el tablero se pide de ese", async () => {
    sucursales.elegir = true;
    await montar();
    const selector = screen.getByRole("combobox", { name: "Sucursal" });
    expect(selector).toHaveValue("1");
    servidor.cajaEn = 1;
    await act(async () => {
      fireEvent.change(selector, { target: { value: "2" } });
    });
    expect(urls()).toContain("/billar/tablero?sucursalId=2");
    expect(localStorage.getItem(`bamardev.billar.sucursal.${sesion.alias}`)).toBe("2");
    expect(await screen.findByRole("combobox", { name: "Sucursal" })).toHaveValue("2");
  });

  it("mirando un local que no es el de su caja, avisa y no ofrece venta rápida", async () => {
    sucursales.elegir = true;
    servidor.tableroDe = 2;
    servidor.cajaEn = 1;
    await montar();
    expect(screen.getByText(/tu caja está abierta en/i)).toBeInTheDocument();
    // La venta caería en la caja de Centro con los precios de Norte.
    expect(screen.queryByRole("button", { name: "Venta rápida" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Volver a Centro" }));
    });
    expect(urls()).toContain("/billar/tablero?sucursalId=1");
  });
});

describe('Tablero: la tecla "/"', () => {
  it("enfoca el buscador, pero no con un diálogo abierto", async () => {
    await montar();
    const buscador = screen.getByPlaceholderText("Buscar mesa o cliente");

    // QA del 13-oct: con un modal abierto, "/" le robaba el foco.
    const dialogo = document.createElement("div");
    dialogo.setAttribute("role", "dialog");
    dialogo.setAttribute("aria-modal", "true");
    dialogo.dataset.dialogoDePrueba = "";
    document.body.appendChild(dialogo);
    fireEvent.keyDown(document, { key: "/" });
    expect(buscador).not.toHaveFocus();

    dialogo.remove();
    fireEvent.keyDown(document, { key: "/" });
    expect(buscador).toHaveFocus();
  });
});
