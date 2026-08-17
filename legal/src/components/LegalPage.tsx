import Wordmark from "./Wordmark";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the two legal documents. Deliberately plain: a wordmark,
 * a title, a last-updated line, then prose. No CutCorner or other decorative
 * chrome — this is a document someone is reading to decide whether they
 * trust the app, not a marketing surface.
 */
export default function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Wordmark />
      </header>
      <main style={styles.main}>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.updated}>Last updated: {lastUpdated}</p>
        <div className="legal-prose" style={styles.prose}>{children}</div>
      </main>
      <footer style={styles.footer}>
        <a href="/privacy-policy" style={styles.footerLink}>
          Privacy Policy
        </a>
        <span style={styles.footerDivider}>·</span>
        <a href="/eula" style={styles.footerLink}>
          EULA
        </a>
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "1.5rem 1.5rem 0",
    maxWidth: "42rem",
    margin: "0 auto",
    width: "100%",
  },
  main: {
    flex: 1,
    maxWidth: "42rem",
    margin: "0 auto",
    width: "100%",
    padding: "2rem 1.5rem 4rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    lineHeight: 1.3,
    margin: "0 0 0.5rem",
    color: "var(--text-primary)",
  },
  updated: {
    fontSize: "0.875rem",
    color: "var(--text-secondary)",
    margin: "0 0 2.5rem",
  },
  prose: {
    fontSize: "1rem",
    lineHeight: 1.75,
    color: "var(--text-primary)",
  },
  footer: {
    borderTop: "1px solid var(--hairline)",
    padding: "1.5rem",
    display: "flex",
    justifyContent: "center",
    gap: "0.75rem",
    fontSize: "0.8125rem",
    color: "var(--text-secondary)",
  },
  footerLink: {
    color: "var(--text-secondary)",
    textDecoration: "none",
  },
  footerDivider: {
    color: "var(--hairline)",
  },
} as const;
