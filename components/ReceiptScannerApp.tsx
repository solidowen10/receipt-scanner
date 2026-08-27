"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  UploadCloud,
  Unlink,
} from "lucide-react";
import FilenameBuilder from "@/components/FilenameBuilder";
import LuruFooter from "@/components/LuruFooter";
import LuruShellHeader, { type ReceiptTab } from "@/components/LuruShellHeader";
import { APP_BASE_PATH, CATEGORY_OPTIONS, PAYMENT_METHODS } from "@/lib/constants";
import { DEFAULT_TEMPLATE, renderFilenamePreview, type FilenameSegment } from "@/lib/filename-template";
import type { ReceiptDraft } from "@/lib/receipt-parse";

type User = {
  userId: string;
  lineUserId: string | null;
  name: string | null;
  image: string | null;
};

type SettingsPayload = {
  googleConfig: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    redirectUri: string;
  };
  connected: boolean;
  googleEmail: string | null;
  ready: boolean;
  driveFolderId: string | null;
  driveFolderName: string | null;
  sheetId: string | null;
  sheetName: string | null;
  filenameTemplate: FilenameSegment[];
  defaultPayerShortName: string | null;
};

type FolderOption = {
  id: string;
  name: string;
};

type SheetOption = {
  id: string;
  name: string;
};

type DraftForm = {
  uploadId: string;
  date: string;
  merchant: string;
  invoiceNumber: string;
  total: string;
  category: string;
  payerShortName: string;
  paymentMethod: string;
  itemsText: string;
  notes: string;
  ocrText: string;
};

type SaveResult = {
  filename: string;
  driveFile: { url: string | null };
  sheet: { sheetUrl: string; tabName: string };
};

const EMPTY_SETTINGS: SettingsPayload = {
  googleConfig: { hasClientId: false, hasClientSecret: false, redirectUri: "" },
  connected: false,
  googleEmail: null,
  ready: false,
  driveFolderId: null,
  driveFolderName: null,
  sheetId: null,
  sheetName: null,
  filenameTemplate: DEFAULT_TEMPLATE,
  defaultPayerShortName: null,
};

