import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CATALOGO, control, paciente } from "../../test/nutricionFixtures";
import HojaControl from "./HojaControl";

/**
 * La hoja «Nuevo control» / «Editar control» (testing profundo, 23-nov):
 * `Esc` en «¿Borrar este control?» cerraba también la hoja y se perdía lo
 * corregido; el IMC imposible (la talla de la ficha mal escrita) no se avisaba;
 * y al salir de un campo entero con decimales («44,5») se redondeaba callado.
 */

vi.mock("../../lib/nutricion/api", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/api")>()),
  apiNutricion: {
    crearControl: vi.fn(),
    editarControl: vi.fn(),
    borrarControl: vi.fn(),
  },
}));

const inicial = control({ id: 5, fecha: "2026-11-01", inicial: true, pesoKg: 120, nota: "La de antes" });

function abrir(opciones: { tallaCm?: number; corregir?: boolean } = {}) {
  const onCerrar = vi.fn();
  const p = paciente({ sexo: "M", fechaNacimiento: null, edad: 29, tallaCm: opciones.tallaCm ?? 175, controles: [inicial] });
  render(
    <MemoryRouter>
      <HojaControl paciente={p} catalogo={CATALOGO} control={opciones.corregir ? inicial : null} onCerrar={onCerrar} onGuardado={vi.fn()} />
    </MemoryRouter>,
  );
  return { onCerrar };
}

describe("hoja de control", () => {
  it("Esc en «¿Borrar este control?» cierra sólo la pregunta: la hoja y lo escrito siguen", () => {
    const { onCerrar } = abrir({ corregir: true });
    const nota = screen.getByLabelText("Nota");
    fireEvent.change(nota, { target: { value: "Corregida a mano" } });
    fireEvent.click(screen.getByRole("button", { name: "Borrar control" }));
    expect(screen.getByRole("dialog", { name: "¿Borrar este control?" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "¿Borrar este control?" })).not.toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Editar control" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nota")).toHaveValue("Corregida a mano");
  });

  it("Esc sin nada escrito cierra directo", () => {
    const { onCerrar } = abrir({ corregir: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("Esc con algo escrito pregunta antes de perderlo", () => {
    const { onCerrar } = abrir();
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "118" } });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "¿Cerrar sin guardar?" })).toBeInTheDocument();

    // Esc en la pregunta: se queda, con lo escrito.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "¿Cerrar sin guardar?" })).not.toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Peso")).toHaveValue("118");

    // La ✕ también pregunta; «Cerrar sin guardar» cierra.
    fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin guardar" }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("avisa el IMC imposible sin bloquear (talla de la ficha 80 cm, 127 kg → 198,4)", () => {
    abrir({ tallaCm: 80 });
    const peso = screen.getByLabelText("Peso");
    fireEvent.change(peso, { target: { value: "12" } });
    // A mitad de escribir el peso está en error: no hay IMC ni aviso.
    expect(screen.queryByText(/Revisá la talla y el peso/)).not.toBeInTheDocument();
    fireEvent.change(peso, { target: { value: "127" } });
    expect(screen.getByText("Revisá la talla y el peso: el IMC da 198,4")).toBeInTheDocument();
  });

  it("con una talla creíble no hay aviso", () => {
    abrir({ tallaCm: 180 });
    fireEvent.change(screen.getByLabelText("Peso"), { target: { value: "127" } });
    expect(screen.getByText("39,2")).toBeInTheDocument();
    expect(screen.queryByText(/Revisá la talla y el peso/)).not.toBeInTheDocument();
  });

  it("al salir de la edad corporal con decimales no se redondea callado: queda con su error", () => {
    abrir();
    const edad = screen.getByLabelText("Edad corporal");
    fireEvent.change(edad, { target: { value: "44,5" } });
    fireEvent.blur(edad);
    expect(edad).toHaveValue("44,5");
    expect(screen.getByText("Sin decimales")).toBeInTheDocument();
  });
});
