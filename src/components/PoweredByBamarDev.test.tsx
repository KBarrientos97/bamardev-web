import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PoweredByBamarDev from "./PoweredByBamarDev";

describe("Powered by BamarDev", () => {
  it("es un enlace a la landing con el logo y el texto", () => {
    const { container } = render(<PoweredByBamarDev />);
    const enlace = screen.getByRole("link", { name: "Powered by BamarDev" });
    expect(enlace).toHaveAttribute("href", "https://bamardev.com");
    // El logo es decorativo: no suma al nombre del enlace.
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container.querySelector("img")).toHaveAttribute("src", "/logo-marca-48.png");
  });

  it("acepta otro destino (la UTM del negocio en su página)", () => {
    render(<PoweredByBamarDev href="https://bamardev.com/?utm_source=salon" />);
    expect(screen.getByRole("link", { name: "Powered by BamarDev" })).toHaveAttribute(
      "href",
      "https://bamardev.com/?utm_source=salon",
    );
  });
});
