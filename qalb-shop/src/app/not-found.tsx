import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page text-center">
      <p className="qalb-label qalb-muted">404</p>
      <h1>Page not found</h1>
      <hr className="qalb-divider qalb-divider-center" />
      <p className="mx-auto">We could not find what you were looking for.</p>
      <Link className="qalb-btn" href="/shop">Shop spices</Link>
    </section>
  );
}
