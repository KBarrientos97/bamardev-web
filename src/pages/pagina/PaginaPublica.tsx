import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import { avisarClic, urlDeImagen } from "../../lib/pagina/apiPagina";
import type { AgregadoElegido } from "../../lib/agregados/tipos";
import { catalogoDePagina, itemLlevaAgregados } from "../../lib/pagina/agregadosPagina";
import { catalogoEnSucursal, enlaceWhatsapp } from "../../lib/pagina/catalogo";
import { claveLinea, type LineaPedido } from "../../lib/pagina/pedido";
import { toppingsAgotados } from "../../lib/pedidosWeb/agotados";
import { contactosWhatsapp, type ContactoWhatsapp } from "../../lib/pagina/whatsapp";
import type { EnlacePublico, ItemCatalogoPublico } from "../../lib/pagina/tipos";
import HojaAgregadosPagina from "./HojaAgregadosPagina";
import PedidoPagina from "./PedidoPagina";
import FranjasPedido from "./FranjasPedido";
import { avisoSinPedidos } from "../../lib/pedidosWeb/aviso";
import { useInfoPedidos } from "../../lib/pedidosWeb/useInfoPedidos";
import { usePedido } from "../../lib/pagina/usePedido";
import RegalarPagina from "./RegalarPagina";
import { urlInscribirmeDe, urlMiCuentaDe, urlPaginaDe, urlPrivacidadDe, urlReservaDe, urlTiendaDe } from "../../lib/pagina/rutas";
import PedirPagina, { plantillaPedir } from "./PedirPagina";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { cargarFuentesPagina } from "../../lib/pagina/estilos";
import { tonosPagina } from "../../lib/pagina/estilosPagina";
import { paleta } from "../../lib/pagina/aspecto";
import { estiloTextoSitio, tonosSitio } from "../../lib/pagina/sitio";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import VistaPagina, { ANCHO_ESCRITORIO, MarcaBamarDev } from "./VistaPagina";
import ChatPagina from "./ChatPagina";


/**
 * Pone título y etiquetas para compartir. WhatsApp y Facebook no ejecutan
 * JavaScript, así que esto no les llega (para eso el enlace corto les sirve
 * el HTML con Open Graph, y la página las Pages Functions, también en
 * `link.bamardev.com`): sirve para la pestaña del navegador y para quien sí lo lee.
 */
function useMetadatosPagina(p: Pagina | null, pedir = false) {
  useEffect(() => {
    if (!p) return;
    const anterior = document.title;
    document.title = p.nombre;
    const metas: HTMLMetaElement[] = [];
    const poner = (atributo: "name" | "property", clave: string, valor: string) => {
      const m = document.createElement("meta");
      m.setAttribute(atributo, clave);
      m.content = valor;
      document.head.appendChild(m);
      metas.push(m);
    };
    poner("name", "description", p.og.descripcion);
    poner("property", "og:title", p.og.titulo);
    poner("property", "og:description", p.og.descripcion);
    // La barra del navegador del color del estilo (Noche, oscura; Boutique, marfil).
    const c = paleta(p.color.hex);
    // En el modo pedir, del color de su barra fija: parece una app.
    const barra = pedir ? c.oscuro : (p.sitio ? tonosSitio(p.sitio.plantilla, c) : tonosPagina(p.estilo, c, !!p.portadaUrl)).barra;
    // El navegador usa el PRIMER theme-color del documento, y el index.html ya trae
    // el de la app (verde): uno agregado al final no se veía nunca (20-nov). Se
    // cambia el que hay y se devuelve al salir.
    const existentes = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const previos = existentes.map((m) => m.content);
    if (existentes.length) existentes.forEach((m) => (m.content = barra));
    else poner("name", "theme-color", barra);
    return () => {
      document.title = anterior;
      metas.forEach((m) => m.remove());
      existentes.forEach((m, i) => (m.content = previos[i]));
    };
  }, [p, pedir]);
}

export function NoDisponible({ mensaje = "Esta página no está disponible" }: { mensaje?: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#F6F7F9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "Roboto, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 360,
          width: "100%",
          background: "#ffffff",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: 28,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#1F2937" }}>{mensaje}</h1>
        <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 18px" }}>
          Revisá que el enlace esté bien escrito o pedile al negocio su dirección.
        </p>
        <a
          href="https://bamardev.com"
          style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6B7280", textDecoration: "none" }}
        >
          <MarcaBamarDev />
          Powered by BamarDev
        </a>
      </div>
    </div>
  );
}

