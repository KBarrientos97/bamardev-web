import { useState, type CSSProperties, type ReactNode } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { iconoDe } from "../../lib/pagina/aspecto";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { rgbaCapa } from "../../lib/pagina/estilosPagina";
import type { ItemCatalogoPublico } from "../../lib/pagina/tipos";
import { etiquetaItem, SinFoto, VisorCatalogo } from "./CatalogoPagina";
import { columna, enFilas, Nombre, Raiz, rubroYDescripcion, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, soloLector, Trazo } from "./piezasPagina";

/**
 * Mosaico (IDEAS/5 §4.3, maqueta del 09-oct): la página como una grilla de
 * bloques de distinto tamaño, 2 columnas en el celular y 4 en computadora. El
 * nombre y el botón grande a lo ancho, el primer ítem del catálogo grande y
 * los dos siguientes chicos, las redes y los botones como cuadrados con su
 * nombre, y las sucursales y el anuncio como bloques anchos. No usa la
 * portada: los bloques ya son el dibujo.
 *
 * Cada fila es su propia grilla con tantas columnas como bloques tiene
 * (`enFilas`): así ninguna combinación de redes, botones o ítems deja una
 * celda vacía, que en una grilla de bloques se ve como algo roto.
 */

const ESPACIO = 12;
const FLECHA = "m9 6 6 6-6 6";

