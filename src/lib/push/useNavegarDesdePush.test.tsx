import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { EVENTO_NAVEGAR_PUSH } from "./destino";
import { useNavegarDesdePush } from "./useNavegarDesdePush";

/** El mensaje del service worker al tocar una notificación con la app abierta. */

const sw = new EventTarget();
const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

beforeEach(() => {
  Object.defineProperty(navigator, "serviceWorker", { value: sw, configurable: true });
});
afterEach(() => {
  if (original) Object.defineProperty(navigator, "serviceWorker", original);
  else delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

function App() {
  useNavegarDesdePush();
  const { pathname, search } = useLocation();
  return <p data-testid="donde">{`${pathname}${search}`}</p>;
}

function mensaje(data: unknown) {
  act(() => {
    sw.dispatchEvent(new MessageEvent("message", { data }));
  });
}

describe("navegar desde una push", () => {
  it("va a la ruta que pide el service worker", () => {
    render(
      <MemoryRouter initialEntries={["/pos"]}>
        <App />
      </MemoryRouter>,
    );
    mensaje({ tipo: EVENTO_NAVEGAR_PUSH, url: "/?creditos=comprar" });
    expect(screen.getByTestId("donde")).toHaveTextContent("/?creditos=comprar");
  });

  it("ignora otros mensajes y una URL ajena lleva al inicio", () => {
    render(
      <MemoryRouter initialEntries={["/pos"]}>
        <App />
      </MemoryRouter>,
    );
    mensaje({ tipo: "otra-cosa", url: "/reportes" });
    expect(screen.getByTestId("donde")).toHaveTextContent(/^\/pos$/);
    mensaje({ tipo: EVENTO_NAVEGAR_PUSH, url: "https://otro.sitio" });
    expect(screen.getByTestId("donde")).toHaveTextContent(/^\/$/);
  });
});
