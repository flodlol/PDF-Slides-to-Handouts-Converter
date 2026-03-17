import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-card/60 text-foreground">
      <div className="container flex flex-col items-start justify-between gap-5 py-8 md:flex-row md:items-center">
        <div className="space-y-1">
          <p className="text-base leading-tight">
            Sponsored by{" "}
            <Link
              href="https://study-track.app"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium underline underline-offset-4 decoration-2 hover:text-primary"
            >
              Study-Track
            </Link>
            .
          </p>
          <p className="text-sm text-muted-foreground">© 2026. All rights reserved.</p>
        </div>

        <div className="text-base md:text-right">
          <p className="text-sm">
            This project is open source, view it
            {" "}
            <Link
              href="https://github.com/flodlol/PDF-Slides-to-Hand-Outs"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium underline underline-offset-4 decoration-2 hover:text-primary"
            >
              here.
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
