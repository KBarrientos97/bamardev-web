import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import CampoPrincipios from "./CampoPrincipios";

/**
 * Los principios activos como fichas (12-nov, Kevin): un remedio puede llevar
 * más de una droga (Clofexan = diclofenaco + paracetamol), y el campo de
 * texto suelto invitaba a cargar una sola o a separarlas de cualquier manera.
 */

const DROGAS = ["Paracetamol", "Diclofenaco", "Ibuprofeno", "Losartán", "Cafeína"];

function Probar({ inicial = [] as string[] }) {
  const [valor, setValor] = useState<string[]>(inicial);
  return (
    <>
      <CampoPrincipios
        etiqueta="Principio activo"
        valor={valor}
        onChange={setValor}
        sugerencias={DROGAS}
        placeholder="Paracetamol"
      />
      <output data-testid="valor">{JSON.stringify(valor)}</output>
    </>
  );
}

const campo = () => screen.getByRole("combobox", { name: "Principio activo" });
const escribir = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });
const tecla = (key: string) => fireEvent.keyDown(campo(), { key });
const valor = (): string[] => JSON.parse(screen.getByTestId("valor").textContent ?? "[]");
const opciones = () => screen.queryAllByRole("option").map((o) => o.textContent);

describe("CampoPrincipios: una ficha por droga", () => {
  it("elegir un atajo lo deja como ficha y el campo queda listo para la siguiente", () => {
    render(<Probar />);
    escribir("para");
    fireEvent.click(screen.getByRole("option", { name: "Paracetamol" }));
    expect(valor()).toEqual(["Paracetamol"]);
    expect(screen.getByRole("button", { name: "Quitar Paracetamol" })).toBeInTheDocument();
    expect(campo()).toHaveValue("");
  });

  it("Enter agrega lo tecleado aunque no esté en la lista", () => {
    render(<Probar />);
    escribir("Tiocolchicósido");
    tecla("Enter");
    expect(valor()).toEqual(["Tiocolchicósido"]);
  });

  it("al escribir queda marcado el primer atajo, y Enter agrega ése", () => {
    // 12-nov, visto en Chrome: "para" + Enter dejaba una ficha "para" con
    // Paracetamol a la vista. Quien atiende escribe el comienzo y Enter.
    render(<Probar />);
    escribir("para");
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Paracetamol");
    tecla("Enter");
    expect(valor()).toEqual(["Paracetamol"]);
  });

  it("con las flechas se elige otro atajo", () => {
    render(<Probar />);
    escribir("i");
    tecla("ArrowDown");
    tecla("Enter");
    // "i": Ibuprofeno es el primero (marcado al escribir); la flecha pasa al
    // siguiente, que no es Ibuprofeno.
    expect(valor()).toHaveLength(1);
    expect(valor()).not.toEqual(["Ibuprofeno"]);
  });

  it("Esc cierra los atajos y Enter deja lo escrito tal cual", () => {
    render(<Probar />);
    escribir("para");
    tecla("Escape");
    tecla("Enter");
    expect(valor()).toEqual(["para"]);
  });

  it("la coma agrega lo de antes y se sigue escribiendo la siguiente", () => {
    render(<Probar />);
    escribir("Diclofenaco,");
    expect(valor()).toEqual(["Diclofenaco"]);
    expect(campo()).toHaveValue("");
    escribir("Paracetamol, Caf");
    expect(valor()).toEqual(["Diclofenaco", "Paracetamol"]);
    expect(campo()).toHaveValue("Caf");
  });

  it("pegar «Paracetamol + Cafeína» da dos fichas", () => {
    render(<Probar />);
    escribir("Paracetamol + Cafeína +");
    expect(valor()).toEqual(["Paracetamol", "Cafeína"]);
  });

  it("lo escrito sin tilde que está en la lista entra bien escrito", () => {
    // La búsqueda por droga y los equivalentes agrupan por este texto:
    // "losartan" y "Losartán" serían dos remedios distintos.
    render(<Probar />);
    escribir("losartan");
    tecla("Enter");
    expect(valor()).toEqual(["Losartán"]);
  });

  it("no ofrece ni repite una droga que ya es ficha", () => {
    render(<Probar inicial={["Paracetamol"]} />);
    escribir("para");
    expect(opciones()).not.toContain("Paracetamol");
    escribir("PARACETAMOL");
    tecla("Enter");
    expect(valor()).toEqual(["Paracetamol"]);
  });

  it("la × saca esa ficha y deja las demás", () => {
    render(<Probar inicial={["Diclofenaco", "Paracetamol"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Diclofenaco" }));
    expect(valor()).toEqual(["Paracetamol"]);
  });

  it("Backspace con el campo vacío saca la última; con texto, borra texto", () => {
    render(<Probar inicial={["Diclofenaco", "Paracetamol"]} />);
    escribir("Ca");
    tecla("Backspace");
    expect(valor()).toEqual(["Diclofenaco", "Paracetamol"]);

    escribir("");
    tecla("Backspace");
    expect(valor()).toEqual(["Diclofenaco"]);
  });

  it("lo que quedó escrito sin Enter se agrega al salir del campo", () => {
    // Si no, escribir la droga y tocar Guardar la perdía sin avisar.
    render(<Probar />);
    escribir("Ibuprofeno");
    fireEvent.blur(campo());
    expect(valor()).toEqual(["Ibuprofeno"]);
  });

  it("con el campo vacío, tocarlo no despliega la lista entera de drogas", () => {
    render(<Probar />);
    fireEvent.click(campo());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // La flecha sí, para quien quiera recorrerla.
    tecla("ArrowDown");
    expect(screen.getByRole("listbox", { name: "Principios activos" })).toBeInTheDocument();
  });

  it("tocar el rótulo no borra la primera ficha", () => {
    // Un <label> que envuelve se asocia a su PRIMER control, que sería la ×:
    // el clic en el rótulo le llegaba a ella. Con `htmlFor` le llega al campo.
    render(<Probar inicial={["Paracetamol"]} />);
    fireEvent.click(screen.getByText("Principio activo"));
    expect(valor()).toEqual(["Paracetamol"]);
  });

  it("Escape cierra la lista sin llegar al modal", () => {
    let alModal = 0;
    const contar = () => alModal++;
    document.addEventListener("keydown", contar);
    try {
      render(<Probar />);
      escribir("para");
      tecla("Escape");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(alModal).toBe(0);
    } finally {
      document.removeEventListener("keydown", contar);
    }
  });
});
