import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TarjetaRegalo from "./TarjetaRegalo";
import { DISENOS_REGALO, motivoDe, textoSobre, tonos } from "../../lib/regalos/disenos";
import { mensajeRegalo } from "../../lib/regalos/pedidoRegalo";

describe("TarjetaRegalo", () => {
  it.each(DISENOS_REGALO)("%s se dibuja con el monto, para quién y el código", (diseno) => {
    const { container } = render(
      <TarjetaRegalo
        datos={{
          diseno,
          rubro: "BARBERIA",
          color: "#3F3C3A",
          negocio: "Barbería El Navajazo",
          monto: 150,
          para: "Ana",
          de: "Luis",
          codigo: "K7QM-2XPA",
          vence: "2027-04-30",
        }}
      />,
    );
    expect(screen.getByRole("img", { name: "Gift card de Barbería El Navajazo por Bs 150" })).toBeInTheDocument();
    const texto = container.textContent ?? "";
    expect(texto).toContain("Bs 150");
    expect(texto).toContain("K7QM-2XPA");
  });

  it("un diseño desconocido cae en Minimal (no rompe la tarjeta)", () => {
    const { container } = render(<TarjetaRegalo datos={{ diseno: "OTRO", rubro: null, color: "#2F6F5E", negocio: "Spa", monto: 50 }} />);
    expect(container.textContent).toContain("Tarjeta de regalo");
  });

  it("los motivos salen del rubro (clave o nombre con tilde) y hay uno general", () => {
    expect(motivoDe("BARBERIA").frase).toBe("Un regalo para lucir impecable");
    expect(motivoDe("Peluquería").frase).toBe("Un regalo para consentirte");
    expect(motivoDe("Uñas").frase).toBe("Uñas perfectas de regalo");
    expect(motivoDe("BILLAR").frase).toBe("Un regalo especial");
  });

  it("el texto sobre el color es legible", () => {
    expect(textoSobre("#3F3C3A")).toBe("#FFFFFF");
    expect(textoSobre("#F5E6C8")).toBe("#1F2937");
    expect(tonos("no-es-un-color").base).toBe("#4A4744");
  });

  it("el pedido de gift card por WhatsApp lleva monto, diseño y dedicatoria", () => {
    expect(mensajeRegalo("Spa Aurora", { diseno: "NEON", monto: 200, para: "María", de: "", mensaje: "¡Feliz cumple!" })).toBe(
      [
        "Hola Spa Aurora, quiero regalar una gift card:",
        "",
        "• Monto: Bs 200",
        "• Diseño: Neón",
        "• Para: María",
        "• Dedicatoria: ¡Feliz cumple!",
        "",
        "¿Cómo te pago?",
      ].join("\n"),
    );
  });
});
