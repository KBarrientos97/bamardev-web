import { Link } from "react-router-dom";
import { Cabecera, CargandoPublico, Marco } from "./piezas";
import PoliticaNegocio from "./PoliticaNegocio";
import { contactoPorTelefono, rutaPublica, useNegocioPublico } from "./util";

/**
 * `/r/:subdominio/privacidad`: la política del NEGOCIO para su cliente final
 * (PLAN-AGENDA-BELLEZA §8.8). Es el mismo texto que `/p/<sub>/privacidad`
 * (`PoliticaNegocio`): un negocio tiene una sola política (B08).
 */
export default function Privacidad() {
  const { sub, datos, cargando } = useNegocioPublico();
  if (cargando) return <CargandoPublico />;
  const negocio = datos?.negocio.nombre ?? "El negocio";
  const contacto = contactoPorTelefono(
    datos?.negocio.telefono ?? datos?.sucursales.find((s) => s.telefono)?.telefono ?? null,
  );

  return (
    <Marco datos={datos} titulo="Política de privacidad">
      <Cabecera arriba="Política de privacidad" titulo={negocio} />
      <article className="flex flex-1 flex-col gap-4 px-5 py-6 text-[15px] leading-relaxed text-[#374151]">
        <PoliticaNegocio negocio={negocio} contacto={contacto} version={datos?.privacidadVersion} />
        {datos && (
          <Link to={rutaPublica(sub, "/reservar")} className="font-bold text-primary-700 underline">
            Volver a reservar
          </Link>
        )}
      </article>
    </Marco>
  );
}
