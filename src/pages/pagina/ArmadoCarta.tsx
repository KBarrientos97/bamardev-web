import type { CSSProperties } from "react";
import { ICONO_RED } from "../../lib/pagina/aspecto";
import { CARTA } from "../../lib/pagina/estilosPagina";
import { urlTelefono } from "../../lib/pagina/vista";
import { EstadoSucursal } from "./HorarioSucursal";
import { columna, enFilas, Nombre, Raiz, tamanoNombre, type AccionPagina, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina, Trazo } from "./piezasPagina";

/**
 * Carta (IDEAS/5 §4.3, maqueta del 09-oct): pensada para mostrar productos
 * con precio, como el menú de un restaurante. Arriba una banda compacta (la
 * portada o el color), el logo cuadrado con el nombre al lado y el cartel
 * "Abierto · cierra 23:00" de la sucursal principal; las acciones como
 * mosaicos (ícono arriba, texto abajo) y el catálogo como lista de menú. En
 * computadora, la carta ancha a la izquierda y a la derecha un panel con el
 * logo, el botón grande, los mosaicos y las sucursales.
 *
 * Sin catálogo pierde lo principal: queda una sola columna con las acciones y
 * las sucursales, sin la mitad de la pantalla vacía.
 */

/** Un mosaico de acción: con la forma de los botones elegida, pero con el radio de las tarjetas (una píldora alta no se lee como botón). */
function MosaicoAccion({ a, x }: { a: AccionPagina; x: PiezasArmado }) {
  const pieza = a.principal ? x.b.principal : x.b.secundario;
  return (
    <a
      href={a.href}
      onClick={a.onClick}
      rel="noopener noreferrer"
      style={{
        ...pieza.estilo,
        borderRadius: x.radio,
        minWidth: 0,
        minHeight: 84,
        boxSizing: "border-box",
        padding: "12px 6px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        textAlign: "center",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.25,
        overflowWrap: "anywhere",
      }}
    >
      <Trazo d={a.icono} color={pieza.icono} size={22} />
      {a.texto}
    </a>
  );
}

