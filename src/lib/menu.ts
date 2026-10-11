import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { NombreIcono } from "../components/Icon";
import { useAuth } from "../store/AuthContext";
import type { Seccion } from "./permisos";
import { esBelleza, termino, type Termino, type Vocabulario } from "./rubro";

/**
 * El árbol del menú lateral, y el estado de qué grupos están abiertos.
 *
 * Vive aparte de `MenuLateral.tsx` porque lo usan dos lugares: la barra (que
 * dibuja el árbol) y la cabecera del celular (que sólo necesita el título de
 * la pantalla), y porque el estado de los grupos tiene que ser UNO solo para
 * la barra de escritorio y el cajón del celular, que en el celular están
 * montados los dos a la vez.
 */

export interface ItemNav {
  a: string;
  label: string;
  /**
   * El nombre completo, para donde no se ve el grupo: la cabecera del celular
   * y la barra de íconos. Dentro de Agenda basta "Reportes", pero solo, en la
   * cabecera, se confundiría con los de Finanzas.
   */
  titulo?: string;
  icono: NombreIcono;
  /**
   * Sin sección, el ítem es un grupo SIN pantalla propia (Agenda, Equipo,
   * Finanzas): se ve sólo si le quedan dos hijos o más, y su nombre lleva al
   * primero que se puede ver. Con uno solo, el hijo va suelto en su lugar.
   */
  seccion?: Seccion;
  /**
   * Se marca activo sólo con la ruta EXACTA. Lo necesitan los ítems que tienen
   * sub-rutas colgando: sin esto, "Movimientos" queda encendido al mismo tiempo
   * que "Ingreso de mercadería" y la barra muestra dos lugares a la vez.
   */
  exacto?: boolean;
  /**
   * El ítem se llama distinto según el rubro: `label` es el nombre de siempre
   * y esto es la palabra que lo reemplaza donde corresponda (ver `rubro.ts`).
   */
  termino?: Termino;
  /**
   * Las pantallas que cuelgan de ésta. Antes la jerarquía era una sangría
   * (`nivel`) sobre una lista plana, y el padre se deducía por posición: si
   * Inventario quedaba oculto por el plan, Artículos se "colgaba" del ítem que
   * tuviera arriba. Declarada acá, el padre es siempre el que corresponde.
   */
  hijos?: ItemNav[];
}

/**
 * Bloques del menú. Agrupan lo que ya estaba en ese orden —no lo reordenan—:
 * el orden de la barra es el del drawer de la app Android y varias posiciones
 * están elegidas a propósito (ver los comentarios de `ITEMS`).
 *
 * El del medio se llama "Stock" y no "Inventario" porque adentro vive el grupo
 * Inventario: el rótulo y el ítem se leían como un renglón repetido.
 */
export type Bloque = "agenda" | "vender" | "stock" | "administracion";

export const TITULO_BLOQUE: Record<Bloque, string> = {
  // Sólo belleza con la feature `agenda`: en los demás rubros no hay ningún
  // ítem en este bloque y el rótulo no se dibuja. No se llama "Agenda" por lo
  // mismo que Stock: adentro vive el grupo Agenda.
  agenda: "Atención",
  vender: "Vender",
  stock: "Stock",
  administracion: "Administración",
};

