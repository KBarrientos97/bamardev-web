import { useState } from "react";
import { Icon } from "../../components/Icon";
import { AvisoOk, Badge, Boton, Campo, Confirmar, ErrorMsg, Input, Modal, useAviso } from "../../components/ui";
import {
  apiTelevisores,
  claveOpcion,
  type OpcionTv,
  type TelevisorLocal,
} from "../../lib/apiTelevisores";
import { codigoEscrito, codigoParaVer } from "../../lib/tickets/codigoTv";
import { useApi } from "../../lib/useApi";
import { Tarjeta } from "./piezas";

/**
 * Las TVs del local conectadas con código (Kevin, 4-nov): van colgadas arriba,
 * y escribir el enlace con la llave entera con el control remoto era un
 * castigo. En la TV se abre `/tv` a secas, muestra un código, y acá se escribe
 * eligiendo qué va a mostrar. Después se le cambia o se la desconecta sin
 * subirse a tocarla.
 *
 * Va en Tickets y pedidos y en el Menú digital, con la misma lista: una TV
 * conectada puede pasar de los tickets al menú. Qué se le puede poner lo dice
 * el servidor (`opciones`), según los extras del negocio y los permisos.
 */
export default function TelevisoresDelLocal() {
  const lista = useApi(() => apiTelevisores.listar(), []);
  const [conectando, setConectando] = useState(false);
  const [cambiando, setCambiando] = useState<TelevisorLocal | null>(null);
  const [desconectar, setDesconectar] = useState<TelevisorLocal | null>(null);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const tvs = lista.datos?.televisores ?? [];
  const opciones = lista.datos?.opciones ?? [];
  const direccion = `${window.location.host}/tv`;

  async function quitar(tv: TelevisorLocal) {
    setError("");
    setEnCurso(true);
    try {
      await apiTelevisores.desconectar(tv.id);
      setDesconectar(null);
      setAviso(`"${tv.nombre}" quedó desconectada: ahora muestra un código para conectarla de nuevo.`);
      lista.recargar();
    } catch (e) {
      setDesconectar(null);
      setError(e instanceof Error ? e.message : "No se pudo desconectar la TV");
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <Tarjeta titulo="TVs del local">
      <p className="text-[13px] text-texto-2">
        En el navegador de la TV abrí <b className="font-semibold text-texto">{direccion}</b>: muestra un código.
        Tocá <b className="font-semibold text-texto">Conectar una TV</b> y escribilo acá.
      </p>

      <ErrorMsg>{error || lista.error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

      {tvs.map((tv) => (
        <div key={tv.id} className="mt-3 flex items-center gap-3 rounded-xl border border-borde p-3">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${tv.prendida ? "bg-primary-boton" : "bg-slate-300"}`}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-texto">{tv.nombre}</p>
            <p className="truncate text-[12px] text-texto-3">
              {queMuestra(tv)} · {tv.prendida ? "prendida" : "apagada o sin internet"}
            </p>
          </div>
          <Boton variante="ghost" className="px-3 py-1.5" onClick={() => setCambiando(tv)}>
            Cambiar
          </Boton>
        </div>
      ))}

      <Boton
        icono="pantalla"
        variante={tvs.length ? "ghost" : "primary"}
        className="mt-3 w-full"
        onClick={() => {
          // Las opciones de recién: una TV del menú agregada en esta pantalla
          // tiene que aparecer para elegirla.
          lista.recargar();
          setConectando(true);
        }}
      >
        Conectar una TV
      </Boton>

      {conectando && (
        <FormTv
          titulo="Conectar una TV"
          opciones={opciones}
          onClose={() => setConectando(false)}
          onGuardar={async ({ codigo, opcion, nombre }) => {
            const tv = await apiTelevisores.conectar({
              codigo,
              muestra: opcion.muestra,
              ...(opcion.menu != null ? { menu: opcion.menu } : {}),
              ...(nombre ? { nombre } : {}),
            });
            setConectando(false);
            setAviso(`"${tv.nombre}" conectada: en unos segundos cambia sola.`);
            lista.recargar();
          }}
        />
      )}
      {cambiando && (
        <FormTv
          titulo={`Cambiar ${cambiando.nombre}`}
          tv={cambiando}
          opciones={opciones}
          onClose={() => setCambiando(null)}
          onDesconectar={() => {
            setDesconectar(cambiando);
            setCambiando(null);
          }}
          onGuardar={async ({ opcion, nombre }) => {
            const tv = await apiTelevisores.cambiar(cambiando.id, {
              muestra: opcion.muestra,
              ...(opcion.menu != null ? { menu: opcion.menu } : {}),
              ...(nombre ? { nombre } : {}),
            });
            setCambiando(null);
            setAviso(`"${tv.nombre}" cambia en unos segundos.`);
            lista.recargar();
          }}
        />
      )}
      <Confirmar
        abierto={!!desconectar}
        titulo="¿Desconectar esta TV?"
        texto={`"${desconectar?.nombre}" deja de mostrar lo que tiene y vuelve a mostrar un código. Para conectarla de nuevo hay que leer ese código en la TV.`}
        etiquetaOk="Desconectar"
        peligroso
        procesando={enCurso}
        onCancel={() => setDesconectar(null)}
        onOk={() => desconectar && void quitar(desconectar)}
      />
    </Tarjeta>
  );
}

function queMuestra(tv: TelevisorLocal): string {
  if (tv.muestra === "TICKETS") return "Tickets";
  return tv.menuNombre ? `Menú: ${tv.menuNombre}` : "Una TV del menú que ya no existe";
}

/**
 * Conectar (con el código) o cambiar una TV: qué va a mostrar y su nombre.
 * Las opciones son pocas (tickets y hasta 4 del menú): van todas a la vista.
 */
function FormTv({
  titulo,
  tv,
  opciones,
  onClose,
  onGuardar,
  onDesconectar,
}: {
  titulo: string;
  /** La TV que se cambia; sin ella, se conecta una nueva con su código. */
  tv?: TelevisorLocal;
  opciones: OpcionTv[];
  onClose: () => void;
  onGuardar: (d: { codigo: string; opcion: OpcionTv; nombre: string }) => Promise<void>;
  onDesconectar?: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [elegida, setElegida] = useState(() =>
    tv ? claveOpcion(tv) : opciones.length === 1 ? claveOpcion(opciones[0]) : "",
  );
  const [nombre, setNombre] = useState(tv?.nombre ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const opcion = opciones.find((o) => claveOpcion(o) === elegida);

  async function guardar() {
    setError("");
    if (!tv && codigo.length !== 6) return setError("El código son 6 letras y números, como sale en la TV.");
    if (!opcion) return setError("Elegí qué va a mostrar la TV.");
    setGuardando(true);
    try {
      await onGuardar({ codigo, opcion, nombre: nombre.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={tv ? "La TV cambia sola en unos segundos" : "El código que muestra la TV"}
      onClose={onClose}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono={tv ? "save" : "pantalla"} onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : tv ? "Guardar" : "Conectar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {!tv && (
          <Campo label="Código de la TV" hint="Mayúsculas o minúsculas, da igual">
            <Input
              value={codigoParaVer(codigo)}
              onChange={(e) => setCodigo(codigoEscrito(e.target.value))}
              placeholder="K7P 4QX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              className="text-center font-mono !text-2xl font-bold tracking-[0.2em]"
            />
          </Campo>
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">¿Qué va a mostrar?</span>
          {opciones.length === 0 ? (
            <p className="text-[13px] text-texto-3">
              No hay nada que puedas poner en una TV: armá primero una pantalla del Menú digital.
            </p>
          ) : (
            <div className="space-y-2" role="radiogroup">
              {opciones.map((o) => {
                const clave = claveOpcion(o);
                const activa = clave === elegida;
                return (
                  <button
                    key={clave}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => setElegida(clave)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                      activa ? "border-primary-boton bg-primary-50 text-primary-700" : "border-borde text-texto hover:bg-muted"
                    }`}
                  >
                    <Icon name={o.muestra === "TICKETS" ? "ticket" : "pantalla"} size={16} />
                    <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
                    {activa && <Icon name="check" size={16} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Campo label="Nombre (opcional)" hint="Para reconocerla en la lista">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="TV de la entrada" maxLength={40} />
        </Campo>
        {tv && (
          <p className="flex items-center gap-2 text-[12px] text-texto-3">
            <Badge tono={tv.prendida ? "verde" : "gris"}>{tv.prendida ? "Prendida" : "Apagada"}</Badge>
            {tv.prendida ? "La TV está preguntando qué mostrar." : "Cuando se prenda, muestra lo que elijas acá."}
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
        {onDesconectar && (
          <button
            type="button"
            onClick={onDesconectar}
            className="text-[12px] font-semibold text-danger-text underline-offset-2 hover:underline"
          >
            Desconectar esta TV
          </button>
        )}
      </div>
    </Modal>
  );
}
