"use client"; // Error boundaries must be Client Components

/**
 * Last-resort boundary for errors thrown by the root layout itself. It replaces
 * the root layout when active, so it must render its own <html>/<body> and
 * cannot rely on any provider, font or Tailwind layer the layout sets up —
 * hence the inline styles.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  console.error(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FBF6EC",
          color: "#1E1816",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.6 }}>
            Sorry about that. Please try again — or call us on{" "}
            <a href="tel:0423464314" style={{ color: "#DA5B4A" }}>
              0423 464 314
            </a>{" "}
            and we&apos;ll help you out.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              background: "#DA5B4A",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
