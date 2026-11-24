import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api";
import { isoDia } from "../../../lib/format";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import type { Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";
import { avisaAlCerrar, historialDePrueba } from "../../../test/historial";
import { armarTratamiento, CATALOGO_SEGUIMIENTO, pacientesDePrueba, type TratamientoCrudo } from "../../../test/seguimientoFixtures";
import HojaSemana from "./HojaSemana";

/**
 * La hoja «Semana N» de la maqueta A (CONTRATO-nutricion-seguimiento-23nov
 * §4.2, §5 y §7.2): una semana nueva viene con «Igual que la anterior»
 * marcada (sin contar como cambio), el peso dice en vivo cuánto bajó, los
 * escalones y «Otra» escriben la dosis, «No se aplicó» apaga la dosis y pide
 * el motivo, y en la semana de pago sin pago el bloque va en amarillo y
 * guardar sin pago pregunta (no bloquea).
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
/** Carla: semana 4 (con 25 UI); la próxima (5) le toca pagar. */
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
const igual = () => boton(/^Igual que la anterior/);
const subir = () => boton(/Subir un escalón/);
const otra = () => screen.getByLabelText(/^Otra dosis/);
const peso = () => screen.getByLabelText("Peso de hoy");
const marcados = () => screen.queryAllByRole("button", { pressed: true }).map((b) => sinNb(b.textContent));

beforeEach(() => {
  vi.mocked(apiSeguimiento.cargarSemana).mockReset().mockResolvedValue(lucia);
  vi.mocked(apiSeguimiento.corregirRegistro).mockReset().mockResolvedValue(lucia);
});

describe("cargar una semana", () => {
  it("abre con el número, la fecha y la dosis de la anterior marcada; lo demás vacío, con lo anterior en gris", () => {
    const { onCerrar } = abrir(lucia);
    const hoja = screen.getByRole("dialog", { name: "Semana 8" });
    expect(within(hoja).getByLabelText("Semana")).toHaveValue("8");
    expect(within(hoja).getByLabelText("Fecha")).toHaveValue(HOY);
    expect(peso()).toHaveValue("");
    expect(screen.getByLabelText("Observaciones de la semana")).toHaveValue("");
    expect(screen.getByLabelText(/^Medicamento/)).toHaveValue("");
    expect(sinNb(screen.getByText(/^Anterior:/).textContent)).toBe("Anterior: 124,7 kg");
    // La franja de la semana pasada: su peso, su dosis y cuántas aplicaciones lleva (la «No se aplicó» no corta).
    const franja = screen.getByText(/^La semana pasada/).parentElement!;
    expect(sinNb(franja.textContent)).toContain("124,7 kg · 17 UI (5 mg) · lleva 4 aplicaciones con esa dosis");
    // «Igual que la anterior» viene marcada: es la única dosis elegida (y el escalón de 5 mg, que es la misma).
    expect(igual()).toHaveAttribute("aria-pressed", "true");
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior17 UI · 5 mg");
    expect(otra()).toHaveValue("");
    // La semana 8 no es de pago; el pago pendiente del mes 2 deja el bloque abierto.
    expect(screen.queryByText(/^Hoy toca el pago del mes/)).not.toBeInTheDocument();
    expect(screen.getByText("Falta el pago de la semana 5")).toBeInTheDocument();
    // La dosis marcada de fábrica no es un cambio: cerrar no pregunta.
    fireEvent.click(boton("Cancelar"));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "¿Cerrar sin guardar?" })).not.toBeInTheDocument();
  });

  it("tocar sólo el peso y guardar manda también la dosis marcada", async () => {
    const { onGuardado } = abrir(lucia);
    fireEvent.change(peso(), { target: { value: "123,9" } });
    fireEvent.click(boton(/^Guardar la semana 8/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, { semana: 8, fecha: HOY, pesoKg: 123.9, dosis: 17 });
    expect(onGuardado.mock.calls[0][1]).toBe("Semana 8 guardada.");
  });

  it("al escribir el peso dice en vivo lo que bajó desde la semana pasada y desde el inicio", () => {
    abrir(lucia);
    fireEvent.change(peso(), { target: { value: "123,5" } });
    expect(sinNb(screen.getByText(/^Bajó\s1,2\skg$/).parentElement!.textContent)).toBe("Bajó 1,2 kg desde la semana pasada");
    expect(sinNb(screen.getByText(/desde el inicio/).textContent)).toBe("Bajó 5,5 kg desde el inicio (129 kg)");
    fireEvent.change(peso(), { target: { value: "125" } });
    expect(sinNb(screen.getByText(/^Subió\s0,3\skg$/).textContent)).toBe("Subió 0,3 kg");
  });

  it("los botones de la dosis escriben en la unidad del tratamiento y quedan marcados; «Otra» se escribe a mano", async () => {
    const { onGuardado } = abrir(lucia);
    fireEvent.click(subir());
    expect(sinNb(subir().textContent)).toContain("25 UI · 7,5 mg");
    expect(subir()).toHaveAttribute("aria-pressed", "true");
    expect(igual()).toHaveAttribute("aria-pressed", "false");
    // Cada escalón con sus dos datos.
    fireEvent.click(boton(exacto("8 UI · 2,5 mg")));
    expect(boton(exacto("8 UI · 2,5 mg"))).toHaveAttribute("aria-pressed", "true");
    expect(boton(exacto("50 UI · 15 mg"))).toBeInTheDocument();
    // A mano: «Otra» queda elegida aunque el número coincida con un botón, y muestra sus equivalencias.
    fireEvent.change(otra(), { target: { value: "20" } });
    expect(marcados()).toEqual([]);
    expect(sinNb(screen.getByText(/^≈/).closest("span[class*='text-texto-3']")!.textContent)).toBe("≈ 6 mg · 0,20 ml");
    fireEvent.change(otra(), { target: { value: "17" } });
    expect(otra()).toHaveValue("17");
    fireEvent.change(peso(), { target: { value: "124" } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, { semana: 8, fecha: HOY, pesoKg: 124, dosis: 17 });
  });

  // Kevin (23-nov): «7,5» anotado en UI se leía «≈ 8 UI» y el botón escribía 8.
  it("«Igual que la anterior» con una dosis anotada con decimales: la muestra y la guarda como se anotó", async () => {
    const conDecimal = delPaciente(12, (t) => {
      const ultima = t.semanas.reduce((a, s) => (s.semana > a.semana ? s : a));
      ultima.dosis = 7.5;
      return t;
    });
    const { onGuardado } = abrir(conDecimal);
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior7,5 UI · 2,25 mg");
    expect(sinNb(screen.getByText(/^La semana pasada/).parentElement!.textContent)).toContain("lleva 1 aplicación con esa dosis");
    fireEvent.change(peso(), { target: { value: "123,9" } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, expect.objectContaining({ dosis: 7.5 }));
  });

  it("la marcada es la última dosis APLICADA: saltea las semanas «No se aplicó»", () => {
    // Sin la semana 7, la anterior es la 6 (no se aplicó): vale la de la 5.
    const sinLa7 = delPaciente(12, (t) => ({ ...t, semanas: t.semanas.filter((s) => s.semana !== 7) }));
    abrir(sinLa7);
    expect(igual()).toHaveAttribute("aria-pressed", "true");
    expect(sinNb(igual().textContent)).toContain("17 UI");
    const franja = sinNb(screen.getByText(/^La semana pasada/).parentElement!.textContent);
    expect(franja).toContain("no se aplicó (Viaje)");
    expect(franja).toContain("la última dosis: 17 UI (5 mg), 3 aplicaciones");
  });

  it("si eligen otra dosis, ésa es la «anterior» de la semana siguiente", () => {
    const subio = delPaciente(12, (t) => {
      t.semanas.push({ semana: 8, fecha: HOY, pesoKg: 124, dosis: 25 });
      return t;
    });
    abrir(subio);
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior25 UI · 7,5 mg");
    expect(igual()).toHaveAttribute("aria-pressed", "true");
    expect(sinNb(subir().textContent)).toContain("33 UI · 10 mg");
  });

  it("con otro vial, la marcada son los mismos mg del escalón en el vial de hoy (17 UI de 30 mg/ml son 5 mg: 25 UI de 20 mg/ml)", async () => {
    // Las semanas se anotaron con 30 mg/ml; el tratamiento hoy tiene el vial de 10 mg en 0,5 ml.
    const otroVial = delPaciente(12, (t) => ({ ...t, vial: { mg: 10, ml: 0.5 }, semanas: t.semanas.map((s) => ({ ...s, mgPorMl: 30 })) }));
    const { onGuardado } = abrir(otroVial);
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior25 UI · 5 mg");
    fireEvent.change(peso(), { target: { value: "124" } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    // §7.4: 17 UI eran el escalón de 5 mg (no 5,1): con el vial nuevo, 25 UI (el mismo escalón), no 26.
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, expect.objectContaining({ dosis: 25 }));
  });

  it("guarda lo escrito y avisa", async () => {
    const { onGuardado } = abrir(lucia);
    fireEvent.change(peso(), { target: { value: "123,9" } });
    fireEvent.click(subir());
    fireEvent.change(screen.getByLabelText("Observaciones de la semana"), { target: { value: "Sube a 7,5 mg." } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, { semana: 8, fecha: HOY, pesoKg: 123.9, dosis: 25, observaciones: "Sube a 7,5 mg." });
  });

  // Probado el 24-nov: tres toques seguidos mandaban tres veces la semana (una 201 y dos 409); y `Esc` a mitad
  // de un guardado lento preguntaba «se pierde» mientras la semana se guardaba igual.
  it("guardando: los toques de más no la mandan otra vez, y `Esc` espera a que termine", async () => {
    let responder: (t: Tratamiento) => void = () => {};
    vi.mocked(apiSeguimiento.cargarSemana).mockReturnValue(new Promise<Tratamiento>((r) => (responder = r)));
    const { onGuardado, onCerrar } = abrir(lucia);
    fireEvent.change(peso(), { target: { value: "123,9" } });
    const guardar = boton(/^Guardar/);
    fireEvent.click(guardar);
    fireEvent.click(guardar);
    fireEvent.click(guardar);
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("¿Cerrar sin guardar?")).not.toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();
    responder(lucia);
    await waitFor(() => expect(onGuardado).toHaveBeenCalledTimes(1));
  });

  // Probado el 23-nov: con la respuesta perdida (o dos personas), el reintento dice «Ya hay un registro…» y la
  // tentación es cambiarle el número y duplicarla. Al CARGAR, la ayuda y «Ver la hoja»; al mover una cargada, no.
  it("semana repetida del servidor al cargar: la ayuda y «Ver la hoja», sin tocar lo escrito", async () => {
    vi.mocked(apiSeguimiento.cargarSemana).mockRejectedValue(new ApiError("Ya hay un registro de la semana 8.", 409, { codigo: "SEMANA_REPETIDA" }));
    const onVerSemana = vi.fn();
    const onCerrar = vi.fn();
    render(
      <MemoryRouter>
        <HojaSemana
          tratamiento={lucia}
          catalogo={CATALOGO_SEGUIMIENTO}
          registro={null}
          semana={8}
          pacienteNombre="Paciente de prueba"
          ultimoControl={null}
          onCerrar={onCerrar}
          onGuardado={vi.fn()}
          onVerSemana={onVerSemana}
        />
      </MemoryRouter>,
    );
    fireEvent.change(peso(), { target: { value: "123,9" } });
    fireEvent.click(boton(/^Guardar/));
    const alerta = await screen.findByText("Ya hay un registro de la semana 8.");
    expect(alerta.parentElement).toHaveTextContent("Puede que ya esté guardada. Mirá la hoja antes de cargarla de nuevo.");
    expect(peso()).toHaveValue("123,9");
    fireEvent.click(boton("Ver la hoja"));
    expect(onVerSemana).toHaveBeenCalledWith(8);
    expect(onCerrar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "¿Cerrar sin guardar?" })).not.toBeInTheDocument();
  });

  it("semana repetida al MOVER una ya cargada: sólo el mensaje del servidor", async () => {
    vi.mocked(apiSeguimiento.corregirRegistro).mockRejectedValue(new ApiError("Ya hay un registro de la semana 8.", 409, { codigo: "SEMANA_REPETIDA" }));
    render(
      <MemoryRouter>
        <HojaSemana
          tratamiento={lucia}
          catalogo={CATALOGO_SEGUIMIENTO}
          registro={lucia.registros.find((r) => r.semana === 6)!}
          semana={6}
          pacienteNombre="Paciente de prueba"
          ultimoControl={null}
          onCerrar={vi.fn()}
          onGuardado={vi.fn()}
          onVerSemana={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Semana"), { target: { value: "8" } });
    fireEvent.click(boton(/^Guardar/));
    const alerta = await screen.findByText("Ya hay un registro de la semana 8.");
    expect(alerta.parentElement).not.toHaveTextContent("Puede que ya esté guardada");
    expect(screen.queryByRole("button", { name: "Ver la hoja" })).not.toBeInTheDocument();
  });

  it("vacía no se guarda; una semana repetida se avisa antes de mandarla", () => {
    // Sin ninguna dosis antes, no hay nada marcado de fábrica.
    const sinDosis = delPaciente(12, (t) => ({ ...t, semanas: t.semanas.map((s) => ({ ...s, dosis: null })) }));
    abrir(sinDosis);
    expect(marcados()).toEqual([]);
    fireEvent.click(boton(/^Guardar/));
    expect(screen.getByText(/^Escribí al menos el peso, la dosis, una observación o un pago/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Semana"), { target: { value: "7" } });
    expect(screen.getByText("Ya hay un registro de la semana 7.")).toBeInTheDocument();
    expect(apiSeguimiento.cargarSemana).not.toHaveBeenCalled();
  });

  it("«No se aplicó»: apaga la dosis, pide el motivo (con botones que lo escriben) y se guarda sólo con eso", async () => {
    const { onGuardado } = abrir(lucia);
    const casilla = screen.getByRole("checkbox", { name: "No se aplicó esta semana" });
    fireEvent.click(casilla);
    expect(casilla).toBeChecked();
    expect(igual()).toBeDisabled();
    expect(boton(exacto("8 UI · 2,5 mg"))).toBeDisabled();
    expect(otra()).toBeDisabled();
    expect(screen.getByLabelText("Motivo")).toHaveValue("");
    fireEvent.click(boton("Viaje"));
    expect(screen.getByLabelText("Motivo")).toHaveValue("Viaje");
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, { semana: 8, fecha: HOY, sinDosis: true, motivoSinDosis: "Viaje" });
  });

  it("ya no escribe «Cambio de laboratorio» en las observaciones: va el cambio de producto", () => {
    abrir(lucia);
    expect(screen.queryByRole("button", { name: "Cambio de laboratorio" })).not.toBeInTheDocument();
    expect(sinNb(boton(/^Cambió de producto desde esta semana/).textContent)).toContain("Hoy usa: Tirzepatida · 15 mg en 0,5 ml");
  });

  it("ofrece el peso de la Evaluación si es del mismo día o posterior, con «Usar ese» (no se precarga)", () => {
    const ultima = lucia.registros[lucia.registros.length - 1].fecha;
    abrir(lucia, { ultimoControl: { fecha: ultima, pesoKg: 124.5 } });
    expect(peso()).toHaveValue("");
    expect(sinNb(screen.getByText(/^La evaluación del/).textContent)).toContain(" anotó 124,5 kg");
    fireEvent.click(boton("Usar ese"));
    expect(peso()).toHaveValue("124,5");
  });

  it("la evaluación de hoy se dice así", () => {
    abrir(lucia, { ultimoControl: { fecha: HOY, pesoKg: 124.5 } });
    expect(sinNb(screen.getByText(/^La evaluación de hoy/).textContent)).toBe("La evaluación de hoy anotó 124,5 kg ·");
  });

  it("con un control de la Evaluación más viejo que el último peso, no lo ofrece", () => {
    abrir(lucia, { ultimoControl: { fecha: "2020-01-01", pesoKg: 130 } });
    expect(screen.queryByText(/^La evaluación/)).not.toBeInTheDocument();
  });

  it("los números se escriben con el teclado numérico", () => {
    abrir(lucia);
    for (const campo of [peso(), otra(), screen.getByLabelText(/^Medicamento/), screen.getByLabelText(/^Control/), screen.getByLabelText(/^Otro/)]) {
      expect(campo).toHaveAttribute("inputmode", "decimal");
    }
  });

  // Probado el 24-nov en la tablet: `Enter` en el peso iba a la casilla «No se aplicó» y el teclado se cerraba.
  it("`Enter` en el peso pasa al siguiente campo de escribir (la dosis), no a la casilla «No se aplicó»", () => {
    abrir(lucia);
    peso().focus();
    fireEvent.keyDown(peso(), { key: "Enter" });
    expect(document.activeElement).toBe(otra());
  });
});

describe("el pago", () => {
  it("«Hoy toca el pago del mes 2» y, al guardar sin pago, pregunta: «Anotar el pago» vuelve al campo", async () => {
    abrir(carla, { semana: 5 });
    expect(screen.getByText("Hoy toca el pago del mes 2")).toBeInTheDocument();
    fireEvent.change(peso(), { target: { value: "84,6" } });
    fireEvent.click(boton(/^Guardar/));
    expect(screen.getByRole("dialog", { name: "¿Guardar sin el pago?" })).toBeInTheDocument();
    fireEvent.click(boton("Anotar el pago"));
    expect(screen.queryByRole("dialog", { name: "¿Guardar sin el pago?" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Medicamento/)).toHaveFocus());
    expect(apiSeguimiento.cargarSemana).not.toHaveBeenCalled();
  });

  it("«Guardar sin pago» guarda igual (no bloquea), con la dosis marcada", async () => {
    const { onGuardado } = abrir(carla, { semana: 5 });
    fireEvent.change(peso(), { target: { value: "84,6" } });
    fireEvent.click(boton(/^Guardar/));
    fireEvent.click(boton("Guardar sin pago"));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(7, { semana: 5, fecha: HOY, pesoKg: 84.6, dosis: 25 });
  });

  it("con el pago anotado no pregunta", async () => {
    const { onGuardado } = abrir(carla, { semana: 5 });
    fireEvent.change(screen.getByLabelText(/^Medicamento/), { target: { value: "480" } });
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(7, { semana: 5, fecha: HOY, dosis: 25, pagoMedicamento: 480 });
  });

  it("una semana común sin pagos pendientes: el pago va cerrado en «Anotar un pago», que lo abre", async () => {
    abrir(carla, { semana: 6 });
    expect(screen.queryByLabelText(/^Medicamento/)).not.toBeInTheDocument();
    fireEvent.click(boton(/^Anotar un pago/));
    await waitFor(() => expect(screen.getByLabelText(/^Medicamento/)).toHaveFocus());
    expect(screen.getByText("Pago de esta semana")).toBeInTheDocument();
  });
});

describe("corregir una semana", () => {
  it("abre con lo guardado y dice quién la cargó y quién la corrigió", () => {
    abrir(lucia, { registro: 5 });
    expect(screen.getByRole("dialog", { name: "Semana 5" })).toBeInTheDocument();
    expect(screen.getByLabelText("Peso")).toHaveValue("123,4");
    expect(screen.getByText(/^Cargó: Dra\. Prueba, /)).toBeInTheDocument();
    expect(screen.getByText(/^Corrigió: Administración, /)).toBeInTheDocument();
    // La semana 5 debe el pago: el bloque va en amarillo.
    expect(screen.getByText("Hoy toca el pago del mes 2")).toBeInTheDocument();
  });

  it("no marca nada de más: la dosis es la que tenía (una «No se aplicó» no tiene ninguna)", () => {
    abrir(lucia, { registro: 6 });
    expect(marcados()).toEqual([]);
    expect(screen.getByRole("checkbox", { name: "No se aplicó esta semana" })).toBeChecked();
  });

  it("«Borrar semana» con un pago anotado lo dice en la confirmación", () => {
    abrir(lucia, { registro: 4 });
    fireEvent.click(boton("Borrar semana"));
    expect(screen.getByText("Esta semana tiene un pago anotado de Bs 50. Si la borrás, se pierde.")).toBeInTheDocument();
  });

  it("el inicial no tiene número de semana ni «Borrar semana» ni «No se aplicó», y no marca ninguna dosis de más", () => {
    abrir(lucia, { registro: 0 });
    expect(screen.getByRole("dialog", { name: "Inicial" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Semana")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrar semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "No se aplicó esta semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Igual que la anterior/ })).not.toBeInTheDocument();
  });

  it("manda sólo lo que cambió", async () => {
    const { onGuardado } = abrir(lucia, { registro: 6 });
    fireEvent.click(boton("Salud"));
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.corregirRegistro).toHaveBeenCalledWith(lucia.registros.find((r) => r.semana === 6)!.id, { motivoSinDosis: "Salud" });
  });
});

describe("el cambio de producto (§7.1 y §7.2)", () => {
  /** Lucía con la marca en la semana 7: «desde esta semana usa Tirze» (con el vial que se pase). */
  const conMarca = (producto: { nombre: string; vialMg?: number; vialMl?: number }, extra?: (t: TratamientoCrudo) => TratamientoCrudo) =>
    delPaciente(12, (t) => {
      const c = { ...t, semanas: t.semanas.map((s) => (s.semana === 7 ? { ...s, producto } : s)) };
      return extra ? extra(c) : c;
    });

  it("se marca en la semana: el producto (vacío) y su vial; con otro vial, la dosis de ESTA hoja se cuenta con él", async () => {
    const onGuardado = vi.fn();
    render(
      <MemoryRouter>
        <HojaSemana tratamiento={lucia} catalogo={CATALOGO_SEGUIMIENTO} registro={null} semana={8} pacienteNombre="Paciente de prueba" ultimoControl={null} onCerrar={vi.fn()} onGuardado={onGuardado} />
      </MemoryRouter>,
    );
    fireEvent.click(boton(/^Cambió de producto desde esta semana/));
    const nombre = screen.getByLabelText("Producto nuevo");
    expect(nombre).toHaveValue("");
    expect(sinNb(screen.getByText(/^Antes usaba:/).textContent)).toBe("Antes usaba: Tirzepatida · 15 mg en 0,5 ml");
    // Sin el nombre no se guarda.
    fireEvent.change(peso(), { target: { value: "124" } });
    fireEvent.click(boton(/^Guardar/));
    expect(screen.getByText("Escribí el producto nuevo")).toBeInTheDocument();
    expect(apiSeguimiento.cargarSemana).not.toHaveBeenCalled();
    // El vial de 10 mg en 0,5 ml (20 mg/ml): la marcada son los mismos 5 mg del escalón, ahora 25 UI; los escalones, con ese vial.
    fireEvent.change(nombre, { target: { value: "Tirze" } });
    fireEvent.click(boton(exacto("10 mg en 0,5 ml")));
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior25 UI · 5 mg");
    expect(igual()).toHaveAttribute("aria-pressed", "true");
    expect(boton(exacto("13 UI · 2,5 mg"))).toBeInTheDocument();
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.cargarSemana).toHaveBeenCalledWith(5, {
      semana: 8,
      fecha: HOY,
      pesoKg: 124,
      dosis: 25,
      producto: { nombre: "Tirze", vialMg: 10, vialMl: 0.5 },
    });
    // La marca cambia las equivalencias de las semanas siguientes: se relee la hoja.
    expect(onGuardado.mock.calls[0][2]).toBe(true);
  });

  // Probado el 24-nov: con un producto nuevo sin vial decía «Igual que la anterior 25 UI · 7,5 mg», con los mg del vial viejo.
  it("un producto nuevo sin vial: «Igual que la anterior» sin los mg (no se sabe cuántos son)", () => {
    abrir(lucia, { semana: 8 });
    fireEvent.click(boton(/^Cambió de producto desde esta semana/));
    fireEvent.change(screen.getByLabelText("Producto nuevo"), { target: { value: "Tirze" } });
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior17 UI");
    expect(igual()).toHaveAttribute("aria-pressed", "true");
  });

  it("abrirlo y cerrarlo sin escribir no deja cambios", () => {
    const { onCerrar } = abrir(lucia);
    fireEvent.click(boton(/^Cambió de producto desde esta semana/));
    fireEvent.click(boton(/^Cambió de producto desde esta semana/));
    expect(screen.queryByLabelText("Producto nuevo")).not.toBeInTheDocument();
    fireEvent.click(boton("Cancelar"));
    expect(onCerrar).toHaveBeenCalled();
  });

  it("la semana siguiente a la marca usa el producto nuevo: en la cabecera, «Hoy usa» y la dosis con su vial", () => {
    const t = conMarca({ nombre: "Tirze", vialMg: 10, vialMl: 0.5 }, (c) => ({ ...c, semanas: c.semanas.map((s) => (s.semana === 7 ? { ...s, dosis: 26 } : s)) }));
    abrir(t);
    expect(sinNb(screen.getByText(/^Paciente de prueba · /).textContent)).toBe("Paciente de prueba · Tirze, 10 mg en 0,5 ml");
    expect(sinNb(boton(/^Cambió de producto desde esta semana/).textContent)).toContain("Hoy usa: Tirze · 10 mg en 0,5 ml");
    expect(sinNb(igual().textContent)).toBe("Igual que la anterior26 UI · 5,2 mg");
    expect(boton(exacto("13 UI · 2,5 mg"))).toBeInTheDocument();
  });

  it("corregir la semana de la marca: el bloque abierto con lo guardado; «Quitar el cambio» manda `producto: null`", async () => {
    const t = conMarca({ nombre: "Tirze", vialMg: 10, vialMl: 0.5 });
    const { onGuardado } = abrir(t, { registro: 7 });
    expect(screen.getByLabelText("Producto nuevo")).toHaveValue("Tirze");
    expect(screen.getByLabelText("Miligramos del vial")).toHaveValue("10");
    expect(sinNb(screen.getByText(/^Antes usaba:/).textContent)).toBe("Antes usaba: Tirzepatida · 15 mg en 0,5 ml");
    fireEvent.click(boton("Quitar el cambio"));
    expect(screen.getByText(/^Al guardar se quita el cambio a Tirze/)).toBeInTheDocument();
    fireEvent.click(boton(/^Guardar/));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());
    expect(apiSeguimiento.corregirRegistro).toHaveBeenCalledWith(t.registros.find((r) => r.semana === 7)!.id, { producto: null });
    expect(onGuardado.mock.calls[0][2]).toBe(true);
  });

  it("una semana que sólo tiene la marca: no ofrece «Quitar» (quedaría vacía), dice que se borra la semana", () => {
    const t = conMarca({ nombre: "Tirze" }, (c) => ({
      ...c,
      semanas: c.semanas.map((s) => (s.semana === 7 ? { semana: 7, fecha: s.fecha, producto: { nombre: "Tirze" } } : s)),
    }));
    abrir(t, { registro: 7 });
    expect(screen.queryByRole("button", { name: "Quitar el cambio" })).not.toBeInTheDocument();
    expect(screen.getByText("Esta semana sólo tiene el cambio de producto: para quitarlo, borrá la semana.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Borrar semana" })[0]);
    expect(screen.getByRole("dialog", { name: "¿Borrar la semana 7?" })).toBeInTheDocument();
  });

  it("una marca sin vial: el aviso del vial lleva a corregir ESA marca, no el tratamiento", () => {
    const t = conMarca({ nombre: "Tirze" });
    const onCorregirMarca = vi.fn();
    render(
      <MemoryRouter>
        <HojaSemana
          tratamiento={t}
          catalogo={CATALOGO_SEGUIMIENTO}
          registro={null}
          semana={8}
          pacienteNombre="Paciente de prueba"
          ultimoControl={null}
          onEditarTratamiento={vi.fn()}
          onCorregirMarca={onCorregirMarca}
          onCerrar={vi.fn()}
          onGuardado={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Cargá la presentación del vial de Tirze para ver las dosis en UI/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar tratamiento" })).not.toBeInTheDocument();
    fireEvent.click(boton("Corregir el cambio de la semana 7"));
    expect(onCorregirMarca).toHaveBeenCalledWith(t.registros.find((r) => r.semana === 7));
  });

  it("en el inicial no hay cambio de producto", () => {
    abrir(lucia, { registro: 0 });
    expect(screen.queryByRole("button", { name: /^Cambió de producto/ })).not.toBeInTheDocument();
  });
});

describe("sin la presentación del vial", () => {
  it("con la dosis en UI, los escalones no se pueden pasar: no se muestran y se avisa; «Otra» queda", () => {
    const sinVial = delPaciente(12, (t) => ({ ...t, vial: null }));
    abrir(sinVial);
    expect(screen.getByText(/Cargá la presentación del vial para ver las dosis en UI/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^8\sUI/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Subir un escalón/ })).not.toBeInTheDocument();
    expect(otra()).toBeInTheDocument();
  });

  it("con la dosis en mg, los escalones se ven igual (primero los mg)", () => {
    const daniel = delPaciente(21);
    abrir(daniel);
    expect(boton(exacto("2,5 mg"))).toBeInTheDocument();
    expect(sinNb(subir().textContent)).toContain("5 mg");
    expect(otra()).toHaveAccessibleName("Otra dosis en mg");
  });
});

