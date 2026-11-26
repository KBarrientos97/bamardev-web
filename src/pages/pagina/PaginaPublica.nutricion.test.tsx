import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiConsultaNutricion, type ConsultaPaciente } from "../../lib/nutricion/consulta";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import { CATALOGO_SEGUIMIENTO } from "../../test/seguimientoFixtures";
import PaginaPublica from "./PaginaPublica";

/**
 * La página de un consultorio de nutrición (25-nov): el carnet se escribe en
 * la misma página, la ficha se ve ahí a pantalla completa y «Salir» vuelve a
 * la página. Otro rubro (sin `consultaPacientes`) no lleva el formulario.
 */

vi.mock("../../lib/nutricion/consulta", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/consulta")>()),
  apiConsultaNutricion: { info: vi.fn(), consultar: vi.fn() },
}));

vi.setConfig({ testTimeout: 20_000 });

const PAGINA: Pagina = {
  subdominio: "vida",
  nombre: "Consultorio Vida",
  rubro: "Nutrición",
  iniciales: "CV",
  descripcion: "Planes de alimentación y control de peso.",
  color: { clave: "VERDE", hex: "#047857" },
  formaBotones: "PILDORA",
  tipografia: "FUERTE",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [],
  botones: [{ id: 9, tipo: "BOTON", etiqueta: "Nuestros planes", url: "https://vida.bo/planes.pdf", icono: null }],
  sucursales: [],
  catalogo: null,
  consultaPacientes: true,
  pie: { atribucionUrl: "https://bamardev.com/?utm_campaign=vida" },
  og: { titulo: "Consultorio Vida", descripcion: "Nutrición", imagen: null, url: "https://link.bamardev.com/vida" },
};

function consulta(): ConsultaPaciente {
  const { clienteId: _c, ...p } = paciente({
    nombre: "Ana Rojas",
    ci: "8958703",
    controles: [control({ id: 1, fecha: "2026-10-01", inicial: true, pesoKg: 90, imc: 35.2, imcGrado: "OBESIDAD_2" })],
  });
  void _c;
  const { ajustes: _a, ...catSeg } = CATALOGO_SEGUIMIENTO;
  void _a;
  return { negocio: "Consultorio Vida", paciente: p, catalogo: CATALOGO, seguimiento: { catalogo: catSeg, tratamientos: [] } };
}

async function montar(pagina: Pagina) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(pagina), { status: 200, headers: { "Content-Type": "application/json" } })),
  );
  render(
    <MemoryRouter initialEntries={[`/p/${pagina.subdominio}`]}>
      <Routes>
        <Route path="/p/:subdominio" element={<PaginaPublica />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.mocked(apiConsultaNutricion.consultar).mockReset();
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.title = "";
});

describe("página de un consultorio de nutrición", () => {
  it("el carnet se escribe en la página; la ficha se ve ahí y «Salir» vuelve", async () => {
    vi.mocked(apiConsultaNutricion.consultar).mockResolvedValue(consulta());
    await montar(PAGINA);
    expect(screen.getByRole("heading", { name: "Consultá tu ficha" })).toBeInTheDocument();
    // La ilustración animada acompaña al formulario (decorativa).
    expect(document.querySelector(".ecn")).toHaveAttribute("aria-hidden", "true");
    // Ya no es un botón que lleva a otra pantalla.
    expect(screen.queryByRole("link", { name: /Consultar mi ficha/ })).toBeNull();
    // Los botones del dueño siguen.
    expect(screen.getByRole("link", { name: /Nuestros planes/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "8958703" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver mi ficha" }));
    // La ficha se baja con `lazy`: en frío, el import tarda más que el segundo por defecto.
    expect(await screen.findByRole("heading", { level: 1, name: "Ana Rojas" }, { timeout: 10_000 })).toBeInTheDocument();
    expect(apiConsultaNutricion.consultar).toHaveBeenCalledWith("vida", { ci: "8958703" });
    expect(screen.queryByRole("link", { name: /Nuestros planes/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Salir/ }));
    expect(screen.queryByText("Ana Rojas")).toBeNull();
    expect(screen.getByRole("heading", { name: "Consultá tu ficha" })).toBeInTheDocument();
    expect((screen.getByLabelText("Carnet de identidad") as HTMLInputElement).value).toBe("");
  });

  it("sitio en la computadora sin reservas ni catálogo: un solo WhatsApp en la portada", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1280 });
    try {
      await montar({
        ...PAGINA,
        destacado: { id: 7, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170123456", icono: null },
        sitio: { plantilla: "COMERCIO", bloques: [{ tipo: "PORTADA", titulo: "Tu salud empieza en el plato", subtitulo: null, fotos: [] }] },
      });
      const portada = screen.getByRole("region", { name: "Portada" });
      expect(within(portada).getAllByRole("link", { name: /WhatsApp/ })).toHaveLength(1);
      // El WhatsApp del encabezado es relleno: su ícono no puede ir del mismo
      // verde que el fondo (salía invisible y corría el texto, 26-nov).
      for (const enlace of [within(screen.getByRole("banner")).getByRole("link", { name: /WhatsApp/ }), within(portada).getByRole("link", { name: /WhatsApp/ })]) {
        expect(enlace.querySelector("svg")).not.toHaveAttribute("stroke", "#0C7A55");
      }
      // El carnet sigue debajo de la portada.
      expect(screen.getByRole("heading", { name: "Consultá tu ficha" })).toBeInTheDocument();
    } finally {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });

  it("otro rubro (sin la consulta) no lleva el formulario", async () => {
    await montar({ ...PAGINA, consultaPacientes: false });
    expect(screen.getByRole("link", { name: /Nuestros planes/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Consultá tu ficha" })).toBeNull();
    expect(screen.queryByLabelText("Carnet de identidad")).toBeNull();
    expect(document.querySelector(".ecn")).toBeNull();
  });
});
