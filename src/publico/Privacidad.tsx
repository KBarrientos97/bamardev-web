import { Link } from "react-router-dom";
import { Cabecera, CargandoPublico, Marco } from "./piezas";
import { useEscritorio } from "./useEscritorio";
import PoliticaNegocio from "./PoliticaNegocio";
import { contactoPorTelefono, rutaPublica, useNegocioPublico } from "./util";

/**
 * `/r/:subdominio/privacidad`: la política del NEGOCIO para su cliente final
 * (PLAN-AGENDA-BELLEZA §8.8). Es el mismo texto que `/p/<sub>/privacidad`
 * (`PoliticaNegocio`): un negocio tiene una sola política (B08).
 *
 * En la computadora el negocio y "Volver a reservar" van a la izquierda y el
 * texto a la derecha (a ese ancho, el renglón ya es cómodo de leer).
 */
export default function Privacidad() {
  const { sub, datos, cargando } = useNegocioPublico();
  const escritorio = useEscritorio();
  if (cargando) return <CargandoPublico />;
  const negocio = datos?.negocio.nombre ?? "El negocio";
  const contacto = contactoPorTelefono(
    datos?.negocio.telefono ?? datos?.sucursales.find((s) => s.telefono)?.telefono ?? null,
  );

  const volver = datos && (
    <Link to={rutaPublica(sub, "/reservar")} className="font-bold text-primary-700 underline">
      Volver a reservar
    </Link>
  );

  return (
    <Marco
      datos={datos}
      titulo="Política de privacidad"
      // La pantalla no tenía h1: el nombre del negocio lo es (se ve igual).
      cabecera={<Cabecera arriba="Política de privacidad" titulo={negocio} principal />}
      lateral={escritorio && volver ? volver : undefined}
      etiquetaLateral="El negocio"
    >
      <article className="flex flex-1 flex-col gap-4 px-5 py-6 text-[15px] leading-relaxed text-[#374151] lg:px-10 lg:py-9">
        <PoliticaNegocio negocio={negocio} contacto={contacto} version={datos?.privacidadVersion} />
        {!escritorio && volver}
      </article>
    </Marco>
  );
}
