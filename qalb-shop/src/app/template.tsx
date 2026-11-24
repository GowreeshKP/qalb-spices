import type { ReactNode } from "react";

/** Unlike a layout, a template remounts on every navigation, so each page fades in. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="qalb-page-in">{children}</div>;
}
