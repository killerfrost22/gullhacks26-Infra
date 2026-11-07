import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="text-teal-700 underline">Report an issue</Link>
    </div>
  );
}
