import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isoDia } from "../../../lib/format";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import type { Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";
import { armarTratamiento, CATALOGO_SEGUIMIENTO, pacientesDePrueba, type TratamientoCrudo } from "../../../test/seguimientoFixtures";
import HojaSemana from "./HojaSemana";

/**
 * La hoja «Semana N» (CONTRATO-nutricion-seguimiento-23nov §4.2 y §5): se
 * carga una semana con lo escrito; los botones de la dosis escriben recién al
 * tocarlos (ninguno viene marcado); «No se aplicó» apaga la dosis y pide el
 * motivo; en la semana de pago sin pago, el bloque va en amarillo y guardar
 * sin pago pregunta (no bloquea).
 */

// La hoja entera es pesada: con la máquina cargada (Vite, otra suite) pasaba los 5 s de fábrica.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("../../../lib/nutricion/seguimiento/api", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/seguimiento/api")>()),
  apiSeguimiento: {
    cargarSemana: vi.fn(),
    corregirRegistro: vi.fn(),
    borrarRegistro: vi.fn(),
  },
}));

const HOY = isoDia(new Date());
const pacientes = pacientesDePrueba(HOY);
const delPaciente = (id: number, cambiar?: (t: TratamientoCrudo) => TratamientoCrudo): Tratamiento => {
  const crudo = pacientes.find((p) => p.paciente.id === id)!.tratamientos[0];
  return armarTratamiento(cambiar ? cambiar(structuredClone(crudo)) : crudo);
};
/** Lucía: semana 7, en UI con el vial de 15 mg en 0,5 ml, debe el pago de la semana 5. */
const lucia = delPaciente(12);
/** Carla: semana 4; la próxima (5) le toca pagar. */
const carla = delPaciente(22);
const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");

function abrir(t: Tratamiento, opciones: { semana?: number; registro?: number; ultimoControl?: { fecha: string; pesoKg: number } | null } = {}) {
  const onGuardado = vi.fn();
  const onCerrar = vi.fn();
  const registro = opciones.registro != null ? t.registros.find((r) => r.semana === opciones.registro)! : null;
  render(
    <MemoryRouter>
      <HojaSemana
        tratamiento={t}
        catalogo={CATALOGO_SEGUIMIENTO}
        registro={registro}
        semana={opciones.semana ?? t.resumen.semana + 1}
        pacienteNombre="Paciente de prueba"
        ultimoControl={opciones.ultimoControl ?? null}
        onCerrar={onCerrar}
        onGuardado={onGuardado}
      />
    </MemoryRouter>,
  );
  return { onGuardado, onCerrar };
}

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre });
/** El nombre exacto de un botón, con los espacios duros («25 UI») como cualquier espacio. */
const exacto = (texto: string) => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")}$`);

beforeEach(() => {
  vi.mocked(apiSeguimiento.cargarSemana).mockReset().mockResolvedValue(lucia);
  vi.mocked(apiSeguimiento.corregirRegistro).mockReset().mockResolvedValue(lucia);
});

