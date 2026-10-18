import { EncabezadoPagina } from "../components/filtros";
import { Icon } from "../components/Icon";
import { CargarQrCobro } from "../components/QrCobro";
import { api } from "../lib/api";
import { fmtFechaHora } from "../lib/format";
import { useApi } from "../lib/useApi";

/**
 * QR de cobro: el del negocio, el que ven los clientes cuando pagan por QR en
 * cualquier caja. Pantalla del administrador (`qr.configurar`).
 *
 * Antes sólo se cambiaba desde la apertura de una caja, y el dueño (18-oct)
 * lo encontraba en "Ventas o Billar": no es el lugar para algo que decide a
 * qué cuenta entra la plata. La apertura lo sigue mostrando (a la cajera, sin
 * botones).
 *
 * La cajera no lo puede cambiar a propósito (decisión del 16-oct): el sistema
 * no distingue el QR que le pasó el dueño del de su cuenta personal, y con el
 * suyo los cobros por QR irían a ella y figurarían "cobrados por QR".
 */
export default function QrDeCobro() {
  const info = useApi(() => api.qrCobro(), []);
  const d = info.datos;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="QR de cobro"
        subtitulo="El que ven los clientes cuando pagan por QR, en todas las cajas"
      />

      <CargarQrCobro grande onCambio={info.recargar} />

      {d?.imagen && d.actualizadoEn && (
        <p className="flex items-center gap-1.5 px-1 text-[13px] text-texto-3">
          <Icon name="clock" size={15} />
          {/* Sin punto final: la hora ya termina en "p. m." */}
          Lo puso {d.actualizadoPor ?? "alguien con permiso"} el {fmtFechaHora(d.actualizadoEn)}
        </p>
      )}

      <section className="card space-y-2.5 p-4 text-[13px] text-texto-2">
        <h2 className="text-sm font-bold text-texto">Para que la plata llegue a tu cuenta</h2>
        <p>
          Sólo vos lo podés subir o cambiar: si una cajera pudiera poner el suyo, los cobros por QR irían a su cuenta y
          el sistema igual diría «cobrado por QR».
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
