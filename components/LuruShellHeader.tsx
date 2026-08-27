"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, FileSpreadsheet, Grid2X2, LogOut, Menu, ReceiptText, Settings, WalletCards, X } from "lucide-react";
import { APP_BASE_PATH, LOGO_SRC, LURU_TOOLS_ORIGIN } from "@/lib/constants";

export type ReceiptTab = "scan" | "setup";

const APP_MENU: Array<{ label: string; tab: ReceiptTab; Icon: typeof ReceiptText }> = [
  { label: "Scan", tab: "scan", Icon: ReceiptText },
  { label: "Setup", tab: "setup", Icon: Settings },
];

export default function LuruShellHeader({
  activeTab,
  onSelectTab,
}: {
  activeTab: ReceiptTab;
  onSelectTab: (tab: ReceiptTab) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectTab = (tab: ReceiptTab) => {
    onSelectTab(tab);
    setOpen(false);
  };

  return (
    <header className="luru-shell-header">
      <div className="luru-shell-header-inner">
        <a className="luru-shell-brand" href={APP_BASE_PATH} aria-label="Receipt Scanner home">
          <img className="luru-shell-logo" src={LOGO_SRC} alt="luruee" />
          <span className="luru-shell-app-name">
            Receipt <em>Scanner</em>
          </span>
        </a>

        <div className="luru-shell-menu" ref={menuRef}>
          <button
            className="icon-button"
            type="button"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="luru-receipt-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>

          <nav
            id="luru-receipt-menu"
            className={`luru-shell-menu-panel${open ? " is-open" : ""}`}
            aria-label="Tool navigation"
          >
            <div className="luru-shell-menu-label">This app</div>
            {APP_MENU.map(({ label, tab, Icon }) => (
              <button
                key={tab}
                className={`luru-shell-menu-item${activeTab === tab ? " is-active" : ""}`}
                type="button"
                onClick={() => selectTab(tab)}
              >
                <Icon className="luru-shell-menu-icon" size={18} />
                <span>{label}</span>
              </button>
            ))}

            <hr className="luru-shell-menu-divider" />
            <div className="luru-shell-menu-label">Other tools</div>
            <a className="luru-shell-menu-item" href={`${LURU_TOOLS_ORIGIN}/split-bill`} onClick={() => setOpen(false)}>
              <ReceiptText className="luru-shell-menu-icon" size={18} />
              <span>Shared Ledger</span>
            </a>
            <a className="luru-shell-menu-item" href={`${LURU_TOOLS_ORIGIN}/spending-tracker`} onClick={() => setOpen(false)}>
              <WalletCards className="luru-shell-menu-icon" size={18} />
              <span>Spending Tracker</span>
            </a>
            <a className="luru-shell-menu-item" href={`${LURU_TOOLS_ORIGIN}/lifestyle-tracker`} onClick={() => setOpen(false)}>
              <Activity className="luru-shell-menu-icon" size={18} />
              <span>Lifestyle Tracker</span>
            </a>
            <a className="luru-shell-menu-item" href={`${LURU_TOOLS_ORIGIN}/`} onClick={() => setOpen(false)}>
              <Grid2X2 className="luru-shell-menu-icon" size={18} />
              <span>All Tools</span>
            </a>

            <hr className="luru-shell-menu-divider" />
            <a className="luru-shell-menu-item luru-shell-menu-logout" href={`/auth/logout?next=${APP_BASE_PATH}`}>
              <LogOut className="luru-shell-menu-icon" size={18} />
              <span>Log out</span>
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
