import { useState } from "react";
import { Chips, EncabezadoPagina } from "../components/filtros";
import { Icon } from "../components/Icon";
import { CargarQrCobro } from "../components/QrCobro";
import { ErrorMsg } from "../components/ui";
import { api } from "../lib/api";
import { fmtFechaHora } from "../lib/format";
import { tienePermiso } from "../lib/permisos";
import { termino } from "../lib/rubro";
import { useApi } from "../lib/useApi";
import { useSucursales } from "../lib/useSucursales";
import { useAuth } from "../store/AuthContext";

/**
 * QR de cobro: el del negocio, el que ven los clientes cuando pagan por QR en
 * cualquier caja. Pantalla del administrador (`qr.configurar`).
 *
 * Antes sólo se cambiaba desde la apertura de una caja, y el dueño (18-oct)
 * lo encontraba en "Ventas o Billar": no es el lugar para algo que decide a
 * qué cuenta entra la plata. La apertura lo sigue mostrando (a la cajera, sin
 * botones).
 *
 * La cajera no lo puede cambiar de fábrica (decisión del 16-oct): el sistema
 * no distingue el QR que le pasó el dueño del de su cuenta personal, y con el
 * suyo los cobros por QR irían a ella y figurarían "cobrado por QR". El
 * administrador se lo puede dar en Roles («QR de cobro», 4-nov), y entonces
 * ve esta pantalla y el botón de la apertura: por eso el texto de abajo no
 * dice "sólo vos", que a ella le mentiría.
 *
 * QR POR SUCURSAL (decisión del dueño, 13-nov-2026): con 2 o más sucursales, la
 * administración elige entre el mismo QR en todas (lo de siempre) y uno en cada
 * una (casilla de abajo). Con un solo local, o para quien es de un local, esa
 * casilla y el selector no existen: la pantalla queda como siempre.
 */
export default function QrDeCobro() {
  const { usuario, rubro, vocabulario } = useAuth();
  const suc = useSucursales();
  const organizacion = suc.modo === "organizacion";
  // Qué sede se está mirando (la organización con un QR por sucursal); null = el general.
  const [sede, setSede] = useState<number | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [errorModo, setErrorModo] = useState("");

  const info = useApi(() => (sede != null ? api.qrCobro(sede) : api.qrCobro()), [sede]);
  const d = info.datos;
  // `mismoEnTodas` viene en cada respuesta; un backend anterior no lo manda y
  // es el mismo para todas, como siempre. Con un solo local no rige aunque
  // se haya elegido (regla del dueño: nada nuevo a la vista).
  const porSucursal = suc.modo !== "una" && d?.mismoEnTodas === false;
  const sedeVista = organizacion && porSucursal ? sede : null;
  const sucursales = termino(rubro, "sucursales", vocabulario);
  const sucursal = termino(rubro, "sucursal", vocabulario);
  const puedeElegirModo = organizacion && tienePermiso(usuario, "qr.configurar");
  // Quien es de un local, con el mismo QR para todas: lo ve, no lo toca.
  const soloLectura = suc.modo === "asignado" && !porSucursal;
  const sedePropia = sedeVista != null && d?.origen === "sucursal";
  const nombreSede = suc.sucursales.find((a) => a.id === sedeVista)?.nombre;

  async function elegirModo(unoPorSucursal: boolean) {
    setCambiando(true);
    setErrorModo("");
    try {
      await api.cambiarModoQrCobro(unoPorSucursal);
      setSede(null);
      info.recargar();
    } catch (e) {
      setErrorModo(e instanceof Error ? e.message : "No se pudo cambiar la opción.");
    } finally {
      setCambiando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="QR de cobro"
        subtitulo={
          porSucursal
            ? `El que ven los clientes cuando pagan por QR, en cada ${sucursal.toLowerCase()}`
            : "El que ven los clientes cuando pagan por QR, en todas las cajas"
        }
      />

      {puedeElegirModo && (
        <section className="card space-y-2 p-4">
          <label className="flex items-start gap-2.5 text-sm text-texto">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={!porSucursal}
              disabled={cambiando || info.cargando}
              onChange={(e) => void elegirModo(!e.target.checked)}
            />
            <span>
              <span className="font-semibold">Usar el mismo QR en todas las {sucursales.toLowerCase()}</span>
              <span className="mt-0.5 block text-[13px] text-texto-3">
                {porSucursal
                  ? `Cada ${sucursal.toLowerCase()} cobra con su QR; la que todavía no subió el suyo usa el general. Marcala para volver a uno solo para todas.`
                  : `Desmarcala si cada ${sucursal.toLowerCase()} cobra en una cuenta distinta: vas a poder subir un QR para cada una.`}
              </span>
            </span>
          </label>
          <ErrorMsg>{errorModo}</ErrorMsg>
        </section>
      )}

      {organizacion && porSucursal && (
        <Chips
          valor={sedeVista == null ? "" : String(sedeVista)}
          opciones={[
            ["", "QR general (de respaldo)"] as const,
            ...suc.sucursales.map((a) => [String(a.id), a.nombre] as const),
          ]}
          onChange={(v) => setSede(v === "" ? null : Number(v))}
        />
      )}

      {sedeVista != null && !sedePropia && !info.cargando && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-texto-2">
          {nombreSede ?? `Esta ${sucursal.toLowerCase()}`} no tiene QR propio: sus cajas cobran con el QR general. Subí el
          suyo para cambiarlo.
        </p>
      )}

      {/* Con `key`, cada sede arranca con su propia copia y sus propios mensajes. */}
      <CargarQrCobro
        key={sedeVista ?? "general"}
        grande
        onCambio={info.recargar}
        sucursalId={sedeVista}
        puedeQuitar={sedeVista == null || sedePropia}
        soloLectura={soloLectura}
      />

      {d?.imagen && d.actualizadoEn && (
        <p className="flex items-center gap-1.5 px-1 text-[13px] text-texto-3">
          <Icon name="clock" size={15} />
          {/* Sin punto final: la hora ya termina en "p. m." */}
          Lo puso {d.actualizadoPor ?? "alguien con permiso"} el {fmtFechaHora(d.actualizadoEn)}
        </p>
      )}

      {soloLectura && (
        <p className="px-1 text-[13px] text-texto-3">
          Es el QR de todas las {sucursales.toLowerCase()}: lo cambia la administración del negocio.
        </p>
      )}

      <section className="card space-y-2.5 p-4 text-[13px] text-texto-2">
        <h2 className="text-sm font-bold text-texto">Para que la plata llegue a tu cuenta</h2>
        <p>
          Lo sube o lo cambia el administrador y quien tenga el permiso «QR de cobro» en Roles.{" "}
          {porSucursal
            ? `Cada ${sucursal.toLowerCase()} muestra el suyo: si una cajera con el permiso pone uno que no es de la cuenta del negocio, los cobros por QR de esa ${sucursal.toLowerCase()} irán a ella y el sistema igual dirá «cobrado por QR».`
            : "Es uno para todas las cajas: si una cajera con el permiso pone el suyo, los cobros por QR de todos irán a su cuenta y el sistema igual dirá «cobrado por QR»."}
        </p>
        <p>
          Al escanearlo, la app del banco del cliente muestra a nombre de quién va la plata: tiene que decir el nombre de
          tu negocio. Si tenés el QR impreso en el mostrador, que sea el mismo.
        </p>
        <p>
          Al cerrar cada caja, compará lo cobrado por QR en ese turno con lo que entró a tu cuenta: la cajera marca
          cada pago como recibido, y esa comparación es la que lo controla.
        </p>
      </section>
    </div>
  );
}