/**
 * El esqueleto con la forma de la página que viene: en la computadora, la
 * portada a todo el ancho y la tarjeta del negocio a la izquierda (como
 * `VistaPagina`), así no salta de una columna a dos al terminar de cargar.
 */
function Cargando() {
  const escritorio = useCoincideMedia(`(min-width: ${ANCHO_ESCRITORIO}px)`);
  if (escritorio) {
    return (
      <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" aria-label="Cargando">
        <div style={{ height: 300, background: "#E5E7EB" }} />
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "0 32px",
            display: "grid",
            gridTemplateColumns: "340px minmax(0, 1fr)",
            gap: 32,
            alignItems: "start",
          }}
        >
          <div
            style={{
              marginTop: -110,
              height: 380,
              background: "#ffffff",
              border: "1px solid #E5E7EB",
              borderRadius: 20,
            }}
          />
          <div style={{ paddingTop: 28, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 64, background: "#E5E7EB", borderRadius: 14 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" aria-label="Cargando">
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ height: 200, background: "#E5E7EB" }} />
        <div
          style={{ width: 104, height: 104, borderRadius: 999, background: "#E5E7EB", margin: "-52px auto 0", border: "4px solid #fff" }}
        />
      </div>
    </div>
  );
}

/** El botón "Regalá una gift card": id negativo, nunca choca con uno del dueño. */
const BOTON_REGALO: EnlacePublico = {
  id: -1,
  tipo: "BOTON",
  etiqueta: "Regalá una gift card",
  url: "#regalar",
  icono: "regalo",
};

/**
 * `/p/:subdominio`: la página pública del negocio (PLAN-PAGINA-NEGOCIO §2).
 * Fuera de la sesión de la app: la ve cualquiera, y un error acá nunca manda
 * al login. También en `link.bamardev.com/<subdominio>` (RutasLink.tsx).
 */
