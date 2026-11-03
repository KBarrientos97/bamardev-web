import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mesa } from "../../types/salon";
import { ElegirMesa, Reserva } from "./AccionesMesa";

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M1",
    nombre: "Mesa M1",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "LIBRE",
    comensales: 0,
    consumo: 0,
    propina: 0,
    comandas: [],
    ...p,
  };
}

describe("BUG-salon-4: elegir la otra mesa", () => {
  const salon = [
    mesa({ id: 1, codigo: "M1", nombre: "Mesa M1" }),
    mesa({ id: 2, codigo: "M2", nombre: "Mesa M2", capacidad: 6 }),
    mesa({
      id: 3,
      codigo: "M3",
      nombre: "Mesa M3",
      unidas: [{ id: 9, codigo: "M9", capacidad: 2 }],
    }),
    mesa({ id: 4, codigo: "M4", nombre: "Mesa M4", estado: "OCUPADA", consumo: 80, meseroNombre: "Luis" }),
    mesa({ id: 6, codigo: "M6", nombre: "Mesa M6", estado: "PAGADA", consumo: 52 }),
  ];

  it("unir abre su propio diálogo, no el de pasar, y no ofrece una mesa que ya tiene otras unidas", () => {
    // Se abría con el modo "pasar": preguntaba "¿A qué mesa la paso?" y
    // explicaba que el consumo se mueve, que es otra operación. Y ofrecía la
    // M3, que el backend rechaza ("ya tiene otras mesas unidas").
    const onElegir = vi.fn();
    render(
      <ElegirMesa modo="unir" mesa={salon[0]} mesas={salon} procesando={false} onElegir={onElegir} onCerrar={() => {}} />,
    );
    expect(screen.getByRole("dialog", { name: "¿Con qué mesa la unís?" })).toBeInTheDocument();
    expect(screen.getByText(/Para un grupo que no entra en una sola mesa/)).toBeInTheDocument();
    expect(screen.queryByText(/el consumo y los pedidos se mueven/i)).not.toBeInTheDocument();

    expect(screen.queryByText("Mesa M3")).not.toBeInTheDocument();
    // Lo que se elige al unir son lugares: cuántos suma.
    expect(screen.getByText(/6 lugares/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mesa M2"));
    expect(onElegir).toHaveBeenCalledWith(salon[1]);
  });

  it("sin ninguna libre para unir lo dice con su texto", () => {
    render(
      <ElegirMesa
        modo="unir"
        mesa={salon[0]}
        mesas={[salon[0], salon[2], salon[3]]}
        procesando={false}
        onElegir={() => {}}
        onCerrar={() => {}}
      />,
    );
    expect(screen.getByText("No hay otra mesa libre para unir.")).toBeInTheDocument();
  });

  it("juntar no ofrece una mesa ya pagada", () => {
    // El backend la rechaza ("ya se cobró: no se puede juntar"): su plata ya
    // entró a caja y moverla descuadraría el turno.
    const actual = mesa({ id: 5, codigo: "M5", nombre: "Mesa M5", estado: "OCUPADA" });
    render(
      <ElegirMesa
        modo="juntar"
        mesa={actual}
        mesas={[actual, ...salon]}
        procesando={false}
        onElegir={() => {}}
        onCerrar={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "¿Qué mesa junto con esta?" })).toBeInTheDocument();
    expect(screen.getByText("Mesa M4")).toBeInTheDocument();
    expect(screen.queryByText("Mesa M6")).not.toBeInTheDocument();
  });
});

describe("BUG-salon-6: la reserva siempre lleva cuántas personas (1 a 30)", () => {
  function completar() {
    fireEvent.change(screen.getByLabelText("¿A qué hora?"), { target: { value: "20:30" } });
    fireEvent.change(screen.getByLabelText("¿A nombre de quién?"), { target: { value: "Sra. Peredo" } });
  }

  it("no baja de 1 y siempre manda el número", () => {
    // Era un campo libre: vacío o en 0 no se mandaba, el backend lo exige
    // (@IsInt @Min(1)) y guardar fallaba con un error de validación.
    const onGuardar = vi.fn();
    render(<Reserva mesa={mesa()} procesando={false} onGuardar={onGuardar} onCerrar={() => {}} />);
    completar();
    const menos = screen.getByRole("button", { name: "Una persona menos" });
    fireEvent.click(menos);
    fireEvent.click(menos);
    expect(menos).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Guardar reserva/ }));
    expect(onGuardar).toHaveBeenCalledWith({ hora: "20:30", nombre: "Sra. Peredo", personas: 1 });
  });

  it("no pasa de 30, aunque la reserva anterior dijera más", () => {
    const onGuardar = vi.fn();
    const conReserva = mesa({
      estado: "RESERVADA",
      reserva: { hora: "21:00", nombre: "Cumpleaños", personas: 45 },
    });
    render(<Reserva mesa={conReserva} procesando={false} onGuardar={onGuardar} onCerrar={() => {}} />);
    expect(screen.getByRole("button", { name: "Una persona más" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Guardar reserva/ }));
    expect(onGuardar).toHaveBeenCalledWith({ hora: "21:00", nombre: "Cumpleaños", personas: 30 });
  });
});
