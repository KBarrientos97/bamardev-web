import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Vacio } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import { useSucursales } from "../../lib/useSucursales";
import { round2 } from "./calculo";
import { useDialogos } from "./dialogos";
import ListaMesas from "./ListaMesas";
import { CajaCerradaAviso } from "./ModalesCaja";
import PanelMesa from "./PanelMesa";
import { useAhora } from "./reloj";
import { billar, mesasEnUso, useBillar } from "./store";
import { atajoDelTablero, mirandoOtraSucursal } from "./Tablero.datos";
import TarjetaMesa from "./TarjetaMesa";
import { BotonB, ChipFiltro, Circulo, Encabezado, Nota, SelectorSucursal } from "./ui";
import { FILTROS, pasaBusqueda, pasaFiltro, vistaDe, type Filtro } from "./vista";

/** Tarjetas o lista: preferencia del dispositivo, como la barra colapsada. */
const VISTA_KEY = "bamardev.billar.vista";

function leerVista(): "tarjetas" | "lista" {
  try {
    return localStorage.getItem(VISTA_KEY) === "lista" ? "lista" : "tarjetas";
  } catch {
    return "tarjetas";
  }
}

/**
 * Billar · Tablero (§7.1): todas las mesas en vivo, el panel de la elegida y
 * las puertas a lo demás (venta rápida, ventas del turno, la pantalla del
 * salón y el cierre de caja).
 */