const ITEMS: (ItemNav & { bloque: Bloque })[] = [
  // Agenda de belleza: primero, como en el lienzo aprobado (en un salón la
  // agenda es el día). Sólo existen en los rubros de belleza con la feature
  // `agenda` (ver permisos.ts), así que a los demás negocios no les mueven el
  // menú. Va como un grupo sin pantalla propia: sueltas eran siete renglones
  // de primer nivel arriba del POS. Las demás no cuelgan de la ruta /agenda a
  // propósito: así no se encienden junto con la del día.
  {
    a: "/agenda",
    label: "Agenda",
    icono: "calendar",
    bloque: "agenda",
    hijos: [
      { a: "/agenda", label: "Agenda del día", icono: "calendar", seccion: "agenda", exacto: true },
      { a: "/hoy", label: "Hoy", icono: "clock", seccion: "hoy" },
      // A9: con contador de pendientes (ver MenuLateral). Sólo con la reserva online.
      { a: "/solicitudes", label: "Solicitudes online", icono: "bell", seccion: "solicitudes" },
      // Fase 2: los números de la agenda (ocupación, no-shows, retención).
      {
        a: "/reportes-agenda",
        label: "Reportes",
        titulo: "Reportes de agenda",
        icono: "chart",
        seccion: "reportes_agenda",
      },
      {
        a: "/configuracion/agenda",
        label: "Configuración",
        titulo: "Configuración de agenda",
        icono: "settings",
        seccion: "agenda_config",
      },
      // Belleza fase 4: qué gasta cada servicio (tinte, oxidante) y su margen.
      {
        a: "/configuracion/insumos-servicio",
        label: "Insumos por servicio",
        icono: "sack",
        seccion: "recetas_servicio",
      },
    ],
  },
  // Fuera del grupo: la ficha es su propia feature (`clientes`) y la cartera
  // de clientes no es una pantalla de la agenda, es a quién se atiende.
  // Íconos distintos en la barra colapsada (QA VER-06). Los de Omar no
  // cambian: Clientes, Comisiones, Propinas y Promociones no existen para él.
  { a: "/clientes", label: "Clientes", icono: "userHeart", seccion: "clientes", bloque: "agenda" },
  { a: "/pos", label: "Punto de venta", icono: "cart", seccion: "pos", bloque: "vender" },
  // Va segundo y no dentro de Inventario: en una farmacia no es una consulta
  // de catálogo, es parte de atender. Se usa más que ninguna otra pantalla.
  {
    a: "/buscar",
    label: "Buscar medicamento",
    icono: "search",
    seccion: "busqueda",
    bloque: "vender",
  },
  { a: "/reparto", label: "Mis entregas", icono: "truck", seccion: "reparto", bloque: "vender" },
  // Belleza fase 4: los vales se venden y se consultan al lado del POS.
  { a: "/gift-cards", label: "Gift cards", icono: "gift", seccion: "gift_cards", bloque: "vender" },
  { a: "/propinas", label: "Propinas", icono: "coins", seccion: "propinas", bloque: "vender" },
  { a: "/encargos", label: "Encargos", icono: "bell", seccion: "encargos", bloque: "vender" },
  // Fuera de Inventario y no dentro: no es catálogo, es la plata que se está
  // por perder. Va donde se vea todos los días.
  {
    a: "/vencimientos",
    label: "Vencimientos",
    icono: "calendar",
    seccion: "vencimientos",
    bloque: "stock",
  },
  // Al lado de Vencimientos: las dos son lo que la farmacia le debe al SEDES.
  {
    a: "/controlados",
    label: "Libro de controlados",
    icono: "fileText",
    seccion: "controlados",
    bloque: "stock",
  },
  {
    a: "/inventario",
    label: "Inventario",
    icono: "archive",
    seccion: "inventario",
    exacto: true,
    bloque: "stock",
    hijos: [
      // Sólo farmacia: la primera pantalla de Inventario con nombre propio,
      // como Medicamentos o Categorías. Comparte la ruta con "Inventario", que
      // pasa a ser el título del grupo (ver `esTitulo`).
      { a: "/inventario", label: "Dashboard", icono: "tablero", seccion: "dashboard", exacto: true },
      {
        a: "/inventario/productos",
        label: "Artículos",
        icono: "box",
        seccion: "productos",
        termino: "articulos",
      },
      { a: "/inventario/categorias", label: "Categorías", icono: "grid", seccion: "productos" },
      { a: "/inventario/insumos", label: "Insumos", icono: "sack", seccion: "insumos" },
      {
        a: "/inventario/almacenes",
        label: "Almacenes",
        icono: "warehouse",
        seccion: "almacenes",
        termino: "almacenes",
      },
      // Sólo farmacia: a quién se le compra. Al lado de Movimientos, donde se elige.
      { a: "/inventario/proveedores", label: "Proveedores", icono: "truck", seccion: "proveedores" },
      {
        a: "/inventario/movimientos",
        label: "Movimientos",
        icono: "swap",
        seccion: "movimientos",
        exacto: true,
        // Sólo farmacia (ver `SOLO_EN_RUBRO` en permisos.ts): el registro
        // sigue siendo Movimientos, pero recibir del proveedor y dar de baja lo
        // vencido son las dos cosas que se hacen todos los días, y merecen
        // estar en el menú y no escondidas detrás de un botón "Nuevo". Un
        // restaurante no las ve: su Movimientos queda exactamente como está.
        hijos: [
          {
            a: "/inventario/movimientos/ingreso",
            label: "Ingreso de mercadería",
            icono: "trendingUp",
            seccion: "ingreso_mercaderia",
          },
          {
            a: "/inventario/movimientos/salida",
            label: "Salida de mercadería",
            icono: "trendingDown",
            seccion: "salida_mercaderia",
          },
          // Sólo con el plan de varias sucursales: con un solo local no hay a dónde.
          {
            a: "/inventario/movimientos/transferencia",
            label: "Transferir mercadería",
            icono: "swap",
            seccion: "transferencia_mercaderia",
          },
        ],
      },
    ],
  },
  // Va suelto y no como sub-ítem de Inventario: las mesas no son catálogo,
  // son el salón. En la app está en el mismo lugar del drawer. Cae en
  // Administración porque es el ABM de mesas y zonas, que es del admin: el
  // que atiende el salón es el mesero, desde su propio panel.
  {
    a: "/mesas",
    label: "Mesas del salón",
    icono: "grid",
    seccion: "mesas",
    bloque: "administracion",
  },
  {
    a: "/creditos",
    label: "Cuentas por cobrar",
    icono: "dollar",
    seccion: "creditos",
    bloque: "administracion",
  },
  // Entre las cuentas por cobrar y los reportes, igual que en el drawer de la
  // app: es plata del negocio, pero del libro del resultado y no de la caja.
  {
    a: "/gastos",
    label: "Gastos operativos",
    icono: "archive",
    seccion: "gastos",
    bloque: "administracion",
  },
  // Al lado de Gastos: es lo que se le paga a cada profesional (fase 2).
  { a: "/comisiones", label: "Comisiones", icono: "percent", seccion: "comisiones", bloque: "administracion" },
  { a: "/reportes", label: "Reportes", icono: "chart", seccion: "reportes", bloque: "administracion" },
  { a: "/usuarios", label: "Usuarios", icono: "users", seccion: "usuarios", bloque: "administracion" },
  // Al lado de Usuarios: es qué puede hacer cada uno (PLAN-ROLES-NEGOCIO).
  // Suelto y no como grupo con Usuarios, así al que no edita roles no se le
  // mueve nada del menú.
  { a: "/roles", label: "Roles", icono: "key", seccion: "roles", bloque: "administracion" },
  // A11: las reglas del negocio y las de la reserva online. Sólo el dueño.
  {
    a: "/configuracion/negocio",
    label: "Configuración",
    icono: "settings",
    seccion: "config_negocio",
    bloque: "administracion",
  },
  // La página pública del negocio (todas las verticales, con su feature). Los
  // enlaces cortos cuelgan de acá: casi siempre apuntan a la página.
  {
    a: "/mi-pagina",
    label: "Mi página",
    icono: "home",
    seccion: "mi_pagina",
    exacto: true,
    bloque: "administracion",
    hijos: [{ a: "/mis-enlaces", label: "Mis enlaces", icono: "qr", seccion: "mis_enlaces" }],
  },
  // CRM y promociones (PLAN-CRM-Y-PROMOCIONES): al final del bloque, así a
  // quien no las tiene no se le mueve nada del menú.
  {
    a: "/promociones",
    label: "Promociones",
    icono: "tag",
    seccion: "promociones",
    bloque: "administracion",
  },
  {
    a: "/clientes-que-no-vuelven",
    label: "Clientes que no vuelven",
    icono: "userX",
    seccion: "retencion",
    bloque: "administracion",
  },
];