describe("cargar una semana", () => {
  it("abre vacía salvo el número y la fecha, con lo anterior en gris", () => {
    abrir(lucia);
    expect(screen.getByRole("dialog", { name: "Semana 8" })).toBeInTheDocument();
    expect(screen.getByLabelText("Semana")).toHaveValue("8");
    expect(screen.getByLabelText("Fecha")).toHaveValue(HOY);
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue("");
    expect(screen.getByLabelText("Dosis")).toHaveValue("");
    expect(screen.getByLabelText("Observaciones")).toHaveValue("");
    expect(screen.getByLabelText("Medicamento (Bs)")).toHaveValue("");
    expect(screen.getByText("anterior: 124,7")).toBeInTheDocument();
    expect(sinNb(screen.getByText(/^Lleva/).textContent)).toBe("Lleva 4 semanas con 17 UI");
    // La semana 8 no es de pago: sin amarillo.
    expect(screen.queryByText("Hoy toca el pago del mes")).not.toBeInTheDocument();
  });

  it("al escribir el peso dice lo que bajó o subió; al escribir la dosis, sus equivalencias", () => {
    abrir(lucia);
    fireEvent.change(screen.getByLabelText("Peso (kg)"), { target: { value: "123,5" } });
    expect(sinNb(screen.getByText(/en total/).textContent)).toBe("↓ 1,2 esta semana · ↓ 5,5 en total");
    fireEvent.change(screen.getByLabelText("Dosis"), { target: { value: "17" } });
    expect(sinNb(screen.getByText(/≈/).closest("span[class*='text-texto-3']")?.textContent ?? "")).toBe("≈ 5,1 mg · 0,17 ml");
  });

  it("los botones de la dosis escriben el número en la unidad del tratamiento, y sólo al tocarlos", () => {
    abrir(lucia);
    const dosis = screen.getByLabelText("Dosis");
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    fireEvent.click(boton(/Igual que la anterior/));
    expect(dosis).toHaveValue("17");
    fireEvent.click(boton(exacto("Subir: 25 UI (7,5 mg)")));
    expect(dosis).toHaveValue("25");
    // Cada escalón con sus dos datos.
    fireEvent.click(boton(exacto("8 UI · 2,5 mg")));
    expect(dosis).toHaveValue("8");
    expect(boton(exacto("50 UI · 15 mg"))).toBeInTheDocument();
  });

  it("guarda lo escrito y avisa", async () => {
    const { onGuardado } = abrir(lucia);
    fireEvent.change(screen.getByLabelText("Peso (kg)"), { target: { value: "123,9" } });
    fireEvent.click(boton(/^Subir/));
    fireEvent.change(screen.getByLabelText("Observaciones"), { target: { value: "Sube a 7,5 mg." } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, { semana: 8, fecha: HOY, pesoKg: 123.9, dosis: 25, observaciones: "Sube a 7,5 mg." });
    expect(onGuardado.mock.calls[0][1]).toBe("Semana 8 guardada.");
  });

  it("vacía no se guarda; una semana repetida se avisa antes de mandarla", () => {
    abrir(lucia);
    fireEvent.click(boton(/^Guardar/));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí al menos el peso, la dosis, una observación o un pago");
    fireEvent.change(screen.getByLabelText("Semana"), { target: { value: "7" } });
    expect(screen.getByText("Ya hay un registro de la semana 7.")).toBeInTheDocument();
    expect(apiSeguimiento.cargarSemana).not.toHaveBeenCalled();
  });

  it("«No se aplicó»: apaga la dosis, pide el motivo (con botones que lo escriben) y se guarda sólo con eso", async () => {
    const { onGuardado } = abrir(lucia);
    fireEvent.change(screen.getByLabelText("Dosis"), { target: { value: "17" } });
    fireEvent.click(boton("No se aplicó esta semana"));
    expect(boton("No se aplicó esta semana")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Dosis")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Subir/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Motivo")).toHaveValue("");
    fireEvent.click(boton("Viaje"));
    expect(screen.getByLabelText("Motivo")).toHaveValue("Viaje");
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, { semana: 8, fecha: HOY, sinDosis: true, motivoSinDosis: "Viaje" });
  });

  it("«Cambio de laboratorio» agrega el texto para completar", () => {
    abrir(lucia);
    fireEvent.click(boton("Cambio de laboratorio"));
    expect(screen.getByLabelText("Observaciones")).toHaveValue("Cambio de laboratorio: ");
  });

  it("ofrece el peso de la Evaluación si es del mismo día o posterior, con «Usar» (no se precarga)", () => {
    const ultima = lucia.registros[lucia.registros.length - 1].fecha;
    abrir(lucia, { ultimoControl: { fecha: ultima, pesoKg: 124.5 } });
    const peso = screen.getByLabelText("Peso (kg)");
    expect(peso).toHaveValue("");
    expect(sinNb(screen.getByText(/^Evaluación del/).textContent)).toContain(": 124,5 kg");
    fireEvent.click(boton("Usar"));
    expect(peso).toHaveValue("124,5");
  });

  it("con un control de la Evaluación más viejo que el último peso, no lo ofrece", () => {
    abrir(lucia, { ultimoControl: { fecha: "2020-01-01", pesoKg: 130 } });
    expect(screen.queryByText(/^Evaluación del/)).not.toBeInTheDocument();
  });
});

