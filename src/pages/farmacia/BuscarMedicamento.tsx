import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Badge, Boton, Cargando, ErrorMsg, Modal, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { contiene, posicionDe } from "../../lib/texto";
import type { CondicionVenta, PaginaProductos, Producto } from "../../types";

/**
 * Buscar un medicamento: la pantalla que más veces por día se usa en una
 * farmacia. Alguien pregunta desde el otro lado del mostrador "¿tenés
 * algo para la acidez?" o "¿cuánto sale el omeprazol?", y esto tiene que
 * responder antes de que termine la frase.
 *
 * Tres decisiones que la separan de la pantalla de Artículos:
 *
 *  1. **Busca en el servidor** (`/productos/buscar`). Artículos se trae el
 *     catálogo entero y filtra en memoria: con 40 productos está perfecto, con
 *     2.000 no. Acá cada tecla es una consulta con límite.
 *  2. **Es de consulta, no de administración.** No se edita, no se borra, no se
 *     da de baja: se responde. Por eso la fila entera abre la ficha y no hay
 *     un solo botón peligroso en la pantalla.
 *  3. **Muestra lo agotado**, apagado pero visible. Esconderlo haría que el
 *     farmacéutico dijera "no tenemos" cuando la respuesta correcta es "hoy no
 *     tengo, te lo consigo" — que es una venta, y es de donde salen los
 *     encargos.
 */

/** Cuántos resultados por tanda. Entran en una pantalla sin scrollear mucho. */
const LIMITE = 20;

/** Lo que se espera a que deje de teclear antes de preguntarle al servidor. */
const ESPERA_MS = 250;

const CONDICION: Record<CondicionVenta, { texto: string; tono: "azul" | "amarillo" | "rojo" } | null> = {
  LIBRE: null,
  RECETA_MEDICA: { texto: "Receta", tono: "azul" },
  RECETA_ARCHIVADA: { texto: "Receta archivada", tono: "amarillo" },
  RECETA_VALORADA: { texto: "Receta valorada", tono: "rojo" },
};

