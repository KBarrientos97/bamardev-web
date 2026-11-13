import { useEffect, useRef, useState } from "react";
import {
  borrarQr,
  guardarQr,
  leerQr,
  quitarQrDelNegocio,
  sincronizarQr,
  subirQr,
} from "../lib/qrPago";
import { tienePermiso, tieneFeature } from "../lib/permisos";
import { useSedeDeCobro } from "../lib/useSedeDeCobro";
import { esBelleza, esBillar } from "../lib/rubro";
import { useAuth } from "../store/AuthContext";
import type { SesionUsuario } from "../types";
import { Icon } from "./Icon";
import { Confirmar, ErrorMsg, Modal } from "./ui";

/**
 * Quién puede cambiar el QR: el mismo permiso que pide el backend. Desde el
 * 16-oct, de fábrica sólo el Administrador: el QR es la cuenta a la que entra
 * la plata, y un cajero que lo cambia desvía los cobros sin que nadie lo note.
 */
function puedeCambiarQr(usuario: SesionUsuario | null): boolean {
  return tienePermiso(usuario, "qr.configurar");
}

/**
 * Carga del QR de cobro del negocio. Va en la apertura de caja, igual que en la
 * app: es el momento en que alguien está configurando el turno.
 *
 * Se sube al backend y lo reciben todos los equipos del negocio (ver
 * `qrPago.ts`). Antes quedaba sólo en este equipo y el mesero nunca lo tenía.
 *
 * También es la pantalla "QR de cobro" del administrador (`grande`, 18-oct):
 * cambiarlo desde la apertura de una caja no era el lugar (el dueño). Avisa
 * con `onCambio` para que esa pantalla vuelva a decir quién lo cambió.
 *
 * `sucursalId` (13-nov-2026, "Un QR para cada sucursal"): el QR de ESA sede en
 * vez del general. Sólo lo manda la pantalla "QR de cobro" cuando la
 * administración eligió uno por sucursal; en la apertura de caja y en todo lo
 * demás no viene y se trabaja con el general, como siempre. `puedeQuitar`
 * oculta «Quitar» cuando lo que se ve es el general prestado a una sede que
 * todavía no subió el suyo (no hay nada propio que quitar). `soloLectura`: se
 * ve el QR pero no se toca (quien es de un local cuando el QR es el de todas
 * las sucursales: lo cambia la administración).
 */