describe("la semana de pago", () => {
  it("«Hoy toca el pago del mes» y, al guardar sin pago, pregunta: «Anotar el pago» vuelve al campo", async () => {
    abrir(carla, { semana: 5 });
    expect(screen.getByText("Hoy toca el pago del mes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Peso (kg)"), { target: { value: "84,6" } });
    fireEvent.click(boton(/^Guardar/));
    expect(screen.getByRole("dialog", { name: "¿Guardar sin el pago?" })).toBeInTheDocument();
    fireEvent.click(boton("Anotar el pago"));
    expect(screen.queryByRole("dialog", { name: "¿Guardar sin el pago?" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Medicamento (Bs)")).toHaveFocus());
    expect(apiSeguimiento.cargarSemana).not.toHaveBeenCalled();
  });

  it("«Guardar sin pago» guarda igual (no bloquea)", async () => {
    const { onGuardado } = abrir(carla, { semana: 5 });
    fireEvent.change(screen.getByLabelText("Peso (kg)"), { target: { value: "84,6" } });
    fireEvent.click(boton(/^Guardar/));
    fireEvent.click(boton("Guardar sin pago"));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(7, { semana: 5, fecha: HOY, pesoKg: 84.6 });
  });

  it("con el pago anotado no pregunta", async () => {
    const { onGuardado } = abrir(carla, { semana: 5 });
    fireEvent.change(screen.getByLabelText("Medicamento (Bs)"), { target: { value: "480" } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(7, { semana: 5, fecha: HOY, pagoMedicamento: 480 });
  });
});

describe("corregir una semana", () => {
  it("abre con lo guardado y dice quién la cargó y quién la corrigió", () => {
    abrir(lucia, { registro: 5 });
    expect(screen.getByRole("dialog", { name: "Semana 5" })).toBeInTheDocument();
    expect(screen.getByLabelText("Peso (kg)")).toHaveValue("123,4");
    expect(screen.getByText(/^Cargó: Dra\. Prueba, /)).toBeInTheDocument();
    expect(screen.getByText(/^Corrigió: Administración, /)).toBeInTheDocument();
    // La semana 5 debe el pago: el bloque va en amarillo.
    expect(screen.getByText("Hoy toca el pago del mes")).toBeInTheDocument();
  });

  it("«Borrar semana» con un pago anotado lo dice en la confirmación", () => {
    abrir(lucia, { registro: 4 });
    fireEvent.click(boton("Borrar semana"));
    expect(screen.getByText("Esta semana tiene un pago anotado de Bs 50. Si la borrás, se pierde.")).toBeInTheDocument();
  });

  it("el inicial no tiene número de semana ni «Borrar semana» ni «No se aplicó»", () => {
    abrir(lucia, { registro: 0 });
    expect(screen.getByRole("dialog", { name: "Inicial" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Semana")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrar semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No se aplicó esta semana" })).not.toBeInTheDocument();
  });

  it("manda sólo lo que cambió", async () => {
    const { onGuardado } = abrir(lucia, { registro: 6 });
    fireEvent.click(boton("Salud"));
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.corregirRegistro).toHaveBeenCalledWith(lucia.registros.find((r) => r.semana === 6)!.id, { motivoSinDosis: "Salud" });
  });
});

describe("sin la presentación del vial", () => {
  it("con la dosis en UI, los escalones no se pueden pasar: no se muestran y se avisa", () => {
    const sinVial = delPaciente(12, (t) => ({ ...t, vial: null }));
    abrir(sinVial);
    expect(screen.getByText(/Cargá la presentación del vial para ver las dosis en UI/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^8\sUI/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Subir/ })).not.toBeInTheDocument();
  });

  it("con la dosis en mg, los escalones se ven igual (sin UI)", () => {
    const daniel = delPaciente(21);
    abrir(daniel);
    expect(boton(exacto("2,5 mg"))).toBeInTheDocument();
    expect(boton(exacto("Subir: 5 mg"))).toBeInTheDocument();
  });
});
