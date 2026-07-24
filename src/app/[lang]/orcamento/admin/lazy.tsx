import dynamic from "next/dynamic";
import { ViewSkeleton } from "./Skeleton";

/**
 * Code-split back-office surfaces. Each top-level view and each detail-panel
 * tool is its own chunk, loaded on demand so the admin bundle stays small.
 * Extracted from AdminClient to keep the container focused on behaviour.
 *
 * While a chunk arrives, a layout-shaped skeleton stands in so the page settles
 * instead of flashing a spinner.
 */
function ViewLoading() {
  return <ViewSkeleton />;
}

// Detail-panel tools — a shimmering eyebrow+bar holds the layout while loading.
const PanelLoading = () => (
  <div className="border-t border-foreground/10 pt-5">
    <div className="bo-skeleton h-2.5 w-40 mb-4" aria-hidden />
    <div className="bo-skeleton h-9 w-full" aria-hidden />
  </div>
);

// ── Top-level views ──
export const Overview = dynamic(() => import("./Overview"), { loading: ViewLoading });
export const Kanban = dynamic(() => import("./Kanban"), { loading: ViewLoading });
export const Clientes = dynamic(() => import("./Clientes"), { loading: ViewLoading });
export const Calendario = dynamic(() => import("./Calendario"), { loading: ViewLoading });
export const Propostas = dynamic(() => import("./Propostas"), { loading: ViewLoading });
export const Tarefas = dynamic(() => import("./Tarefas"), { loading: ViewLoading });
export const Fornecedores = dynamic(() => import("./Fornecedores"), { loading: ViewLoading });
export const StatsDashboard = dynamic(() => import("./StatsDashboard"), { loading: ViewLoading });
export const EmailTemplates = dynamic(() => import("./EmailTemplates"), { loading: ViewLoading });
export const Faturas = dynamic(() => import("./Faturas"), { loading: ViewLoading });
export const Contratos = dynamic(() => import("./Contratos"), { loading: ViewLoading });
export const Inventario = dynamic(() => import("./Inventario"), { loading: ViewLoading });
export const Seguimentos = dynamic(() => import("./FollowUps"), { loading: ViewLoading });

// ── Detail-panel tools (only needed once a quote is opened) ──
export const ProposalBuilder = dynamic(() => import("./ProposalBuilder"), {
  loading: PanelLoading,
});
export const ProposalStudio = dynamic(() => import("./ProposalStudio"), {
  loading: PanelLoading,
});
export const ClientMessenger = dynamic(() => import("./ClientMessenger"), {
  loading: PanelLoading,
});
export const EventChecklist = dynamic(() => import("./EventChecklist"), { loading: PanelLoading });
export const ProductionPlan = dynamic(() => import("./ProductionPlan"), { loading: PanelLoading });
export const EventTimeline = dynamic(() => import("./EventTimeline"), { loading: PanelLoading });
export const PaymentsPanel = dynamic(() => import("./PaymentsPanel"), { loading: PanelLoading });
export const EventCosts = dynamic(() => import("./EventCosts"), { loading: PanelLoading });
export const GuestList = dynamic(() => import("./GuestList"), { loading: PanelLoading });
export const TagsField = dynamic(() => import("./TagsField"), {
  loading: () => <div className="bo-skeleton h-9 w-full" aria-hidden />,
});
export const FollowUpField = dynamic(() => import("./FollowUpField"), {
  loading: () => <div className="bo-skeleton h-9 w-full" aria-hidden />,
});
export const ActivityLog = dynamic(() => import("./ActivityLog"), { loading: PanelLoading });
export const EventTasks = dynamic(() => import("./EventTasks"), { loading: PanelLoading });