export function CargarQrCobro({
  grande = false,
  onCambio,
  sucursalId,
  puedeQuitar = true,
  soloLectura = false,
}: {
  grande?: boolean;
  onCambio?: () => void;
  sucursalId?: number | null;
  puedeQuitar?: boolean;
  soloLectura?: boolean;
} = {}) {
  const { negocio, usuario, rubro } = useAuth();
  /**
   * A quién más le llega el QR. En un salón de belleza no hay meseros ni, casi
   * nunca, reparto (QA B-21), y en un billar tampoco (18-oct: decía "lo
   * reciben también los meseros y el reparto"): se nombra sólo lo que el
   * negocio tiene. En los demás rubros, el texto de siempre.
   */
  const conSalon = tieneFeature(negocio?.features, "salon");
  const conReparto = tieneFeature(negocio?.features, "delivery");
  // Un instituto tampoco tiene meseros: como en belleza y el billar, se nombra
  // lo que hay.
  const segunFeatures = esBelleza(rubro) || esBillar(rubro) || rubro === "ACADEMIA";
  const quienesMas = !segunFeatures
    ? "los meseros y el reparto"
    : conSalon && conReparto
      ? "los meseros y el reparto"
      : conSalon
        ? "los meseros"
        : conReparto
          ? "el reparto"
          : null;
  const alias = negocio?.alias;
  const sede = sucursalId ?? null;
  const [qr, setQr] = useState<string | null>(() => (sede != null ? leerQr(alias, sede) : leerQr(alias)));
  const [error, setError] = useState("");
  // Quitarlo lo borra en todos los equipos: un toque suelto dejaba a las
  // cajas sin QR para cobrar. Se confirma antes (18-oct).
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Sin el permiso se ve cuál es (para saber que está), pero no se toca: el
  // backend rechaza el cambio y antes el botón estaba igual, y lo elegido
  // quedaba sólo en este equipo con un error de "no se pudo compartir".
  const puedeCambiar = puedeCambiarQr(usuario) && !soloLectura;

  // Si otro equipo ya lo subió, se muestra ése: no hay que volver a elegirlo.
  useEffect(() => {
    let vivo = true;
    const puede = puedeCambiarQr(usuario);
    void (sede != null ? sincronizarQr(alias, puede, sede) : sincronizarQr(alias, puede)).then((q) => {
      if (vivo) setQr(q);
    });
    return () => {
      vivo = false;
    };
  }, [alias, usuario, sede]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    const res = sede != null ? await guardarQr(alias, archivo, sede) : await guardarQr(alias, archivo);
    if (res.ok) {
      setQr(sede != null ? leerQr(alias, sede) : leerQr(alias));
      // Si no sube (sin señal), en este equipo igual queda y se cobra; se
      // avisa para que se sepa que los meseros todavía no lo tienen.
      const subida = sede != null ? await subirQr(alias, sede) : await subirQr(alias);
      if (!subida.ok) {
        setError(
          `El QR quedó en este equipo, pero no se pudo compartir con ${
            segunFeatures ? "los demás equipos" : "los meseros"
          }: ${subida.error}`,
        );
      }
      onCambio?.();
    } else {
      setError(res.error);
    }
    // Permite volver a elegir el MISMO archivo si el primer intento falló.
    if (input.current) input.current.value = "";
  }

  async function quitar() {
    setQuitando(true);
    if (sede != null) borrarQr(alias, sede);
    else borrarQr(alias);
    setQr(null);
    // Quitarlo acá y dejarlo en los celulares de los meseros sería seguir
    // cobrando a una cuenta dada de baja.
    const res = sede != null ? await quitarQrDelNegocio(sede) : await quitarQrDelNegocio();
    setQuitando(false);
    setConfirmarQuitar(false);
    if (!res.ok) setError(res.error);
    onCambio?.();
  }

  const lado = grande ? "h-40 w-40" : "h-16 w-16";
  return (
    <div className="rounded-xl border border-borde p-3.5">
      <div className={`flex gap-3 ${grande ? "flex-col items-center text-center sm:flex-row sm:items-start sm:text-left" : "items-start"}`}>
        {qr ? (
          <img
            src={qr}
            alt="QR de cobro del negocio"
            className={`${lado} shrink-0 rounded-lg border border-borde object-contain`}
          />
        ) : (
          <span className={`flex ${lado} shrink-0 items-center justify-center rounded-lg bg-muted text-texto-4`}>
            <Icon name="qr" size={grande ? 44 : 26} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-bold text-texto">QR de cobro</h4>
          <p className="mt-0.5 text-xs text-texto-3">
            {qr
              ? "Se le muestra al cliente cuando paga por QR."
              : puedeCambiar
                ? "Subí la imagen de tu QR para mostrársela al cliente al cobrar."
                : "Todavía no hay QR del negocio. Lo carga el administrador."}
          </p>
          {quienesMas && (
            <p className="mt-1 text-xs text-texto-4">Lo reciben también {quienesMas}.</p>
          )}

          {puedeCambiar && (
            <div className={`mt-2 flex flex-wrap gap-2 ${grande ? "justify-center sm:justify-start" : ""}`}>
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="rounded-lg border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-texto-2 hover:bg-muted"
              >
                {qr ? "Cambiar" : "Subir QR"}
              </button>
              {qr && puedeQuitar && (
                <button
                  type="button"
                  onClick={() => setConfirmarQuitar(true)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-text hover:bg-danger-bg"
                >
                  Quitar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => elegir(e.target.files?.[0])}
      />

      <ErrorMsg>{error}</ErrorMsg>

      <Confirmar
        abierto={confirmarQuitar}
        titulo="Quitar el QR de cobro"
        texto={
          sede != null
            ? "Se borra el QR de esta sucursal: hasta que subas otro, sus cajas van a mostrar el QR general del negocio."
            : "Se borra en todos los equipos del negocio: hasta que subas otro, ninguna caja va a poder mostrarle un QR al cliente."
        }
        etiquetaOk="Quitar QR"
        peligroso
        procesando={quitando}
        onCancel={() => setConfirmarQuitar(false)}
        onOk={quitar}
      />
    </div>
  );
}

/**
 * El QR que ve el cliente al pagar, con su confirmación manual.
 *
 * La confirmación es el punto: nadie verifica la transferencia por nosotros, y
 * sin este paso la venta se registraba como cobrada por el solo hecho de haber
 * elegido "QR". El cajero mira su banco y recién ahí confirma; hasta entonces
 * el botón de cobrar queda bloqueado, igual que en la app.
 */
export function QrParaCobrar({
  confirmado,
  onConfirmar,
  /** Monto a cobrar, para que el cajero contraste contra lo que le entró. */
  monto,
  sinBoton = false,
}: {
  confirmado: boolean;
  onConfirmar: () => void;
  monto?: string;
  /**
   * Sin el botón «Confirmar pago recibido»: quien la usa confirma al cobrar
   * con un solo botón («Llegó el QR · Confirmar cobro», Cobrar a estudiante).
   * Queda el aviso de revisar el banco antes.
   */
  sinBoton?: boolean;
}) {
  const { negocio, usuario } = useAuth();
  const alias = negocio?.alias;
  // La sede de la caja, para la organización con un QR por sucursal; para los
  // demás, nada (`listo` de entrada) y todo como siempre.
  const { sedeId: sede, listo } = useSedeDeCobro();
  const [qr, setQr] = useState<string | null>(() => (sede != null ? leerQr(alias, sede) : leerQr(alias)));
  const [ampliado, setAmpliado] = useState(false);
  const puedeCargar = puedeCambiarQr(usuario);
  const input = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");

  async function cargar(archivo: File | undefined) {
    if (!archivo) return;
    setErrorCarga("");
    setCargando(true);
    // Desde acá se sube el QR general, que es el de respaldo de toda sede
    // (el propio de cada sede se sube en «QR de cobro»).
    const res = await guardarQr(alias, archivo);
    if (res.ok) {
      setQr(leerQr(alias));
      const subida = await subirQr(alias);
      if (!subida.ok) {
        setErrorCarga(
          `El QR quedó en este equipo, pero no se pudo compartir con los meseros: ${subida.error}`,
        );
      }
    } else {
      setErrorCarga(res.error);
    }
    setCargando(false);
    if (input.current) input.current.value = "";
  }

  // Se muestra la copia del equipo al instante y se trae la del backend por
  // si la caja la cambió (o, en el equipo del mesero, porque nunca la tuvo).
  useEffect(() => {
    if (!listo) return;
    let vivo = true;
    const puede = puedeCambiarQr(usuario);
    void (sede != null ? sincronizarQr(alias, puede, sede) : sincronizarQr(alias, puede)).then((q) => {
      if (vivo) setQr(q);
    });
    return () => {
      vivo = false;
    };
  }, [alias, usuario, sede, listo]);

  return (
    <div className="space-y-3">
      {qr ? (
        <button
          type="button"
          onClick={() => setAmpliado(true)}
          className="mx-auto block rounded-xl border border-borde bg-white p-2"
          title="Ampliar"
        >
          <img src={qr} alt="QR de cobro" className="h-44 w-44 object-contain" />
        </button>
      ) : (
        <div className="mx-auto flex h-44 w-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-borde bg-muted px-3 text-center">
          <Icon name="qr" size={30} />
          <span className="text-xs text-texto-3">
            {puedeCargar
              ? "Todavía no hay QR del negocio."
              : "Todavía no hay QR del negocio. Lo carga el administrador."}
          </span>
          {/* Cargarlo acá mismo. Antes el único lugar era la apertura de caja,
              y con la caja ya abierta no había dónde: en QA llevaba una semana
              abierta y el QR no se podía subir. Sólo quien tiene
              `qr.configurar` (de fábrica, el Administrador) lo ve. */}
          {puedeCargar && (
            <>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={cargando}
                className="rounded-lg border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-texto-2 hover:bg-white/70"
              >
                {cargando ? "Cargando…" : "Cargar el QR"}
              </button>
              <input
                ref={input}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => cargar(e.target.files?.[0])}
              />
            </>
          )}
        </div>
      )}
      {errorCarga && <ErrorMsg>{errorCarga}</ErrorMsg>}

      {!sinBoton && (
        <button
          type="button"
          onClick={onConfirmar}
          disabled={confirmado}
          className={[
            "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold transition-colors",
            confirmado
              ? "border-primary bg-primary-50 text-primary-700"
              : "border-borde bg-white text-texto hover:bg-muted",
          ].join(" ")}
        >
          {confirmado && <Icon name="check" size={17} />}
          {confirmado ? "Pago confirmado" : "Confirmar pago recibido"}
        </button>
      )}

      {!confirmado && (
        <p className="text-center text-xs text-texto-3">
          Revisá que el pago{monto ? ` de ${monto}` : ""} haya llegado antes de confirmar.
        </p>
      )}

      {ampliado && qr && (
        <Modal abierto titulo="QR de cobro" onClose={() => setAmpliado(false)} ancho="max-w-sm">
          <div className="p-4">
            <img src={qr} alt="QR de cobro" className="mx-auto w-full max-w-xs object-contain" />
          </div>
        </Modal>
      )}
    </div>
  );
}
