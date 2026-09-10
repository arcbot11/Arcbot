import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-screen">
      <p className="kicker">404</p>
      <h1>Page not found.</h1>
      <Link className="secondary" href="/">Return to Arc Bot</Link>
    </main>
  );
}
