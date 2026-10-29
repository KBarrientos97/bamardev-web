import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * COB-1: en el restaurante lo recibido en efectivo arranca vacío y se escribe,
 * o se toca el monto justo o un billete. Sin eso no se cobra.
 *
 * La pantalla no cambia con esto: es como la web ya cobraba, y la app de
 * Android se iguala a ella. Lo que se fija acá es que nadie lo "simplifique"
 * llenando el campo con el total: así se cobra sin contar, y lo que queda
 * grabado como recibido y como cambio no es lo que pasó en el mostrador.
 */

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  // El restaurante de Omar: efectivo y QR, sin vales ni propinas.
  const features = ["pos", "pago_qr_mixto"];
  return {
    useAuth: () => ({
      negocio: { id: 1, tipoNegocio: "RESTAURANTE", features },
      usuario: { id: 1, username: "caja", rol: "CAJERO", ...permisosDe("CAJERO") },
      incluye: (f: string) => features.includes(f),
    }),
  };
});

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: { consultarVale: vi.fn(), formaPagoVale: vi.fn() },
}));

vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ onConfirmar, sinBoton }: { onConfirmar: () => void; sinBoton?: boolean }) =>
    sinBoton ? <p>Revisá el QR</p> : <button onClick={onConfirmar}>Ya llegó el QR</button>,
}));

import PantallaCobro from "./PantallaCobro";

const FORMAS = [
  { id: 10, nombre: "Efectivo" },
  { id: 11, nombre: "QR" },
];

type CobroDeMesa = "caja" | "mesero";

/**
 * Los tres cobros del restaurante que montan esta pantalla: el mostrador y la
 * caja cobrando una mesa (`pos/Pos.tsx`, ésta con `cobroDeMesa="caja"`) y el
 * mesero que cobra su mesa (`salon/CobrarMesa.tsx`, con `cobroDeMesa="mesero"`).
 * Ninguno le pasa `recibidoVacioEsExacto`, y lo que la cambia de uno a otro es
 * `cobroDeMesa`. Por eso la regla se prueba en los tres: probada sólo en el
 * mostrador, una pantalla que tomara lo vacío como el justo únicamente
 * cobrando una mesa pasaba en verde. Es lo que hacía la hoja de cobro del
 * mesero en Android hasta COB-1 («el caso más común es que pague justo»), y su
 * comentario pone a esta pantalla, la del mesero en la web, como la referencia.
 *
 * La sesión es la del cajero también para el mesero: la pantalla no mira el
 * rol para cobrar.
 */
const MONTAJES: [string, CobroDeMesa | undefined][] = [
  ["el mostrador", undefined],
  ["la caja cobrando una mesa", "caja"],
  ["el mesero que cobra su mesa", "mesero"],
];

function montar({ total, cobroDeMesa }: { total: number; cobroDeMesa?: CobroDeMesa }) {
  const onConfirmar = vi.fn();
  render(
    <PantallaCobro
      total={total}
      formasPago={FORMAS}
      onAtras={() => {}}
      onConfirmar={onConfirmar}
      enviando={false}
      error=""
      cobroDeMesa={cobroDeMesa}
    />,
  );
  return onConfirmar;
}

const atajo = (monto: RegExp) => screen.getByRole("button", { name: monto });
const confirmar = () => fireEvent.click(screen.getByText(/Confirmar cobro/));

/**
 * Todo el código de la app como texto, como en `src/separacion.test.ts`: se
 * lee, no se ejecuta. Sin los tests: éste nombra la opción para buscarla.
 */
const fuentes = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Si el código, sin los comentarios, nombra la opción: que un comentario la
 * nombre no es pasarla. Una sola pasada que respeta las cadenas: un
 * `"image/*"` no abre un comentario, ni un `/*` escrito dentro de un
 * comentario de línea, ni la `//` de un `https://wa.me/${…}`. Sin los
 * templates, esa `//` se comía el resto de su línea en 19 archivos, entre
 * ellos el historial del POS y el repartidor. Lo que todavía no entiende es
 * una regex con `//` adentro (`/^https?:\/\//`): pierde el resto de esa línea.
 */
