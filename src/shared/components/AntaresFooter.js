/**
 * Shared Antares footer.
 *
 * The login screen and the dashboard shell (including every dashboard page such
 * as /dashboard and /dashboard/providers) render the exact same footer, so both
 * surfaces read identically: a hairline top border, muted 13.5px text, centred
 * on small screens and left aligned from md up.
 */
export default function AntaresFooter({ className = "" }) {
  return (
    <footer
      className={`an-scope an-footer mt-auto border-t border-[var(--t-line)] ${className}`}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-5 lg:px-6">
        <p className="text-center text-[13.5px] text-[var(--t-muted)] md:text-left">
          RouterMod Developed by{" "}
          <a
            href="https://github.com/techwiz37"
            target="_blank"
            rel="noopener noreferrer"
          >
            Techwiz
          </a>
        </p>
      </div>
    </footer>
  );
}
