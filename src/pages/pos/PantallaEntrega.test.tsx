import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Repartidor } from "../../types";
import PantallaEntrega, { type DatosEntrega } from "./PantallaEntrega";

/**
 * El formulario de un pedido para delivery o para recoger: lo que trae al
 * volver del cobro (BUG-pedidos-9) y el rechazo del servidor al crear el
 * pedido contra entrega (BUG-pedidos-1).
 */

const REPARTIDORES = [
  { id: 3, nombre: "Rodrigo", zona: "Norte" },
  { id: 4, nombre: "Marcelo", zona: null },
] as unknown as Repartidor[];

const CARGADO: DatosEntrega = {
  clienteNombre: "Lucía Fernández",
  clienteDireccion: "Calle Jordán 123, portón verde",
  clienteTelefono: "70490686",
  repartidorId: 4,
  tarifaEnvio: 10,
  notaPedido: "Tocar timbre",
  prepagado: true,
};

function dibujar(props: Partial<Parameters<typeof PantallaEntrega>[0]> = {}) {
  const onContinuar = vi.fn();
  render(
    <PantallaEntrega
      tipo="DELIVERY"
      total={50}
      unidades={2}
      repartidores={REPARTIDORES}
      enviando={false}
      onAtras={() => {}}
      onContinuar={onContinuar}
      {...props}
    />,
  );
  return { onContinuar };
}

describe("BUG-pedidos-9: al volver del cobro, el formulario trae lo que ya se cargó", () => {
  it("nombre, dirección, teléfono, repartidor, tarifa y nota vuelven como estaban", () => {
    // Volvía vacío: había que tipear todo de nuevo con el cliente esperando.
    dibujar({ inicial: CARGADO });
    expect(screen.getByLabelText("Nombre del cliente")).toHaveValue("Lucía Fernández");
    expect(screen.getByLabelText("Dirección de entrega")).toHaveValue("Calle Jordán 123, portón verde");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("70490686");
    expect(screen.getByLabelText("Repartidor")).toHaveValue("4");
    expect(screen.getByLabelText(/Tarifa de envío/)).toHaveValue("10,00");
    expect(screen.getByLabelText("Nota del pedido")).toHaveValue("Tocar timbre");
  });

  it("seguir sin tocar nada manda los mismos datos", () => {
    const { onContinuar } = dibujar({ inicial: CARGADO });
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    expect(onContinuar).toHaveBeenCalledWith(CARGADO);
  });

  it("sin nada cargado arranca como siempre: vacío y con la tarifa de Bs 8", () => {
    dibujar();
    expect(screen.getByLabelText("Nombre del cliente")).toHaveValue("");
    expect(screen.getByLabelText("Repartidor")).toHaveValue("");
    expect(screen.getByLabelText(/Tarifa de envío/)).toHaveValue("8,00");
  });

  it("un pedido para recoger vuelve con sus minutos", () => {
    const { onContinuar } = dibujar({
      tipo: "RECOGER",
      inicial: { clienteNombre: "Rosa", tarifaEnvio: 0, minutosEstimados: 45, prepagado: true },
    });
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    expect(onContinuar).toHaveBeenCalledWith(
      expect.objectContaining({ clienteNombre: "Rosa", minutosEstimados: 45, tarifaEnvio: 0 }),
    );
  });
});

describe("BUG-pedidos-1: el rechazo del servidor al crear el pedido se ve", () => {
  it("el mensaje aparece junto a los botones", () => {
    // Se guardaba en el POS y acá no se dibujaba: el botón volvía a estar
    // activo, sin ningún mensaje, y el pedido no existía.
    dibujar({ errorServidor: 'Stock insuficiente de "Brasa cuarto" (disponible 0, requiere 1)' });
    expect(screen.getByText('Stock insuficiente de "Brasa cuarto" (disponible 0, requiere 1)')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cobra el repartidor al entregar" })).toBeEnabled();
  });

  it("sin rechazo no hay mensaje", () => {
    const { container } = render(
      <PantallaEntrega
        tipo="DELIVERY"
        total={50}
        unidades={2}
        repartidores={REPARTIDORES}
        enviando={false}
        errorServidor=""
        onAtras={() => {}}
        onContinuar={() => {}}
      />,
    );
    // El pie tiene sólo la pregunta y los dos botones.
    const pie = screen.getByText("¿Cómo se cobra?").parentElement!;
    expect(pie.children).toHaveLength(3);
    expect(container).not.toHaveTextContent(/Stock insuficiente/);
  });
});

describe("el pin del delivery, opcional (20-nov)", () => {
  const llenar = () => {
    fireEvent.change(screen.getByLabelText("Nombre del cliente"), { target: { value: "Lucía" } });
    fireEvent.change(screen.getByLabelText("Dirección de entrega"), { target: { value: "Calle Jordán 123" } });
    fireEvent.change(screen.getByLabelText("Repartidor"), { target: { value: "3" } });
  };

  it("pegar el enlace de Google Maps del cliente marca el punto y viaja con el pedido", () => {
    const { onContinuar } = dibujar();
    llenar();
    fireEvent.change(screen.getByLabelText("Enlace de Google Maps"), {
      target: { value: "https://www.google.com/maps/search/?api=1&query=-17.7834,-63.1821" },
    });
    expect(screen.getByText(/Ubicación marcada \(-17\.78340, -63\.18210\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cobra el repartidor al entregar/ }));
    expect(onContinuar).toHaveBeenCalledWith(expect.objectContaining({ latitud: -17.7834, longitud: -63.1821, prepagado: false }));
  });

  it("un enlace corto (sin el punto) lo dice y el pedido sale igual, sin pin", () => {
    const { onContinuar } = dibujar();
    llenar();
    fireEvent.change(screen.getByLabelText("Enlace de Google Maps"), { target: { value: "https://maps.app.goo.gl/AbC123" } });
    expect(screen.getByText(/De ese enlace no sale el punto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cobra el repartidor al entregar/ }));
    const datos = onContinuar.mock.calls[0][0] as DatosEntrega;
    expect(datos).not.toHaveProperty("latitud");
    expect(datos).not.toHaveProperty("longitud");
  });

  it("«Quitar» saca el pin; un pedido para recoger no lo ofrece", () => {
    const { onContinuar } = dibujar({ inicial: { ...CARGADO, latitud: -17.7, longitud: -63.1 } });
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    fireEvent.click(screen.getByRole("button", { name: /Cobrar ahora en caja/ }));
    expect(onContinuar.mock.calls[0][0]).not.toHaveProperty("latitud");
  });

  it("para recoger no hay ubicación que marcar", () => {
    dibujar({ tipo: "RECOGER" });
    expect(screen.queryByLabelText("Enlace de Google Maps")).not.toBeInTheDocument();
  });
});
