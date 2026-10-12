import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AvisoOk, Cargando, ErrorMsg, useAviso } from "../../../components/ui";
import { useCoincideMedia } from "../../../lib/useCoincideMedia";
import { useAuth } from "../../../store/AuthContext";
import { billar, leerBillar, useBillar } from "../store";
import type { TipoMesa } from "../tipos";
import { BotonB, Nota } from "../ui";
import { borradorTarifas, erroresTipo, tipoDeBorrador, type BorradorTarifas } from "./borrador";
import { FormMesa } from "./FormMesa";
import { Pestanas, type Pestana } from "./piezas";
import { TabMesas } from "./TabMesas";
import { TabTarifas } from "./TabTarifas";

/**
 * Mesas de billar (§7.14), del administrador: las mesas y sus tarifas,
 * paquetes, promociones, avisos y PIN. Todo es del backend
 * (`/billar/admin/...`): las mesas, también las guardadas sin usar, se traen
 * al entrar; las tarifas y los ajustes son los del negocio, no los que este
 * equipo haya tocado en la campana del tablero.
 */
export default function MesasBillar() {
  const e = useBillar();
  useEffect(() => {
    void billar.cargarAdmin();
  }, []);
  if (!e.admin.cargado) {
    return e.admin.error ? (
      <div className="p-6">
        <ErrorMsg onReintentar={() => void billar.cargarAdmin()}>{e.admin.error}</ErrorMsg>
      </div>
    ) : (
      <Cargando texto="Cargando las mesas…" />
    );
  }
  return <MesasBillarCargadas />;
}

/** La pantalla, con las mesas y las tarifas ya traídas: el borrador arranca de lo guardado. */
function MesasBillarCargadas() {
  const e = useBillar();
  const { usuario } = useAuth();
  const [params, setParams] = useSearchParams();
  const pestana: Pestana = params.get("tab") === "tarifas" ? "tarifas" : "mesas";
  const ancha = useCoincideMedia("(min-width: 1024px)");
  const [aviso, setAviso] = useAviso();

  // El formulario de la mesa: null = cerrado; "nueva" o el número que se edita.
  const [form, setForm] = useState<"nueva" | number | null>(null);
  // Cambia con cada apertura: el formulario arranca de cero aunque sea la misma mesa.
  const [vez, setVez] = useState(0);
  const abrirForm = (f: "nueva" | number) => {
    setForm(f);
    setVez((v) => v + 1);
  };

  // Tarifas: el borrador y la última versión guardada, para saber si hay cambios.
  const [guardado, setGuardado] = useState(() => borradorTarifas(e.tipos, e.ajustesNegocio));
  const [guardando, setGuardando] = useState(false);
  const [errorTarifas, setErrorTarifas] = useState("");
  const [borrador, setBorrador] = useState<BorradorTarifas>(guardado);
  const [intento, setIntento] = useState(false);
  const sinGuardar = JSON.stringify(borrador) !== JSON.stringify(guardado);
  const errores = useMemo(
    () => Object.fromEntries(borrador.tipos.map((t) => [t.id, erroresTipo(t)])),
    [borrador],
  );
  const hayErrores = Object.values(errores).some((x) => Object.keys(x).length > 0);

  // Si se va de la página con cambios sin guardar, el navegador pregunta.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const irA = (p: Pestana) =>
    setParams(
      (x) => {
        const n = new URLSearchParams(x);
        if (p === "mesas") n.delete("tab");
        else n.set("tab", p);
        return n;
      },
      { replace: true },
    );

  const guardar = async () => {
    setIntento(true);
    if (hayErrores || guardando) return;
    const tipos: Record<string, TipoMesa> = {};
    for (const t of borrador.tipos) tipos[t.id] = tipoDeBorrador(t)!;
    const ajustes = { avisos: borrador.avisos, sonido: borrador.sonido, voz: borrador.voz, pin: borrador.pin };
    setGuardando(true);
    setErrorTarifas("");
    const error = await billar.guardarTarifas(tipos, ajustes);
    setGuardando(false);
    if (error) return setErrorTarifas(error);
    // Lo que quedó guardado de verdad (el backend ordena los avisos y los paquetes).
    const ahora = leerBillar();
    const nuevo = borradorTarifas(ahora.tipos, ahora.ajustesNegocio);
    setGuardado(nuevo);
    setBorrador(nuevo);
    setIntento(false);
    setAviso("Cambios guardados. Las mesas en juego siguen con la tarifa con que se abrieron.");
  };

  const sucursal = usuario?.sucursal ?? "Principal";
  const panel =
    form !== null ? (
      <FormMesa
        key={vez}
        mesaId={form === "nueva" ? null : form}
        onCerrar={() => setForm(null)}
        onListo={(m) => {
          setForm(null);
          setAviso(m);
        }}
      />
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-borde bg-white px-4 py-3 sm:px-6">
        <div className="min-w-[12rem] flex-1">
          <h1 className="text-xl font-bold leading-tight text-texto">Mesas de billar</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {e.admin.mesas.length} {e.admin.mesas.length === 1 ? "mesa" : "mesas"} en {sucursal}
          </p>
        </div>
        <BotonB variante="verde" icono="plus" onClick={() => abrirForm("nueva")}>
          Nueva mesa
        </BotonB>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <Pestanas valor={pestana} onCambiar={irA} sinGuardar={sinGuardar} />
            <AvisoOk>{aviso}</AvisoOk>
            {pestana === "mesas" ? (
              <TabMesas e={e} editando={typeof form === "number" ? form : null} onEditar={abrirForm} />
            ) : (
              <TabTarifas b={borrador} errores={errores} mostrarErrores={intento} onCambiar={setBorrador} />
            )}
          </div>

          {pestana === "tarifas" && (
            <div
              className={`bottom-0 z-10 border-t border-borde px-4 py-3 sm:px-6 ${
                sinGuardar ? "sticky bg-white/95 backdrop-blur" : ""
              }`}
            >
              <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
                {intento && hayErrores ? (
                  <div className="mr-auto">
                    <Nota tono="rosa" icono="alert">
                      Revisá los campos marcados en rojo.
                    </Nota>
                  </div>
                ) : errorTarifas ? (
                  <div className="mr-auto" role="alert">
                    <Nota tono="rosa" icono="alert">
                      {errorTarifas}
                    </Nota>
                  </div>
                ) : (
                  <p className="mr-auto text-[13px] text-texto-3">
                    {sinGuardar
                      ? "Tenés cambios sin guardar."
                      : "Los cambios corren para las mesas que se abran desde que se guardan."}
                  </p>
                )}
                {sinGuardar && (
                  <BotonB
                    onClick={() => {
                      setBorrador(guardado);
                      setIntento(false);
                    }}
                  >
                    Descartar
                  </BotonB>
                )}
                <BotonB variante="verde" icono="check" disabled={!sinGuardar || guardando} onClick={() => void guardar()}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </BotonB>
              </div>
            </div>
          )}
        </div>

        {/* En pantalla ancha el formulario va al costado; si no, tapa la pantalla.
            Es el MISMO elemento en los dos casos (sólo cambian las clases): una
            tablet que se gira de parado a acostado no pierde lo escrito. */}
        {panel && (
          <div className={ancha ? "flex shrink-0" : "fixed inset-0 z-40"}>
            {!ancha && <div className="absolute inset-0 bg-slate-900/40" aria-hidden />}
            <aside
              aria-label="Mesa"
              className={
                ancha
                  ? "flex w-[440px] flex-col border-l border-borde bg-white"
                  : "absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col bg-white shadow-2xl"
              }
            >
              {panel}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