/** Los mosaicos en filas parejas de a `porFila` (4 de a 3 = 2 y 2): ninguna fila con un hueco. */
function Mosaicos({ acciones, porFila, x }: { acciones: AccionPagina[]; porFila: number; x: PiezasArmado }) {
  if (acciones.length === 0) return null;
  return (
    <div style={{ ...columna, gap: 10 }}>
      {enFilas(acciones, porFila).map((fila) => (
        <div
          key={fila[0].clave}
          data-fila-mosaicos={fila.length}
          style={{ display: "grid", gridTemplateColumns: `repeat(${fila.length}, minmax(0, 1fr))`, gap: 10 }}
        >
          {fila.map((a) => (
            <MosaicoAccion key={a.clave} a={a} x={x} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ArmadoCarta(x: PiezasArmado) {
  const { p, c, t, escritorio, chico, Principal } = x;
  const hayMenu = !!x.catalogo;
  const dosColumnas = escritorio && hayMenu;
  const altoBanda = escritorio ? 170 : chico ? 96 : 120;
  const sucursal = p.sucursales[0];
  const principal = x.acciones.filter((a) => a.principal);
  const secundarias = x.acciones.filter((a) => !a.principal);
  // Llamar y Cómo llegar a la sucursal principal (el backend la manda primera).
  const deLaSucursal: AccionPagina[] = [
    sucursal?.telefono && { clave: "llamar", texto: "Llamar", icono: ICONO_RED.TELEFONO, href: urlTelefono(sucursal.telefono), principal: false },
    sucursal?.mapaUrl && { clave: "como-llegar", texto: "Cómo llegar", icono: ICONO_RED.MAPS, href: sucursal.mapaUrl, principal: false },
  ].filter(Boolean) as AccionPagina[];

  const banda = x.portada ? (
    <img
      src={x.portada}
      alt=""
      width={1600}
      height={400}
      decoding="async"
      fetchPriority={x.prioridad ? "high" : undefined}
      style={{ width: "100%", height: altoBanda, objectFit: "cover", display: "block" }}
    />
  ) : (
    // Sin foto, una banda del color con rayas suaves (como la portada vacía del Clásico).
    <div
      aria-hidden="true"
      style={{
        height: altoBanda,
        backgroundColor: c.acento,
        backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,0.08) 0 14px,rgba(255,255,255,0) 14px 28px)",
      }}
    />
  );

  const ladoLogo = escritorio ? 76 : chico ? 60 : 68;
  const logo = (
    <LogoNegocio
      logo={x.logo}
      p={p}
      lado={ladoLogo}
      radio={16}
      fondoIniciales={c.acento}
      letra={x.letra}
      estilo={{ border: `4px solid ${t.fondo}`, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", background: "#ffffff" }}
    />
  );
  const estado = sucursal ? <EstadoSucursal tramos={sucursal.horarioSemanal} t={t} testId="estado-encabezado" /> : null;
  const datos = (tamano: number) => (
    <div style={{ ...columna, gap: 4, alignItems: "flex-start" }}>
      <Nombre x={x} tamano={tamanoNombre(p.nombre, tamano)} style={{ lineHeight: 1.1, color: t.textoEncabezado }} />
      {p.rubro && <span style={{ fontSize: 13, fontWeight: 500, color: t.texto3 }}>{p.rubro}</span>}
      {estado && <div style={{ marginTop: 4 }}>{estado}</div>}
    </div>
  );
  const descripcion = p.descripcion && (
    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.45, color: t.texto2Encabezado }}>{p.descripcion}</p>
  );
  const redes = <RedesPagina redes={p.redes} variante="plano" trazo={t.redTrazo} centradas={false} clic={x.clic} />;

  if (dosColumnas) {
    // El panel de la derecha queda fijo mientras se baja por la carta, salvo
    // que sea más alto que la pantalla (muchas sucursales): ahí se cortaría.
    const fijo = p.sucursales.length <= 1;
    const panel: CSSProperties = {
      ...columna,
      gap: 14,
      marginTop: -48,
      position: fijo ? "sticky" : "relative",
      top: fijo ? 24 : undefined,
      alignSelf: "start",
    };
    return (
      <Raiz x={x}>
        {banda}
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 40px",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 360px",
            gap: 48,
            alignItems: "start",
          }}
        >
          <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: 16, padding: "28px 0 40px" }}>
            <header style={{ ...columna, gap: 10 }}>
              {datos(36)}
              {descripcion}
              {redes}
            </header>
            {x.anuncio}
            {x.catalogo}
            {x.pie}
          </Principal>
          <aside aria-label="Contacto" style={panel}>
            <div
              style={{
                ...columna,
                gap: 14,
                background: "#ffffff",
                border: `1px solid ${CARTA.borde}`,
                borderRadius: 18,
                boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
                padding: 18,
              }}
            >
              <div style={{ display: "flex", justifyContent: "center" }}>{logo}</div>
              {x.principal}
              <Mosaicos acciones={[...deLaSucursal, ...secundarias]} porFila={2} x={x} />
            </div>
            {x.sucursales}
          </aside>
        </div>
      </Raiz>
    );
  }

  return (
    <Raiz x={x}>
      {banda}
      <div
        style={{
          ...columna,
          gap: 14,
          maxWidth: escritorio ? 720 : 520,
          margin: "0 auto",
          padding: escritorio ? "0 32px" : "0 18px",
        }}
      >
        <header style={{ ...columna, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ marginTop: -Math.round(ladoLogo * 0.45) }}>{logo}</div>
            <div style={{ minWidth: 0, paddingTop: 10 }}>{datos(escritorio ? 30 : 22)}</div>
          </div>
          {descripcion}
          {redes}
        </header>
        <Principal aria-label={x.etiquetaPrincipal} style={{ ...columna, gap: 14, paddingBottom: escritorio ? 40 : 24 }}>
          <Mosaicos acciones={[...principal, ...deLaSucursal, ...secundarias]} porFila={3} x={x} />
          {x.anuncio}
          {x.catalogo}
          {x.sucursales}
          {x.pie}
        </Principal>
      </div>
    </Raiz>
  );
}
