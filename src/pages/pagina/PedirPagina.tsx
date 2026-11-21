import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { paleta } from "../../lib/pagina/aspecto";
import { textoIncluyeDeItem } from "../../lib/pagina/agregadosPagina";
import { catalogoEnSucursal } from "../../lib/pagina/catalogo";
import { estiloBotones, estiloLetra, letraTitulo } from "../../lib/pagina/estilos";
import { cantidadDe, type LineaPedido } from "../../lib/pagina/pedido";
import { tonosSitio } from "../../lib/pagina/sitio";
import type { ItemCatalogoPublico, PaginaPublica } from "../../lib/pagina/tipos";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import CartaSitio, { type PedidoCarta } from "./CartaSitio";
import type { AccionCatalogo } from "./CatalogoPagina";
import { ANCHO_ESCRITORIO, MarcaBamarDev } from "./VistaPagina";

/** Los rubros de comida van con las filas de la carta; los demás, con las tarjetas de tienda. */
const RUBROS_CARTA = new Set(["RESTAURANTE", "BILLAR"]);

/**
 * Con qué plantilla se dibuja la carta del modo pedir: la del sitio, si el
 * negocio tiene; si no, la que corresponde a su rubro.
 */
export function plantillaPedir(p: Pick<PaginaPublica, "sitio" | "rubroClave">): string {
  if (p.sitio) return p.sitio.plantilla;
  return RUBROS_CARTA.has(p.rubroClave ?? "") ? "GASTRONOMIA" : "COMERCIO";
}

/**
 * El modo pedir (`/<negocio>/pedir`, 20-nov): el enlace para vender. Quien
 * entra ya quiere pedir, así que no hay portada, «quiénes somos», mapa ni
 * preguntas: arriba el negocio en una línea y enseguida la carta entera, con
 * buscador y categorías (la misma de la tienda del sitio). Tampoco pregunta de
 * qué sucursal ver los precios: con delivery la elige el pin y al retirar la
 * elige el cliente en el pedido, que ajusta los precios si cambian.
 *
 * El carrito, los toppings y las franjas («pedido en curso», «no estamos
 * recibiendo pedidos») los pone `PaginaPublica`, igual que en la página.
 */
export default function PedirPagina({
  pagina: p,
  sucursal,
  urlPagina,
  alAgregarAlPedido,
  lineasPedido,
  alCambiarPedido,
  agotados,
}: {
  pagina: PaginaPublica;
  /** La sucursal de la que son los precios de la carta (la del pedido). */
  sucursal: number;
  urlPagina: string;
  alAgregarAlPedido: (item: ItemCatalogoPublico) => void;
  lineasPedido: LineaPedido[];
  alCambiarPedido: (id: number | string, delta: number) => void;
  agotados?: ReadonlySet<number>;
}) {
  const escritorio = useCoincideMedia(`(min-width: ${ANCHO_ESCRITORIO}px)`);
  const plantilla = plantillaPedir(p);
  const c = paleta(p.color.hex);
  const t = tonosSitio(plantilla, c);
  const b = estiloBotones(p.formaBotones, c, t.superficie);
  // El visor es siempre blanco: su botón va con la forma sobre fondo claro.
  const bVisor = t.superficie.tipo === "clara" ? b : estiloBotones(p.formaBotones, c);
  const letra = letraTitulo(p.tipografia);
  const logo = urlDeImagen(p.logoUrl);
  const catalogo = p.catalogo ? catalogoEnSucursal(p.catalogo, sucursal) : null;
  const items = catalogo?.items ?? [];

  const pedido: PedidoCarta = {
    cantidadDe: (id) => cantidadDe(lineasPedido, id),
    agregar: alAgregarAlPedido,
    cambiar: alCambiarPedido,
    agotado: (id) => agotados?.has(id) ?? false,
    incluye: (id) => textoIncluyeDeItem(p.agregados, id),
  };
  const accionVisor: AccionCatalogo = {
    texto: "Agregar al pedido",
    icono: "M12 5v14M5 12h14",
    href: () => "#",
    alAgregar: alAgregarAlPedido,
    agotado: (it) => agotados?.has(it.id) ?? false,
    incluye: (it) => textoIncluyeDeItem(p.agregados, it.id),
  };
  const ancho: CSSProperties = { maxWidth: escritorio ? 1120 : 640, margin: "0 auto", padding: escritorio ? "0 32px" : "0 16px", boxSizing: "border-box" };

  return (
    <div data-testid="modo-pedir" style={{ minHeight: "100dvh", background: t.fondo, color: t.texto, fontFamily: t.familia }}>
      <header style={{ background: t.tarjeta, borderBottom: `1px solid ${t.borde ?? t.linea}` }}>
        <div style={{ ...ancho, display: "flex", alignItems: "center", gap: 12, minHeight: 64, paddingTop: 10, paddingBottom: 10 }}>
          {logo && (
            <img src={logo} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", flex: "none", background: c.tinte }} />
          )}
          <h1 style={{ ...estiloLetra(letra, escritorio ? 26 : 22), color: t.textoTarjeta, margin: 0, flex: 1, minWidth: 0, lineHeight: 1.1, overflowWrap: "anywhere" }}>
            {p.nombre}
          </h1>
          <Link to={urlPagina} style={{ flex: "none", fontSize: 14, fontWeight: 700, color: c.oscuro, textDecoration: "none", padding: "10px 4px" }}>
            Ver la página
          </Link>
        </div>
      </header>
      {/* Lo de abajo deja lugar a la barra del pedido (fija, 56 px más su margen). */}
      <main style={{ ...ancho, paddingTop: escritorio ? 28 : 16, paddingBottom: 120 }}>
        {items.length > 0 ? (
          <CartaSitio
            items={items}
            plantilla={plantilla}
            modo="tienda"
            titulo={(id) => (
              <h2 id={id} style={{ ...estiloLetra(letra, escritorio ? 34 : 26), color: t.titulo, margin: 0, lineHeight: 1.1 }}>
                Hacé tu pedido
              </h2>
            )}
            t={t}
            c={c}
            letra={letra}
            escritorio={escritorio}
            enMarco={false}
            radio={16}
            pedido={pedido}
            lleno={b.principal.estilo}
            colorIconoLleno={b.principal.icono}
            urlReservar={null}
            accionVisor={accionVisor}
            estiloBoton={{ minHeight: 50, padding: "0 22px", fontSize: 16, fontWeight: 800, ...bVisor.principal.estilo }}
            colorIconoBoton={bVisor.principal.icono}
            colorVacio={t.texto3}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 15, color: t.texto3 }}>Todavía no hay productos para pedir.</p>
        )}
        <a
          href="https://bamardev.com/?utm_source=pagina&utm_medium=referral&utm_campaign=pedir"
          style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 32, fontSize: 12, color: t.texto3, textDecoration: "none" }}
        >
          <MarcaBamarDev />
          Powered by BamarDev
        </a>
      </main>
    </div>
  );
}
