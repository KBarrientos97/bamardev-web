import { fireEvent } from "@testing-library/react";

/**
 * Enter en un campo, como lo hace el navegador (envío implícito del formulario):
 * jsdom no lo implementa, así que se imita lo que dice la especificación. Primero
 * va el `keydown` (si alguien lo cancela, no pasa nada); después se "hace clic" en
 * el botón de envío del formulario, y si ese botón está deshabilitado no se envía
 * nada. Por eso sirve para probar que Enter guarda, y que no vuelve a guardar
 * mientras ya se está guardando.
 */
export function pulsarEnter(campo: HTMLElement) {
  const sinCancelar = fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
  if (!sinCancelar) return;
  const boton = campo.closest("form")?.querySelector<HTMLButtonElement>('button[type="submit"], input[type="submit"]');
  if (boton && !boton.disabled) fireEvent.click(boton);
}