export default function PaginaPublica({ tienda = false, pedir = false }: { tienda?: boolean; pedir?: boolean } = {}) {
  const { subdominio } = useParams();
  // `/tienda?categoria=Bebidas`: llega desde una categoría de la portada.
  const [busqueda] = useSearchParams();
  const { pagina, error } = usePaginaPublica(subdominio);
  // La letra del texto del estilo y sólo la que eligió el negocio para su
  // nombre, no las 30.
  const tipografia = pagina?.tipografia;
  // Con sitio, la letra del texto es la de su plantilla. En el modo pedir, la
  // de la plantilla con que se dibuja su carta.
  const estilo = pagina && pedir ? estiloTextoSitio(plantillaPedir(pagina)) : pagina?.sitio ? estiloTextoSitio(pagina.sitio.plantilla) : pagina?.estilo;
  useEffect(() => cargarFuentesPagina(tipografia, estilo), [tipografia, estilo]);
  useMetadatosPagina(pagina, pedir);
  const pedido = usePedido(subdominio ?? "");
  const [regalando, setRegalando] = useState(false);
  // La sucursal elegida en el catálogo («Mis productos» con más de una): de
  // ella son los precios del pedido, y el mensaje la nombra.
  const [sucursal, setSucursal] = useState(0);
  const sucursales = pagina?.catalogo?.sucursales ?? [];
  const nombreSucursal = sucursales.length > 1 ? (sucursales[sucursal] ?? sucursales[0]) : null;
  const elegirSucursal = (i: number) => {
    setSucursal(i);
    // Los toppings también cambian de precio con el local elegido.
    if (pagina?.catalogo) pedido.ajustar(catalogoEnSucursal(pagina.catalogo, i).items, pagina.catalogo.items, catalogoDePagina(pagina.agregados, i)?.catalogo);
  };
  // La hoja de toppings (PLAN-AGREGADOS §8.3): al agregar un vaso que lleva grupo, o al tocar los toppings de una línea.
  const [hoja, setHoja] = useState<{
    itemId: number;
    titulo: string;
    precio: number | null;
    /** Con `item`, es un vaso nuevo; con `clave`, se edita esa línea. */
    item?: ItemCatalogoPublico;
    clave?: string;
    inicial?: AgregadoElegido[];
    vasos?: number;
  } | null>(null);

  // Pedidos y gift cards se mandan por WhatsApp: al general o al de alguna
  // sucursal (13-oct). Sin ningún número, no hay.
  const whatsapp = pagina ? enlaceWhatsapp(pagina) : null;
  const contactos = pagina ? contactosWhatsapp(pagina) : [];
  const conPedidos = !!pagina?.pedidos && contactos.length > 0;
  // Pedidos directo al sistema (13-nov). Si los dos están prendidos, gana
  // WhatsApp (decisión del dueño): el carrito de WhatsApp manda sobre `pedidosSistema`.
  // Pero un WhatsApp prendido SIN ningún número cargado no tiene a quién escribir
  // (`conPedidos` es falso): cuenta como apagado y sale el del sistema.
  const conSistema = !!pagina?.pedidosSistema && !conPedidos;
  const carrito = conPedidos || conSistema;
  const infoPedidos = useInfoPedidos(subdominio, conSistema);
  // El texto sale del horario de la página: «Cerrado ahora · Abrimos hoy a las 12:00» (24-nov).
  const sinPedidos = conSistema
    ? avisoSinPedidos(infoPedidos.info, { horarios: pagina?.sucursales.map((s) => s.horarioSemanal), enLaCarta: true })
    : null;
  // Lo que el local elegido en el catálogo no puede servir hoy (agotado a mano o sin stock). La info trae las
  // sucursales en el mismo orden que el catálogo (QA R1, N3).
  const agotadosCarta = useMemo(() => {
    if (!conSistema) return undefined;
    const delLocal = infoPedidos.info?.sucursales[sucursal] ?? infoPedidos.info?.sucursales[0];
    return delLocal?.agotados?.length ? new Set(delLocal.agotados) : undefined;
  }, [conSistema, infoPedidos.info, sucursal]);
  // Los toppings con los precios del local elegido en la carta; null si la página no los usa.
  const toppings = useMemo(() => catalogoDePagina(pagina?.agregados, sucursal), [pagina?.agregados, sucursal]);
  const agregarAlPedido = (item: ItemCatalogoPublico) => {
    if (toppings && itemLlevaAgregados(pagina?.agregados, item.id)) setHoja({ itemId: item.id, titulo: item.titulo, precio: item.precio, item });
    else pedido.agregar(item);
  };
  const editarToppings = (l: LineaPedido) =>
    setHoja({ itemId: l.id, titulo: l.titulo, precio: l.precio, clave: claveLinea(l), inicial: l.agregados, vasos: l.cantidad });
  // Lo que ese local no puede servir de los toppings: lo que no ofrece y lo que la info marca agotado.
  const toppingsAgotadosDe = (indice: number | null): ReadonlySet<number> => {
    const delLocal = catalogoDePagina(pagina?.agregados, indice ?? sucursal);
    const agotados = new Set(delLocal?.noOfrecidas ?? []);
    const s = indice != null ? infoPedidos.info?.sucursales[indice] : undefined;
    for (const id of toppingsAgotados(s)) agotados.add(id);
    return agotados;
  };
  const conRegalos = !!pagina?.regalos && contactos.length > 0;
  // El pedido de «Mis productos» con sucursal elegida va al WhatsApp de esa
  // sucursal o, si no tiene, al general. Sin selector, a cualquiera de los
  // números (si hay varios, el cliente elige en el pedido).
  const catalogo = pagina?.catalogo;
  let destinosPedido: ContactoWhatsapp[] = contactos;
  if (catalogo?.sucursales && catalogo.sucursales.length > 1) {
    const i = sucursal < catalogo.sucursales.length ? sucursal : 0;
    const url = catalogo.whatsapps?.[i] ?? whatsapp?.url ?? null;
    if (url) destinosPedido = [{ etiqueta: catalogo.sucursales[i], url }];
  }
  // "Regalá una gift card" entra como un botón más de la página, con su
  // forma y su estilo, sin tocar cada armado.
  const vista = useMemo(
    () => (pagina && conRegalos ? { ...pagina, botones: [...pagina.botones, BOTON_REGALO] } : pagina),
    [pagina, conRegalos],
  );

  if (error) return <NoDisponible mensaje={error} />;
  if (!pagina || !vista) return <Cargando />;
  // La tienda es del sitio del Profesional: sin sitio, la página de siempre.
  if (tienda && !pagina.sitio) return <Navigate to={urlPaginaDe(pagina.subdominio)} replace />;
  // El modo pedir es para pedir: sin carrito (ni WhatsApp ni pedidos al sistema) o sin carta, la página de siempre.
  if (pedir && (!carrito || !pagina.catalogo?.items.length)) return <Navigate to={urlPaginaDe(pagina.subdominio)} replace />;
  return (
    <>
      {conSistema && !pedir && (
        <FranjasPedido subdominio={pagina.subdominio} fuerte={paleta(pagina.color.hex).oscuro} aviso={sinPedidos} />
      )}
      {pedir ? (
        <PedirPagina
          pagina={pagina}
          sucursal={sucursal}
          urlPagina={urlPaginaDe(pagina.subdominio)}
          alAgregarAlPedido={agregarAlPedido}
          lineasPedido={pedido.lineas}
          alCambiarPedido={pedido.cambiar}
          agotados={agotadosCarta}
          franjas={conSistema ? <FranjasPedido subdominio={pagina.subdominio} fuerte={paleta(pagina.color.hex).oscuro} aviso={sinPedidos} /> : null}
        />
      ) : (
      <VistaPagina
        pagina={vista}
        urlReservar={urlReservaDe(pagina.subdominio)}
        urlPrivacidad={urlPrivacidadDe(pagina.subdominio)}
        urlInscribirme={(grupoId) => urlInscribirmeDe(pagina.subdominio, grupoId)}
        urlMiCuenta={urlMiCuentaDe(pagina.subdominio)}
        alClic={(e) => (e.id === BOTON_REGALO.id ? setRegalando(true) : avisarClic(pagina.subdominio, e.id))}
        alAgregarAlPedido={carrito ? agregarAlPedido : undefined}
        lineasPedido={carrito ? pedido.lineas : undefined}
        alCambiarPedido={carrito ? pedido.cambiar : undefined}
        agotados={agotadosCarta}
        urlTienda={urlTiendaDe(pagina.subdominio)}
        tienda={tienda ? { urlInicio: urlPaginaDe(pagina.subdominio), categoria: busqueda.get("categoria") } : undefined}
        sucursalCatalogo={sucursal}
        onSucursalCatalogo={elegirSucursal}
      />
      )}
      {carrito && (
        <PedidoPagina
          negocio={pagina.nombre}
          color={pagina.color.hex}
          destinos={conPedidos ? destinosPedido : []}
          pedido={pedido}
          sucursal={nombreSucursal}
          rubro={pagina.rubroClave}
          subdominio={pagina.subdominio}
          asistente={!!pagina.asistente}
          onEditarToppings={toppings ? editarToppings : undefined}
          llevaToppings={toppings ? (id) => itemLlevaAgregados(pagina.agregados, id) : undefined}
          toppingsAgotadosDe={toppings ? toppingsAgotadosDe : undefined}
          sistema={
            conSistema
              ? {
                  info: infoPedidos.info,
                  errorInfo: infoPedidos.error,
                  onReintentarInfo: infoPedidos.recargar,
                  sucursalCatalogo: sucursal,
                  onSucursal: elegirSucursal,
                  muchasSucursales: sucursales.length > 1,
                  whatsappUrl: whatsapp?.url ?? null,
                }
              : undefined
          }
        />
      )}
      {hoja && toppings && (
        <HojaAgregadosPagina
          itemId={hoja.itemId}
          titulo={hoja.titulo}
          precio={hoja.precio}
          catalogo={toppings.catalogo}
          agotadas={toppingsAgotadosDe(conSistema ? sucursal : null)}
          inicial={hoja.inicial}
          vasos={hoja.vasos}
          editando={!!hoja.clave}
          c={paleta(pagina.color.hex)}
          onCerrar={() => setHoja(null)}
          onConfirmar={(elegidos) => {
            const t = { elegidos, catalogo: toppings.catalogo };
            if (hoja.item) pedido.agregar(hoja.item, t);
            else if (hoja.clave) pedido.cambiarToppings(hoja.clave, t);
            setHoja(null);
          }}
        />
      )}
      {conRegalos && pagina.regalos && (
        <RegalarPagina
          abierto={regalando}
          onCerrar={() => setRegalando(false)}
          negocio={pagina.nombre}
          color={pagina.color.hex}
          rubro={pagina.rubroClave ?? pagina.rubro}
          fotoUrl={urlDeImagen(pagina.portadaUrl ?? pagina.logoUrl)}
          regalos={pagina.regalos}
          destinos={contactos}
        />
      )}
      {/* Fuera de VistaPagina: la vista previa del editor no lleva el chat.
          Sólo con el extra `asistente_pagina` contratado. */}
      {pagina.asistente && (
        <ChatPagina subdominio={pagina.subdominio} nombre={pagina.nombre} color={pagina.color.hex} />
      )}
    </>
  );
}
