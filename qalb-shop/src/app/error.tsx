"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="page text-center">
      <p className="qalb-label qalb-muted">Something went wrong</p>
      <h1>We hit a snag</h1>
      <hr className="qalb-divider qalb-divider-center" />
      <p className="mx-auto">Please try again. If it keeps happening, email hello@qalbspices.com.</p>
      <button type="button" className="qalb-btn" onClick={() => reset()}>Try again</button>
    </section>
  );
}
