import Link from "next/link";

/**
 * Minimal text wordmark, not an image asset — this project deliberately
 * ships no build of expo's icon/logo files, since it's an independent
 * Next.js app. Links home so the two legal pages don't dead-end.
 */
export default function Wordmark() {
  return (
    <Link href="/" aria-label="Driveverse" style={styles.link}>
      <span style={styles.mark}>DRIVE</span>
      <span style={styles.markAccent}>VERSE</span>
    </Link>
  );
}

const styles = {
  link: {
    display: "inline-flex",
    alignItems: "baseline",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "1rem",
    letterSpacing: "0.06em",
  },
  mark: {
    color: "var(--text-primary)",
  },
  markAccent: {
    color: "var(--racing-red)",
  },
} as const;
