import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import { avisarClic, urlDeImagen } from "../../lib/pagina/apiPagina";
import { catalogoEnSucursal, enlaceWhatsapp } from "../../lib/pagina/catalogo";
import { contactosWhatsapp, type ContactoWhatsapp } from "../../lib/pagina/whatsapp";
import type { EnlacePublico } from "../../lib/pagina/tipos";
import PedidoPagina from "./PedidoPagina";
import { usePedido } from "../../lib/pagina/usePedido";
import RegalarPagina from "./RegalarPagina";
import { urlPrivacidadDe, urlReservaDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { cargarFuentesPagina } from "../../lib/pagina/estilos";
import { tonosPagina } from "../../lib/pagina/estilosPagina";
import { paleta } from "../../lib/pagina/aspecto";
import type { PaginaPublica as Pagina } from "../../lib/pagina/tipos";
import VistaPagina, { ANCHO_ESCRITORIO, MarcaBamarDev } from "./VistaPagina";
import ChatPagina from "./ChatPagina";


/**
 * Pone título y etiquetas para compartir. WhatsApp y Facebook no ejecutan
 * JavaScript, así que esto no les llega (para eso el enlace corto les sirve
 * el HTML con Open Graph, y la página las Pages Functions, también en
 * `link.bamardev.com`): sirve para la pestaña del navegador y para quien sí lo lee.
 */
function useMetadatosPagina(p: Pagina | null) {
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
    poner("name", "theme-color", tonosPagina(p.estilo, paleta(p.color.hex), !!p.portadaUrl).barra);
    return () => {
      document.title = anterior;
      metas.forEach((m) => m.remove());
    };
  }, [p]);
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
export default function PaginaPublica() {
  const { subdominio } = useParams();
  const { pagina, error } = usePaginaPublica(subdominio);
  // La letra del texto del estilo y sólo la que eligió el negocio para su
  // nombre, no las 30.
  const tipografia = pagina?.tipografia;
  const estilo = pagina?.estilo;
  useEffect(() => cargarFuentesPagina(tipografia, estilo), [tipografia, estilo]);
  useMetadatosPagina(pagina);
  const pedido = usePedido(subdominio ?? "");
  const [regalando, setRegalando] = useState(false);
  // La sucursal elegida en el catálogo («Mis productos» con más de una): de
  // ella son los precios del pedido, y el mensaje la nombra.
  const [sucursal, setSucursal] = useState(0);
  const sucursales = pagina?.catalogo?.sucursales ?? [];
  const nombreSucursal = sucursales.length > 1 ? (sucursales[sucursal] ?? sucursales[0]) : null;
  const elegirSucursal = (i: number) => {
    setSucursal(i);
    if (pagina?.catalogo) pedido.ajustar(catalogoEnSucursal(pagina.catalogo, i).items, pagina.catalogo.items);
  };

  // Pedidos y gift cards se mandan por WhatsApp: al general o al de alguna
  // sucursal (13-oct). Sin ningún número, no hay.
  const whatsapp = pagina ? enlaceWhatsapp(pagina) : null;
  const contactos = pagina ? contactosWhatsapp(pagina) : [];
  const conPedidos = !!pagina?.pedidos && contactos.length > 0;
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
  return (
    <>
      <VistaPagina
        pagina={vista}
        urlReservar={urlReservaDe(pagina.subdominio)}
        urlPrivacidad={urlPrivacidadDe(pagina.subdominio)}
        alClic={(e) => (e.id === BOTON_REGALO.id ? setRegalando(true) : avisarClic(pagina.subdominio, e.id))}
        alAgregarAlPedido={conPedidos ? pedido.agregar : undefined}
        sucursalCatalogo={sucursal}
        onSucursalCatalogo={elegirSucursal}
      />
      {conPedidos && (
        <PedidoPagina
          negocio={pagina.nombre}
          color={pagina.color.hex}
          destinos={destinosPedido}
          pedido={pedido}
          sucursal={nombreSucursal}
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
