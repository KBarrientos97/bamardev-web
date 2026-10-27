import { useCallback, useEffect, useState } from "react";
import { EncabezadoPagina } from "../components/filtros";
import { Icon } from "../components/Icon";
import { HojaInstalar } from "../components/InstalarApp";
import { AvisoOk, Boton, Cargando, ErrorMsg, Vacio } from "../components/ui";
import { ApiError } from "../lib/api";
import { apiNotificaciones, type PreferenciaNotificacion } from "../lib/push/apiNotificaciones";
import { entornoActual, situacionPush, type SituacionPush } from "../lib/push/estadoPush";
import { agrupar } from "../lib/push/notificaciones";
import { sincronizarPushSilencioso } from "../lib/push/registroPush";

/**
 * Notificaciones (PLAN-PUSH §10.2): qué avisos le llegan a quien está
 * sentado, y si ESTE equipo los puede recibir. Es de la cuenta y no del
 * negocio, así que no depende de permisos: la lista la filtra el backend (a la
 * cajera no le aparece "Venta anulada") y acá sólo se muestra.
 *
 * Es también el único lugar donde se pide el permiso del navegador. El botón
 * "Enviarme una de prueba" se sacó el 26-oct (el dueño: no hace falta).
 */

export default function Notificaciones() {
  const [avisos, setAvisos] = useState<PreferenciaNotificacion[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [errorCambio, setErrorCambio] = useState("");
  const [guardando, setGuardando] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      setAvisos(await apiNotificaciones.preferencias());
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : "No se pudieron traer tus avisos");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const poner = (tipo: string, cambio: Partial<PreferenciaNotificacion>) =>
    setAvisos((lista) => lista?.map((p) => (p.tipo === tipo ? { ...p, ...cambio } : p)) ?? lista);

  /**
   * Optimista: el interruptor cambia al toque y, si el backend no lo acepta,
   * vuelve a como estaba con el motivo. De la respuesta se toma sólo ESTE
   * aviso: si se tocaron dos seguidos, la lista que vuelve del primero no
   * tiene que pisar el segundo, que todavía va en camino.
   */
  async function cambiar(p: PreferenciaNotificacion, activa: boolean) {
    setErrorCambio("");
    poner(p.tipo, { activa });
    setGuardando((g) => [...g, p.tipo]);
    try {
      const lista = await apiNotificaciones.cambiar(p.tipo, activa);
      const nuevo = lista.find((x) => x.tipo === p.tipo);
      if (nuevo) poner(p.tipo, nuevo);
    } catch (e) {
      poner(p.tipo, { activa: !activa });
      const motivo = e instanceof Error ? e.message : "";
      setErrorCambio(`No se pudo ${activa ? "prender" : "apagar"} «${p.nombre}».${motivo ? ` ${motivo}` : ""}`);
      // Ya no le corresponde (le cambiaron el rol, apagaron la feature): la
      // lista que tiene en pantalla quedó vieja.
      if (e instanceof ApiError && e.status === 404) void cargar();
    } finally {
      setGuardando((g) => g.filter((t) => t !== p.tipo));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina titulo="Notificaciones" subtitulo="Qué avisos te llegan al celular o a la computadora" />

      <EsteEquipo />

      {cargando && !avisos ? (
        <div className="card">
          <Cargando texto="Cargando tus avisos…" />
        </div>
      ) : errorCarga && !avisos ? (
        <ErrorMsg onReintentar={() => void cargar()}>{errorCarga}</ErrorMsg>
      ) : avisos && avisos.length === 0 ? (
        <div className="card">
          <Vacio
            icono="bell"
            titulo="No hay avisos para tu usuario"
            texto="Cuando haya avisos que te correspondan por tu rol, vas a poder elegirlos acá."
          />
        </div>
      ) : avisos ? (
        <>
          <ErrorMsg>{errorCambio}</ErrorMsg>
          {agrupar(avisos).map((g) => (
            <section key={g.grupo} aria-labelledby={`grupo-${g.grupo}`} className="card px-4 py-1 sm:px-5">
              <h2 id={`grupo-${g.grupo}`} className="pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-texto-3">
                {g.titulo}
              </h2>
              <ul className="divide-y divide-borde-soft">
                {g.avisos.map((p) => (
                  <li key={p.tipo}>
                    <FilaAviso aviso={p} guardando={guardando.includes(p.tipo)} onCambiar={(v) => void cambiar(p, v)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}

/**
 * Un aviso con su interruptor. El que no se apaga se ve prendido y quieto, con
 * el porqué: esconderlo haría creer que no existe, y es justo el que llega
 * cuando la app ya no deja entrar.
 */
function FilaAviso({
  aviso,
  guardando,
  onCambiar,
}: {
  aviso: PreferenciaNotificacion;
  guardando: boolean;
  onCambiar: (activa: boolean) => void;
}) {
  const fijo = !aviso.apagable;
  const activo = fijo || aviso.activa;
  const idDetalle = `aviso-${aviso.tipo}-detalle`;
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-texto">{aviso.nombre}</p>
        <p id={idDetalle} className="mt-0.5 text-[13px] text-texto-3">
          {aviso.descripcion}
          {fijo && <span className="mt-0.5 block text-xs font-semibold text-texto-4">Siempre activo: no se puede apagar.</span>}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={aviso.nombre}
        aria-describedby={idDetalle}
        disabled={fijo || guardando}
        onClick={() => onCambiar(!activo)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: activo ? "var(--color-primary-boton)" : "#CBD5E1" }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150 motion-reduce:transition-none"
          style={{ left: activo ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

/**
 * Si este navegador puede recibir y, si no, qué hacer. Cada equipo se activa
 * por separado: el permiso es del navegador, no de la cuenta.
 */
function EsteEquipo() {
  const [situacion, setSituacion] = useState<SituacionPush>(() => situacionPush(entornoActual()));
  const [activando, setActivando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [instalando, setInstalando] = useState(false);

  // Con el permiso ya dado, se asegura que el servidor tenga el token de este
  // equipo (no pregunta nada; si ya lo tiene, ni llama). Sirve si el registro
  // del arranque falló por la red.
  useEffect(() => {
    if (situacion === "concedido") void sincronizarPushSilencioso();
  }, [situacion]);

  async function activar() {
    setActivando(true);
    setAviso("");
    setError("");
    try {
      const { activarPush } = await import("../lib/push/firebasePush");
      const r = await activarPush();
      if ("motivo" in r) setError(r.motivo);
      else if (!r.registrado)
        setError("El permiso quedó dado, pero no se pudo avisar al servidor. Se reintenta solo la próxima vez que abras la app.");
      else setAviso("Listo: este equipo ya recibe tus avisos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron activar las notificaciones");
    } finally {
      setSituacion(situacionPush(entornoActual()));
      setActivando(false);
    }
  }

  return (
    <section aria-labelledby="este-equipo" className="card space-y-3 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            situacion === "concedido" ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-texto-3"
          }`}
        >
          <Icon name={situacion === "concedido" ? "bell" : "campanaOff"} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="este-equipo" className="text-sm font-bold text-texto">
            En este equipo
          </h2>
          <TextoSituacion situacion={situacion} />
        </div>
      </div>

      {situacion === "pendiente" && (
        <Boton icono="bell" onClick={() => void activar()} disabled={activando} className="w-full sm:w-auto">
          {activando ? "Activando…" : "Activar notificaciones"}
        </Boton>
      )}
      {situacion === "ios-sin-instalar" && (
        <Boton variante="soft" icono="download" onClick={() => setInstalando(true)} className="w-full sm:w-auto">
          Cómo agregarla al inicio
        </Boton>
      )}

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {instalando && <HojaInstalar onClose={() => setInstalando(false)} />}
    </section>
  );
}

function TextoSituacion({ situacion }: { situacion: SituacionPush }) {
  const clase = "mt-0.5 text-[13px] text-texto-3";
  switch (situacion) {
    case "concedido":
      return <p className={clase}>Activadas: los avisos prendidos abajo te llegan acá, aunque la app esté cerrada.</p>;
    case "pendiente":
      return <p className={clase}>Todavía no están activadas. El navegador te va a pedir permiso.</p>;
    case "denegado":
      return (
        <div className={`${clase} space-y-1`}>
          <p>Las bloqueaste en este navegador, y no vuelve a preguntar solo. Para habilitarlas:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>En la computadora: tocá el candado al lado de la dirección → Notificaciones → Permitir.</li>
            <li>En Android: Ajustes del teléfono → Aplicaciones → Chrome (o BamarDev, si la instalaste) → Notificaciones.</li>
          </ul>
          <p>Después volvé a abrir esta pantalla.</p>
        </div>
      );
    case "ios-sin-instalar":
      return (
        <p className={clase}>
          En el iPhone y el iPad las notificaciones sólo llegan con la app agregada a la pantalla de inicio (iOS 16.4 o
          más). Agregala y abrila desde ese ícono para activarlas.
        </p>
      );
    case "sin-soporte":
      return (
        <p className={clase}>
          Este navegador no puede recibir notificaciones. Probá con Chrome, Edge o Safari actualizados; en el iPhone, con
          iOS 16.4 o más.
        </p>
      );
  }
}