// 23-nov: el atrás del navegador se llevaba la página de abajo y la hoja con lo escrito, sin preguntar.
describe("el atrás del navegador", () => {
  let h: ReturnType<typeof historialDePrueba>;
  beforeEach(() => {
    h = historialDePrueba(5);
  });
  afterEach(() => h.limpiar());

  it("con algo escrito se queda y pregunta; «Cancelar» conserva lo escrito y «Cerrar sin guardar» cierra la hoja", () => {
    const { onCerrar } = abrir(lucia);
    fireEvent.change(peso(), { target: { value: "123,9" } });

    h.viajar(4);
    expect(h.go).toHaveBeenCalledWith(1);
    h.viajar(5);
    expect(h.router).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "¿Cerrar sin guardar?" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog", { name: "¿Cerrar sin guardar?" })).not.toBeInTheDocument();
    expect(peso()).toHaveValue("123,9");
    expect(onCerrar).not.toHaveBeenCalled();

    h.viajar(4);
    h.viajar(5);
    fireEvent.click(boton("Cerrar sin guardar"));
    expect(onCerrar).toHaveBeenCalledTimes(1);
    expect(h.router).not.toHaveBeenCalled();
  });

  it("sin nada escrito (con la dosis marcada de fábrica) el atrás hace lo de siempre", () => {
    const { onCerrar } = abrir(lucia);
    h.viajar(4);
    expect(h.router).toHaveBeenCalledTimes(1);
    expect(h.go).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it("con «¿Guardar sin el pago?» abierta no abre otra pregunta encima", () => {
    abrir(carla, { semana: 5 });
    fireEvent.change(peso(), { target: { value: "84,6" } });
    fireEvent.click(boton(/^Guardar/));
    h.viajar(4);
    h.viajar(5);
    expect(h.router).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "¿Cerrar sin guardar?" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "¿Guardar sin el pago?" })).toBeInTheDocument();
  });

  it("cerrar o recargar la pestaña avisa sólo con algo escrito", () => {
    abrir(lucia);
    expect(avisaAlCerrar()).toBe(false);
    fireEvent.change(screen.getByLabelText("Observaciones de la semana"), { target: { value: "Una nota" } });
    expect(avisaAlCerrar()).toBe(true);
  });

  it("`Esc` sin cambios cierra; con cambios, pregunta", () => {
    const { onCerrar } = abrir(lucia);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
