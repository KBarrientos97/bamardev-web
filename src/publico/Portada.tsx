import { Link } from "react-router-dom";
import { Aviso, Cabecera, CargandoPublico, IconoMapa, Marco, NoDisponible } from "./piezas";
import { enlaceMapa, rutaPublica, ultimaReserva, useNegocioPublico } from "./util";

/**
 * `/r/:subdominio`: la portada mínima con el botón Reservar. La página del
 * negocio completa (bio, enlaces, portada) es de PLAN-PAGINA-NEGOCIO; ésta
 * sólo lleva a la reserva y muestra dónde queda cada sucursal.
 */
export default function Portada() {
  const { sub, datos, cargando, noDisponible, error } = useNegocioPublico();
  if (cargando) return <CargandoPublico />;
  if (!datos) {
    return <Marco datos={null}>{noDisponible ? <NoDisponible /> : <Aviso>{error}</Aviso>}</Marco>;
  }
  const { negocio, sucursales } = datos;
  const ultima = ultimaReserva.leer(sub);
  const unaSola = sucursales.length === 1;

  return (
    <Marco datos={datos} titulo="Reservas">
      <Cabecera arriba="Reservas online" titulo={negocio.nombre} abajo={negocio.direccion ?? undefined} principal />
      <div className="flex flex-1 flex-col gap-4 px-5 py-6">
        <p className="text-[15px] text-[#374151]">Elegí el servicio, el día y la hora. Sin registrarte ni bajar nada.</p>
        <Link
          to={rutaPublica(sub, "/reservar")}
          className="flex min-h-[52px] items-center justify-center rounded-xl bg-primary-boton text-base font-bold text-white hover:bg-primary-boton-hover"
        >
          Reservar
        </Link>
        {ultima && (
          <Link
            to={rutaPublica(sub, `/c/${ultima}`)}
            className="flex min-h-12 items-center justify-center rounded-xl border border-[#E5E7EB] text-[15px] text-[#374151]"
          >
            Ver mi última reserva
          </Link>
        )}

        <section className="mt-2 flex flex-col gap-2.5" aria-label="Sucursales">
          <h2 className="text-[13px] tracking-[0.06em] text-[#6B7280]">{unaSola ? "DÓNDE ESTAMOS" : "SUCURSALES"}</h2>
          {sucursales.map((s) => {
            const mapa = enlaceMapa(negocio.nombre, s.direccion);
            // Sin teléfono propio, el del negocio (como en el enlace de gestión, B27).
            const telefono = s.telefono ?? negocio.telefono;
            return (
              <div key={s.slug} className="flex flex-col gap-1.5 rounded-[14px] border border-[#E5E7EB] p-4">
                <strong className="text-[15px]">{s.nombre}</strong>
                {s.direccion && <span className="text-[13px] text-[#4B5563]">{s.direccion}</span>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {telefono && (
                    <a href={`tel:${telefono}`} className="text-primary-700 underline">
                      {telefono}
                    </a>
                  )}
                  {mapa && (
                    <a href={mapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-700 underline">
                      <IconoMapa /> Cómo llegar
                    </a>
                  )}
                  {!unaSola && (
                    <Link to={rutaPublica(sub, `/reservar/${s.slug}`)} className="font-bold text-primary-700 underline">
                      Reservar acá
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <p className="mt-auto pt-6 text-center text-xs text-[#9CA3AF]">
          <Link to={rutaPublica(sub, "/privacidad")} className="underline">
            Política de privacidad
          </Link>{" "}
          · Reservas con BamarDev
        </p>
      </div>
    </Marco>
  );
}
