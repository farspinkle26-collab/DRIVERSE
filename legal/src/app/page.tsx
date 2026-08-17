import Link from "next/link";
import Wordmark from "@/components/Wordmark";

export default function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Wordmark />
      </div>
      <div style={styles.center}>
        <p style={styles.lead}>Legal documents for the Driveverse app.</p>
        <nav style={styles.links}>
          <Link href="/privacy-policy" style={styles.link}>
            Privacy Policy
          </Link>
          <Link href="/eula" style={styles.link}>
            End User License Agreement
          </Link>
        </nav>
      </div>
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
    padding: "1.5rem",
  },
  center: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "1.5rem",
    padding: "2rem 1.5rem 6rem",
  },
  lead: {
    color: "var(--text-secondary)",
    fontSize: "0.9375rem",
    margin: 0,
  },
  links: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    alignItems: "center",
  },
  link: {
    color: "var(--text-primary)",
    fontSize: "1rem",
    fontWeight: 500,
    textDecoration: "none",
    borderBottom: "1px solid var(--hairline)",
    paddingBottom: "2px",
  },
} as const;
