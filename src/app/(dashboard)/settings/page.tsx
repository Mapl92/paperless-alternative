"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, Trash2, RefreshCw, Mail, ChevronDown, ChevronUp, Palette, Upload, X, Database } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import EntityManagement from "./entity-management";
import SignatureManagement from "./signature-management";

const EMAIL_PRESETS: Record<string, { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  gmx: { host: "imap.gmx.net", port: 993 },
  webde: { host: "imap.web.de", port: 993 },
};

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [stats, setStats] = useState({
    documents: 0,
    tags: 0,
    correspondents: 0,
    documentTypes: 0,
  });

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // AI settings
  const [aiModel, setAiModel] = useState("");
  const [classifyPrompt, setClassifyPrompt] = useState("");
  const [ocrPrompt, setOcrPrompt] = useState("");
  const [ocrPageLimit, setOcrPageLimit] = useState(5);

  // Email settings
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailHost, setEmailHost] = useState("");
  const [emailPort, setEmailPort] = useState(993);
  const [emailUser, setEmailUser] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailFolder, setEmailFolder] = useState("INBOX");
  const [emailInterval, setEmailInterval] = useState(5);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailHelpOpen, setEmailHelpOpen] = useState(false);

  // Branding
  const [appName, setAppName] = useState("DocuMind");
  const [hasLogo, setHasLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  // #25: Version counter busts logo cache only after a successful upload (not on every render)
  const [logoVersion, setLogoVersion] = useState(0);

  // Embeddings
  const [embeddingStats, setEmbeddingStats] = useState({ total: 0, embedded: 0, pending: 0, running: false, progress: null as { processed: number; failed: number; total: number } | null });
  const [embeddingPolling, setEmbeddingPolling] = useState(false);

  const fetchEmbeddingStats = async () => {
    try {
      const res = await fetch("/api/embeddings/backfill");
      const data = await res.json();
      setEmbeddingStats(data);
      return data;
    } catch {
      return null;
    }
  };

  // Logs
  interface ApiLog {
    id: string;
    timestamp: string;
    type: string;
    action: string;
    model: string | null;
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    status: string;
    error: string | null;
  }
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(0);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsType, setLogsType] = useState("all");
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchLogs = async (page = 1, type = logsType) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (type !== "all") params.set("type", type);
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs);
      setLogsTotalPages(data.totalPages);
      setLogsTotal(data.total);
      setLogsPage(page);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!embeddingPolling) return;
    const interval = setInterval(async () => {
      const data = await fetchEmbeddingStats();
      if (data && !data.running) {
        setEmbeddingPolling(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [embeddingPolling]);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => {
        setAiModel(data.model);
        setClassifyPrompt(data.classifyPrompt);
        setOcrPrompt(data.ocrPrompt);
        setOcrPageLimit(data.ocrPageLimit ?? 5);
      })
      .catch(() => {});
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data) => {
        setEmailEnabled(data.enabled ?? false);
        setEmailHost(data.imapHost ?? "");
        setEmailPort(data.imapPort ?? 993);
        setEmailUser(data.imapUser ?? "");
        setEmailPassword(data.imapPassword ?? "");
        setEmailFolder(data.folder ?? "INBOX");
        setEmailInterval(data.pollIntervalMinutes ?? 5);
      })
      .catch(() => {});
    fetch("/api/settings/branding")
      .then((r) => r.json())
      .then((data) => {
        setAppName(data.appName ?? "DocuMind");
        setHasLogo(data.hasLogo ?? false);
      })
      .catch(() => {});
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (res.ok) {
        toast.success("Passwort geändert");
        setCurrentPassword("");
        setNewPassword("");
      } else {
        toast.error("Aktuelles Passwort ist falsch");
      }
    } catch {
      toast.error("Fehler beim Ändern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Einstellungen</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="branding">Personalisierung</TabsTrigger>
          <TabsTrigger value="general">Allgemein</TabsTrigger>
          <TabsTrigger value="management">Verwaltung</TabsTrigger>
          <TabsTrigger value="signatures">Unterschriften</TabsTrigger>
          <TabsTrigger value="ai">KI</TabsTrigger>
          <TabsTrigger value="embeddings" onClick={() => { if (embeddingStats.total === 0) fetchEmbeddingStats(); }}>Embeddings</TabsTrigger>
          <TabsTrigger value="email">E-Mail</TabsTrigger>
          <TabsTrigger value="logs" onClick={() => { if (logs.length === 0) fetchLogs(1, logsType); }}>Logs</TabsTrigger>
          <TabsTrigger value="security">Sicherheit</TabsTrigger>
        </TabsList>

        {/* Branding */}
        <TabsContent value="branding" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Personalisierung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="appName">App-Name</Label>
                <Input
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="DocuMind"
                  className="mt-1 max-w-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Wird in der Sidebar, auf der Login-Seite und im Browser-Tab angezeigt.
                </p>
              </div>

              <Separator />

              <div>
                <Label>Logo</Label>
                <div className="mt-2 flex items-start gap-4">
                  {/* Preview */}
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed bg-muted/30 shrink-0 overflow-hidden">
                    {removeLogo ? (
                      <span className="text-xs text-muted-foreground">Kein Logo</span>
                    ) : logoPreview ? (
                      <img src={logoPreview} alt="Logo Vorschau" className="h-full w-full object-contain p-1" />
                    ) : hasLogo ? (
                      <img src={`/api/branding/logo?v=${logoVersion}`} alt="Aktuelles Logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Kein Logo</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("logoUpload")?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Logo hochladen
                      </Button>
                      {(hasLogo || logoPreview) && !removeLogo && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRemoveLogo(true);
                            setLogoFile(null);
                            setLogoPreview(null);
                          }}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Entfernen
                        </Button>
                      )}
                    </div>
                    <input
                      id="logoUpload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setLogoFile(file);
                          setRemoveLogo(false);
                          const url = URL.createObjectURL(file);
                          setLogoPreview(url);
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, WebP oder SVG. Empfohlen: quadratisch, min. 64x64px.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={async () => {
                  setSavingBranding(true);
                  try {
                    const formData = new FormData();
                    formData.append("appName", appName);
                    if (logoFile) formData.append("logo", logoFile);
                    if (removeLogo) formData.append("removeLogo", "true");

                    const res = await fetch("/api/settings/branding", {
                      method: "PUT",
                      body: formData,
                    });

                    if (res.ok) {
                      const data = await res.json();
                      setHasLogo(data.hasLogo);
                      setLogoFile(null);
                      setLogoPreview(null);
                      setRemoveLogo(false);
                      setLogoVersion((v) => v + 1); // #25: bust cache after successful upload
                      toast.success("Personalisierung gespeichert");
                      window.dispatchEvent(new Event("branding-changed"));
                    } else {
                      toast.error("Speichern fehlgeschlagen");
                    }
                  } catch {
                    toast.error("Speichern fehlgeschlagen");
                  } finally {
                    setSavingBranding(false);
                  }
                }}
                disabled={savingBranding}
              >
                {savingBranding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Personalisierung speichern
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* General */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>System-Statistiken</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{stats.documents}</p>
                  <p className="text-xs text-muted-foreground">Dokumente</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{stats.tags}</p>
                  <p className="text-xs text-muted-foreground">Tags</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{stats.correspondents}</p>
                  <p className="text-xs text-muted-foreground">
                    Korrespondenten
                  </p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{stats.documentTypes}</p>
                  <p className="text-xs text-muted-foreground">Dokumenttypen</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Management */}
        <TabsContent value="management" className="space-y-4 mt-4">
          <EntityManagement />
        </TabsContent>

        {/* Signatures */}
        <TabsContent value="signatures" className="space-y-4 mt-4">
          <SignatureManagement />
        </TabsContent>

        {/* AI */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>KI-Konfiguration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="aiModel">Modell (OpenRouter)</Label>
                <Input
                  id="aiModel"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="openai/gpt-4.1-mini"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  z.B. openai/gpt-4.1-mini, google/gemini-2.5-flash, anthropic/claude-sonnet-4
                </p>
              </div>
              <Separator />
              <div>
                <Label htmlFor="classifyPrompt">Klassifizierungs-Prompt</Label>
                <Textarea
                  id="classifyPrompt"
                  className="mt-1 h-64 font-mono text-xs"
                  value={classifyPrompt}
                  onChange={(e) => setClassifyPrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bestehende Tags/Korrespondenten/Typen werden automatisch angehängt.
                </p>
              </div>
              <Separator />
              <div>
                <Label htmlFor="ocrPrompt">OCR-Prompt</Label>
                <Textarea
                  id="ocrPrompt"
                  className="mt-1 h-24 font-mono text-xs"
                  value={ocrPrompt}
                  onChange={(e) => setOcrPrompt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ocrPageLimit">Max. OCR-Seiten pro Dokument</Label>
                <Input
                  id="ocrPageLimit"
                  type="number"
                  min={1}
                  max={100}
                  value={ocrPageLimit}
                  onChange={(e) => setOcrPageLimit(parseInt(e.target.value) || 5)}
                  className="mt-1 w-32"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Anzahl der Seiten, die per OCR verarbeitet werden. Höhere Werte erhöhen Kosten und Verarbeitungszeit.
                </p>
              </div>
              <Button
                onClick={async () => {
                  setSavingAI(true);
                  try {
                    const res = await fetch("/api/settings/ai", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        model: aiModel,
                        classifyPrompt,
                        ocrPrompt,
                        ocrPageLimit,
                      }),
                    });
                    if (res.ok) toast.success("KI-Einstellungen gespeichert");
                    else toast.error("Speichern fehlgeschlagen");
                  } catch {
                    toast.error("Speichern fehlgeschlagen");
                  } finally {
                    setSavingAI(false);
                  }
                }}
                disabled={savingAI}
              >
                {savingAI ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                KI-Einstellungen speichern
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embeddings */}
        <TabsContent value="embeddings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Embeddings (Semantische Suche)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Embeddings ermöglichen die semantische Suche. Dokumente ohne Embedding werden nur per Textsuche gefunden.
              </p>

              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">{embeddingStats.total}</p>
                  <p className="text-xs text-muted-foreground">Dokumente gesamt</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-600">{embeddingStats.embedded}</p>
                  <p className="text-xs text-muted-foreground">Mit Embedding</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-orange-500/10">
                  <p className="text-2xl font-bold text-orange-600">{embeddingStats.pending}</p>
                  <p className="text-xs text-muted-foreground">Ohne Embedding</p>
                </div>
              </div>

              {embeddingStats.total > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Abdeckung</span>
                    <span>{embeddingStats.total > 0 ? Math.round((embeddingStats.embedded / embeddingStats.total) * 100) : 0}%</span>
                  </div>
                  <Progress value={embeddingStats.total > 0 ? (embeddingStats.embedded / embeddingStats.total) * 100 : 0} />
                </div>
              )}

              {embeddingStats.running && embeddingStats.progress && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">Backfill läuft...</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{embeddingStats.progress.processed + embeddingStats.progress.failed} / {embeddingStats.progress.total}</span>
                    {embeddingStats.progress.failed > 0 && (
                      <span className="text-red-500">{embeddingStats.progress.failed} fehlgeschlagen</span>
                    )}
                  </div>
                  <Progress value={embeddingStats.progress.total > 0 ? ((embeddingStats.progress.processed + embeddingStats.progress.failed) / embeddingStats.progress.total) * 100 : 0} />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/embeddings/backfill", { method: "POST" });
                      if (res.ok) {
                        toast.success("Embedding-Generierung gestartet");
                        setEmbeddingPolling(true);
                        await fetchEmbeddingStats();
                      } else {
                        const data = await res.json();
                        toast.error(data.error || "Fehler beim Starten");
                      }
                    } catch {
                      toast.error("Fehler beim Starten");
                    }
                  }}
                  disabled={embeddingStats.running || embeddingStats.pending === 0}
                >
                  {embeddingStats.running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {embeddingStats.pending > 0
                    ? `${embeddingStats.pending} fehlende Embeddings generieren`
                    : "Alle Dokumente haben Embeddings"}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={fetchEmbeddingStats}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email */}
        <TabsContent value="email" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                E-Mail-Import (IMAP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="emailEnabled">E-Mail-Import aktivieren</Label>
                  <p className="text-xs text-muted-foreground">
                    PDF-Anhänge aus ungelesenen E-Mails automatisch importieren
                  </p>
                </div>
                <Switch
                  id="emailEnabled"
                  checked={emailEnabled}
                  onCheckedChange={setEmailEnabled}
                />
              </div>

              <Separator />

              <div>
                <Label htmlFor="emailPreset">Anbieter-Vorlage</Label>
                <Select
                  onValueChange={(v) => {
                    if (v in EMAIL_PRESETS) {
                      setEmailHost(EMAIL_PRESETS[v].host);
                      setEmailPort(EMAIL_PRESETS[v].port);
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Anbieter auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="outlook">Outlook / Hotmail</SelectItem>
                    <SelectItem value="gmx">GMX</SelectItem>
                    <SelectItem value="webde">Web.de</SelectItem>
                    <SelectItem value="manual">Manuell</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emailHost">IMAP-Server</Label>
                  <Input
                    id="emailHost"
                    value={emailHost}
                    onChange={(e) => setEmailHost(e.target.value)}
                    placeholder="imap.gmail.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="emailPort">Port</Label>
                  <Input
                    id="emailPort"
                    type="number"
                    value={emailPort}
                    onChange={(e) => setEmailPort(parseInt(e.target.value) || 993)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emailUser">Benutzername / E-Mail</Label>
                  <Input
                    id="emailUser"
                    value={emailUser}
                    onChange={(e) => setEmailUser(e.target.value)}
                    placeholder="user@gmail.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="emailPassword">Passwort / App-Passwort</Label>
                  <Input
                    id="emailPassword"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="App-Passwort eingeben"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emailFolder">IMAP-Ordner</Label>
                  <Input
                    id="emailFolder"
                    value={emailFolder}
                    onChange={(e) => setEmailFolder(e.target.value)}
                    placeholder="INBOX"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="emailInterval">Abruf-Intervall (Minuten)</Label>
                  <Input
                    id="emailInterval"
                    type="number"
                    min={1}
                    max={60}
                    value={emailInterval}
                    onChange={(e) => setEmailInterval(parseInt(e.target.value) || 5)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    setTestingEmail(true);
                    try {
                      const res = await fetch("/api/settings/email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "test",
                          imapHost: emailHost,
                          imapPort: emailPort,
                          imapUser: emailUser,
                          imapPassword: emailPassword,
                          folder: emailFolder,
                        }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        toast.success(data.message);
                      } else {
                        toast.error(data.message);
                      }
                    } catch {
                      toast.error("Verbindungstest fehlgeschlagen");
                    } finally {
                      setTestingEmail(false);
                    }
                  }}
                  disabled={testingEmail || !emailHost || !emailUser}
                >
                  {testingEmail ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  Verbindung testen
                </Button>
                <Button
                  onClick={async () => {
                    setSavingEmail(true);
                    try {
                      const res = await fetch("/api/settings/email", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          enabled: emailEnabled,
                          imapHost: emailHost,
                          imapPort: emailPort,
                          imapUser: emailUser,
                          imapPassword: emailPassword,
                          folder: emailFolder,
                          pollIntervalMinutes: emailInterval,
                        }),
                      });
                      if (res.ok) toast.success("E-Mail-Einstellungen gespeichert");
                      else toast.error("Speichern fehlgeschlagen");
                    } catch {
                      toast.error("Speichern fehlgeschlagen");
                    } finally {
                      setSavingEmail(false);
                    }
                  }}
                  disabled={savingEmail}
                >
                  {savingEmail ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Speichern
                </Button>
              </div>

              <Separator />

              {/* Help section */}
              <div>
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setEmailHelpOpen(!emailHelpOpen)}
                >
                  {emailHelpOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Einrichtungs-Anleitung
                </button>
                {emailHelpOpen && (
                  <div className="mt-3 space-y-4 text-sm">
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-semibold">Gmail</h4>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>IMAP aktivieren: Gmail &rarr; Einstellungen &rarr; Weiterleitung und POP/IMAP &rarr; IMAP aktivieren</li>
                        <li>2-Faktor-Authentifizierung aktivieren: myaccount.google.com &rarr; Sicherheit &rarr; Bestätigung in zwei Schritten</li>
                        <li>App-Passwort erstellen: myaccount.google.com &rarr; Sicherheit &rarr; App-Passwörter &rarr; Neues Passwort generieren</li>
                        <li>Einstellungen: Server <code className="bg-muted px-1 rounded">imap.gmail.com</code>, Port <code className="bg-muted px-1 rounded">993</code></li>
                        <li>Das generierte App-Passwort (16 Zeichen) als Passwort verwenden</li>
                      </ol>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-semibold">Outlook / Hotmail</h4>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Server: <code className="bg-muted px-1 rounded">outlook.office365.com</code>, Port <code className="bg-muted px-1 rounded">993</code></li>
                        <li>E-Mail-Adresse als Benutzername, normales Passwort oder App-Passwort</li>
                      </ol>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-semibold">GMX</h4>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>IMAP aktivieren: GMX &rarr; Einstellungen &rarr; POP3/IMAP &rarr; IMAP aktivieren</li>
                        <li>Server: <code className="bg-muted px-1 rounded">imap.gmx.net</code>, Port <code className="bg-muted px-1 rounded">993</code></li>
                      </ol>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-semibold">Web.de</h4>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>IMAP aktivieren: Web.de &rarr; Einstellungen &rarr; POP3/IMAP &rarr; IMAP aktivieren</li>
                        <li>Server: <code className="bg-muted px-1 rounded">imap.web.de</code>, Port <code className="bg-muted px-1 rounded">993</code></li>
                      </ol>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Nach der Einrichtung wird das konfigurierte Postfach regelmäßig auf ungelesene E-Mails mit PDF-Anhängen geprüft.
                      Importierte E-Mails werden als gelesen markiert. Der E-Mail-Betreff wird als Dokumenttitel verwendet.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs */}
        <TabsContent value="logs" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>API-Logs ({logsTotal})</CardTitle>
                <div className="flex items-center gap-2">
                  <Select
                    value={logsType}
                    onValueChange={(v) => {
                      setLogsType(v);
                      fetchLogs(1, v);
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Alle Typen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Typen</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="gemini-chat">Gemini Chat</SelectItem>
                      <SelectItem value="gemini-embedding">Gemini Embedding</SelectItem>
                      <SelectItem value="gemini-title">Gemini Titel</SelectItem>
                      <SelectItem value="vector-search">Vektor-Suche</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fetchLogs(logsPage, logsType)}
                    disabled={logsLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${logsLoading ? "animate-spin" : ""}`} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!confirm("Alle Logs löschen?")) return;
                      await fetch("/api/logs", { method: "DELETE" });
                      toast.success("Logs gelöscht");
                      fetchLogs(1, logsType);
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Löschen
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3">Zeitpunkt</th>
                      <th className="pb-2 pr-3">Typ</th>
                      <th className="pb-2 pr-3">Aktion</th>
                      <th className="pb-2 pr-3">Modell</th>
                      <th className="pb-2 pr-3 text-right">Dauer</th>
                      <th className="pb-2 pr-3 text-right">Tokens</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">
                          {new Date(log.timestamp).toLocaleString("de-DE")}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="outline" className="text-xs">
                            {log.type}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs">{log.action}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {log.model || "-"}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs tabular-nums">
                          {log.durationMs < 1000
                            ? `${log.durationMs}ms`
                            : `${(log.durationMs / 1000).toFixed(1)}s`}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs tabular-nums">
                          {log.inputTokens || log.outputTokens
                            ? `${log.inputTokens ?? 0}/${log.outputTokens ?? 0}`
                            : "-"}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant={log.status === "success" ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {log.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          Keine Logs vorhanden
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {logsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    Seite {logsPage} von {logsTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsPage <= 1}
                      onClick={() => fetchLogs(logsPage - 1, logsType)}
                    >
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsPage >= logsTotalPages}
                      onClick={() => fetchLogs(logsPage + 1, logsType)}
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Passwort ändern</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword">Neues Passwort</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Passwort ändern
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
