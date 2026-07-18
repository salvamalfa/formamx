import type { JSX } from 'preact';
import type { LampImageManifest } from '../../config/lamps';
import { ClientesPanel } from './clientes/ClientesPanel';
import { EnviosPanel } from './envios/EnviosPanel';
import { InventarioPanel } from './inventario/InventarioPanel';
import { PedidosPanel } from './pedidos/PedidosPanel';

// Registro de módulos del taller. Activar un módulo nuevo = agregar una
// entrada aquí (el tab y el hash #<id> aparecen solos). La receta completa
// está en docs/ROADMAP_ARQUITECTURA.md.
export interface TallerModule {
  id: string;
  label: string;
  Panel: (props: { manifest: LampImageManifest }) => JSX.Element;
}

export const MODULES: TallerModule[] = [
  { id: 'pedidos', label: 'Pedidos', Panel: PedidosPanel },
  { id: 'clientes', label: 'Clientes', Panel: ClientesPanel },
  { id: 'envios', label: 'Envíos', Panel: EnviosPanel },
  { id: 'inventario', label: 'Inventario', Panel: InventarioPanel },
  // futuros: calidad, inbox, agente
];
