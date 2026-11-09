import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** «Publicar en tu sitio» desde la caja (PLAN-PAGINA-PRO M4), con la API simulada. */

vi.mock("../../lib/pagina/apiDestacado", async (original) => ({
  ...(await original<typeof import("../../lib/pagina/apiDestacado")>()),
  apiDestacado: { estado: vi.fn(), publicar: vi.fn(), quitar: vi.fn() },
}));
vi.mock("../../lib/pagina/apiPagina", () => ({
  BASE_API: "/api",
  urlDeImagen: (r: string | null) => r,
  apiPagina: { buscarProductosCatalogo: vi.fn() },
}));
vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { servicios: vi.fn(), recursos: vi.fn(), huecos: vi.fn() },
}));

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { apiDestacado, horaAIso, horaPropuesta, resumenDestacado } from "../../lib/pagina/apiDestacado";
import { apiPagina } from "../../lib/pagina/apiPagina";
import { ApiError } from "../../lib/api";
import PublicarEnSitio from "./PublicarEnSitio";

const TIPOS_GASTRO = [
  { tipo: "ALMUERZO", etiqueta: "Almuerzo de hoy" },
  { tipo: "PLATO_DEL_DIA", etiqueta: "Plato del día" },
  { tipo: "HOY_HAY", etiqueta: "Hoy hay" },
];

async function montar(sucursalId: number | null = 3) {
  render(<PublicarEnSitio abierto onCerrar={vi.fn()} sucursalId={sucursalId} />);
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiPagina.buscarProductosCatalogo).mockResolvedValue({
    items: [
      { id: 41, nombre: "Sopa de maní + pique macho", precio: 30, icono: null, categoria: null },
      { id: 42, nombre: "Silpancho", precio: 28, icono: null, categoria: null },
    ],
    total: 2,
    limite: 20,
    offset: 0,
  });
});