/** Una fila de la grilla: tantas columnas como bloques trae. */
function Fila({ children, alto }: { children: ReactNode[]; alto?: number }) {
  return (
    <div
      data-fila-mosaico={children.length}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${children.length}, minmax(0, 1fr))`,
        gap: ESPACIO,
        minHeight: alto,
      }}
    >
      {children}
    </div>
  );
}

/** Las filas de una lista de bloques, parejas y sin huecos. */
function Filas({ bloques, porFila, alto }: { bloques: ReactNode[]; porFila: number; alto?: number }) {
  return (
    <>
      {enFilas(bloques, porFila).map((fila, i) => (
        <Fila key={i} alto={alto}>
          {fila}
        </Fila>
      ))}
    </>
  );
}

export default function ArmadoMosaico(x: PiezasArmado) {
  const { p, c, t, escritorio, chico, Principal } = x;
  const k = t.bloques!;
  const [abierto, setAbierto] = useState<number | null>(null);
  const items = x.visor?.items ?? [];
  // El catálogo cambia en vivo en el editor: un ítem que se oculta no deja el visor apuntando a la nada.
  const indice = abierto != null && abierto < items.length ? abierto : null;
  const radio = x.radio;
  const bloque: CSSProperties = {
    borderRadius: radio,
    padding: escritorio ? 18 : 16,
    boxSizing: "border-box",
    minWidth: 0,
    textDecoration: "none",
  };
  const porFila = escritorio ? 4 : 2;
  const altoChico = escritorio ? 150 : chico ? 96 : 116;

  // ── Los bloques ──

  const identidad = (
    <header key="identidad" style={{ ...bloque, background: "#ffffff", display: "flex", alignItems: "center", gap: 14 }}>
      <LogoNegocio logo={x.logo} p={p} lado={escritorio ? 68 : 58} radio={16} fondoIniciales={c.acento} letra={x.letra} />
      <div style={{ ...columna, gap: 3 }}>
        <Nombre
          x={x}
          tamano={tamanoNombre(p.nombre, escritorio ? 28 : 21)}
          style={{ lineHeight: 1.1, color: t.textoEncabezado }}
        />
        {rubroYDescripcion(p) && (
          <span style={{ fontSize: 13.5, lineHeight: 1.4, color: t.texto2Encabezado }}>{rubroYDescripcion(p)}</span>
        )}
      </div>
    </header>
  );

  const accionPrincipal = x.acciones.find((a) => a.principal);
  const principal = accionPrincipal && (
    <a
      key="principal"
      href={accionPrincipal.href}
      onClick={accionPrincipal.onClick}
      rel="noopener noreferrer"
      style={{
        ...bloque,
        background: k.principal.fondo,
        color: k.principal.texto,
        minHeight: 64,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: escritorio ? 18 : 17,
        fontWeight: 800,
      }}
    >
      <Trazo d={accionPrincipal.icono} color={k.principal.texto} size={22} ancho={2} />
      <span style={{ flex: 1, minWidth: 0 }}>{accionPrincipal.texto}</span>
      <Trazo d={FLECHA} color={k.principal.texto} size={22} ancho={2} />
    </a>
  );

  /** Un cuadrado con ícono arriba y nombre abajo: una red o un botón. */
  const cuadrado = (clave: string, href: string, onClick: (() => void) | undefined, icono: string, texto: string, colores: { fondo: string; texto: string }) => (
    <a
      key={clave}
      href={href}
      onClick={onClick}
      rel="noopener noreferrer"
      style={{
        ...bloque,
        background: colores.fondo,
        color: colores.texto,
        minHeight: altoChico,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1.25,
        overflowWrap: "anywhere",
      }}
    >
      <Trazo d={icono} color={colores.texto} size={28} />
      {texto}
    </a>
  );
  const cuadrados: ReactNode[] = [
    ...p.redes.map((r) => cuadrado(`red-${r.id}`, r.url, x.clic(r), iconoDe(r.tipo, r.icono), r.etiqueta, k.red)),
    ...x.acciones
      .filter((a) => !a.principal)
      .map((a) => cuadrado(a.clave, a.href, a.onClick, a.icono, a.texto, k.boton)),
  ];

  /** Un ítem del catálogo como bloque de foto: el grande con título y precio encima; el chico, con una etiqueta. */
  const bloqueItem = (it: ItemCatalogoPublico, i: number, grande: boolean, alto: number | string) => {
    const foto = urlDeImagen(it.fotoUrl);
    const precio = formatoPrecio(it.precio, it.precioDesde);
    // Los que no entran en la grilla se ven en el visor: el último chico lo avisa.
    const quedan = !grande && i === Math.min(items.length, 3) - 1 && items.length > 3 ? items.length : 0;
    return (
      <button
        key={`item-${it.id}`}
        type="button"
        aria-haspopup="dialog"
        aria-label={etiquetaItem(it, i, items.length)}
        onClick={() => setAbierto(i)}
        style={{
          position: "relative",
          minWidth: 0,
          height: alto,
          minHeight: altoChico,
          padding: 0,
          margin: 0,
          border: "none",
          borderRadius: radio,
          overflow: "hidden",
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
          background: t.sinFotoFondo,
          color: "#ffffff",
        }}
      >
        {foto ? (
          <img
            src={foto}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <span style={{ position: "absolute", inset: 0 }}>
            <SinFoto item={it} fondo={t.sinFotoFondo} color={t.sinFotoTexto} tamano={grande ? 72 : 40} />
          </span>
        )}
        {grande ? (
          // La capa crece con el texto: detrás de cada letra hay al menos la capa mínima (como en Vitrina).
          <span
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "40px 16px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              background: `linear-gradient(to top, rgba(0,0,0,0.72) 0%, ${rgbaCapa(k.capaFoto)} calc(100% - 40px), rgba(0,0,0,0) 100%)`,
            }}
          >
            <strong style={{ fontSize: escritorio ? 20 : 18, fontWeight: 800, lineHeight: 1.2 }}>{it.titulo}</strong>
            {precio && <span style={{ fontSize: 15, fontWeight: 700 }}>{precio}</span>}
          </span>
        ) : (
          // Una etiqueta blanca con el nombre y, abajo, el precio: en una sola línea "Desde Bs 38" no entra.
          <span
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              maxWidth: "calc(100% - 20px)",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              background: k.boton.fondo,
              color: t.precio,
              borderRadius: 10,
              padding: "4px 9px",
              fontSize: 12,
              lineHeight: 1.3,
            }}
          >
            <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.titulo}</span>
            {precio && <strong style={{ fontWeight: 800 }}>{precio}</strong>}
          </span>
        )}
        {quedan > 0 && (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: k.boton.fondo,
              color: k.boton.texto,
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Ver los {quedan}
          </span>
        )}
      </button>
    );
  };

  // ── El armado ──

  const grande = items[0];
  const chicos = items.slice(1, 3);
  let sueltos = cuadrados;
  let catalogo: ReactNode = null;
  if (grande) {
    const titulo = (
      <h2 key="titulo" style={soloLector}>
        {x.visor?.titulo}
      </h2>
    );
    const itemsChicos = chicos.map((it, i) => bloqueItem(it, i + 1, false, "100%"));
    if (escritorio) {
      // El grande a la izquierda y a la derecha un cuadro de 2×2 con los
      // cuadrados que haya (primero) y los ítems chicos: si sobran lugares,
      // los que hay se estiran.
      const derecha = [...cuadrados.slice(0, Math.max(0, 4 - itemsChicos.length)), ...itemsChicos];
      sueltos = cuadrados.slice(derecha.length - itemsChicos.length);
      const alto = 340;
      catalogo = (
        <section aria-label={x.visor?.titulo} style={{ position: "relative" }}>
          {titulo}
          <Fila alto={alto}>
            {[
              bloqueItem(grande, 0, true, alto),
              ...(derecha.length > 0
                ? [
                    <div key="derecha" style={{ ...columna, gap: ESPACIO, height: alto }}>
                      {enFilas(derecha, 2).map((fila, i) => (
                        <div
                          key={i}
                          data-fila-mosaico={fila.length}
                          style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${fila.length}, minmax(0, 1fr))`, gap: ESPACIO }}
                        >
                          {fila}
                        </div>
                      ))}
                    </div>,
                  ]
                : []),
            ]}
          </Fila>
        </section>
      );
    } else {
      catalogo = (
        <section aria-label={x.visor?.titulo} style={{ ...columna, position: "relative", gap: ESPACIO }}>
          {titulo}
          <Fila>{[bloqueItem(grande, 0, true, chico ? 220 : 300)]}</Fila>
          {itemsChicos.length > 0 && <Fila alto={altoChico + 24}>{itemsChicos}</Fila>}
        </section>
      );
    }
  }

  // Las sucursales y el anuncio, como bloques anchos: de a dos en computadora.
  const anchos: ReactNode[] = [
    ...x.tarjetasSucursal.map((s, i) => (
      // En grilla: la tarjeta se estira al alto de la fila, como su vecina.
      <div key={`sucursal-${i}`} style={{ display: "grid", minWidth: 0 }}>
        {s}
      </div>
    )),
    // También en grilla: junto a una sucursal, el anuncio se estira y es un bloque más, no una franja suelta.
    ...(x.anuncio ? [<div key="anuncio" style={{ display: "grid", minWidth: 0 }}>{x.anuncio}</div>] : []),
  ];

  return (
    <Raiz x={x}>
      <div
        style={{
          ...columna,
          gap: ESPACIO,
          maxWidth: escritorio ? 1040 : 520,
          margin: "0 auto",
          padding: escritorio ? "40px 32px 40px" : chico ? "14px 12px 20px" : "18px 14px 24px",
          boxSizing: "border-box",
        }}
      >
        <Fila>{[identidad]}</Fila>
        <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: ESPACIO }}>
          {principal && <Fila>{[principal]}</Fila>}
          {catalogo}
          <Filas bloques={sueltos} porFila={porFila} alto={altoChico} />
          {x.tarjetasSucursal.length > 0 && (
            <h2 style={soloLector}>{x.tituloSucursales}</h2>
          )}
          <Filas bloques={anchos} porFila={escritorio ? 2 : 1} />
          {x.pie}
        </Principal>
      </div>
      {indice != null && x.visor && (
        <VisorCatalogo
          items={items}
          indice={indice}
          onIndice={setAbierto}
          onCerrar={() => setAbierto(null)}
          c={x.visor.c}
          familia={x.visor.familia}
          escritorio={x.visor.escritorio}
          enMarco={x.visor.enMarco}
          accion={x.visor.accion}
          estiloBoton={x.visor.estiloBoton}
          colorIconoBoton={x.visor.colorIconoBoton}
        />
      )}
    </Raiz>
  );
}
