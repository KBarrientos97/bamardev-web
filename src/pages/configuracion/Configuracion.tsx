import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { opcionesConfiguracion } from "../../lib/configuracion";
import { termino } from "../../lib/rubro";
import { useAuth } from "../../store/AuthContext";

/**
 * «Configuración» del restaurante (15-nov): lo que se ajusta del negocio, en
 * una lista, como la pantalla de la app (`ConfiguracionFragment`). Cada
 * tarjeta lleva a su pantalla, que vuelve acá con la flecha de su título.
 *
 * Qué tarjetas hay lo decide `opcionesConfiguracion`: cada una aparece si la
 * persona ve esa sección. Sin ninguna, la ruta no se abre (ver AppNegocio) y
 * el menú no ofrece «Configuración». A diferencia de la app no lleva el pie
 * "se cambian desde la web": acá Inventario y stock y los datos de las
 * sucursales están en la lista.
 */
export default function Configuracion() {
  const { puede, rubro, vocabulario } = useAuth();
  const opciones = opcionesConfiguracion(puede, rubro);
  const palabra = (clave: Parameters<typeof termino>[1]) => termino(rubro, clave, vocabulario);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina titulo="Configuración" subtitulo="Lo que se ajusta del negocio." />
      <ul className="space-y-3">
        {opciones.map((o) => (
          <li key={o.a}>
            {/* Toda la tarjeta es el enlace: en una terminal con pantalla
                chica, la flecha sola era un blanco muy chico (como la app).
                Con el foco de teclado del navegador, el mismo de los botones
                de la web (`Boton`): el anillo verde claro casi no se veía (QA
                del 16-nov). */}
            <Link
              to={o.a}
              className="card flex min-h-16 items-center gap-3 p-4 transition-colors hover:border-primary-200 hover:bg-primary-50/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <Icon name={o.icono} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-snug text-texto">
                  {o.etiqueta ? o.etiqueta(palabra) : o.titulo}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-texto-3">{o.detalle}</span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-texto-4" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
