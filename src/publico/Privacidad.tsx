import { Link } from "react-router-dom";
import { Cabecera, CargandoPublico, Marco } from "./piezas";
import { rutaPublica, useNegocioPublico } from "./util";

/**
 * `/r/:subdominio/privacidad`: la política del NEGOCIO para su cliente final
 * (PLAN-AGENDA-BELLEZA §8.8, legal/PRIVACIDAD-CLIENTE-FINAL.md v0.1). El
 * responsable de los datos es el negocio; BamarDev sólo los guarda por él.
 *
 * Plantilla v0.1, a revisar con un abogado antes de PROD (§17).
 */
export default function Privacidad() {
  const { sub, datos, cargando } = useNegocioPublico();
  if (cargando) return <CargandoPublico />;
  const negocio = datos?.negocio.nombre ?? "El negocio";
  const contacto = datos?.negocio.telefono ?? datos?.sucursales.find((s) => s.telefono)?.telefono ?? null;
  const version = datos?.privacidadVersion ?? "v0.1";

  return (
    <Marco datos={datos} titulo="Política de privacidad">
      <Cabecera arriba="Política de privacidad" titulo={negocio} />
      <article className="flex flex-1 flex-col gap-4 px-5 py-6 text-[15px] leading-relaxed text-[#374151]">
        <p>
          <strong>{negocio}</strong> usa tu nombre y tu teléfono para agendar, confirmar y recordarte tus citas, y para
          atenderte. {negocio} es el responsable de tus datos y no los vende.
        </p>
        <p>
          Los guarda en <strong>BamarDev</strong>, la plataforma que usa para su agenda, que solo los trata por cuenta de{" "}
          {negocio}.
        </p>
        <p>
          Si un dato de salud (como una alergia) es necesario para atenderte, se te pedirá en el local y solo lo verá
          quien te atienda. Por eso la reserva por internet no te pide ninguno.
        </p>
        <p>
          Se guardan mientras seas cliente o hasta que pidas borrarlos. Para ver, corregir o borrar tus datos, escribile
          a {negocio}
          {contacto ? (
            <>
              {" "}
              (<a href={`tel:${contacto}`} className="underline">
                {contacto}
              </a>
              )
            </>
          ) : null}
          . También podés pedirlo desde el enlace de tu reserva.
        </p>
        <p className="text-xs text-[#9CA3AF]">Versión {version}.</p>
        {datos && (
          <Link to={rutaPublica(sub, "/reservar")} className="font-bold text-primary-700 underline">
            Volver a reservar
          </Link>
        )}
      </article>
    </Marco>
  );
}