/**
 * Administración de un negocio con agenda (el salón): la misma lista, pero
 * agrupada por tema. Con la agenda se suman comisiones, propinas, la página,
 * los enlaces, promociones y retención, y sueltos eran diez renglones. Las
 * propinas vienen de "Vender": en el salón son plata del equipo, no del POS.
 * Los demás rubros siguen con `ITEMS` tal cual: a Omar no se le mueve nada.
 */
const ADMIN_AGENDA: (ItemNav & { bloque: Bloque })[] = [
  {
    a: "/personal",
    label: "Equipo",
    icono: "users",
    bloque: "administracion",
    hijos: [
      // PLAN-ROLES §11: Personal es la puerta de entrada (la gente, con o sin
      // login); Usuarios queda como los accesos.
      { a: "/personal", label: "Personal", icono: "users", seccion: "personal" },
      // Íconos distintos (QA VER-06): en la barra colapsada no hay grupo.
      { a: "/usuarios", label: "Usuarios", icono: "key", seccion: "usuarios" },
      // Qué puede hacer cada uno: el cargo de la gente es uno de estos roles.
      { a: "/roles", label: "Roles", icono: "lock", seccion: "roles" },
      { a: "/comisiones", label: "Comisiones", icono: "percent", seccion: "comisiones" },
      { a: "/propinas", label: "Propinas", icono: "coins", seccion: "propinas" },
    ],
  },
  {
    a: "/creditos",
    label: "Finanzas",
    icono: "chart",
    bloque: "administracion",
    hijos: [
      { a: "/creditos", label: "Cuentas por cobrar", icono: "dollar", seccion: "creditos" },
      { a: "/gastos", label: "Gastos operativos", icono: "archive", seccion: "gastos" },
      { a: "/reportes", label: "Reportes", icono: "chart", seccion: "reportes" },
    ],
  },
  {
    a: "/mi-pagina",
    label: "Marketing",
    icono: "home",
    bloque: "administracion",
    hijos: [
      { a: "/mi-pagina", label: "Mi página", icono: "home", seccion: "mi_pagina" },
      { a: "/mis-enlaces", label: "Mis enlaces", icono: "qr", seccion: "mis_enlaces" },
      { a: "/promociones", label: "Promociones", icono: "tag", seccion: "promociones" },
      {
        a: "/clientes-que-no-vuelven",
        label: "Clientes que no vuelven",
        icono: "userX",
        seccion: "retencion",
      },
    ],
  },
  { a: "/mesas", label: "Mesas del salón", icono: "grid", seccion: "mesas", bloque: "administracion" },
  {
    a: "/configuracion/negocio",
    label: "Configuración",
    icono: "settings",
    seccion: "config_negocio",
    bloque: "administracion",
  },
];

