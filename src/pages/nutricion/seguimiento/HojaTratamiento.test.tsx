import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import type { CatalogoSeguimiento, ProductoSeguimiento } from "../../../lib/nutricion/seguimiento/tipos";
import { catalogoConLista } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { avisaAlCerrar, historialDePrueba } from "../../../test/historial";
import { CATALOGO_SEGUIMIENTO } from "../../../test/seguimientoFixtures";
import HojaTratamiento from "./HojaTratamiento";

/**
 * «Iniciar tratamiento» y el atrás del navegador (23-nov): con algo escrito
 * se llevaba la página de abajo y la hoja, sin preguntar. Y «+ Agregar»
 * (§9.2): abre «Tratamientos» encima sin tocar lo escrito en la hoja.
 */

vi.mock("../../../lib/nutricion/seguimiento/api", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/seguimiento/api")>()),
  apiSeguimiento: { iniciar: vi.fn(), cambiarTratamiento: vi.fn(), productos: vi.fn(), agregarProducto: vi.fn() },
}));

function abrir() {
  const onCerrar = vi.fn();
  render(
    <MemoryRouter>
      <HojaTratamiento
        modo="iniciar"
        pacienteId={20}
        pacienteNombre="Paciente de prueba"
        catalogo={CATALOGO_SEGUIMIENTO}
        ultimoControl={null}
        onCerrar={onCerrar}
        onGuardado={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { onCerrar };
}

describe("iniciar tratamiento: el atrás del navegador", () => {
  let h: ReturnType<typeof historialDePrueba>;
  beforeEach(() => {
    h = historialDePrueba(5);
  });
  afterEach(() => h.limpiar());

  it("con algo escrito se queda y pregunta; «Cancelar» conserva lo escrito y «Cerrar sin guardar» cierra la hoja", () => {
    const { onCerrar } = abrir();
    fireEvent.change(screen.getByLabelText("Tratamiento"), { target: { value: "Un tratamiento" } });

    h.viajar(6);
    expect(h.go).toHaveBeenCalledWith(-1);
    h.viajar(5);
    expect(h.router).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "¿Cerrar sin guardar?" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Tratamiento")).toHaveValue("Un tratamiento");
    expect(onCerrar).not.toHaveBeenCalled();

    h.viajar(4);
    h.viajar(5);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin guardar" }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(h.router).not.toHaveBeenCalled();
  });

  it("sin nada escrito el atrás hace lo de siempre", () => {
    const { onCerrar } = abrir();
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("cerrar o recargar la pestaña avisa sólo con algo escrito", () => {
    abrir();
    expect(avisaAlCerrar()).toBe(false);
    fireEvent.change(screen.getByLabelText("Tratamiento"), { target: { value: "Un tratamiento" } });
    expect(avisaAlCerrar()).toBe(true);
  });
});

describe("«+ Agregar» al final de los botones del catálogo (§9.2)", () => {
  const deFabrica = (nombre: string): ProductoSeguimiento => ({ id: null, nombre, deFabrica: true, cambiado: false, oculto: false, pasosMg: [], presentaciones: [] });
  const DE_FABRICA = ["Tirzepatida", "Retatrutida", "Glow"].map(deFabrica);
  const NUEVO: ProductoSeguimiento = { ...deFabrica("Péptido nuevo"), id: 12, deFabrica: false, presentaciones: [{ mg: 70, ml: 3 }] };

  /** La hoja con el catálogo en el estado de quien la abre, como en la hoja del paciente. */
  function ConCatalogo({ catalogo, onCerrar }: { catalogo: CatalogoSeguimiento; onCerrar: () => void }) {
    const [cat, setCat] = useState(catalogo);
    return (
      <HojaTratamiento
        modo="iniciar"
        pacienteId={20}
        pacienteNombre="Paciente de prueba"
        catalogo={cat}
        ultimoControl={null}
        onCerrar={onCerrar}
        onGuardado={vi.fn()}
        onListaCambiada={(p) => setCat((c) => catalogoConLista(c, p))}
      />
    );
  }
  function abrirCon(catalogo: CatalogoSeguimiento = CATALOGO_SEGUIMIENTO) {
    const onCerrar = vi.fn();
    render(
      <MemoryRouter>
        <ConCatalogo catalogo={catalogo} onCerrar={onCerrar} />
      </MemoryRouter>,
    );
    return { onCerrar };
  }
  const agregar = () => screen.getByRole("button", { name: "Agregar un tratamiento a la lista" });
  const hoja = () => screen.getByRole("dialog", { name: "Iniciar tratamiento" });
  /** Toca «+ Agregar» y deja que llegue la lista adentro de `act`. */
  const abrirLaLista = async () => {
    fireEvent.click(agregar());
    await act(async () => {});
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiSeguimiento.productos).mockResolvedValue({ productos: DE_FABRICA });
  });

  it("los botones del catálogo (también «Glow») y, al final, «+ Agregar»", () => {
    abrirCon();
    const botones = within(hoja()).getByRole("button", { name: "Glow" }).parentElement!;
    expect(within(botones).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tirzepatida", "Retatrutida", "Glow", "Agregar"]);
    expect(agregar()).toBeInTheDocument();
  });

  it("sin `puedeCambiarlos` no sale «+ Agregar»", () => {
    abrirCon({ ...CATALOGO_SEGUIMIENTO, ajustes: { ...CATALOGO_SEGUIMIENTO.ajustes, puedeCambiarlos: false } });
    expect(screen.getByRole("button", { name: "Glow" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar un tratamiento a la lista" })).not.toBeInTheDocument();
  });

  it("abre «Agregar tratamiento» encima; `Esc` la cierra sin cerrar ni preguntar por la hoja", async () => {
    const { onCerrar } = abrirCon();
    fireEvent.change(screen.getByLabelText("Tratamiento"), { target: { value: "Escrito a mano" } });
    await abrirLaLista();
    expect(screen.getByRole("dialog", { name: "Agregar tratamiento" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Agregar tratamiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "¿Cerrar sin guardar?" })).not.toBeInTheDocument();
    expect(hoja()).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tratamiento")).toHaveValue("Escrito a mano");
    // `Ctrl+Enter` con la ventana encima no guarda la hoja de atrás.
    await abrirLaLista();
    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });
    expect(apiSeguimiento.iniciar).not.toHaveBeenCalled();
  });

  it("al volver de agregar: el botón nuevo aparece, NO se elige solo y lo escrito en la hoja sigue igual", async () => {
    vi.mocked(apiSeguimiento.agregarProducto).mockResolvedValue({ productos: [...DE_FABRICA, NUEVO] });
    const { onCerrar } = abrirCon();
    fireEvent.change(screen.getByLabelText("Tratamiento"), { target: { value: "Escrito a mano" } });
    fireEvent.click(within(hoja()).getByRole("radio", { name: "UI" }));
    fireEvent.change(screen.getByLabelText("Peso de hoy"), { target: { value: "92,5" } });
    await abrirLaLista();
    const ventana = screen.getByRole("dialog", { name: "Agregar tratamiento" });
    fireEvent.change(within(ventana).getByLabelText("Nombre"), { target: { value: "Péptido nuevo" } });
    fireEvent.click(within(ventana).getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Agregar tratamiento" })).not.toBeInTheDocument());
    expect(within(hoja()).getByRole("button", { name: "Péptido nuevo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tratamiento")).toHaveValue("Escrito a mano");
    expect(within(hoja()).getByRole("radio", { name: "UI" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Peso de hoy")).toHaveValue("92,5");
    expect(onCerrar).not.toHaveBeenCalled();
    // Recién al tocarlo escribe el nombre (y sus viales salen como botones).
    fireEvent.click(within(hoja()).getByRole("button", { name: "Péptido nuevo" }));
    expect(screen.getByLabelText("Tratamiento")).toHaveValue("Péptido nuevo");
    expect(within(hoja()).getByRole("button", { name: /^70.mg en 3.ml$/ })).toBeInTheDocument();
  });
});