export default function ReceiptScannerApp() {
  const [tab, setTab] = useState<ReceiptTab>("scan");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [settings, setSettings] = useState<SettingsPayload>(EMPTY_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab === "setup" || requestedTab === "scan") setTab(requestedTab);
    if (params.get("google") === "connected") setNotice("Google account connected.");
    if (params.get("google") === "error") setNotice("Google connection failed.");

    fetchJson<{ user: User }>(api("/api/whoami"))
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      if (!authLoading) setLoadingSettings(false);
      return;
    }
    loadSettings().catch((error) => setNotice(error.message));
  }, [user, authLoading]);

  useEffect(() => {
    if (!loadingSettings && user && !settings.ready) setTab("setup");
  }, [loadingSettings, settings.ready, user]);

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const data = await fetchJson<SettingsPayload>(api("/api/settings"));
      setSettings({ ...EMPTY_SETTINGS, ...data, filenameTemplate: data.filenameTemplate?.length ? data.filenameTemplate : DEFAULT_TEMPLATE });
    } finally {
      setLoadingSettings(false);
    }
  };

  const saveSettings = async (payload: Record<string, unknown>) => {
    const data = await fetchJson<SettingsPayload>(api("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSettings({ ...EMPTY_SETTINGS, ...data, filenameTemplate: data.filenameTemplate?.length ? data.filenameTemplate : DEFAULT_TEMPLATE });
    return data;
  };

  const shell = (children: React.ReactNode) => (
    <div className="app-container">
      <LuruShellHeader activeTab={tab} onSelectTab={setTab} />
      {notice && (
        <div className="notice" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {children}
      <LuruFooter />
    </div>
  );

  if (authLoading || loadingSettings) {
    return shell(
      <main className="app-main app-main-narrow">
        <div className="panel center-panel">
          <Loader2 className="spin" size={22} />
          <span>Checking login...</span>
        </div>
      </main>,
    );
  }

  if (!user) {
    return shell(
      <main className="app-main app-main-narrow">
        <div className="panel login-panel">
          <div>
            <h1>Receipt Scanner</h1>
            <p className="muted-copy">LINE login is required for lürú tools.</p>
          </div>
          <a className="primary-button" href={`/auth/login?next=${APP_BASE_PATH}`}>
            <ShieldCheck size={18} />
            <span>Log in with LINE</span>
          </a>
        </div>
      </main>,
    );
  }

  return shell(
    <>
      <div className="top-tabs" role="tablist" aria-label="Receipt Scanner views">
        <button className={tab === "scan" ? "active" : ""} type="button" onClick={() => setTab("scan")}>
          <Camera size={17} />
          <span>Scan</span>
        </button>
        <button className={tab === "setup" ? "active" : ""} type="button" onClick={() => setTab("setup")}>
          <FolderOpen size={17} />
          <span>Setup</span>
        </button>
      </div>

      <main className="app-main">
        {tab === "scan" ? (
          <ScanView settings={settings} onSetup={() => setTab("setup")} onSaved={loadSettings} />
        ) : (
          <SetupView settings={settings} onSaveSettings={saveSettings} onReload={loadSettings} />
        )}
      </main>
    </>,
  );
}

function SetupView({
  settings,
  onSaveSettings,
  onReload,
}: {
  settings: SettingsPayload;
  onSaveSettings: (payload: Record<string, unknown>) => Promise<SettingsPayload>;
  onReload: () => Promise<void>;
}) {
  const [folderLink, setFolderLink] = useState("");
  const [sheetLink, setSheetLink] = useState("");
  const [sheetTitle, setSheetTitle] = useState("lürú receipt scanner");
  const [defaultPayerShortName, setDefaultPayerShortName] = useState(settings.defaultPayerShortName || "");
  const [template, setTemplate] = useState<FilenameSegment[]>(settings.filenameTemplate || DEFAULT_TEMPLATE);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [folderStack, setFolderStack] = useState<FolderOption[]>([{ id: "root", name: "My Drive" }]);
  const [sheets, setSheets] = useState<SheetOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDefaultPayerShortName(settings.defaultPayerShortName || "");
    setTemplate(settings.filenameTemplate || DEFAULT_TEMPLATE);
  }, [settings.defaultPayerShortName, settings.filenameTemplate]);

  const googleConfigured = settings.googleConfig.hasClientId && settings.googleConfig.hasClientSecret;

  const saveFolderLink = async () => {
    setBusy("folder-link");
    setMessage(null);
    try {
      await onSaveSettings({ driveFolderInput: folderLink });
      setFolderLink("");
      setMessage("Drive folder saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveSheetLink = async () => {
    setBusy("sheet-link");
    setMessage(null);
    try {
      await onSaveSettings({ sheetInput: sheetLink });
      setSheetLink("");
      setMessage("Google Sheet saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const loadFolders = async (folder: FolderOption = folderStack[folderStack.length - 1]) => {
    setBusy("folders");
    setMessage(null);
    try {
      const data = await fetchJson<{ folders: FolderOption[] }>(api(`/api/google/drive/folders?parentId=${encodeURIComponent(folder.id)}`));
      setFolders(data.folders);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const openFolder = async (folder: FolderOption) => {
    setFolderStack((current) => [...current, folder]);
    await loadFolders(folder);
  };

  const jumpFolder = async (index: number) => {
    const nextStack = folderStack.slice(0, index + 1);
    setFolderStack(nextStack);
    await loadFolders(nextStack[nextStack.length - 1]);
  };

  const useFolder = async (folder: FolderOption) => {
    setBusy(`folder-${folder.id}`);
    setMessage(null);
    try {
      await onSaveSettings({ driveFolderId: folder.id, driveFolderName: folder.name });
      setMessage("Drive folder saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const loadSheets = async () => {
    setBusy("sheets");
    setMessage(null);
    try {
      const data = await fetchJson<{ sheets: SheetOption[] }>(api("/api/google/sheets"));
      setSheets(data.sheets);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const createSheet = async () => {
    setBusy("create-sheet");
    setMessage(null);
    try {
      const data = await fetchJson<{ sheet: SheetOption }>(api("/api/google/sheets/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sheetTitle }),
      });
      setSheets((current) => [data.sheet, ...current.filter((sheet) => sheet.id !== data.sheet.id)]);
      await onReload();
      setMessage("Google Sheet created.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const useSheet = async (sheet: SheetOption) => {
    setBusy(`sheet-${sheet.id}`);
    setMessage(null);
    try {
      await onSaveSettings({ sheetId: sheet.id, sheetName: sheet.name });
      setMessage("Google Sheet saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveFilenameSettings = async () => {
    setBusy("filename");
    setMessage(null);
    try {
      await onSaveSettings({ filenameTemplate: template, defaultPayerShortName });
      setMessage("Filename settings saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setMessage(null);
    try {
      await fetchJson(api("/api/google/disconnect"), { method: "POST" });
      await onReload();
      setMessage("Google account disconnected.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <section className="panel setup-summary">
        <div>
          <h1>Receipt Scanner</h1>
          <p className="muted-copy">Signed in with LINE. Google handles Drive and Sheets access.</p>
        </div>
        <div className={`status-pill ${settings.ready ? "ready" : ""}`}>
          <span>{settings.ready ? "Ready" : "Setup needed"}</span>
        </div>
      </section>

      {message && <div className="inline-message">{message}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Google</h2>
            <p>{settings.connected ? settings.googleEmail || "Connected" : "Not connected"}</p>
          </div>
          {settings.connected ? (
            <button className="secondary-button danger" type="button" onClick={disconnect} disabled={busy === "disconnect"}>
              <Unlink size={17} />
              <span>Disconnect</span>
            </button>
          ) : (
            <a className={`primary-button ${googleConfigured ? "" : "disabled-link"}`} href={googleConfigured ? api("/api/google/auth/start") : "#"}>
              <ShieldCheck size={17} />
              <span>Connect Google</span>
            </a>
          )}
        </div>
        {!googleConfigured && <p className="warning-copy">Google OAuth environment values are missing.</p>}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Drive Folder</h2>
            <p>{settings.driveFolderName || "No folder selected"}</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => loadFolders()} disabled={!settings.connected || busy === "folders"}>
            {busy === "folders" ? <Loader2 className="spin" size={17} /> : <FolderOpen size={17} />}
            <span>Browse</span>
          </button>
        </div>

        <div className="form-row">
          <label className="field">
            <span>Folder link</span>
            <input value={folderLink} onChange={(event) => setFolderLink(event.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
          </label>
          <button className="secondary-button form-button" type="button" onClick={saveFolderLink} disabled={!settings.connected || !folderLink.trim() || busy === "folder-link"}>
            {busy === "folder-link" ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            <span>Use link</span>
          </button>
        </div>

        {folders.length > 0 && (
          <div className="browser-block">
            <div className="breadcrumb">
              {folderStack.map((folder, index) => (
                <button key={`${folder.id}-${index}`} type="button" onClick={() => jumpFolder(index)}>
                  {folder.name}
                  {index < folderStack.length - 1 && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
            <div className="option-list">
              {folders.map((folder) => (
                <div className="option-row" key={folder.id}>
                  <button className="option-main" type="button" onClick={() => openFolder(folder)}>
                    <Folder size={18} />
                    <span>{folder.name}</span>
                  </button>
                  <button className="small-button" type="button" onClick={() => useFolder(folder)} disabled={busy === `folder-${folder.id}`}>
                    Use
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Google Sheet</h2>
            <p>{settings.sheetName || "No sheet selected"}</p>
          </div>
          <button className="secondary-button" type="button" onClick={loadSheets} disabled={!settings.connected || busy === "sheets"}>
            {busy === "sheets" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            <span>Load</span>
          </button>
        </div>

        <div className="form-row">
          <label className="field">
            <span>Sheet link</span>
            <input value={sheetLink} onChange={(event) => setSheetLink(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
          </label>
          <button className="secondary-button form-button" type="button" onClick={saveSheetLink} disabled={!settings.connected || !sheetLink.trim() || busy === "sheet-link"}>
            {busy === "sheet-link" ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            <span>Use link</span>
          </button>
        </div>

        <div className="form-row">
          <label className="field">
            <span>New sheet</span>
            <input value={sheetTitle} onChange={(event) => setSheetTitle(event.target.value)} />
          </label>
          <button className="secondary-button form-button" type="button" onClick={createSheet} disabled={!settings.connected || busy === "create-sheet"}>
            {busy === "create-sheet" ? <Loader2 className="spin" size={17} /> : <FileSpreadsheet size={17} />}
            <span>Create</span>
          </button>
        </div>

        {sheets.length > 0 && (
          <div className="option-list">
            {sheets.map((sheet) => (
              <div className="option-row" key={sheet.id}>
                <div className="option-main static">
                  <FileSpreadsheet size={18} />
                  <span>{sheet.name}</span>
                </div>
                <button className="small-button" type="button" onClick={() => useSheet(sheet)} disabled={busy === `sheet-${sheet.id}`}>
                  Use
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Filename</h2>
            <p>{renderFilenamePreview(template, { payerShortName: defaultPayerShortName || "OL" })}.jpg</p>
          </div>
          <button className="primary-button" type="button" onClick={saveFilenameSettings} disabled={busy === "filename"}>
            {busy === "filename" ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            <span>Save</span>
          </button>
        </div>

        <label className="field compact-field">
          <span>Default payer short name</span>
          <input value={defaultPayerShortName} onChange={(event) => setDefaultPayerShortName(event.target.value)} placeholder="OL" />
        </label>

        <FilenameBuilder template={template} onChange={setTemplate} previewValues={{ payerShortName: defaultPayerShortName || "OL" }} />
      </section>
    </div>
  );
}

function ScanView({ settings, onSetup, onSaved }: { settings: SettingsPayload; onSetup: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const filenamePreview = useMemo(() => {
    if (!draft) return renderFilenamePreview(settings.filenameTemplate, { payerShortName: settings.defaultPayerShortName || "OL" });
    return renderFilenamePreview(settings.filenameTemplate, {
      date: draft.date,
      invoiceNumber: draft.invoiceNumber,
      payerShortName: draft.payerShortName,
      total: draft.total,
      merchant: draft.merchant,
      category: draft.category,
      paymentMethod: draft.paymentMethod,
    });
  }, [draft, settings.defaultPayerShortName, settings.filenameTemplate]);

  const extract = async () => {
    if (!file) return;
    setBusy("ocr");
    setMessage(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const data = await fetchJson<{
        uploadId: string;
        draft: ReceiptDraft;
        defaultPayerShortName: string | null;
        filenameTemplate: FilenameSegment[];
      }>(api("/api/receipts/ocr"), { method: "POST", body: form });

      setDraft({
        uploadId: data.uploadId,
        date: data.draft.date || "",
        merchant: data.draft.merchant || "",
        invoiceNumber: data.draft.invoiceNumber || "",
        total: data.draft.total == null ? "" : String(data.draft.total),
        category: data.draft.category || "其他",
        payerShortName: data.defaultPayerShortName || "",
        paymentMethod: "",
        itemsText: data.draft.items.map((item) => `${item.name}${item.subtotal ? ` ${item.subtotal}` : ""}`).join("、"),
        notes: data.draft.notes || "",
        ocrText: data.draft.ocrText || "",
      });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    setMessage(null);
    try {
      const data = await fetchJson<SaveResult>(api("/api/receipts/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setResult(data);
      setDraft(null);
      setFile(null);
      await onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (!settings.ready) {
    return (
      <div className="stack">
        <section className="panel setup-required">
          <div>
            <h1>Receipt Scanner</h1>
            <p className="muted-copy">Connect Google, choose a Drive folder, and choose a Sheet.</p>
          </div>
          <button className="primary-button" type="button" onClick={onSetup}>
            <FolderOpen size={18} />
            <span>Open setup</span>
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      {message && <div className="inline-message">{message}</div>}

      <section className="panel capture-panel">
        <div className="capture-copy">
          <h1>Receipt Scanner</h1>
          <p className="muted-copy">Drive folder: {settings.driveFolderName}</p>
        </div>

        <label className="upload-drop">
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setDraft(null);
              setResult(null);
            }}
          />
          <UploadCloud size={28} />
          <span>{file ? file.name : "Choose receipt photo"}</span>
        </label>

        <button className="primary-button wide-button" type="button" onClick={extract} disabled={!file || busy === "ocr"}>
          {busy === "ocr" ? <Loader2 className="spin" size={18} /> : <Camera size={18} />}
          <span>Extract receipt</span>
        </button>
      </section>

      {draft && (
        <section className="panel review-panel">
          <div className="panel-heading">
            <div>
              <h2>Review</h2>
              <p>{filenamePreview}</p>
            </div>
            <button className="primary-button" type="button" onClick={save} disabled={busy === "save"}>
              {busy === "save" ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
              <span>Save</span>
            </button>
          </div>

          <div className="form-grid">
            <TextField label="日期" value={draft.date} onChange={(value) => setDraft({ ...draft, date: value })} placeholder="2026-08-27" />
            <TextField label="店家" value={draft.merchant} onChange={(value) => setDraft({ ...draft, merchant: value })} />
            <TextField label="發票號碼" value={draft.invoiceNumber} onChange={(value) => setDraft({ ...draft, invoiceNumber: value })} />
            <TextField label="支付總計額" value={draft.total} onChange={(value) => setDraft({ ...draft, total: value })} inputMode="decimal" />
            <label className="field">
              <span>類別</span>
              <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="支付方簡稱" value={draft.payerShortName} onChange={(value) => setDraft({ ...draft, payerShortName: value })} placeholder="OL" />
            <label className="field">
              <span>支付方式</span>
              <select value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}>
                <option value="">Not set</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="備註" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} />
          </div>

          <label className="field">
            <span>品項</span>
            <textarea value={draft.itemsText} onChange={(event) => setDraft({ ...draft, itemsText: event.target.value })} rows={3} />
          </label>

          <details className="ocr-details">
            <summary>OCR text</summary>
            <pre>{draft.ocrText || "No text returned."}</pre>
          </details>
        </section>
      )}

      {result && (
        <section className="panel result-panel">
          <CheckCircle2 size={28} />
          <div>
            <h2>{result.filename}</h2>
            <p>Saved to {result.sheet.tabName}.</p>
          </div>
          <div className="result-links">
            {result.driveFile.url && (
              <a className="secondary-button" href={result.driveFile.url} target="_blank" rel="noreferrer">
                <ExternalLink size={17} />
                <span>Drive file</span>
              </a>
            )}
            <a className="secondary-button" href={result.sheet.sheetUrl} target="_blank" rel="noreferrer">
              <FileSpreadsheet size={17} />
              <span>Sheet</span>
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </label>
  );
}

function api(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
