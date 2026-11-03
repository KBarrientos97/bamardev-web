import { useRef, useState } from "react";
import { CampoCategoria, PanelCategorias } from "../components/CategoriasGasto";
import { Icon } from "../components/Icon";
import InputMonto from "../components/InputMonto";
import { EncabezadoPagina } from "../components/filtros";
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
  Select,
  useAviso,
  Vacio,
} from "../components/ui";
import { api } from "../lib/api";
import { esPositivo } from "../lib/dinero";
import { leerMonto, montoParaEditar } from "../lib/montoTecleado";
import { fmtFecha, fmtMoney } from "../lib/format";
import { esFarmacia } from "../lib/rubro";
import { useApi } from "../lib/useApi";
import { useSucursales } from "../lib/useSucursales";
import { useAuth } from "../store/AuthContext";
import type {
  CategoriaGasto,
  FrecuenciaGasto,
  PlantillaGasto,
  PlantillaGastoInput,
} from "../types";

/**
 * Gastos automáticos: las **reglas** que crean un gasto solas.
 *
 * Una regla no es un gasto. El gasto ocurrió y tiene monto, fecha y saldo; la
 * regla no ocurrió nunca y tiene frecuencia, día del mes y la posibilidad de
 * no saber todavía cuánto va a ser (la luz). Por eso viven en pantallas
 * distintas, igual que en la app.
 *
 * **Quien las corre es el servidor, no esta pantalla**: una computadora apagada
 * el 1 de octubre no puede crear nada. Acá sólo se configuran.
 */

const FRECUENCIAS = [
  ["MENSUAL", "Cada mes"],
  ["BIMESTRAL", "Cada 2 meses"],
  ["TRIMESTRAL", "Cada 3 meses"],
  ["SEMESTRAL", "Cada 6 meses"],
  ["ANUAL", "Cada año"],
] as const satisfies readonly (readonly [FrecuenciaGasto, string])[];

const ETIQUETA_FRECUENCIA: Record<FrecuenciaGasto, string> = Object.fromEntries(
  FRECUENCIAS,
) as Record<FrecuenciaGasto, string>;

