import type { ReactNode } from "react";
import type { useSalidaConCambios } from "../lib/useSalidaConCambios";
import { Boton, Modal } from "./ui";

/**
 * La pregunta de `useSalidaConCambios`: seguir, salir sin guardar o guardar y
 * salir. Cada pantalla pone su título y qué se pierde; los botones son los
 * mismos en todas (L7 de las Notas).
 */
export default function ModalSalida({
  salida,
  titulo,
  seguir,
  guardando,
  onGuardar,
  children,
}: {
  salida: ReturnType<typeof useSalidaConCambios>;
  titulo: string;
  /** El botón de quedarse: «Seguir cargando», «Seguir pasando lista». */
  seguir: string;
  guardando: boolean;
  /** Guarda todo; true = quedó guardado (y entonces sale). */
  onGuardar: () => Promise<boolean>;
  /** Qué cambió y que se pierde. */
  children: ReactNode;
}) {
  return (
    <Modal
      abierto={!!salida.salida}
      titulo={titulo}
      onClose={salida.quedarse}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={salida.quedarse} disabled={guardando}>
            {seguir}
          </Boton>
          <Boton variante="ghost" disabled={guardando} onClick={salida.salirSinGuardar}>
            Salir sin guardar
          </Boton>
          <Boton disabled={guardando} onClick={() => void salida.guardarYSalir(onGuardar)}>
            {guardando ? "Guardando…" : "Guardar y salir"}
          </Boton>
        </>
      }
    >
      <p className="text-sm text-texto-2">{children}</p>
    </Modal>
  );
}
