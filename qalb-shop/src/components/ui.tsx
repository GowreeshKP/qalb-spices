import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Icon({ name }: { name: "check" | "alert" | "plus" | "tag" }) {
  const paths: Record<typeof name, string> = {
    check: "M5 12.5l4.5 4.5L19 7.5",
    alert: "M12 8v5M12 16.5h.01M12 3a9 9 0 100 18 9 9 0 000-18z",
    plus: "M12 4v16M4 12h16",
    tag: "M5 19L19 5M7 7h.01M17 17h.01",
  };
  return (
    <svg className="qalb-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  return (
    <div className={`qalb-alert qalb-alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon name={kind === "error" ? "alert" : "check"} />
      <p>{children}</p>
    </div>
  );
}

interface FieldBase {
  label: string;
  name: string;
  errors?: string[] | undefined;
  hint?: string | undefined;
}

function describedBy(name: string, errors?: string[], hint?: string): string | undefined {
  const ids = [errors?.length ? `${name}-error` : null, hint ? `${name}-hint` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function FieldShell({ label, name, errors, hint, children }: FieldBase & { children: ReactNode }) {
  return (
    <div className="qalb-field">
      <label htmlFor={name}>{label}</label>
      {children}
      {hint ? (
        <p className="qalb-hint" id={`${name}-hint`}>
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p className="qalb-field-error" id={`${name}-error`} role="alert">
          <Icon name="alert" />
          <span>{errors[0]}</span>
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, name, errors, hint, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} name={name} errors={errors} hint={hint}>
      <input
        id={name}
        name={name}
        className="qalb-input"
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, errors, hint)}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, name, errors, hint, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} name={name} errors={errors} hint={hint}>
      <textarea
        id={name}
        name={name}
        className="qalb-input"
        rows={5}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, errors, hint)}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  children,
  ...rest
}: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} name={name} errors={errors} hint={hint}>
      <select
        id={name}
        name={name}
        className="qalb-input"
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, errors, hint)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) {
    return (
      <span className="qalb-badge qalb-badge-sale">
        <Icon name="alert" />
        Sold out
      </span>
    );
  }
  if (stock <= 5) {
    return (
      <span className="qalb-badge qalb-badge-new">
        <Icon name="plus" />
        Only {stock} left
      </span>
    );
  }
  return (
    <span className="qalb-badge qalb-badge-stock">
      <Icon name="check" />
      In stock
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="qalb-card" style={{ alignItems: "center", textAlign: "center" }}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
