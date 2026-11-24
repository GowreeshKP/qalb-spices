"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { canTransition } from "@/lib/order-status";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/validators";
import { ORDER_STATUS_LABELS } from "./order-status";
import { Alert } from "./ui";
import { useAction } from "./use-action";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <button
        type="button"
        className="qalb-btn qalb-btn-danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Cancel this order?")) return;
          void run(async () => {
            await api(`/api/orders/${orderId}`, { method: "PATCH", body: { status: "CANCELLED" } });
            router.refresh();
          });
        }}
      >
        {pending ? "Cancelling..." : "Cancel order"}
      </button>
    </div>
  );
}

export function AdminOrderStatus({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const options = ORDER_STATUSES.filter((s) => canTransition(status, s));
  if (options.length === 0) return <span className="qalb-muted text-xs">Final</span>;
  return (
    <div>
      <label className="visually-hidden" htmlFor={`status-${orderId}`} style={{ position: "absolute", left: -9999 }}>
        Change status
      </label>
      <select
        id={`status-${orderId}`}
        className="qalb-input !w-auto"
        value=""
        disabled={pending}
        onChange={(e) => {
          const next = ORDER_STATUSES.find((s) => s === e.target.value);
          if (!next) return;
          void run(async () => {
            await api(`/api/orders/${orderId}`, { method: "PATCH", body: { status: next } });
            router.refresh();
          });
        }}
      >
        <option value="">Update...</option>
        {options.map((s) => (
          <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
        ))}
      </select>
      {error ? <p className="qalb-field-error">{error}</p> : null}
    </div>
  );
}