/**
 * ¿El menú se arma como el del salón? Hace falta la feature y el rubro, los
 * mismos dos candados de las pantallas de agenda (ver `SOLO_EN_RUBRO`): una
 * pollería con `agenda` prendida por error no cambia de menú.
 */
export function esMenuDeAgenda(rubro: string | undefined, features: string[] | undefined): boolean {
  return esBelleza(rubro) && !!features?.includes("agenda");
}

function itemsDe(conAgenda: boolean) {
  if (!conAgenda) return ITEMS;
  return [
    ...ITEMS.filter((i) => i.bloque !== "administracion" && i.seccion !== "propinas"),
    ...ADMIN_AGENDA,
  ];
}

/** Un ítem ya filtrado por permisos, con su nombre según el rubro. */
export interface NodoMenu {
  item: ItemNav;
  /** Para `aria-controls` y para recordar si está abierto. */
  id: string;
  hijos: NodoMenu[];
  /**
   * Título de grupo: uno de sus hijos lleva a la misma ruta (Inventario →
   * Dashboard, sólo en farmacia). No se marca como "estás acá" —eso lo dice el
   * hijo—, o la barra marcaría dos lugares a la vez.
   */
  esTitulo: boolean;
}

export interface BloqueMenu {
  bloque: Bloque;
  nodos: NodoMenu[];
}

/**
 * Filtra un nivel del árbol. Lo que el plan o el rol no deja ver desaparece,
 * pero sus hijos visibles NO: suben a su lugar. Un negocio con catálogo y sin
 * la feature `inventario` sigue teniendo dónde cargar sus artículos.
 */
