import type { ComponentProps } from "react";
import EscenaConsulta from "./EscenaConsulta";
import FormularioConsulta from "./FormularioConsulta";

/**
 * La consulta por carnet dentro de la página de un consultorio de nutrición:
 * la ilustración y el formulario en una sola tarjeta (25-nov, el dueño: sola
 * y angosta la tarjeta quedaba perdida en la computadora). Se arma según el
 * ancho de la tarjeta (@container), no de la pantalla: en el sitio de la
 * computadora va en dos columnas; en el celular y en la página simple, la
 * ilustración arriba como una franja y el formulario debajo.
 */
export default function ConsultaEnPagina(
  props: Omit<ComponentProps<typeof FormularioConsulta>, "enPagina">,
) {
  return (
    <div className="@container">
      <div className="grid overflow-hidden rounded-[18px] bg-white text-[#111827] shadow-[0_1px_3px_rgba(15,23,42,0.12),0_8px_24px_rgba(15,23,42,0.08)] @2xl:grid-cols-2">
        <EscenaConsulta className="h-52 @2xl:h-auto @2xl:min-h-[320px]" />
        <div className="p-[18px] @2xl:self-center @2xl:p-7">
          <FormularioConsulta {...props} enPagina />
        </div>
      </div>
    </div>
  );
}
