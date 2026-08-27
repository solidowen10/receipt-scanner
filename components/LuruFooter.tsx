import { LURU_TOOLS_ORIGIN } from "@/lib/constants";

export default function LuruFooter() {
  return (
    <footer className="luru-footer">
      <p className="luru-footer-tagline">Small tools, built and self-hosted by Owen.</p>
      <a className="luru-footer-link" href={`${LURU_TOOLS_ORIGIN}/`}>
        lürú tools
      </a>
    </footer>
  );
}