function filtrar(
  items: ItemNav[],
  puede: (s: Seccion) => boolean,
  rubro: string | undefined,
  vocabulario?: Vocabulario,
): NodoMenu[] {
  const salida: NodoMenu[] = [];
  for (const i of items) {
    const hijos = filtrar(i.hijos ?? [], puede, rubro, vocabulario);
    if (!i.seccion) {
      // Grupo sin pantalla propia: con un solo hijo, el hijo va suelto.
      if (hijos.length < 2) {
        salida.push(...hijos);
        continue;
      }
      // El nombre lleva al primer hijo visible, que es "su" pantalla: por eso
      // es título (no se marca activo, lo marca el hijo).
      salida.push({ item: { ...i, a: hijos[0].item.a }, id: `grupo:${i.label}`, hijos, esTitulo: true });
      continue;
    }
    if (!puede(i.seccion)) {
      salida.push(...hijos);
      continue;
    }
    const item: ItemNav = i.termino
      ? { ...i, label: termino(rubro, i.termino, vocabulario) }
      : i;
    const id = `${i.seccion}:${i.a}`;

    // Un grupo de un solo hijo es un clic de más para llegar a una sola
    // pantalla: se muestra plano, el hijo al lado del padre. Si el único hijo
    // es la misma pantalla que el padre (el Dashboard), basta con el padre.
    if (hijos.length === 1) {
      salida.push({ item, id, hijos: [], esTitulo: false });
      if (hijos[0].item.a !== i.a) salida.push(hijos[0]);
      continue;
    }

    const esTitulo = hijos.some((h) => h.item.a === i.a);
    salida.push({ item, id, hijos, esTitulo });
  }
  return salida;
}

export function construirMenu(
  puede: (s: Seccion) => boolean,
  rubro: string | undefined,
  vocabulario?: Vocabulario,
  /** Ver `esMenuDeAgenda`. */
  conAgenda = false,
): BloqueMenu[] {
  const bloques: BloqueMenu[] = [];
  for (const i of itemsDe(conAgenda)) {
    const nodos = filtrar([i], puede, rubro, vocabulario);
    if (nodos.length === 0) continue;
    const ultimo = bloques[bloques.length - 1];
    if (ultimo?.bloque === i.bloque) ultimo.nodos.push(...nodos);
    else bloques.push({ bloque: i.bloque, nodos });
  }
  return bloques;
}

/** El árbol aplanado, en el orden en que se dibuja. */
export function aplanar(nodos: NodoMenu[]): NodoMenu[] {
  return nodos.flatMap((n) => [n, ...aplanar(n.hijos)]);
}

/** ¿Este ítem es la pantalla en la que se está? */
export function esActivo(item: ItemNav, pathname: string): boolean {
  if (pathname === item.a) return true;
  return !item.exacto && pathname.startsWith(`${item.a}/`);
}

/**
 * El ítem que corresponde a la ruta. Se queda con la ruta MÁS LARGA que
 * coincide: "/inventario/productos" empieza con "/inventario", y quedarse con
 * la primera mostraría "Inventario" estando en Artículos. Ignora `exacto` a
 * propósito: en "/inventario/movimientos/5/editar" ningún ítem se marca, pero
 * el título y el grupo abierto son los de Movimientos.
 */
function nodoDeRuta(planos: NodoMenu[], pathname: string): NodoMenu | null {
  let mejor: NodoMenu | null = null;
  for (const n of planos) {
    const a = n.item.a;
    if (pathname === a || pathname.startsWith(`${a}/`)) {
      // `>=`: con dos ítems en la misma ruta gana el de abajo, que es el
      // sub-ítem ("Dashboard") y no el título del grupo ("Inventario").
      if (!mejor || a.length >= mejor.item.a.length) mejor = n;
    }
  }
  return mejor;
}

/** Título de la barra móvil. */
export function tituloDe(planos: NodoMenu[], pathname: string): string {
  const n = nodoDeRuta(planos, pathname)?.item;
  return n ? (n.titulo ?? n.label) : "BamarDev";
}

/**
 * Los grupos a abrir para que se vea la pantalla actual: los que la contienen
 * y, si la pantalla es ella misma un grupo, ese también. Es lo mismo que hace
 * el clic en el nombre de un grupo: lleva a su pantalla y lo despliega.
 */
export function caminoA(nodos: NodoMenu[], pathname: string): string[] {
  const destino = nodoDeRuta(aplanar(nodos), pathname);
  if (!destino) return [];
  const buscar = (lista: NodoMenu[], camino: string[]): string[] | null => {
    for (const n of lista) {
      if (n === destino) return n.hijos.length ? [...camino, n.id] : camino;
      const dentro = buscar(n.hijos, [...camino, n.id]);
      if (dentro) return dentro;
    }
    return null;
  };
  return buscar(nodos, []) ?? [];
}

/** ¿La pantalla actual está dentro de este grupo (o es el grupo)? */
export function contieneRuta(nodo: NodoMenu, pathname: string): boolean {
  return (
    esActivo(nodo.item, pathname) ||
    pathname.startsWith(`${nodo.item.a}/`) ||
    nodo.hijos.some((h) => contieneRuta(h, pathname))
  );
}

