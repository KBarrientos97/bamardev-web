import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import CampoAgua from "./CampoAgua";

/** El campo con su estado, como lo tiene la evaluación; muestra el texto que sale. */
function Campo({ inicial = "" }: { inicial?: string }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <CampoAgua id="ev-agua" valor={valor} onCambiar={setValor} />
      <output data-testid="texto">{valor}</output>
    </>
  );
}
const texto = () => screen.getByTestId("texto").textContent;
const tocar = (nombre: string) => fireEvent.click(screen.getByRole("button", { name: nombre }));
const nota = () => screen.getByLabelText("Consumo de agua") as HTMLInputElement;
const llenas = () => screen.getAllByRole("button").filter((b) => b.className.includes("bg-[#0369a1]")).length;

describe("CampoAgua", () => {
  it("abre «Sin anotar», vacío y con nada elegido", () => {
    render(<Campo />);
    expect(screen.getByText("Sin anotar")).toBeTruthy();
    expect(texto()).toBe("");
    expect(screen.getAllByRole("button").every((b) => b.getAttribute("aria-pressed") !== "true")).toBe(true);
  });

  it("elige «1,5 litros al día» y tocarlo otra vez lo apaga", () => {
    render(<Campo />);
    tocar("1,5 litros al día");
    expect(texto()).toBe("1,5 L");
    expect(screen.getByText("1,5 L al día")).toBeTruthy();
    tocar("1,5 litros al día");
    expect(texto()).toBe("");
    expect(screen.getByText("Sin anotar")).toBeTruthy();
  });

  it("«0» es «No toma agua»", () => {
    render(<Campo />);
    tocar("No toma agua");
    expect(texto()).toBe("No toma agua");
    tocar("No toma agua");
    expect(texto()).toBe("");
  });

  it("con nota escrita la conserva al elegir y al apagar", () => {
    render(<Campo />);
    fireEvent.change(nota(), { target: { value: "con limón" } });
    expect(texto()).toBe("con limón");
    tocar("1,5 litros al día");
    expect(texto()).toBe("1,5 L: con limón");
    tocar("1,5 litros al día");
    expect(texto()).toBe("con limón");
  });

  it("un texto que llega de afuera («2 l») enciende hasta el «2»", () => {
    render(<Campo inicial="2 l" />);
    expect(screen.getByText("2 L al día")).toBeTruthy();
    expect(llenas()).toBe(4);
    expect(screen.getByRole("button", { name: "2 litros al día" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lee la nota de un texto viejo", () => {
    render(<Campo inicial="2 L: con limón" />);
    expect(nota().value).toBe("con limón");
  });
});
