import IconoProducto from "../../components/IconoProducto";
import { filasFotos, precioTv, simboloMoneda, type BloqueLista, type PaginaMenu, type PlatoTv } from "../../lib/menuDigital/paginar";
import { coloresMenu } from "../../lib/menuDigital/colores";
import { TEXTO_ETIQUETA, type PantallaMenu } from "../../types/menuDigital";

/**
 * Una TV del menú digital: el título, los platos de la página que toca y la
 * cinta de abajo, sobre el lienzo fijo de 1600 × 900 de las TVs (LienzoTv,
 * como la de tickets): lo que se ve en el editor es lo que ve el local.
 *
 * Nombre y precio son los de Inventario. Un plato agotado sale tachado (o no
 * sale, si la TV lo pide así). No importa nada de la app: la usa también la
 * TV pública, sin sesión.
 */

export interface DatosTableroMenu {
  negocio: string;
  moneda?: string;
  pantalla: PantallaMenu;
  /** Ruta de la imagen ya armada (foto o logo) → URL para el <img>. */
  url: (ruta: string) => string;
  logo: string | null;
}

/** Las letras de cada tamaño (A- / A / A+). */
const LETRA = {
  s: { nombre: 22, precio: 34, desc: 15, lista: 24 },
  m: { nombre: 27, precio: 40, desc: 17, lista: 28 },
  l: { nombre: 32, precio: 48, desc: 19, lista: 33 },
} as const;

