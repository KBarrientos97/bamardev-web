import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/Icon";
import { Chips, EncabezadoPagina } from "../../../components/filtros";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Vacio,
  useAviso,
} from "../../../components/ui";
import { api } from "../../../lib/api";
import { fmtCantidad, fmtFechaHora } from "../../../lib/format";
import { ofreceAprobarMovimiento } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import CampoBusqueda from "../CampoBusqueda";
import { avisoVidaUtil, mesAIso, tecleoMes } from "../mercaderia";
import {
  MOTIVOS_TOMA,
  articulosDelConteo,
  borrarBorrador,
  cantidadContada,
  descripcionDelAjuste,
  detallesDelAjuste,
  diferenciasDe,
  etiquetaDiferencia,
  guardarBorrador,
  leerBorrador,
  pedirToma,
  resumenDelConteo,
  tipoDiferencia,
  type Conteo,
  type ConteoArticulo,
  type ItemToma,
  type LoteNuevo,
} from "./toma";

/** Artículos por tanda. Es el `limite` por defecto del backend. */
const POR_TANDA = 50;

/** "1 artículo", "3 artículos". */
function plural(n: number, singular: string, plural: string): string {
  return `${fmtCantidad(n)} ${n === 1 ? singular : plural}`;
}

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}

/**
 * "31/03/2027" desde "2027-03-31", partiendo el texto y no con `Date`: un
 * ISO sin hora se interpreta en UTC y en Bolivia (UTC−4) `fmtFecha` lo
 * corría al día anterior. Un lote que vence el 1 se veía venciendo el 31.
 */
function venceTexto(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "sin fecha";
}

/** `true` si la entrada tiene algo tecleado, aunque no sea una cantidad válida. */
function tieneAlgo(c: ConteoArticulo): boolean {
  if ((c.total ?? "").trim()) return true;
  if (Object.values(c.lotes ?? {}).some((v) => v.trim())) return true;
  return (c.nuevos ?? []).length > 0;
}

/**
 * Toma de inventario de la farmacia: contar lo que hay en el estante de UNA
 * sucursal, lote por lote, ver qué no cuadra con el sistema y aplicar el
 * AJUSTE con un motivo.
 *
 * Es lo que toda farmacia hace una vez al mes y hasta el 11-nov no existía:
 * el formulario de AJUSTE de siempre fija el total de un producto y no sabe
 * de lotes, así que con dos partidas del mismo remedio fijar el total en lo
 * contado de una sola borraba la otra. Acá cada lote tiene su "Contado" y el
 * backend (`ajustarPorLote`) fija cada partida en lo que se contó.
 *
 * Se usa con el celular o la tablet en la mano, delante del estante: el
 * lector de código de barras escribe en el buscador y con Enter el foco cae
 * en el "Contado" del artículo; Enter ahí vuelve al buscador para el próximo.
 * El conteo se guarda como borrador en el dispositivo (por sucursal) para
 * seguir mañana o después de un F5. Nada toca el inventario hasta aplicar.
 *
 * Las reglas del AJUSTE que viaja están en `toma.ts`.
 */