export default function Tablero() {
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const { abrir, actual } = useDialogos();
  const [params, setParams] = useSearchParams();
  const ancha = useCoincideMedia("(min-width: 1024px)");
  // La Lista son once columnas: desde monitor, no en una tablet acostada.
  const muyAncha = useCoincideMedia("(min-width: 1280px)");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState(leerVista);
  const buscador = useRef<HTMLInputElement>(null);

  const elegida = Number(params.get("mesa")) || null;
  const elegir = (id: number | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id === null || id === elegida) n.delete("mesa");
        else n.set("mesa", String(id));
        return n;
      },
      { replace: true },
    );

  useEffect(() => {
    try {
      localStorage.setItem(VISTA_KEY, vista);
    } catch {
      // Sin almacenamiento sólo se pierde el recuerdo.
    }
  }, [vista]);

  // "/" busca y Escape cierra el panel (§7.1). Con un diálogo abierto las dos
  // son de él (ver `atajoDelTablero`). No alcanza con los del billar
  // (`actual`): el menú "…" de la mesa en el celular es un Modal suelto, así
  // que también cuenta cualquier `aria-modal` que esté en pantalla.
  const hayDialogo = actual !== null;
  const hojaPanel = !!elegida && !ancha;
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      const atajo = atajoDelTablero({
        tecla: ev.key,
        escribiendo: !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable),
        hayDialogo: hayDialogo || document.querySelector('[aria-modal="true"]') !== null,
        buscadorTapado: hojaPanel,
      });
      if (atajo === "buscar") {
        ev.preventDefault();
        buscador.current?.focus();
      } else if (atajo === "cerrar") {
        elegir(null);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  });

  // Varias sucursales (13-oct): el dueño elige el local en el encabezado. Con
  // un solo local, o para el cajero, `elegir` es falso y no aparece nada.
  const suc = useSucursales();
  const otraSucursal = mirandoOtraSucursal(e);
  const nombreCaja = suc.sucursales.find((s) => s.id === e.cajaSucursalId)?.nombre ?? "otra sucursal";
  const selector =
    suc.elegir && e.sucursalId != null ? (
      <SelectorSucursal valor={e.sucursalId} sucursales={suc.sucursales} onElegir={billar.elegirSucursal} />
    ) : undefined;

  const vistas = useMemo(() => mesasEnUso(e).map((m) => vistaDe(e, m, ahora)), [e, ahora]);
  const abiertas = vistas.filter((v) => v.cuenta);
  const totalAbierto = round2(abiertas.reduce((t, v) => t + v.cuenta!.total, 0));
  const porCobrar = round2(abiertas.reduce((t, v) => t + v.cuenta!.saldo, 0));
  const visibles = vistas.filter((v) => pasaFiltro(v, filtro) && pasaBusqueda(v, busqueda));
  const seleccion = vistas.find((v) => v.mesa.id === elegida) ?? null;
  const enLista = muyAncha && vista === "lista";

  if (!e.caja.abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Billar" />
        <CajaCerradaAviso />
      </div>
    );
  }

  const panel = seleccion && <PanelMesa v={seleccion} ahora={ahora} onCerrar={() => elegir(null)} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Billar" sucursal={selector}>
        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
          <label className="relative order-last w-full sm:order-none sm:w-56">
            <span className="sr-only">Buscar mesa o cliente</span>
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-texto-4">
              <Icon name="search" size={17} />
            </span>
            <input
              ref={buscador}
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              placeholder="Buscar mesa o cliente"
              className="h-10 w-full rounded-full border border-borde bg-white pl-10 pr-9 text-sm outline-none placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
            />
            <kbd className="pointer-events-none absolute inset-y-0 right-3 my-auto hidden h-5 items-center rounded border border-borde px-1.5 text-[11px] text-texto-4 sm:flex">
              /
            </kbd>
          </label>
          {muyAncha && (
            <div role="radiogroup" aria-label="Vista" className="flex rounded-full bg-slate-100 p-1">
              {(["tarjetas", "lista"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={vista === v}
                  onClick={() => setVista(v)}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${
                    vista === v ? "bg-white text-texto shadow-sm" : "text-texto-3 hover:text-texto"
                  }`}
                >
                  <Icon name={v === "tarjetas" ? "tarjetas" : "lista"} size={15} />
                  {v === "tarjetas" ? "Tarjetas" : "Lista"}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => abrir({ tipo: "avisos" })}
            aria-label={e.ajustes.silencio ? "Avisos silenciados" : "Avisos de tiempo fijo"}
            title={e.ajustes.silencio ? "Avisos silenciados" : "Avisos de tiempo fijo"}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
          >
            <Icon name={e.ajustes.silencio ? "campanaOff" : "bell"} size={18} />
            {!e.ajustes.silencio && vistas.some((v) => v.estado === "vence" || v.estado === "cumplido") && (
              <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
            )}
          </button>
          {/* Mirando otro local no: la venta cae en la caja (la de otro local)
              con el catálogo y los precios de éste, y el cobro no cuadra. */}
          {!otraSucursal && (
            <BotonB variante="menta" icono="cart" onClick={() => navigate("/billar/venta-rapida")} aria-label="Venta rápida">
              <span className="hidden sm:inline">Venta rápida</span>
            </BotonB>
          )}
          <BotonB icono="fileText" onClick={() => navigate("/billar/ventas")} aria-label="Ventas del turno">
            <span className="hidden sm:inline">Ventas</span>
          </BotonB>
          <button
            type="button"
            onClick={() => navigate("/billar/salon")}
            aria-label="Pantalla del salón"
            title="Pantalla del salón (TV)"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
          >
            <Icon name="tarjetas" size={18} />
          </button>
          <BotonB icono="lock" onClick={() => navigate("/billar/caja")} aria-label="Cerrar caja">
            <span className="hidden sm:inline">Cerrar caja</span>
          </BotonB>
        </div>
      </Encabezado>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {otraSucursal && (
            <Nota tono="ambar" icono="alert">
              Estás mirando <b>{e.sucursal}</b>, pero tu caja está abierta en <b>{nombreCaja}</b>. Estas mesas se
              abren y se cobran con una caja de este local.{" "}
              <button
                type="button"
                onClick={() => billar.elegirSucursal(e.cajaSucursalId)}
                className="font-bold underline"
              >
                Volver a {nombreCaja}
              </button>
            </Nota>
          )}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Resumen
              icono="fileText"
              tono="verde"
              etiqueta="Cuentas abiertas"
              valor={fmtMoney(totalAbierto)}
              pie={`${abiertas.length} ${abiertas.length === 1 ? "mesa" : "mesas"} en juego o pausadas`}
            />
            <Resumen
              icono="billetera"
              tono="ambar"
              etiqueta="Por cobrar"
              valor={fmtMoney(porCobrar)}
              pie="Saldo pendiente de todas las mesas"
            />
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {FILTROS.map((f) => (
              <ChipFiltro
                key={f.clave}
                activo={filtro === f.clave}
                etiqueta={f.etiqueta}
                cuenta={vistas.filter((v) => pasaFiltro(v, f.clave)).length}
                onClick={() => setFiltro(f.clave)}
              />
            ))}
          </div>

          {visibles.length === 0 ? (
            <Vacio
              icono="bola"
              titulo="No hay mesas acá"
              texto={busqueda ? `Ninguna mesa coincide con "${busqueda}".` : "Probá con otro filtro."}
            />
          ) : enLista ? (
            <ListaMesas vistas={visibles} seleccionada={elegida} onSeleccionar={(id) => elegir(id)} />
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(158px,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(228px,1fr))]">
              {visibles.map((v) => (
                <TarjetaMesa
                  key={v.mesa.id}
                  v={v}
                  ahora={ahora}
                  seleccionada={v.mesa.id === elegida}
                  onSeleccionar={() => elegir(v.mesa.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* En pantalla ancha el panel va al costado; si no, es una hoja que
            sube desde abajo (§7.16). */}
        {panel && ancha && (
          <aside aria-label={`Mesa ${seleccion.mesa.id}`} className="flex w-[400px] shrink-0 flex-col border-l border-borde bg-white xl:w-[420px]">
            {panel}
          </aside>
        )}
      </div>

      {panel && !ancha && (
        <div className="fixed inset-0 z-40" role="presentation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => elegir(null)} />
          <aside
            aria-label={`Mesa ${seleccion.mesa.id}`}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
          >
            <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />
            {panel}
          </aside>
        </div>
      )}
    </div>
  );
}

function Resumen({
  icono,
  tono,
  etiqueta,
  valor,
  pie,
}: {
  icono: "fileText" | "billetera";
  tono: "verde" | "ambar";
  etiqueta: string;
  valor: string;
  pie: string;
}) {
  return (
    <div className="card flex items-center gap-4 px-3.5 py-3 sm:px-5 sm:py-3.5">
      <span className="hidden sm:block">
        <Circulo icono={icono} tono={tono} size={44} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-texto-3 sm:text-[11px]">{etiqueta}</p>
        <p className="text-lg font-extrabold leading-tight tabular-nums text-texto sm:text-[22px]">{valor}</p>
        <p className="truncate text-[11px] text-texto-3 sm:text-[12px]">{pie}</p>
      </div>
    </div>
  );
}