export default function GastosFijos() {
  const { sucursalId } = useSucursales();
  const { rubro } = useAuth();
  const [editando, setEditando] = useState<PlantillaGasto | null | undefined>(
    undefined,
  );
  const [borrando, setBorrando] = useState<PlantillaGasto | null>(null);
  const [aviso, mostrarAviso] = useAviso();
  const [errorAccion, setErrorAccion] = useState("");

  const lista = useApi(() => api.getPlantillasGasto(sucursalId), [sucursalId]);
  const categorias = useApi(() => api.getCategoriasGasto(), []);

  const plantillas = lista.datos ?? [];
  const activas = plantillas.filter((p) => p.activa);

  /** Lo que van a sumar las reglas activas la próxima vez que corran. */
  const estimado = activas.reduce((a, p) => a + (p.monto ?? 0), 0);
  /** Las de monto variable no suman: recién se sabe cuando llega la factura. */
  const sinMonto = activas.filter((p) => p.monto == null).length;

  const cambiarEstado = async (p: PlantillaGasto) => {
    setErrorAccion("");
    try {
      await api.cambiarEstadoPlantillaGasto(p.id, { activa: !p.activa });
      mostrarAviso(
        p.activa
          ? `${p.concepto} queda pausado`
          : `${p.concepto} vuelve a cargarse solo`,
      );
      lista.recargar();
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : "No se pudo cambiar la regla");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:space-y-5 sm:p-5">
      <EncabezadoPagina
        titulo="Gastos automáticos"
        volver={{ a: "/gastos", etiqueta: "Volver a Gastos operativos" }}
        subtitulo="Los que se repiten todos los meses: se cargan solos el día que corresponde"
        accion={
          <Boton onClick={() => setEditando(null)}>
            <Icon name="plus" size={16} /> Nuevo gasto automático
          </Boton>
        }
      />

      {aviso && <AvisoOk>{aviso}</AvisoOk>}
      {errorAccion && <ErrorMsg>{errorAccion}</ErrorMsg>}

      {activas.length > 0 && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-semibold text-primary-700">Se cargan solos</div>
              <p className="text-sm text-texto-3">
                El día que corresponde aparecen en la lista como pendientes. Vos
                sólo confirmás el monto real cuando llega la factura.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase text-texto-4">
                Estimado
              </div>
              <div className="text-lg font-semibold">{fmtMoney(estimado)}</div>
            </div>
          </div>
          {sinMonto > 0 && (
            <p className="mt-2 text-sm text-texto-3">
              {sinMonto === 1
                ? "1 regla se crea sin monto: lo pone la factura del mes."
                : `${sinMonto} reglas se crean sin monto: lo pone la factura del mes.`}
            </p>
          )}
        </div>
      )}

      {lista.cargando ? (
        <Cargando />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : plantillas.length === 0 ? (
        <Vacio
          icono="swap"
          titulo="Todavía no cargaste ninguno"
          texto="Acá van el alquiler, los sueldos y los servicios: lo que se repite todos los meses y no querés tener que acordarte."
        />
      ) : (
        <ul className="space-y-2">
          {plantillas.map((p) => (
            <li
              key={p.id}
              className="card flex flex-wrap items-center gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{p.concepto}</span>
                  <Badge tono="gris">{p.categoriaNombre ?? p.categoria}</Badge>
                  {p.sucursal && <Badge tono="gris">{p.sucursal}</Badge>}
                  {!p.activa && <Badge tono="amarillo">Pausado</Badge>}
                </div>
                <div className="mt-1 text-sm text-texto-3">
                  {/* Pausada no anuncia próxima carga: no va a correr. */}
                  {p.activa ? (
                    <>
                      {ETIQUETA_FRECUENCIA[p.frecuencia]} · día {p.diaDelMes}
                      {p.proximaCarga && ` · próxima ${fmtFecha(p.proximaCarga)}`}
                    </>
                  ) : (
                    p.motivoPausa || "Pausado: no se va a crear"
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">
                  {p.monto == null ? "A confirmar" : fmtMoney(p.monto)}
                </div>
              </div>
              <div className="flex gap-2">
                <Boton variante="ghost" onClick={() => cambiarEstado(p)}>
                  {p.activa ? "Pausar" : "Reanudar"}
                </Boton>
                <Boton variante="ghost" onClick={() => setEditando(p)}>
                  Editar
                </Boton>
                <Boton variante="danger" onClick={() => setBorrando(p)}>
                  Borrar
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editando !== undefined && (
        <FormPlantilla
          plantilla={editando}
          categorias={categorias.datos ?? []}
          sucursalSugerida={sucursalId}
          onCerrar={() => setEditando(undefined)}
          onGuardado={(texto) => {
            setEditando(undefined);
            mostrarAviso(texto);
            lista.recargar();
          }}
          // El mismo panel que el formulario de Gastos operativos (G-03): la
          // regla del alquiler también necesita su categoría. La farmacia
          // administra las suyas desde su pantalla y acá queda como estaba.
          onCatalogo={
            esFarmacia(rubro)
              ? undefined
              : (nuevo) => {
                  categorias.setDatos(nuevo);
                  // Un renombre cambia cómo se lee cada regla de la lista.
                  lista.recargar();
                }
          }
        />
      )}

      {borrando && (
        <Confirmar
          abierto
          titulo="Borrar el gasto automático"
          texto={`"${borrando.concepto}" deja de crearse. Los gastos que ya creó se conservan.`}
          etiquetaOk="Borrar"
          peligroso
          onCancel={() => setBorrando(null)}
          onOk={async () => {
            const p = borrando;
            setBorrando(null);
            setErrorAccion("");
            try {
              await api.eliminarPlantillaGasto(p.id);
              mostrarAviso(`${p.concepto} ya no se carga solo`);
              lista.recargar();
            } catch (e) {
              setErrorAccion(
                e instanceof Error ? e.message : "No se pudo borrar la regla",
              );
            }
          }}
        />
      )}
    </div>
  );
}

// ── Formulario ──────────────────────────────────────────────────────────────

function FormPlantilla({
  plantilla,
  categorias,
  sucursalSugerida,
  onCerrar,
  onGuardado,
  onCatalogo,
}: {
  /** null = alta. */
  plantilla: PlantillaGasto | null;
  categorias: CategoriaGasto[];
  sucursalSugerida: number | null;
  onCerrar: () => void;
  onGuardado: (texto: string) => void;
  /** Ver `FormGasto`: sin esto, el desplegable de siempre y nada más. */
  onCatalogo?: (lista: CategoriaGasto[]) => void;
}) {
  const [concepto, setConcepto] = useState(plantilla?.concepto ?? "");
  const [categoria, setCategoria] = useState(plantilla?.categoria ?? "");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaGasto>(
    plantilla?.frecuencia ?? "MENSUAL",
  );
  const [dia, setDia] = useState(String(plantilla?.diaDelMes ?? 1));
  /** Vacío = monto variable: lo pone la factura del mes. */
  const [monto, setMonto] = useState(
    plantilla?.monto == null ? "" : montoParaEditar(plantilla.monto),
  );
  /**
   * En un ALTA arranca apagado: lo normal es saber cuánto es el alquiler, y el
   * monto variable es la excepción (luz, agua, gas). Con `plantilla?.monto ==
   * null` arrancaba marcado, porque en un alta `plantilla` es null y el
   * optional chaining devuelve undefined: el campo monto nacía deshabilitado y
   * había que desmarcar un switch para poder escribir.
   */
  const [variable, setVariable] = useState(
    plantilla != null && plantilla.monto == null,
  );
  const [beneficiario, setBeneficiario] = useState(plantilla?.beneficiario ?? "");
  const [nota, setNota] = useState(plantilla?.nota ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Ver `Gastos.tsx`: el estado no frena el segundo clic del mismo tick. */
  const enVuelo = useRef(false);
  /** true mientras el cuerpo del formulario muestra el panel de categorías. */
  const [conCategorias, setConCategorias] = useState(false);
  const panel = conCategorias && !!onCatalogo;

  const guardar = async () => {
    if (enVuelo.current) return;
    if (!concepto.trim()) return setError("Ponele un concepto.");
    if (!categoria) return setError("Elegí una categoría.");

    const d = Number(dia);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return setError("El día tiene que estar entre 1 y 31.");
    }

    // Vacío es monto variable, que es distinto de cero: cero sería un gasto de
    // cero pesos. Con el switch apagado el monto es obligatorio.
    let m: number | null = null;
    if (!variable) {
      const parsed = leerMonto(monto);
      if (parsed == null || !esPositivo(parsed)) {
        return setError("El monto tiene que ser mayor a cero.");
      }
      m = parsed;
    }

    const input: PlantillaGastoInput = {
      concepto: concepto.trim(),
      categoria,
      frecuencia,
      diaDelMes: d,
      monto: m,
      beneficiario: beneficiario.trim() || null,
      nota: nota.trim() || null,
      // Al editar se conserva el local que ya tenía; al crear, el que está
      // filtrado. Sin esto toda regla nueva nacía sin local y el alquiler de
      // una sucursal se cargaba al negocio entero, todos los meses.
      sucursalId: plantilla ? plantilla.sucursalId : sucursalSugerida,
    };

    enVuelo.current = true;
    setGuardando(true);
    setError("");
    try {
      if (plantilla) {
        await api.actualizarPlantillaGasto(plantilla.id, input);
        onGuardado("Gasto automático actualizado");
      } else {
        await api.crearPlantillaGasto(input);
        onGuardado("Se va a crear solo cada vez que corresponda");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      enVuelo.current = false;
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={
        panel
          ? "Categorías de gasto"
          : plantilla
            ? "Editar gasto automático"
            : "Nuevo gasto automático"
      }
      subtitulo={panel ? "Tocá una para elegirla" : "Se va a crear solo cada vez que corresponda"}
      // Con el panel abierto, cerrar vuelve a la regla: ver `FormGasto`.
      onClose={panel ? () => setConCategorias(false) : onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        panel ? (
          <Boton variante="ghost" onClick={() => setConCategorias(false)}>
            Volver al gasto automático
          </Boton>
        ) : (
          <>
            <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </>
        )
      }
    >
      {panel && onCatalogo && (
        <PanelCategorias
          categorias={categorias}
          elegida={categoria}
          onElegir={(c) => {
            setCategoria(c.codigo);
            setConCategorias(false);
          }}
          onCatalogo={(lista) => {
            // Se retiró la que estaba elegida: se pide elegir otra, menos si es
            // la que la regla ya tenía (ver `FormGasto`).
            const estaba = categorias.some((c) => c.codigo === categoria);
            const seRetiro = estaba && !lista.some((c) => c.codigo === categoria);
            if (seRetiro && categoria !== plantilla?.categoria) setCategoria("");
            onCatalogo(lista);
          }}
        />
      )}
      <div className="space-y-3" hidden={panel}>
        <Campo label="Concepto">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Alquiler del local"
            autoFocus
          />
        </Campo>
        <CampoCategoria
          categorias={categorias}
          valor={categoria}
          onChange={setCategoria}
          original={plantilla ? { codigo: plantilla.categoria, nombre: plantilla.categoriaNombre } : null}
          onAdministrar={onCatalogo ? () => setConCategorias(true) : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cada cuánto">
            <Select
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as FrecuenciaGasto)}
            >
              {FRECUENCIAS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Qué día">
            <Input
              inputMode="numeric"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              placeholder="5"
            />
          </Campo>
        </div>
        <p className="-mt-1 text-xs text-texto-4">
          Si ponés 31, en los meses que no lo tienen se crea el último día.
        </p>

        <Campo label="Monto (Bs)">
          <InputMonto value={variable ? "" : monto} onChange={setMonto} placeholder="0,00" disabled={variable} />
        </Campo>
        <label className="flex items-start gap-2 rounded-xl border border-borde p-3 text-sm">
          <input
            type="checkbox"
            checked={variable}
            onChange={(e) => setVariable(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong>No sé el monto todavía</strong>
            <span className="block text-texto-3">
              Para la luz, el agua o el gas: el gasto se crea sin monto y vos lo
              completás cuando llega la factura.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Beneficiario (opcional)">
            <Input
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
              placeholder="Ej: DELAPAZ"
            />
          </Campo>
          <Campo label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} />
          </Campo>
        </div>

        {error && <ErrorMsg>{error}</ErrorMsg>}
      </div>
    </Modal>
  );
}
