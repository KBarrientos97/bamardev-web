import { useRef, useState } from "react";
import { Badge, Boton, Cargando, ErrorMsg, Modal, Vacio } from "../../components/ui";
import { fmtMoney, fmtNum } from "../../lib/format";
import type { Producto } from "../../types";
import CampoBusqueda from "./CampoBusqueda";
import { CONDICION, concentracionAparte, detalleDe } from "./medicamento";
import { ChipsCondicion, Resaltado } from "./piezas";
import { useBusquedaProductos } from "./useBusquedaProductos";

/**
 * Buscar un medicamento: la pantalla que más veces por día se usa en una
 * farmacia. Alguien pregunta desde el otro lado del mostrador "¿tenés algo
 * para la acidez?" o "¿cuánto sale el omeprazol?", y esto tiene que responder
 * antes de que termine la frase.
 *
 * Tres decisiones que la separan de la pantalla de Artículos:
 *
 *  1. **Busca en el servidor**. Artículos se trae el catálogo entero y filtra
 *     en memoria: con 40 productos está perfecto, con 2.000 no.
 *  2. **Es de consulta, no de administración.** No se edita, no se borra, no se
 *     da de baja: se responde. Por eso la fila entera abre la ficha y no hay
 *     un solo botón peligroso en la pantalla.
 *  3. **Muestra lo agotado**, apagado pero visible. Esconderlo haría que el
 *     farmacéutico dijera "no tenemos" cuando la respuesta correcta es "hoy no
 *     tengo, te lo consigo" — que es una venta, y es de donde salen los
 *     encargos.
 */
export default function BuscarMedicamento() {
  const [q, setQ] = useState("");
  const [ficha, setFicha] = useState<Producto | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const busqueda = useBusquedaProductos({ q });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <header>
        <h1 className="text-xl font-bold text-texto">Buscar medicamento</h1>
        <p className="text-[13px] text-texto-3">
          Por nombre, droga, laboratorio o código de barras
        </p>
      </header>

      <CampoBusqueda ref={campo} valor={q} onChange={setQ} />

      <ErrorMsg>{busqueda.error}</ErrorMsg>

      {busqueda.cargando && busqueda.items.length === 0 ? (
        <Cargando texto="Buscando…" />
      ) : busqueda.items.length === 0 ? (
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
            {busqueda.items.length < busqueda.total
              ? `${busqueda.items.length} de ${busqueda.total}`
              : `${busqueda.items.length} ${
                  busqueda.items.length === 1 ? "resultado" : "resultados"
                }`}
          </p>

          <ul className="divide-y divide-borde-soft overflow-hidden rounded-2xl border border-borde bg-white">
            {busqueda.items.map((p) => (
              <Fila key={p.id} producto={p} q={q} onFicha={() => setFicha(p)} />
            ))}
          </ul>

          {busqueda.hayMas && (
            <div className="flex justify-center">
              <Boton
                variante="ghost"
                onClick={busqueda.traerMas}
                disabled={busqueda.trayendoMas}
              >
                {busqueda.trayendoMas ? "Trayendo…" : "Ver más"}
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
  const agotado = p.stockTotal <= 0;
  const bajo = !agotado && p.stockTotal <= p.stockMinimo;
  const detalle = detalleDe(p);
  const concentracion = concentracionAparte(p);

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
              {concentracion && (
                <span className="ml-1.5 font-semibold text-texto-2">{concentracion}</span>
              )}
            </span>
            <ChipsCondicion producto={p} />
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-texto-3">
            {detalle ? <Resaltado texto={detalle} q={q} /> : "Sin ficha cargada"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-bold text-texto">{fmtMoney(p.precio)}</span>
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
      </button>
    </li>
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
  return (
    <Modal
      abierto
      titulo={p.nombre}
      subtitulo={concentracionAparte(p) ?? p.principioActivo ?? undefined}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {CONDICION[p.condicionVenta] ? (
            <ChipsCondicion producto={p} largo />
          ) : (
            <>
              <Badge tono="gris">Venta libre</Badge>
              <ChipsCondicion producto={p} largo />
            </>
          )}
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
