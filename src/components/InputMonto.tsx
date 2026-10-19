import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { completarMonto, editarMonto } from "../lib/montoTecleado";
import { Input } from "./ui";

/**
 * Campo de plata que se escribe como en Bolivia: separa los miles mientras se
 * teclea ("2258" → "2.258"), entiende la coma y el punto de los centavos y, al
 * salir, deja el monto escrito entero ("2.258,90"). Las reglas están en
 * `montoTecleado`.
 *
 * El valor es el texto que se ve; quien lo usa lo lee con `leerMonto`. No es
 * un `Input type="number"`: ése pasa la coma a punto y "2.258,90" llegaba
 * como "2.258.90", que no se puede leer (QA de Kevin, 17-oct-2026).
 */
export default function InputMonto({
  value,
  onChange,
  onBlur,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> & {
  value: string;
  onChange: (texto: string) => void;
}) {
  const campo = useRef<HTMLInputElement | null>(null);
  const cursor = useRef<number | null>(null);

  // Al reescribir el texto (un punto de miles que aparece o se va) el
  // navegador manda el cursor al final: se lo devuelve a donde se tecleó.
  useLayoutEffect(() => {
    const el = campo.current;
    if (el && cursor.current !== null && document.activeElement === el) {
      el.setSelectionRange(cursor.current, cursor.current);
    }
    cursor.current = null;
  });

  return (
    <Input
      {...props}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const el = e.target;
        campo.current = el;
        const r = editarMonto(value, el.value, el.selectionStart ?? el.value.length);
        if (r.texto === value) {
          // No entró (una tercera cifra de centavos, otra coma, una letra):
          // el campo queda como estaba y el cursor donde estaba.
          el.value = value;
          el.setSelectionRange(r.cursor, r.cursor);
          return;
        }
        cursor.current = r.cursor;
        onChange(r.texto);
      }}
      onBlur={(e) => {
        const completo = completarMonto(value);
        if (completo !== value) onChange(completo);
        onBlur?.(e);
      }}
    />
  );
}