export default function TomaInventario() {
  const { usuario, incluye } = useAuth();
  const suc = useSucursales({ incluirDepositos: true });
  // El extra "Aprobar movimientos" (doble control, se vende aparte): quien
  // cuenta sólo guarda y otro aprueba desde Movimientos. La misma regla que
  // el ingreso y la transferencia de mercadería (`FormTransferencia`).
  const dobleControl = incluye("aprobacion_inventario");
  const puedeAprobar = !dobleControl && ofreceAprobarMovimiento(usuario, "AJUSTE");

  // ── La sucursal: una sola, y hay que elegirla ──
  // Quien está atado a una sucursal cuenta la suya. Con varias y "Varios
  // almacenes" prendido se elige a mano, sin "Todas": contar es físico y se
  // hace en un local a la vez. Con un solo local, ese.
  const [elegida, setElegida] = useState<number | null>(null);
  const atada = usuario?.sucursalId ?? null;
  const almacenId = atada ?? (suc.elegir ? elegida : (suc.sugerida?.id ?? null));
  const nombreSucursal =
    atada != null
      ? (usuario?.sucursal ?? "")
      : (suc.sucursales.find((a) => a.id === almacenId)?.nombre ?? "");

  // ── Filtros ──
  const categorias = useApi(() => api.getCategorias(false), []);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const chipsCategoria = useMemo(
    () => [
      ["", "Todas"] as const,
      ...(categorias.datos ?? [])
        .filter((c) => c.activo !== false)
        .map((c) => [String(c.id), c.nombre] as const),
    ],
    [categorias.datos],
  );

  const [q, setQ] = useState("");
  const [qAplicada, setQAplicada] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  // Se busca cuando se deja de teclear, no en cada letra: el lector escribe
  // trece dígitos de un tirón y eran trece pedidos al backend. Borrar el
  // campo vuelve a la lista entera sin esperar.
  useEffect(() => {
    const texto = q.trim();
    if (!texto) {
      setQAplicada("");
      return;
    }
    const t = setTimeout(() => setQAplicada(texto), 300);
    return () => clearTimeout(t);
  }, [q]);

  // ── La lista del estante ──
  const [items, setItems] = useState<ItemToma[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [errorLista, setErrorLista] = useState("");
  /** Sube con cada pedido: una respuesta de un pedido viejo se descarta. */
  const vuelta = useRef(0);
  /** Qué se pidió por última vez, para que el efecto no repita lo que Enter ya pidió. */
  const pedida = useRef("");
  useEffect(() => () => {
    vuelta.current++;
  }, []);

  const claveDe = useCallback(
    (texto: string) => `${almacenId ?? ""}|${categoriaId ?? ""}|${texto}`,
    [almacenId, categoriaId],
  );

  const cargar = useCallback(
    async (opc: { q: string; offset: number; sumar: boolean }): Promise<ItemToma[] | null> => {
      if (almacenId == null) return null;
      const mia = ++vuelta.current;
      if (!opc.sumar) pedida.current = claveDe(opc.q);
      if (opc.sumar) setTrayendoMas(true);
      else {
        setCargando(true);
        setErrorLista("");
      }
      try {
        const r = await pedirToma({
          almacenId,
          q: opc.q || undefined,
          categoriaId: categoriaId ?? undefined,
          limite: POR_TANDA,
          offset: opc.offset,
        });
        if (mia !== vuelta.current) return null;
        setItems((antes) => (opc.sumar ? [...antes, ...r.items] : r.items));
        setTotal(r.total);
        return r.items;
      } catch (err) {
        if (mia !== vuelta.current) return null;
        setErrorLista(mensajeDe(err, "No se pudo cargar el estante"));
        if (!opc.sumar) setItems([]);
        return null;
      } finally {
        if (mia === vuelta.current) {
          setCargando(false);
          setTrayendoMas(false);
        }
      }
    },
    [almacenId, categoriaId, claveDe],
  );

  useEffect(() => {
    if (almacenId == null) {
      setItems([]);
      setTotal(0);
      return;
    }
    if (pedida.current === claveDe(qAplicada)) return;
    void cargar({ q: qAplicada, offset: 0, sumar: false });
  }, [almacenId, qAplicada, cargar, claveDe]);

  // ── El foco: del lector al "Contado" y de vuelta ──
  const campos = useRef(new Map<number, HTMLInputElement>());
  const registrar = (id: number, el: HTMLInputElement | null) => {
    if (el) campos.current.set(id, el);
    else campos.current.delete(id);
  };
  function enfocarConteo(id: number) {
    // El renglón se dibuja en el próximo render: el foco espera a que exista.
    setTimeout(() => {
      const el = campos.current.get(id);
      el?.focus();
      el?.select();
    }, 0);
  }
  function volverAlBuscador() {
    campo.current?.focus();
    // Seleccionado, no borrado: el próximo escaneo lo reemplaza, y si no hay
    // otro, lo buscado sigue a la vista.
    campo.current?.select();
  }

  /**
   * Enter lleva el foco al "Contado" del único resultado: es lo que hace que
   * el lector funcione solo. Con más de uno no elige nadie por la persona.
   * El lector manda el Enter antes de que la búsqueda haya preguntado nada,
   * así que si la lista no es de este texto se pide ya y se decide con eso.
   */
  async function alEnter() {
    const texto = q.trim();
    if (!texto || almacenId == null) return;
    const alDia = qAplicada === texto && pedida.current === claveDe(texto) && !cargando;
    setQAplicada(texto);
    const lista = alDia ? items : await cargar({ q: texto, offset: 0, sumar: false });
    if (lista && lista.length === 1) enfocarConteo(lista[0].productoId);
  }

  // ── El conteo y su borrador ──
  const [conteo, setConteo] = useState<Conteo>({});
  const [guardadoEl, setGuardadoEl] = useState<string | null>(null);
  useEffect(() => {
    if (almacenId == null) {
      setConteo({});
      setGuardadoEl(null);
      return;
    }
    const b = leerBorrador(almacenId);
    setConteo(b.conteo);
    setGuardadoEl(b.guardado);
  }, [almacenId]);

  const porId = useMemo(() => new Map(items.map((i) => [i.productoId, i])), [items]);
  const articulos = useMemo(() => articulosDelConteo(conteo, porId), [conteo, porId]);
  const resumen = useMemo(() => resumenDelConteo(articulos, conteo), [articulos, conteo]);
  const diferencias = useMemo(() => diferenciasDe(articulos, conteo), [articulos, conteo]);

  /** Cambia lo contado de un artículo y lo deja guardado en el borrador. */
  function actualizar(item: ItemToma, parche: (c: ConteoArticulo) => ConteoArticulo) {
    if (almacenId == null) return;
    const clave = String(item.productoId);
    const actual = conteo[clave] ?? { articulo: item };
    // La foto del artículo se refresca con la que está en pantalla: es la
    // última que se sabe del sistema.
    const nuevo = parche({ ...actual, articulo: item });
    const siguiente: Conteo = { ...conteo, [clave]: nuevo };
    // Un artículo que quedó sin nada tecleado sale del conteo: así "N
    // contados" y el borrador dicen lo mismo que la pantalla.
    if (!tieneAlgo(nuevo)) delete siguiente[clave];
    setConteo(siguiente);
    const ahora = new Date();
    guardarBorrador(almacenId, siguiente, ahora);
    setGuardadoEl(Object.keys(siguiente).length ? ahora.toISOString() : null);
  }

  const [descartando, setDescartando] = useState(false);
  function descartar() {
    if (almacenId != null) borrarBorrador(almacenId);
    setConteo({});
    setGuardadoEl(null);
    setDescartando(false);
  }

  // ── Revisar y aplicar ──
  const [revisando, setRevisando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [errorPagina, setErrorPagina] = useState("");
  const [aviso, setAviso] = useAviso(8000);

  const etiquetaBoton = puedeAprobar ? "Aplicar ajuste" : "Guardar para que lo aprueben";

  async function confirmar() {
    if (almacenId == null || enviando) return;
    if (!motivo) {
      setErrorEnvio("Elegí el motivo del ajuste.");
      return;
    }
    if (motivo === "Otro" && !nota.trim()) {
      setErrorEnvio('Con "Otro", escribí en la nota qué pasó: es lo que va a leer quien revise el movimiento.');
      return;
    }
    const detalles = detallesDelAjuste(articulos, conteo);
    if (detalles.length === 0) {
      setErrorEnvio("No hay diferencias para ajustar.");
      return;
    }
    const cuantos = new Set(detalles.map((d) => d.productoId)).size;
    setEnviando(true);
    setErrorEnvio("");

    let id: number;
    try {
      const creado = await api.crearMovimiento({
        tipo: "AJUSTE",
        almacenId,
        descripcion: descripcionDelAjuste(motivo, nota),
        detalles,
      });
      id = creado.id;
    } catch (err) {
      // Falló antes de crear nada: el conteo sigue en pantalla y en el
      // borrador, se corrige lo que haya que corregir y se reintenta.
      setErrorEnvio(mensajeDe(err, "No se pudo guardar el ajuste"));
      setEnviando(false);
      return;
    }

    let aprobado = false;
    let fallaAprobar = "";
    if (puedeAprobar) {
      try {
        await api.aprobarMovimiento(id);
        aprobado = true;
      } catch (err) {
        fallaAprobar = mensajeDe(err, "no se pudo");
      }
    }

    // El movimiento ya existe con todos sus renglones, aprobado o pendiente:
    // el borrador se limpia igual, porque reintentar desde el conteo lo
    // crearía por segunda vez.
    borrarBorrador(almacenId);
    setConteo({});
    setGuardadoEl(null);
    setEnviando(false);
    setRevisando(false);
    setMotivo("");
    setNota("");
    const texto = plural(cuantos, "artículo", "artículos");
    if (aprobado) {
      setErrorPagina("");
      setAviso(`Ajuste aplicado: ${texto}`);
    } else if (puedeAprobar) {
      setErrorPagina(
        `Se guardó como pendiente, pero no se pudo aprobar: ${fallaAprobar}. Se aprueba desde Movimientos.`,
      );
    } else {
      setErrorPagina("");
      setAviso(`Conteo guardado: ${texto}. Queda pendiente hasta que alguien lo apruebe en Movimientos.`);
    }
    void cargar({ q: qAplicada, offset: 0, sumar: false });
  }

  const sinSucursal = almacenId == null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-0 sm:p-5 sm:pb-0">
      <EncabezadoPagina
        titulo="Toma de inventario"
        subtitulo="Contá lo que hay en el estante de una sucursal, lote por lote. Lo que no cuadra se ajusta con un motivo."
        volver={{ a: "/inventario/movimientos", etiqueta: "Movimientos" }}
        accion={
          resumen.contados > 0 ? (
            <Boton variante="ghost" icono="trash" onClick={() => setDescartando(true)}>
              Descartar conteo
            </Boton>
          ) : undefined
        }
      />

      <section className="card space-y-3 p-4">
        {atada != null || !suc.elegir ? (
          nombreSucursal ? (
            <p className="text-[13px] text-texto-3">
              Sucursal: <strong className="text-texto">{nombreSucursal}</strong>
            </p>
          ) : null
        ) : (
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-texto-2">¿Qué sucursal vas a contar?</p>
            <Chips
              titulo="Sucursal"
              valor={elegida == null ? "" : String(elegida)}
              opciones={suc.sucursales.map((a) => [String(a.id), a.nombre] as const)}
              onChange={(v) => setElegida(Number(v))}
            />
          </div>
        )}
        <CampoBusqueda
          ref={campo}
          valor={q}
          onChange={setQ}
          onEnter={() => void alEnter()}
          placeholder="Buscá o escaneá: nombre, droga, laboratorio…"
        />
        {chipsCategoria.length > 1 && (
          <Chips
            titulo="Categoría"
            valor={categoriaId == null ? "" : String(categoriaId)}
            opciones={chipsCategoria}
            onChange={(v) => setCategoriaId(v ? Number(v) : null)}
          />
        )}
      </section>

      {guardadoEl && resumen.contados > 0 && (
        <p className="text-[12px] text-texto-3">
          Borrador guardado en este dispositivo el {fmtFechaHora(guardadoEl)}. Seguí contando o aplicá el
          ajuste.
        </p>
      )}
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{errorPagina}</ErrorMsg>

      {sinSucursal ? (
        <Vacio
          icono="warehouse"
          titulo={suc.elegir ? "Elegí la sucursal" : "Buscando tu sucursal…"}
          texto={
            suc.elegir
              ? "La toma se hace en un local a la vez: lo que se cuenta es el estante de esa sucursal."
              : "Si esto sigue así, recargá la página."
          }
        />
      ) : cargando && items.length === 0 ? (
        <Cargando texto="Cargando el estante…" />
      ) : errorLista ? (
        <ErrorMsg onReintentar={() => void cargar({ q: qAplicada, offset: 0, sumar: false })}>
          {errorLista}
        </ErrorMsg>
      ) : items.length === 0 ? (
        <Vacio
          icono="search"
          titulo={qAplicada ? `No hay nada con “${qAplicada}”` : "No hay nada que contar"}
          texto={
            qAplicada
              ? "Probá con otra parte del nombre, la droga o el laboratorio."
              : "En esta sucursal no hay artículos con stock ni lotes con saldo."
          }
        />
      ) : (
        <>
          <p className="text-[12px] text-texto-4">
            {fmtCantidad(items.length)} de {plural(total, "artículo", "artículos")} · «Sistema» es lo que dice
            el inventario de {nombreSucursal || "la sucursal"} ahora.
          </p>
          <ul className="space-y-3">
            {items.map((item) => (
              <FilaArticulo
                key={item.productoId}
                item={item}
                conteo={conteo[String(item.productoId)]}
                onCambiar={(parche) => actualizar(item, parche)}
                registrar={(el) => registrar(item.productoId, el)}
                alTerminar={volverAlBuscador}
              />
            ))}
          </ul>
          {items.length < total && (
            <button
              onClick={() => void cargar({ q: qAplicada, offset: items.length, sumar: true })}
              disabled={trayendoMas}
              className="w-full rounded-xl border border-dashed border-borde py-2.5 text-[13px] font-semibold text-texto-2 hover:bg-muted disabled:opacity-60"
            >
              {trayendoMas ? "Trayendo…" : `Ver más (${items.length} de ${total})`}
            </button>
          )}
        </>
      )}

      {/* La barra de abajo: pegada al borde del área que se desplaza, así se
          ve mientras se recorre el estante. En el celular el botón va entero
          en su propio renglón: "Guardar para que lo aprueben" no entra al
          lado del resumen sin partirse. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-borde bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm font-semibold text-texto">
              {plural(resumen.contados, "artículo contado", "artículos contados")} ·{" "}
              {plural(resumen.diferencias, "diferencia", "diferencias")}
            </p>
            {resumen.contados > 0 && resumen.diferencias === 0 && (
              <p className="text-[12px] text-texto-3">Todo cuadra: no hay nada que ajustar.</p>
            )}
          </div>
          <Boton
            icono="check"
            onClick={() => {
              setErrorEnvio("");
              setRevisando(true);
            }}
            disabled={sinSucursal || resumen.diferencias === 0}
            className="basis-full sm:basis-auto"
          >
            {etiquetaBoton}
          </Boton>
        </div>
      </div>

      <Modal
        abierto={revisando}
        titulo="Revisar diferencias"
        subtitulo={`${plural(resumen.articulosConDiferencia, "artículo", "artículos")} en ${
          nombreSucursal || "la sucursal"
        }. Sólo viaja lo que cambia; lo que cuadró y lo que no se contó quedan como están.`}
        onClose={() => {
          if (!enviando) setRevisando(false);
        }}
        cerrarAlClicAfuera={false}
        ancho="max-w-2xl"
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setRevisando(false)} disabled={enviando}>
              Cancelar
            </Boton>
            <Boton icono="check" onClick={() => void confirmar()} disabled={enviando}>
              {enviando ? (puedeAprobar ? "Aplicando…" : "Guardando…") : etiquetaBoton}
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          {/* Arriba, no abajo: el error del backend tiene que verse sin
              desplazar una lista de cuarenta renglones. El conteo no se
              pierde: sigue en pantalla y en el borrador. */}
          <ErrorMsg>{errorEnvio}</ErrorMsg>

          <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
            {diferencias.map((d, i) => (
              <li
                key={`${d.productoId}-${d.lote ?? ""}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-texto">{d.nombre}</p>
                  <p className="truncate text-[12px] text-texto-3">
                    {[d.detalle, d.lote ? `Lote ${d.lote}` : "", d.lote ? `vence ${venceTexto(d.vencimiento)}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                    {d.nuevo && (
                      <Badge tono="azul" className="ml-1.5">
                        Nuevo
                      </Badge>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  <span className="text-texto-3">
                    {fmtCantidad(d.sistema)} → <strong className="text-texto">{fmtCantidad(d.contado)}</strong>
                  </span>
                  <BadgeDiferencia diferencia={d.diferencia} />
                </div>
              </li>
            ))}
          </ul>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Motivo</p>
            <Chips
              titulo="Motivo"
              valor={motivo}
              opciones={MOTIVOS_TOMA.map((m) => [m, m] as const) as readonly (readonly [string, string])[]}
              onChange={setMotivo}
            />
          </div>
          <Campo label={motivo === "Otro" ? "Qué pasó" : "Nota (opcional)"}>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Se tiraron 3 cajas vencidas del estante 2"
              maxLength={200}
            />
          </Campo>
          <p className="text-[12px] text-texto-3">
            {puedeAprobar
              ? "El stock de cada lote queda en lo contado en este momento. Después sólo se puede revertir anulando el movimiento desde Movimientos."
              : "Queda pendiente: el stock se mueve cuando alguien lo aprueba en Movimientos."}
          </p>
        </div>
      </Modal>

      <Confirmar
        abierto={descartando}
        titulo="Descartar el conteo"
        texto={`Se borra lo contado en ${nombreSucursal || "esta sucursal"} (${plural(
          resumen.contados,
          "artículo",
          "artículos",
        )}). El inventario no se toca.`}
        etiquetaOk="Descartar"
        peligroso
        onCancel={() => setDescartando(false)}
        onOk={descartar}
      />
    </div>
  );
}

/** Verde si cuadra, ámbar si sobra, rojo si falta: los colores de toda la app. */
function BadgeDiferencia({ diferencia }: { diferencia: number }) {
  const tipo = tipoDiferencia(diferencia);
  const tono = tipo === "cuadra" ? "verde" : tipo === "sobra" ? "amarillo" : "rojo";
  return <Badge tono={tono}>{tipo === "cuadra" ? "Cuadra" : etiquetaDiferencia(diferencia)}</Badge>;
}

function BotonChico({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-borde bg-white px-2.5 py-1 text-[12px] font-semibold text-texto-2 transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );
}

/**
 * Un artículo del estante con sus "Contado": uno por lote, o uno solo si no
 * maneja lote. "Todo en 0" y "Igual al sistema" son para ir rápido por los
 * que se terminaron y los que cuadran, que son la mayoría en una toma.
 */
function FilaArticulo({
  item,
  conteo,
  onCambiar,
  registrar,
  alTerminar,
}: {
  item: ItemToma;
  conteo: ConteoArticulo | undefined;
  onCambiar: (parche: (c: ConteoArticulo) => ConteoArticulo) => void;
  /** El primer "Contado" del artículo, adonde cae el foco tras escanear. */
  registrar: (el: HTMLInputElement | null) => void;
  alTerminar: () => void;
}) {
  const [agregando, setAgregando] = useState(false);
  const nuevos = conteo?.nuevos ?? [];
  // Maneja lote pero el sistema no tiene ninguna partida registrada: se
  // cuenta por el total, salvo que se le agregue un lote (ver `toma.ts`).
  const sinPartidas = item.manejaLote && item.lotes.length === 0;
  const porTotal = !item.manejaLote || (sinPartidas && nuevos.length === 0);

  const todoEnCero = () =>
    onCambiar(() =>
      !item.manejaLote || sinPartidas
        ? { articulo: item, total: "0" }
        : { articulo: item, lotes: Object.fromEntries(item.lotes.map((l) => [l.codigo, "0"])) },
    );
  const igualAlSistema = () =>
    onCambiar(() =>
      !item.manejaLote || sinPartidas
        ? { articulo: item, total: String(item.stock) }
        : {
            articulo: item,
            lotes: Object.fromEntries(item.lotes.map((l) => [l.codigo, String(l.cantidad)])),
          },
    );

  return (
    <li className="card p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <p className="font-semibold text-texto">
            {item.nombre}
            {item.concentracion && <span className="font-normal text-texto-3"> · {item.concentracion}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-texto-3">
            {item.laboratorio && <span>{item.laboratorio}</span>}
            {item.ubicacion && (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" size={12} />
                {item.ubicacion}
              </span>
            )}
            {item.unidad && <span>{item.unidad}</span>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <BotonChico onClick={todoEnCero}>Todo en 0</BotonChico>
          <BotonChico onClick={igualAlSistema}>Igual al sistema</BotonChico>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {porTotal ? (
          <RenglonConteo
            etiqueta={sinPartidas ? "Sin lotes registrados" : null}
            sistema={item.stock}
            valor={conteo?.total ?? ""}
            onChange={(v) => onCambiar((c) => ({ ...c, total: v }))}
            aria={`Contado de ${item.nombre}`}
            registrar={registrar}
            onEnter={alTerminar}
          />
        ) : (
          item.lotes.map((l, i) => (
            <RenglonConteo
              key={l.codigo}
              etiqueta={`${l.codigo} · vence ${venceTexto(l.vencimiento)}`}
              sistema={l.cantidad}
              valor={conteo?.lotes?.[l.codigo] ?? ""}
              onChange={(v) => onCambiar((c) => ({ ...c, lotes: { ...(c.lotes ?? {}), [l.codigo]: v } }))}
              aria={`Contado de ${item.nombre}, lote ${l.codigo}`}
              registrar={i === 0 ? registrar : undefined}
              onEnter={alTerminar}
            />
          ))
        )}
        {nuevos.map((n, i) => (
          <RenglonConteo
            key={`nuevo-${n.codigo}-${i}`}
            etiqueta={`${n.codigo} · vence ${venceTexto(n.vencimiento)}`}
            nuevo
            sistema={0}
            valor={n.cantidad}
            onChange={(v) =>
              onCambiar((c) => ({
                ...c,
                nuevos: (c.nuevos ?? []).map((x, j) => (j === i ? { ...x, cantidad: v } : x)),
              }))
            }
            onQuitar={() => onCambiar((c) => ({ ...c, nuevos: (c.nuevos ?? []).filter((_, j) => j !== i) }))}
            aria={`Contado de ${item.nombre}, lote nuevo ${n.codigo}`}
            onEnter={alTerminar}
          />
        ))}
      </div>

      {item.manejaLote &&
        (agregando ? (
          <FormLoteNuevo
            item={item}
            nuevos={nuevos}
            onAgregar={(n) => {
              onCambiar((c) => ({ ...c, nuevos: [...(c.nuevos ?? []), n] }));
              setAgregando(false);
            }}
            onCancelar={() => setAgregando(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 hover:underline"
          >
            <Icon name="plus" size={14} />
            Agregar lote
          </button>
        ))}
    </li>
  );
}

/**
 * Un lote (o el total) con su "Contado" y la diferencia al lado. El campo es
 * un `<input>` propio y no el `Input` de ui: necesita el `ref` para recibir
 * el foco tras escanear, y teclado numérico. La coma vale como punto igual
 * que allá: el teclado del celular ofrece una u otra según el idioma.
 */
function RenglonConteo({
  etiqueta,
  nuevo,
  sistema,
  valor,
  onChange,
  onQuitar,
  aria,
  registrar,
  onEnter,
}: {
  etiqueta: string | null;
  nuevo?: boolean;
  sistema: number;
  valor: string;
  onChange: (v: string) => void;
  onQuitar?: () => void;
  aria: string;
  registrar?: (el: HTMLInputElement | null) => void;
  onEnter: () => void;
}) {
  const contado = cantidadContada(valor);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl bg-muted/60 px-3 py-2">
      <div className="min-w-0">
        {etiqueta && (
          <p className="truncate text-[13px] font-medium text-texto-2">
            {etiqueta}
            {nuevo && (
              <Badge tono="azul" className="ml-1.5">
                Nuevo
              </Badge>
            )}
          </p>
        )}
        <p className="text-[12px] text-texto-3">
          Sistema: <strong className="text-texto">{fmtCantidad(sistema)}</strong>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={registrar}
          type="text"
          inputMode="numeric"
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(/,/g, "."))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder="Contado"
          aria-label={aria}
          className="w-24 rounded-xl border border-borde bg-white px-3 py-2 text-center text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
        />
        <span className="inline-flex w-16 justify-end">
          {contado !== null && <BadgeDiferencia diferencia={contado - sistema} />}
        </span>
        {onQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar ${etiqueta ?? "lote"}`}
            className="rounded-lg p-1.5 text-texto-4 transition-colors hover:bg-danger-bg hover:text-danger-text"
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Un lote que apareció en el estante y el sistema no conocía. El vencimiento
 * se teclea MM/AAAA como en el ingreso de mercadería (`mesAIso`): el envase
 * trae mes y año, y se guarda el último día de ese mes. Un código repetido
 * se frena acá: se cuenta en la partida que ya está en la lista.
 */
function FormLoteNuevo({
  item,
  nuevos,
  onAgregar,
  onCancelar,
}: {
  item: ItemToma;
  nuevos: LoteNuevo[];
  onAgregar: (n: LoteNuevo) => void;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [mes, setMes] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState("");
  const iso = mesAIso(mes);
  const aviso = iso ? avisoVidaUtil(iso) : null;

  function agregar() {
    const cod = codigo.trim();
    const clave = cod.toLowerCase();
    if (!cod) {
      setError("Escribí el código del lote, como está en el envase.");
      return;
    }
    const repetido =
      item.lotes.some((l) => l.codigo.trim().toLowerCase() === clave) ||
      nuevos.some((n) => n.codigo.trim().toLowerCase() === clave);
    if (repetido) {
      setError("Ese lote ya está en la lista: contalo ahí.");
      return;
    }
    if (!iso) {
      setError("El vencimiento va como MM/AAAA, por ejemplo 04/2028.");
      return;
    }
    const n = cantidadContada(cantidad);
    if (n === null || n <= 0) {
      setError("¿Cuántas unidades de ese lote hay en el estante?");
      return;
    }
    onAgregar({ codigo: cod, vencimiento: iso, cantidad: cantidad.trim() });
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-dashed border-borde p-3">
      <p className="text-[13px] font-semibold text-texto-2">Lote que apareció en el estante</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Campo label="Código del lote">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Como dice el envase" />
        </Campo>
        <Campo label="Vence (MM/AAAA)">
          <Input
            value={mes}
            inputMode="numeric"
            onChange={(e) => setMes(tecleoMes(e.target.value))}
            placeholder="04/2028"
          />
        </Campo>
        <Campo label="Cantidad contada">
          <Input
            type="number"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
          />
        </Campo>
      </div>
      {aviso && <p className="text-[12px] text-warning-text">{aviso}</p>}
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex justify-end gap-2">
        <Boton variante="ghost" onClick={onCancelar} className="px-3 py-1.5 text-[13px]">
          Cancelar
        </Boton>
        <Boton variante="soft" onClick={agregar} className="px-3 py-1.5 text-[13px]">
          Agregar
        </Boton>
      </div>
    </div>
  );
}
