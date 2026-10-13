import { useState, type ReactNode } from "react";
import type { NavegadorIOS } from "../lib/pwa/entorno";
import { equipoActual, guiaPara } from "../lib/pwa/guia";
import { instalar, usePwa } from "../lib/pwa/pwa";
import { Icon, type NombreIcono } from "./Icon";
import { AvisoOk, Boton, Modal } from "./ui";

/**
 * "Instalar en el celular" (PLAN-IOS §8 F2): la web como app, con su ícono y
 * sin la barra del navegador. En Android/Chrome hay un botón que lo hace; en
 * iOS no existe ese botón para nadie (Safari no tiene `beforeinstallprompt`),
 * así que se explica el camino: Compartir → Agregar a inicio.
 */

function Paso({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
        {n}
      </span>
      <div className="flex-1 pt-0.5 text-sm leading-relaxed text-texto">{children}</div>
    </li>
  );
}

/**
 * El ícono tal como se ve en el iPhone, al lado de su nombre. Azul como el de
 * iOS y no del color del negocio: es para reconocerlo en la pantalla.
 */
function IconoIOS({ name }: { name: NombreIcono }) {
  return (
    <span className="mx-1 inline-flex h-6 w-6 -translate-y-px items-center justify-center rounded-md border border-borde bg-white align-middle text-sky-600">
      <Icon name={name} size={16} />
    </span>
  );
}

/** Los pasos de iOS según el navegador. */
function PasosIOS({ navegador }: { navegador: NavegadorIOS }) {
  if (navegador === "otro") {
    return (
      <div className="space-y-3 text-sm leading-relaxed text-texto">
        <p>Este navegador no deja agregar la app a la pantalla de inicio.</p>
        <p>
          Abrí <strong>{location.host}</strong> en <strong>Safari</strong> y tocá de nuevo “Instalar en el celular”
          desde el menú.
        </p>
      </div>
    );
  }
  const dondeCompartir =
    navegador === "safari" ? "abajo en el iPhone, arriba en el iPad" : "arriba, en la barra de la dirección";
  return (
    <ol className="space-y-4">
      <Paso n={1}>
        Tocá <strong>Compartir</strong>
        <IconoIOS name="compartir" />({dondeCompartir})
      </Paso>
      <Paso n={2}>
        Elegí <strong>Agregar a inicio</strong>
        <IconoIOS name="masCuadro" />. Si no la ves, deslizá la lista hacia arriba
      </Paso>
      <Paso n={3}>
        Dejá encendido <strong>Abrir como app web</strong> (si aparece) y tocá <strong>Agregar</strong>
      </Paso>
      <Paso n={4}>
        Abrí <strong>BamarDev</strong> desde el ícono nuevo y entrá con tu usuario: la app instalada tiene su propia
        sesión
      </Paso>
    </ol>
  );
}

export function HojaInstalar({ onClose }: { onClose: () => void }) {
  const estado = usePwa();
  const guia = guiaPara(estado, equipoActual());
  const [instalando, setInstalando] = useState(false);

  async function alInstalar() {
    setInstalando(true);
    try {
      if (await instalar()) onClose();
    } finally {
      setInstalando(false);
    }
  }

  const acciones =
    guia.tipo === "boton" ? (
      <>
        <Boton variante="ghost" onClick={onClose}>
          Ahora no
        </Boton>
        <Boton icono="download" onClick={alInstalar} disabled={instalando}>
          {instalando ? "Instalando…" : "Instalar"}
        </Boton>
      </>
    ) : (
      <Boton onClick={onClose}>Entendido</Boton>
    );

  return (
    <Modal
      abierto
      titulo="Instalá BamarDev en tu celular"
      subtitulo="Queda con su ícono, abre más rápido y sin la barra del navegador."
      onClose={onClose}
      ancho="max-w-sm"
      acciones={acciones}
    >
      {guia.tipo === "instalada" && <AvisoOk>Ya estás usando BamarDev como app.</AvisoOk>}
      {guia.tipo === "boton" && (
        <p className="text-sm leading-relaxed text-texto">
          Tocá <strong>Instalar</strong> y el ícono de BamarDev aparece junto a tus otras apps.
        </p>
      )}
      {guia.tipo === "ios" && <PasosIOS navegador={guia.navegador} />}
      {guia.tipo === "android" && (
        <ol className="space-y-4">
          <Paso n={1}>
            Tocá el menú del navegador (<strong>⋮</strong>, arriba a la derecha)
          </Paso>
          <Paso n={2}>
            Elegí <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>
          </Paso>
        </ol>
      )}
      {guia.tipo === "ninguna" && (
        <p className="text-sm leading-relaxed text-texto">
          En la computadora no hace falta instalar nada: seguí usando BamarDev desde el navegador.
        </p>
      )}
    </Modal>
  );
}

/**
 * "Hay una versión nueva": el deploy ya está en el celular pero la pantalla
 * sigue con la de antes. No se recarga sola (un cobro a medias se perdería);
 * se ofrece y el cajero elige el momento.
 */
export function AvisoVersionNueva() {
  const { versionNueva } = usePwa();
  const [cerrado, setCerrado] = useState(false);
  if (!versionNueva || cerrado) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
        <Icon name="download" size={18} />
        <span className="flex-1">Hay una versión nueva de BamarDev.</span>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25"
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => setCerrado(true)}
          aria-label="Cerrar aviso"
          className="rounded-lg p-1 text-white/70 hover:text-white"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  );
}