export default function BuscarMedicamento() {
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState<PaginaProductos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [error, setError] = useState("");
  const [ficha, setFicha] = useState<Producto | null>(null);
  const [pista, setPista] = useState(false);

  const campo = useRef<HTMLInputElement>(null);
  /**
   * Número de la última búsqueda pedida. Las respuestas pueden llegar
   * desordenadas —"ome" tarda más que "omepra" y contestaría después—, así que
   * se descarta todo lo que no sea la última.
   */
  const pedido = useRef(0);

  const buscar = useCallback(async (texto: string) => {
    const mio = ++pedido.current;
    setCargando(true);
    setError("");
    try {
      const res = await api.buscarProductos({ q: texto, limite: LIMITE });
      if (pedido.current !== mio) return;
      setPagina(res);
    } catch (err) {
      if (pedido.current !== mio) return;
      setError(err instanceof Error ? err.message : "No se pudo buscar");
      setPagina(null);
    } finally {
      if (pedido.current === mio) setCargando(false);
    }
  }, []);

  // Al entrar, el foco va al campo: el lector del mostrador escribe como un
  // teclado, así que con la pantalla abierta alcanza con pasar el código.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void buscar(q), ESPERA_MS);
    return () => clearTimeout(id);
  }, [q, buscar]);

  async function traerMas() {
    if (!pagina || trayendoMas) return;
    setTrayendoMas(true);
    try {
      const res = await api.buscarProductos({
        q,
        limite: LIMITE,
        offset: pagina.items.length,
      });
      setPagina({ ...res, items: [...pagina.items, ...res.items] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo traer más");
    } finally {
      setTrayendoMas(false);
    }
  }

  const items = pagina?.items ?? [];
  const hayMas = pagina ? items.length < pagina.total : false;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <header>
        <h1 className="text-xl font-bold text-texto">Buscar medicamento</h1>
        <p className="text-[13px] text-texto-3">
          Por nombre, droga, laboratorio o código de barras
        </p>
      </header>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-4">
            <Icon name="search" size={20} />
          </span>
          <input
            ref={campo}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Paracetamol, BAGÓ, 7501…"
            // El campo es más grande que el de otras pantallas a propósito: es
            // la única entrada de esta, y se usa sin levantar la vista.
            className="w-full rounded-2xl border border-borde bg-white py-3.5 pl-12 pr-10 text-base outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                campo.current?.focus();
              }}
              aria-label="Limpiar"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-texto-4 hover:bg-muted hover:text-texto-2"
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
        <Boton
          variante="ghost"
          icono="barcode"
          onClick={() => {
            campo.current?.focus();
            setPista(true);
          }}
        >
          Escanear
        </Boton>
      </div>

      {pista && (
        <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
          Pasá el producto por el lector: escribe solo, como un teclado. El campo ya
          está listo para recibirlo.
        </p>
      )}

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && !pagina ? (
        <Cargando texto="Buscando…" />
      ) : items.length === 0 ? (
        <div className="card">
          <Vacio
            icono="search"
            titulo={q ? `No hay nada con "${q}"` : "El catálogo está vacío"}
            texto={
              q
                ? "Probá con la droga en vez de la marca, o con menos letras."
                : "Cargá el primer medicamento desde el catálogo."
            }
          />
        </div>
      ) : (
        <>
          <p className="text-[13px] text-texto-3">
            {pagina && items.length < pagina.total
              ? `${items.length} de ${pagina.total}`
              : `${items.length} ${items.length === 1 ? "resultado" : "resultados"}`}
          </p>

          <ul className="divide-y divide-borde-soft overflow-hidden rounded-2xl border border-borde bg-white">
            {items.map((p) => (
              <Fila key={p.id} producto={p} q={q} onFicha={() => setFicha(p)} />
            ))}
          </ul>

          {hayMas && (
            <div className="flex justify-center">
              <Boton variante="ghost" onClick={traerMas} disabled={trayendoMas}>
                {trayendoMas ? "Trayendo…" : "Ver más"}
              </Boton>
            </div>
          )}
        </>
      )}

      {ficha && <FichaMedicamento producto={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}

/** Una fila de resultado: lo que hay que leer de un vistazo, y nada más. */
function Fila({
  producto: p,
  q,
  onFicha,
}: {
  producto: Producto;
  q: string;
  onFicha: () => void;
}) {
  const condicion = CONDICION[p.condicionVenta];
  const agotado = p.stockTotal <= 0;
  const bajo = !agotado && p.stockTotal <= p.stockMinimo;
  const detalle = [p.principioActivo, p.laboratorio, p.formaFarmaceutica]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <button
        onClick={onFicha}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted ${
          agotado ? "opacity-60" : ""
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-bold text-texto">
              <Resaltado texto={p.nombre} q={q} />
              {/* Casi todos los nombres comerciales ya la traen ("Paracetamol
                  500 mg"): repetirla al lado quedaba como un error de dedo. */}
              {p.concentracion && !contiene(p.nombre, p.concentracion) && (
                <span className="ml-1.5 font-semibold text-texto-2">{p.concentracion}</span>
              )}
            </span>
            {condicion && <Badge tono={condicion.tono}>{condicion.texto}</Badge>}
            {p.controlado && <Badge tono="rojo">Controlado</Badge>}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-texto-3">
            {detalle ? <Resaltado texto={detalle} q={q} /> : "Sin ficha cargada"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-bold text-texto">
            {fmtMoney(p.precio)}
          </span>
          <span
            className={`flex items-center justify-end gap-1.5 text-[13px] ${
              agotado ? "text-danger-text" : bajo ? "text-warning-text" : "text-texto-3"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${
                agotado ? "bg-danger" : bajo ? "bg-warning" : "bg-primary"
              }`}
            />
            {agotado ? "Agotado" : `${fmtNum(p.stockTotal)} u.`}
          </span>
        </span>

        <Icon name="chevronRight" size={17} color="#94A3B8" />
      </button>
    </li>
  );
}

/** Marca en negrita la parte que coincide con lo tecleado. */
function Resaltado({ texto, q }: { texto: string; q: string }) {
  const rango = posicionDe(texto, q);
  if (!rango) return <>{texto}</>;
  const [desde, hasta] = rango;
  return (
    <>
      {texto.slice(0, desde)}
      <mark className="rounded bg-primary-100 px-0.5 text-texto">
        {texto.slice(desde, hasta)}
      </mark>
      {texto.slice(hasta)}
    </>
  );
}

/**
 * La ficha: lo que hace falta para responderle a quien está esperando. Sin
 * botones de edición — para eso está el catálogo, y quien atiende no debería
 * poder cambiar un precio con el cliente enfrente.
 */
function FichaMedicamento({
  producto: p,
  onClose,
}: {
  producto: Producto;
  onClose: () => void;
}) {
  const condicion = CONDICION[p.condicionVenta];

  return (
    <Modal
      abierto
      titulo={p.nombre}
      subtitulo={
        p.concentracion && !contiene(p.nombre, p.concentracion)
          ? p.concentracion
          : (p.principioActivo ?? undefined)
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {condicion ? (
            <Badge tono={condicion.tono}>{condicion.texto}</Badge>
          ) : (
            <Badge tono="gris">Venta libre</Badge>
          )}
          {p.controlado && <Badge tono="rojo">Controlado</Badge>}
          {p.manejaLote && <Badge tono="gris">Por lote</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Dato label="Precio" valor={fmtMoney(p.precio)} />
          <Dato
            label="Stock"
            valor={
              p.stockTotal > 0
                ? `${fmtNum(p.stockTotal)} ${p.unidadMedida?.nombre ?? ""}`
                : "Agotado"
            }
          />
          <Dato label="Principio activo" valor={p.principioActivo || "—"} />
          <Dato label="Laboratorio" valor={p.laboratorio || "—"} />
          <Dato label="Forma" valor={p.formaFarmaceutica || "—"} />
          <Dato label="Categoría" valor={p.categoria?.nombre ?? "—"} />
          <Dato label="Registro sanitario" valor={p.registroSanitario || "—"} />
          <Dato label="Código de barras" valor={p.codBarra || "—"} />
        </div>

        {p.controlado && (
          <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
            <strong>Medicamento controlado.</strong> Se dispensa con la receta que
            corresponde y queda asentado en el libro.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-texto">{valor}</dd>
    </div>
  );
}