export function TableroMenu({
  datos,
  pagina,
  paginaActual,
  totalPaginas,
}: {
  datos: DatosTableroMenu;
  pagina: PaginaMenu;
  paginaActual: number;
  totalPaginas: number;
}) {
  const { pantalla } = datos;
  const c = coloresMenu(pantalla);
  return (
    <div
      className="flex flex-col"
      style={{ width: 1600, height: 900, padding: "36px 56px 28px", background: c.fondo, color: c.texto }}
    >
      <header className="flex shrink-0 items-start justify-between" style={{ height: 112, gap: 32 }}>
        <div className="min-w-0">
          <h1 className="truncate font-black" style={{ fontSize: 60, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            {pantalla.titulo || datos.negocio}
          </h1>
          {pantalla.subtitulo && (
            <p className="truncate" style={{ fontSize: 26, opacity: 0.82, marginTop: 6 }}>
              {pantalla.subtitulo}
            </p>
          )}
        </div>
        {pantalla.logo && datos.logo && (
          // Tal cual lo subió el dueño, sin recuadro (Kevin, 31-oct): el
          // marco blanco se leía como un borde alrededor de los logos que ya
          // traen su propio fondo, como el negro de la pollería.
          <img
            src={datos.url(datos.logo)}
            alt={datos.negocio}
            className="shrink-0"
            style={{ maxHeight: 104, maxWidth: 280, objectFit: "contain" }}
          />
        )}
      </header>

      <main className="min-h-0 flex-1" style={{ marginTop: 18 }}>
        {pagina.diseno === "fotos" && <GrillaFotos platos={pagina.platos} datos={datos} c={c} />}
        {pagina.diseno === "lista" && (
          <div className="grid h-full grid-cols-2" style={{ gap: 64 }}>
            {[0, 1].map((i) => (
              <ColumnaLista key={i} bloques={pagina.columnas[i] ?? []} datos={datos} c={c} />
            ))}
          </div>
        )}
        {pagina.diseno === "destacado" && (
          <div className="flex h-full" style={{ gap: 48 }}>
            <Heroe plato={pagina.heroe} datos={datos} c={c} />
            <div className="min-w-0 flex-1">
              <ColumnaLista bloques={pagina.columna} datos={datos} c={c} />
            </div>
          </div>
        )}
      </main>

      <footer
        className="flex shrink-0 items-center justify-between"
        style={{ height: 52, marginTop: 14, borderTop: `2px solid ${c.borde}`, gap: 24 }}
      >
        <p className="truncate" style={{ fontSize: 22, opacity: 0.9 }}>
          {pantalla.cinta}
        </p>
        {totalPaginas > 1 && (
          <div className="flex shrink-0" style={{ gap: 10 }}>
            {Array.from({ length: totalPaginas }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: i === paginaActual ? c.acento : c.borde,
                }}
              />
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}

type Colores = ReturnType<typeof coloresMenu>;

function Precio({ valor, moneda, tam, c, tachado }: { valor: number; moneda?: string; tam: number; c: Colores; tachado?: boolean }) {
  return (
    <span className="shrink-0 whitespace-nowrap font-black tabular-nums" style={{ color: c.acento, lineHeight: 1, textDecoration: tachado ? "line-through" : undefined }}>
      <span style={{ fontSize: Math.round(tam * 0.42), verticalAlign: "top", marginRight: 3 }}>{simboloMoneda(moneda)}</span>
      <span style={{ fontSize: tam }}>{precioTv(valor)}</span>
    </span>
  );
}

function Etiqueta({ texto, c }: { texto: string; c: Colores }) {
  return (
    <span
      className="font-extrabold uppercase"
      style={{ background: c.acento, color: c.sobreAcento, fontSize: 13, letterSpacing: "0.08em", borderRadius: 999, padding: "4px 12px" }}
    >
      {texto}
    </span>
  );
}

/** La foto del plato o, sin foto, su ícono sobre un brillo del color del tema. */
function Imagen({ plato, datos, c, alto, lado }: { plato: PlatoTv; datos: DatosTableroMenu; c: Colores; alto: number; lado: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden"
      style={{ height: alto, background: `radial-gradient(circle at 50% 55%, ${c.acento}40, transparent 70%)` }}
    >
      {plato.foto ? (
        <img
          src={datos.url(plato.foto)}
          alt=""
          className="h-full w-full object-cover"
          style={{ filter: plato.agotado ? "grayscale(1) opacity(0.55)" : undefined }}
        />
      ) : (
        <span style={{ opacity: plato.agotado ? 0.4 : 1 }}>
          <IconoProducto nombre={plato.nombre} icono={plato.icono} size={lado} />
        </span>
      )}
    </div>
  );
}

function GrillaFotos({ platos, datos, c }: { platos: PlatoTv[]; datos: DatosTableroMenu; c: Colores }) {
  const p = datos.pantalla;
  const filas = filasFotos(p.tamano, p.fotos);
  // 640 = los 900 del lienzo menos márgenes, título y cinta.
  const altoTarjeta = Math.floor((640 - (filas - 1) * 22) / filas);
  const altoImagen = p.fotos ? Math.round(altoTarjeta * (filas === 3 ? 0.5 : 0.58)) : 0;
  const letra = LETRA[p.tamano];
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${p.columnas}, minmax(0, 1fr))`, gridAutoRows: altoTarjeta, gap: 22 }}
    >
      {platos.map((x) => (
        <article
          key={x.id}
          className="relative flex flex-col overflow-hidden"
          style={{ background: c.tarjeta, border: `1.5px solid ${c.borde}`, borderRadius: 22 }}
        >
          {p.fotos && <Imagen plato={x} datos={datos} c={c} alto={altoImagen} lado={Math.round(altoImagen * 0.72)} />}
          {(p.etiquetas && x.etiqueta) || x.agotado ? (
            <div className="absolute flex" style={{ top: 12, left: 12, gap: 6 }}>
              {x.agotado ? <Etiqueta texto="Agotado" c={{ ...c, acento: "#111111", sobreAcento: "#FFFFFF" }} /> : null}
              {!x.agotado && p.etiquetas && x.etiqueta ? <Etiqueta texto={TEXTO_ETIQUETA[x.etiqueta]} c={c} /> : null}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col" style={{ padding: "12px 18px 14px", opacity: x.agotado ? 0.55 : 1 }}>
            <div className="flex items-start justify-between" style={{ gap: 10 }}>
              <h3
                className="min-w-0 font-extrabold"
                style={{ fontSize: letra.nombre, lineHeight: 1.12, textDecoration: x.agotado ? "line-through" : undefined }}
              >
                {x.nombre}
              </h3>
              <Precio valor={x.precio} moneda={datos.moneda} tam={letra.precio} c={c} tachado={x.agotado} />
            </div>
            {p.descripciones && x.descripcion && (
              <p className="overflow-hidden" style={{ fontSize: letra.desc, lineHeight: 1.3, opacity: 0.8, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {x.descripcion}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function ColumnaLista({ bloques, datos, c }: { bloques: BloqueLista[]; datos: DatosTableroMenu; c: Colores }) {
  const p = datos.pantalla;
  const letra = LETRA[p.tamano];
  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      {bloques.map((b, i) => (
        <section key={`${b.categoria}-${i}`}>
          <h2
            className="font-extrabold uppercase"
            style={{ color: c.acento, fontSize: 22, letterSpacing: "0.2em", borderBottom: `2px solid ${c.borde}`, paddingBottom: 6, marginBottom: 8 }}
          >
            {b.categoria}
          </h2>
          <ul className="flex flex-col" style={{ gap: 8 }}>
            {b.platos.map((x) => (
              <li key={x.id} style={{ opacity: x.agotado ? 0.55 : 1 }}>
                <div className="flex items-end" style={{ gap: 12 }}>
                  <span className="truncate font-bold" style={{ fontSize: letra.lista, textDecoration: x.agotado ? "line-through" : undefined }}>
                    {x.nombre}
                  </span>
                  {p.etiquetas && x.etiqueta && !x.agotado && <Etiqueta texto={TEXTO_ETIQUETA[x.etiqueta]} c={c} />}
                  <span className="min-w-6 flex-1" style={{ borderBottom: `2px dotted ${c.borde}`, marginBottom: 8 }} />
                  {x.agotado ? (
                    <span className="shrink-0 font-extrabold uppercase" style={{ fontSize: Math.round(letra.lista * 0.85), letterSpacing: "0.14em", opacity: 0.85 }}>
                      Agotado
                    </span>
                  ) : (
                    <Precio valor={x.precio} moneda={datos.moneda} tam={Math.round(letra.lista * 1.15)} c={c} />
                  )}
                </div>
                {p.descripciones && x.descripcion && (
                  <p className="truncate" style={{ fontSize: Math.round(letra.desc * 0.95), opacity: 0.75 }}>
                    {x.descripcion}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Heroe({ plato, datos, c }: { plato: PlatoTv | null; datos: DatosTableroMenu; c: Colores }) {
  const p = datos.pantalla;
  if (!plato) return <div style={{ width: 600 }} />;
  return (
    <article
      className="relative flex shrink-0 flex-col overflow-hidden"
      style={{ width: 600, background: c.tarjeta, border: `1.5px solid ${c.borde}`, borderRadius: 28 }}
    >
      <Imagen plato={plato} datos={datos} c={c} alto={p.fotos ? 400 : 260} lado={p.fotos ? 300 : 200} />
      {p.etiquetas && plato.etiqueta && !plato.agotado && (
        <div className="absolute" style={{ top: 16, left: 16 }}>
          <Etiqueta texto={TEXTO_ETIQUETA[plato.etiqueta]} c={c} />
        </div>
      )}
      <div className="flex flex-1 flex-col justify-center text-center" style={{ padding: "18px 28px", opacity: plato.agotado ? 0.55 : 1 }}>
        <h3 className="font-black" style={{ fontSize: 40, lineHeight: 1.1, textDecoration: plato.agotado ? "line-through" : undefined }}>
          {plato.nombre}
        </h3>
        {p.descripciones && plato.descripcion && (
          <p style={{ fontSize: 22, opacity: 0.82, marginTop: 8 }}>{plato.descripcion}</p>
        )}
        <div style={{ marginTop: 14 }}>
          {plato.agotado ? (
            <span className="font-extrabold uppercase" style={{ fontSize: 40, letterSpacing: "0.14em" }}>
              Agotado
            </span>
          ) : (
            <Precio valor={plato.precio} moneda={datos.moneda} tam={92} c={c} />
          )}
        </div>
      </div>
    </article>
  );
}