const nombraLaOpcion = (codigo: string) =>
  /\brecibidoVacioEsExacto\b/.test(
    codigo.replace(
      /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      (_comentario, cadena?: string) => cadena ?? "",
    ),
  );

describe("COB-1: en el restaurante lo recibido en efectivo se escribe o se toca", () => {
  describe.each(MONTAJES)("%s", (_quien, cobroDeMesa) => {
    it("arranca vacío y sin escribir lo recibido no cobra", () => {
      // Kevin, 17-oct: en el billar, con lo recibido ya puesto, «se cobra sin
      // contar». La app del restaurante lo llenaba solo con el total y se
      // igualó a esto (COB-1): el ticket decía recibido = total y cambio 0
      // aunque el cliente hubiera pagado con un billete más grande.
      const onConfirmar = montar({ total: 74, cobroDeMesa });
      expect((screen.getByLabelText(/Efectivo recibido/) as HTMLInputElement).value).toBe("");

      confirmar();

      expect(onConfirmar).not.toHaveBeenCalled();
      expect(screen.getByText("Lo recibido no alcanza para cubrir el total.")).toBeInTheDocument();
    });

    it("el atajo del monto justo cobra con lo recibido igual al total", () => {
      // Lo que hace llevadera la regla: el cliente que paga justo es un
      // toque, no un número tecleado.
      const onConfirmar = montar({ total: 74, cobroDeMesa });
      fireEvent.click(atajo(/^Bs.74,00$/));
      confirmar();
      expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 74, recibido: 74 }]);
    });

    it("un billete muestra el cambio y lo deja grabado como recibido", () => {
      // Es lo que se perdía con el campo lleno: se grababan Bs 74 recibidos
      // sin cambio, aunque el cliente hubiera dado Bs 100.
      const onConfirmar = montar({ total: 74, cobroDeMesa });
      fireEvent.click(atajo(/^Bs.100,00$/));
      // Bajo «Cambio» y no bajo «Falta»: los dos se pintan en el mismo lugar.
      expect(screen.getByText("Cambio").nextElementSibling).toHaveTextContent(/^Bs.26,00$/);

      confirmar();

      expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 74, recibido: 100 }]);
    });

    it("los atajos son el justo y los billetes de Bolivia que lo cubren", () => {
      // Kevin, 25-oct: sólo billetes que existen. Bs 75 y Bs 80 son los
      // redondeos que ofrecía la app (COB-2): montos que nadie entrega en un
      // solo billete.
      montar({ total: 74, cobroDeMesa });
      for (const monto of [/^Bs.74,00$/, /^Bs.100,00$/, /^Bs.200,00$/])
        expect(atajo(monto)).toBeInTheDocument();
      for (const redondeo of [/^Bs.75,00$/, /^Bs.80,00$/])
        expect(screen.queryByRole("button", { name: redondeo })).not.toBeInTheDocument();
    });
  });

  it("fuera de «Cobrar a estudiante», nadie le pasa a la pantalla que lo vacío es el justo", () => {
    // Los tests de arriba montan la pantalla sin la opción, como los tres
    // cobros del restaurante: no verían que uno se la pasara. Y es la vuelta
    // más corta a «se cobra sin contar»: una línea, sin que nada más se
    // rompa. La opción es de «Cobrar a estudiante», a propósito: cobrando
    // cuotas lo común es el monto justo (QA 23-oct).
    // Se lee todo `src` y no dos archivos fijos: si el cobro se muda de
    // archivo, o aparece otro cobro que monte la pantalla, el lugar nuevo
    // queda vigilado sin tocar este test.
    // La lista exacta es también el control: si la opción cambia de nombre,
    // o el lector no ve nada, queda vacía y falla, en vez de pasar siempre
    // sin probar nada.
    const laNombran = Object.keys(fuentes).filter((ruta) => nombraLaOpcion(fuentes[ruta])).sort();
    expect(laNombran, "sólo «Cobrar a estudiante» toma lo vacío como el justo").toEqual([
      "/src/pages/academia/Cobrar.tsx",
      "/src/pages/pos/PantallaCobro.tsx",
    ]);
  });
});