// ── Grupos abiertos ─────────────────────────────────────────────────────────

/**
 * Qué grupos abrió o cerró cada quien. Va por negocio Y por usuario: en la PC
 * del mostrador entran el dueño y el cajero, y lo que uno despliega no tiene
 * por qué desordenarle la barra al otro. Es del equipo y no viaja al backend,
 * como la barra colapsada.
 */
const PREFIJO_ABIERTOS = "bamardev.menu.abiertos";

type Abiertos = Record<string, boolean>;

/**
 * localStorage puede no estar (modo privado de Safari, cuota llena, un
 * navegador con el almacenamiento bloqueado): ahí el menú arranca con todo
 * cerrado salvo el grupo de la pantalla actual, y sigue andando.
 */
function leerAbiertos(clave: string): Abiertos {
  try {
    const raw = localStorage.getItem(clave);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Abiertos) : {};
  } catch {
    return {};
  }
}

function guardarAbiertos(clave: string, abiertos: Abiertos) {
  try {
    localStorage.setItem(clave, JSON.stringify(abiertos));
  } catch {
    // Sin almacenamiento se pierde sólo el recuerdo; el menú funciona igual.
  }
}

function abrirTodos(abiertos: Abiertos, ids: string[]): Abiertos {
  if (ids.every((id) => abiertos[id])) return abiertos;
  const nuevo = { ...abiertos };
  for (const id of ids) nuevo[id] = true;
  return nuevo;
}

export interface Menu {
  bloques: BloqueMenu[];
  planos: NodoMenu[];
  pathname: string;
  estaAbierto: (id: string) => boolean;
  alternar: (id: string) => void;
  abrir: (id: string) => void;
  cerrar: (id: string) => void;
}

export function useMenu(): Menu {
  const { puede, rubro, vocabulario, usuario, negocio } = useAuth();
  const { pathname } = useLocation();

  // Se recalcula cuando cambian `puede` o el rubro: así, si el panel le apaga
  // una feature al negocio (`refrescarFeatures`), la sección se va del menú en
  // caliente. Lo guardado de un grupo que ya no existe queda en el storage sin
  // molestar; si la feature vuelve, el grupo vuelve como estaba.
  const conAgenda = esMenuDeAgenda(rubro, negocio?.features);
  const bloques = useMemo(
    () => construirMenu(puede, rubro, vocabulario, conAgenda),
    [puede, rubro, vocabulario, conAgenda],
  );
  const raices = useMemo(() => bloques.flatMap((b) => b.nodos), [bloques]);
  const planos = useMemo(() => aplanar(raices), [raices]);

  const clave = `${PREFIJO_ABIERTOS}.${negocio?.id ?? "-"}.${usuario?.id ?? "-"}`;

  // El camino a la pantalla actual se abre ya en el primer render y no en un
  // efecto: entrando por URL directa a Medicamentos, el grupo aparece abierto
  // de entrada en vez de desplegarse frente al usuario.
  const [abiertos, setAbiertos] = useState<Abiertos>(() =>
    abrirTodos(leerAbiertos(clave), caminoA(raices, pathname)),
  );

  // Al navegar se abre el grupo de la pantalla nueva. Se hace durante el render
  // (el patrón de React para "estado que depende de una prop") y sólo cuando
  // cambia la ruta: si dependiera del árbol, cada refresco de features volvería
  // a abrir un grupo que el usuario acababa de cerrar.
  const [rutaVista, setRutaVista] = useState(pathname);
  if (rutaVista !== pathname) {
    setRutaVista(pathname);
    setAbiertos((prev) => abrirTodos(prev, caminoA(raices, pathname)));
  }

  useEffect(() => {
    guardarAbiertos(clave, abiertos);
  }, [clave, abiertos]);

  return {
    bloques,
    planos,
    pathname,
    estaAbierto: (id) => !!abiertos[id],
    alternar: (id) => setAbiertos((prev) => ({ ...prev, [id]: !prev[id] })),
    abrir: (id) => setAbiertos((prev) => abrirTodos(prev, [id])),
    cerrar: (id) => setAbiertos((prev) => (prev[id] ? { ...prev, [id]: false } : prev)),
  };
}