describe("Publicar en tu sitio", () => {
  it("gastronomía: el primer tipo elegido, un producto con cuántos hay y el resumen", async () => {
    vi.mocked(apiDestacado.estado).mockResolvedValue({ tipos: TIPOS_GASTRO, vigente: null });
    vi.mocked(apiDestacado.publicar).mockResolvedValue({ tipos: TIPOS_GASTRO, vigente: null });
    await montar();
    expect(screen.getByRole("button", { name: "Almuerzo de hoy", pressed: true })).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    fireEvent.click(within(screen.getByRole("list", { name: "Productos del catálogo" })).getByRole("button", { name: /Sopa de maní/ }));
    fireEvent.click(screen.getByRole("button", { name: "Uno más" }));
    fireEvent.click(screen.getByRole("button", { name: "Uno más" }));
    expect(screen.getByText("«Almuerzo de hoy: Sopa de maní + pique macho · Quedan 2»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await act(async () => {});
    const cuerpo = vi.mocked(apiDestacado.publicar).mock.calls[0][0];
    expect(cuerpo).toMatchObject({ tipo: "ALMUERZO", productoIds: [41], cantidad: 2 });
    expect(new Date(cuerpo.hasta).getTime()).toBeGreaterThan(Date.now());
    expect(screen.getByText("¡Publicado! Ya se ve en tu sitio.")).toBeInTheDocument();
  });

  it("el 400 del backend se muestra tal cual", async () => {
    vi.mocked(apiDestacado.estado).mockResolvedValue({ tipos: TIPOS_GASTRO, vigente: null });
    vi.mocked(apiDestacado.publicar).mockRejectedValue(new ApiError("La hora de quitarlo ya pasó", 400));
    await montar();
    fireEvent.change(screen.getByLabelText("Una nota (opcional)"), { target: { value: "Hay sopa" } });
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await act(async () => {});
    expect(screen.getByText("La hora de quitarlo ya pasó")).toBeInTheDocument();
  });

  it("con uno vigente lo muestra y lo deja quitar", async () => {
    const vigente = {
      tipo: "ALMUERZO",
      etiqueta: "Almuerzo de hoy",
      items: [{ titulo: "Silpancho", precio: 28, fotoUrl: null }],
      restante: 5,
      texto: null,
      descuentoPct: null,
      turnos: null,
      hasta: "2026-11-08T19:00:00Z",
      publicadoEn: "2026-11-08T15:00:00Z",
    };
    vi.mocked(apiDestacado.estado).mockResolvedValue({ tipos: TIPOS_GASTRO, vigente });
    vi.mocked(apiDestacado.quitar).mockResolvedValue({ tipos: TIPOS_GASTRO, vigente: null });
    await montar();
    expect(screen.getByText("Ahora en tu sitio, hasta las 15:00")).toBeInTheDocument();
    expect(screen.getByText("«Almuerzo de hoy: Silpancho · Quedan 5»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await act(async () => {});
    expect(apiDestacado.quitar).toHaveBeenCalled();
    expect(screen.queryByText(/Ahora en tu sitio/)).toBeNull();
  });

  it("belleza: los huecos de hoy del servicio, con el profesional y el descuento", async () => {
    const tipos = [
      { tipo: "TURNOS_LIBRES", etiqueta: "Turnos libres hoy" },
      { tipo: "PROMO", etiqueta: "Promo del día" },
    ];
    vi.mocked(apiDestacado.estado).mockResolvedValue({ tipos, vigente: null });
    vi.mocked(apiDestacado.publicar).mockResolvedValue({ tipos, vigente: null });
    vi.mocked(apiAgenda.servicios).mockResolvedValue([
      { id: 5, nombre: "Corte clásico", categoriaId: null, categoria: null, precio: 50, duracionMin: 40, bufferMin: 0, reservableOnline: true, recursoIds: [9], activo: true },
    ]);
    vi.mocked(apiAgenda.recursos).mockResolvedValue([{ id: 9, tipo: "PROFESIONAL", nombre: "Marco Q.", nombrePublico: "Marco" } as never]);
    const futuro = new Date(Date.now() + 2 * 3_600_000).toISOString();
    vi.mocked(apiAgenda.huecos).mockResolvedValue({
      huecos: [{ inicio: futuro, lineas: [{ servicioId: 5, recursoId: 9, inicio: futuro, fin: futuro }] }],
    });
    await montar(3);
    fireEvent.change(screen.getByLabelText("Servicio"), { target: { value: "5" } });
    await act(async () => {});
    expect(apiAgenda.huecos).toHaveBeenCalledWith(expect.objectContaining({ sucursalId: 3, lineas: [{ servicioId: 5, recursoId: null }] }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "20 %" }));
    expect(screen.getByText("«Turnos libres hoy: 1 turno libre · 20 % menos»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await act(async () => {});
    expect(vi.mocked(apiDestacado.publicar).mock.calls[0][0]).toMatchObject({
      tipo: "TURNOS_LIBRES",
      turnos: [{ inicio: futuro, recursoId: 9, profesional: "Marco" }],
      descuentoPct: 20,
    });
  });

  it("farmacia de turno pide hasta cuándo", async () => {
    const tipos = [
      { tipo: "OFERTA", etiqueta: "Oferta del día" },
      { tipo: "DE_TURNO", etiqueta: "De turno hoy" },
    ];
    vi.mocked(apiDestacado.estado).mockResolvedValue({ tipos, vigente: null });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "De turno hoy" }));
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Hasta cuándo estás de turno"), { target: { value: "Hasta las 08:00" } });
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
    expect(screen.getByLabelText("Se quita a las")).toHaveValue("08:00");
  });
});

describe("horas del destacado (Bolivia, UTC−4)", () => {
  it("la hora de hoy, o la de mañana si ya pasó", () => {
    const ahora = new Date("2026-11-08T14:00:00Z"); // 10:00 en Bolivia
    expect(horaAIso("15:00", ahora)).toBe("2026-11-08T19:00:00.000Z");
    expect(horaAIso("08:00", ahora)).toBe("2026-11-09T12:00:00.000Z");
    expect(horaAIso("nada", ahora)).toBeNull();
  });

  it("la propuesta: el almuerzo a las 15:00 y, si ya pasó, al final del día", () => {
    expect(horaPropuesta("ALMUERZO", new Date("2026-11-08T14:00:00Z"))).toBe("15:00");
    expect(horaPropuesta("ALMUERZO", new Date("2026-11-08T20:00:00Z"))).toBe("23:30");
    expect(horaPropuesta("OFERTA", new Date("2026-11-08T14:00:00Z"))).toBe("21:00");
    expect(horaPropuesta("DE_TURNO")).toBe("08:00");
  });

  it("el resumen como lo lee el cliente", () => {
    expect(resumenDestacado({ etiqueta: "Oferta del día", titulos: ["Aceite"], cantidad: 1, texto: null, descuentoPct: null, turnos: 0 })).toBe(
      "Oferta del día: Aceite · Queda 1",
    );
  });
});
