"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type BillingInterval = "monthly" | "quarterly" | "yearly" | "once" | "unknown";

interface ContractCost {
  id: string;
  amount: number;
  currency: string;
  billingInterval: BillingInterval;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  monthlyAmount: number;
  yearlyAmount: number;
  sourceDocument?: { id: string; title: string } | null;
}

interface Contract {
  id: string;
  name: string;
  category: string;
  status: string;
  providerName: string | null;
  contractNumber: string | null;
  customerNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  cancellationDeadline: string | null;
  cancellationPeriod: string | null;
  renewalInterval: string | null;
  notes: string | null;
  currentCost: ContractCost | null;
  costs: ContractCost[];
  documents: Array<{
    id: string;
    role: string;
    document: { id: string; title: string; documentDate: string | null; createdAt: string };
  }>;
  reminders: Array<{ id: string; title: string; remindAt: string; dismissed: boolean }>;
}

interface Candidate {
  id: string;
  status: string;
  contractName: string | null;
  category: string | null;
  providerName: string | null;
  contractNumber: string | null;
  customerNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  cancellationDeadline: string | null;
  cancellationPeriod: string | null;
  renewalInterval: string | null;
  amount: number | null;
  currency: string;
  billingInterval: BillingInterval | null;
  confidence: number;
  evidence: string[];
  document: {
    id: string;
    title: string;
    content: string | null;
    correspondent: { name: string } | null;
    documentType: { name: string } | null;
  };
}

const categoryLabels: Record<string, string> = {
  insurance: "Versicherung",
  mobile: "Mobilfunk",
  energy: "Energie",
  streaming: "Streaming",
  software: "Software",
  membership: "Mitgliedschaft",
  other: "Sonstiges",
};

const intervalLabels: Record<string, string> = {
  monthly: "Monatlich",
  quarterly: "Quartalsweise",
  yearly: "Jährlich",
  once: "Einmalig",
  unknown: "Unbekannt",
};

function formatCurrency(value: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("de-DE") : "—";
}

function toDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function emptyForm() {
  return {
    name: "",
    category: "other",
    providerName: "",
    contractNumber: "",
    customerNumber: "",
    startDate: "",
    endDate: "",
    cancellationDeadline: "",
    cancellationPeriod: "",
    renewalInterval: "",
    amount: "",
    currency: "EUR",
    billingInterval: "monthly",
    notes: "",
  };
}

export default function ContractsPage() {
  const [activeContracts, setActiveContracts] = useState<Contract[]>([]);
  const [archiveContracts, setArchiveContracts] = useState<Contract[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState({
    activeCount: 0,
    pendingCandidates: 0,
    cancellableSoon: 0,
    monthlyTotal: 0,
    yearlyTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [candidateForm, setCandidateForm] = useState(emptyForm);
  const [existingContractId, setExistingContractId] = useState("new");
  const [confirming, setConfirming] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contractForm, setContractForm] = useState(emptyForm);
  const [savingContract, setSavingContract] = useState(false);
  const [newCost, setNewCost] = useState({ amount: "", currency: "EUR", billingInterval: "monthly", validFrom: "", note: "" });

  async function loadAll() {
    setLoading(true);
    try {
      const [activeRes, archiveRes, candidatesRes] = await Promise.all([
        fetch("/api/contracts?status=active"),
        fetch("/api/contracts?status=archive"),
        fetch("/api/contracts/candidates"),
      ]);
      const [activeData, archiveData, candidatesData] = await Promise.all([
        activeRes.json(),
        archiveRes.json(),
        candidatesRes.json(),
      ]);
      setActiveContracts(activeData.contracts ?? []);
      setArchiveContracts(archiveData.contracts ?? []);
      setStats(activeData.stats ?? stats);
      setCandidates(candidatesData.candidates ?? []);
    } catch {
      toast.error("Verträge konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const soonContracts = useMemo(
    () =>
      activeContracts
        .map((contract) => ({ contract, days: daysUntil(contract.cancellationDeadline || contract.endDate) }))
        .filter((item): item is { contract: Contract; days: number } => item.days !== null && item.days >= 0 && item.days <= 90)
        .sort((a, b) => a.days - b.days),
    [activeContracts]
  );

  function openCandidate(candidate: Candidate) {
    setSelectedCandidate(candidate);
    setExistingContractId("new");
    setCandidateForm({
      name: candidate.contractName || candidate.document.title,
      category: candidate.category || "other",
      providerName: candidate.providerName || candidate.document.correspondent?.name || "",
      contractNumber: candidate.contractNumber || "",
      customerNumber: candidate.customerNumber || "",
      startDate: toDateInput(candidate.startDate),
      endDate: toDateInput(candidate.endDate),
      cancellationDeadline: toDateInput(candidate.cancellationDeadline),
      cancellationPeriod: candidate.cancellationPeriod || "",
      renewalInterval: candidate.renewalInterval || "",
      amount: candidate.amount?.toString() || "",
      currency: candidate.currency || "EUR",
      billingInterval: candidate.billingInterval || "monthly",
      notes: "",
    });
  }

  function openContract(contract: Contract) {
    setSelectedContract(contract);
    setContractForm({
      name: contract.name,
      category: contract.category,
      providerName: contract.providerName || "",
      contractNumber: contract.contractNumber || "",
      customerNumber: contract.customerNumber || "",
      startDate: toDateInput(contract.startDate),
      endDate: toDateInput(contract.endDate),
      cancellationDeadline: toDateInput(contract.cancellationDeadline),
      cancellationPeriod: contract.cancellationPeriod || "",
      renewalInterval: contract.renewalInterval || "",
      amount: "",
      currency: "EUR",
      billingInterval: "monthly",
      notes: contract.notes || "",
    });
    setNewCost({ amount: "", currency: "EUR", billingInterval: "monthly", validFrom: "", note: "" });
  }

  async function confirmCandidate() {
    if (!selectedCandidate) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/contracts/candidates/${selectedCandidate.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: existingContractId === "new" ? null : existingContractId,
          contract: candidateForm,
          updateContract: false,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Bestätigung fehlgeschlagen");
      }
      toast.success("Vertrag bestätigt");
      setSelectedCandidate(null);
      await loadAll();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function ignoreCandidate(candidate: Candidate) {
    try {
      const res = await fetch(`/api/contracts/candidates/${candidate.id}/ignore`, { method: "POST" });
      if (!res.ok) throw new Error("Ignorieren fehlgeschlagen");
      setCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
      toast.success("Vorschlag ignoriert");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function runBackfill() {
    setBackfilling(true);
    try {
      const res = await fetch("/api/contracts/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Backfill fehlgeschlagen");
      }
      const data = await res.json();
      toast.success(`${data.scanned} Dokumente geprüft, ${data.pending} Vorschläge gefunden`);
      await loadAll();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBackfilling(false);
    }
  }

  async function saveContract() {
    if (!selectedContract) return;
    setSavingContract(true);
    try {
      const res = await fetch(`/api/contracts/${selectedContract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contractForm),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Speichern fehlgeschlagen");
      }
      const updated = await res.json();
      setSelectedContract(updated);
      toast.success("Vertrag gespeichert");
      await loadAll();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingContract(false);
    }
  }

  async function addCost() {
    if (!selectedContract || !newCost.amount.trim()) return;
    try {
      const res = await fetch(`/api/contracts/${selectedContract.id}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCost),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Kosten konnten nicht gespeichert werden");
      }
      const full = await fetch(`/api/contracts/${selectedContract.id}`).then((r) => r.json());
      setSelectedContract(full);
      setNewCost({ amount: "", currency: "EUR", billingInterval: "monthly", validFrom: "", note: "" });
      await loadAll();
      toast.success("Kosten hinzugefügt");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function archiveContract(contract: Contract) {
    const res = await fetch(`/api/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (res.ok) {
      toast.success("Vertrag archiviert");
      await loadAll();
    } else {
      toast.error("Archivieren fehlgeschlagen");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verträge & Abos</h1>
          <p className="text-sm text-muted-foreground">
            Laufzeiten, Kosten und Kündigungsfristen an einem Ort.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAll} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Aktualisieren
          </Button>
          <Button onClick={runBackfill} disabled={backfilling}>
            {backfilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Bestand scannen
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={ShieldCheck} label="Aktive Verträge" value={stats.activeCount.toString()} />
        <StatCard icon={AlertTriangle} label="Zu prüfen" value={stats.pendingCandidates.toString()} />
        <StatCard icon={Clock} label="Bald kündbar" value={stats.cancellableSoon.toString()} />
        <StatCard icon={CreditCard} label="Monatlich" value={formatCurrency(stats.monthlyTotal)} />
        <StatCard icon={CreditCard} label="Jährlich" value={formatCurrency(stats.yearlyTotal)} />
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Aktive Verträge</TabsTrigger>
          <TabsTrigger value="review">Zu prüfen ({candidates.length})</TabsTrigger>
          <TabsTrigger value="archive">Archiv</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {soonContracts.length > 0 && (
            <div className="rounded-lg border bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Bell className="h-4 w-4" />
                Kündigungsfenster in den nächsten 90 Tagen
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {soonContracts.slice(0, 6).map(({ contract, days }) => (
                  <button
                    key={contract.id}
                    onClick={() => openContract(contract)}
                    className="rounded-md bg-background/70 px-3 py-2 text-left text-sm hover:bg-background"
                  >
                    <span className="font-medium">{contract.name}</span>
                    <span className="block text-xs opacity-75">in {days} Tagen</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ContractList contracts={activeContracts} loading={loading} onOpen={openContract} onArchive={archiveContract} />
        </TabsContent>

        <TabsContent value="review">
          <div className="grid gap-3">
            {candidates.length === 0 ? (
              <EmptyState title="Keine offenen Vorschläge" text="Neue Vertragsdokumente erscheinen hier nach der KI-Verarbeitung oder nach einem Bestandsscan." />
            ) : (
              candidates.map((candidate) => (
                <div key={candidate.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{candidate.contractName || candidate.document.title}</h3>
                        <Badge variant="secondary">{categoryLabels[candidate.category || "other"] || "Sonstiges"}</Badge>
                        <Badge variant="outline">{Math.round(candidate.confidence * 100)} %</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {candidate.providerName || candidate.document.correspondent?.name || "Unbekannter Anbieter"} · Dokument: {candidate.document.title}
                      </p>
                      {candidate.evidence?.length > 0 && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{candidate.evidence.join(" · ")}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => ignoreCandidate(candidate)}>
                        <X className="mr-1 h-4 w-4" />
                        Ignorieren
                      </Button>
                      <Button size="sm" onClick={() => openCandidate(candidate)}>
                        <Check className="mr-1 h-4 w-4" />
                        Prüfen
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="archive">
          <ContractList contracts={archiveContracts} loading={loading} onOpen={openContract} />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedCandidate)} onOpenChange={(open) => !open && setSelectedCandidate(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Vertragsvorschlag prüfen</DialogTitle>
            <DialogDescription>
              Werte korrigieren und als neuen Vertrag speichern oder mit einem bestehenden Vertrag verknüpfen.
            </DialogDescription>
          </DialogHeader>
          {selectedCandidate && (
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{selectedCandidate.document.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedCandidate.document.documentType?.name || "Dokument"} · {selectedCandidate.document.correspondent?.name || "Unbekannt"}
                  </p>
                </div>
                <div className="max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                  {selectedCandidate.document.content?.slice(0, 5000) || "Kein OCR-Text vorhanden."}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Zu bestehendem Vertrag hinzufügen</Label>
                  <Select value={existingContractId} onValueChange={setExistingContractId}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Neuen Vertrag erstellen</SelectItem>
                      {activeContracts.map((contract) => (
                        <SelectItem key={contract.id} value={contract.id}>{contract.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ContractForm form={candidateForm} onChange={setCandidateForm} includeCost />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCandidate(null)} disabled={confirming}>
              Abbrechen
            </Button>
            <Button onClick={confirmCandidate} disabled={confirming || !candidateForm.name.trim()}>
              {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {existingContractId === "new" ? "Vertrag erstellen" : "Verknüpfen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedContract)} onOpenChange={(open) => !open && setSelectedContract(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Vertragsdetail</DialogTitle>
            <DialogDescription>Daten, Kostenhistorie, Dokumente und Erinnerungen bearbeiten.</DialogDescription>
          </DialogHeader>
          {selectedContract && (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <ContractForm form={contractForm} onChange={setContractForm} />
                <Button onClick={saveContract} disabled={savingContract || !contractForm.name.trim()}>
                  {savingContract ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Speichern
                </Button>
              </div>
              <div className="space-y-5">
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Kostenhistorie</h3>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-[1fr_1fr] gap-2">
                      <Input placeholder="Betrag" value={newCost.amount} onChange={(e) => setNewCost((v) => ({ ...v, amount: e.target.value }))} />
                      <Select value={newCost.billingInterval} onValueChange={(billingInterval) => setNewCost((v) => ({ ...v, billingInterval }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(intervalLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input type="date" value={newCost.validFrom} onChange={(e) => setNewCost((v) => ({ ...v, validFrom: e.target.value }))} />
                    <Input placeholder="Notiz" value={newCost.note} onChange={(e) => setNewCost((v) => ({ ...v, note: e.target.value }))} />
                    <Button variant="outline" size="sm" onClick={addCost} disabled={!newCost.amount.trim()}>
                      <Plus className="mr-1 h-4 w-4" />
                      Kosten hinzufügen
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {selectedContract.costs.map((cost) => (
                      <div key={cost.id} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{formatCurrency(cost.amount, cost.currency)}</span>
                          <span className="text-muted-foreground">{intervalLabels[cost.billingInterval]}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          ab {formatDate(cost.validFrom)} · {formatCurrency(cost.yearlyAmount, cost.currency)} / Jahr
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Dokumente</h3>
                  {selectedContract.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine Dokumente verknüpft.</p>
                  ) : (
                    selectedContract.documents.map((item) => (
                      <Link key={item.id} href={`/documents/${item.document.id}`} className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{item.document.title}</span>
                      </Link>
                    ))
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-medium">Erinnerungen</h3>
                  {selectedContract.reminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine Erinnerungen.</p>
                  ) : (
                    selectedContract.reminders.map((reminder) => (
                      <div key={reminder.id} className="rounded-md border p-2 text-sm">
                        <p className="font-medium">{reminder.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(reminder.remindAt)}</p>
                      </div>
                    ))
                  )}
                </section>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ContractList({
  contracts,
  loading,
  onOpen,
  onArchive,
}: {
  contracts: Contract[];
  loading: boolean;
  onOpen: (contract: Contract) => void;
  onArchive?: (contract: Contract) => void;
}) {
  if (loading) {
    return <div className="rounded-lg border p-6 text-sm text-muted-foreground">Lade Verträge...</div>;
  }
  if (contracts.length === 0) {
    return <EmptyState title="Keine Verträge" text="Bestätigte Vertragsvorschläge erscheinen hier." />;
  }

  return (
    <div className="grid gap-3">
      {contracts.map((contract) => {
        const deadline = contract.cancellationDeadline || contract.endDate;
        const days = daysUntil(deadline);
        return (
          <div key={contract.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button className="min-w-0 text-left" onClick={() => onOpen(contract)}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{contract.name}</h3>
                  <Badge variant="secondary">{categoryLabels[contract.category] || "Sonstiges"}</Badge>
                  {days !== null && days >= 0 && days <= 90 && <Badge variant="destructive">in {days} Tagen</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {contract.providerName || "Unbekannter Anbieter"} · Kündigung {formatDate(contract.cancellationDeadline)} · Ende {formatDate(contract.endDate)}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-right text-sm">
                  <p className="font-medium">{contract.currentCost ? formatCurrency(contract.currentCost.monthlyAmount, contract.currentCost.currency) : "—"}</p>
                  <p className="text-xs text-muted-foreground">pro Monat</p>
                </div>
                {onArchive && (
                  <Button variant="ghost" size="sm" onClick={() => onArchive(contract)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContractForm({
  form,
  onChange,
  includeCost = false,
}: {
  form: ReturnType<typeof emptyForm>;
  onChange: (form: ReturnType<typeof emptyForm>) => void;
  includeCost?: boolean;
}) {
  function set(key: keyof ReturnType<typeof emptyForm>, value: string) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Kategorie">
          <Select value={form.category} onValueChange={(value) => set("category", value)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(categoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Anbieter"><Input value={form.providerName} onChange={(e) => set("providerName", e.target.value)} /></Field>
        <Field label="Vertragsnummer"><Input value={form.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Kundennummer"><Input value={form.customerNumber} onChange={(e) => set("customerNumber", e.target.value)} /></Field>
        <Field label="Kündigungsfrist"><Input value={form.cancellationPeriod} onChange={(e) => set("cancellationPeriod", e.target.value)} /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Start"><Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="Kündigen bis"><Input type="date" value={form.cancellationDeadline} onChange={(e) => set("cancellationDeadline", e.target.value)} /></Field>
        <Field label="Ende"><Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
      </div>
      <Field label="Verlängerung"><Input value={form.renewalInterval} onChange={(e) => set("renewalInterval", e.target.value)} placeholder="z.B. jährlich" /></Field>
      {includeCost && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Betrag"><Input value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Währung"><Input value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></Field>
          <Field label="Intervall">
            <Select value={form.billingInterval} onValueChange={(value) => set("billingInterval", value)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(intervalLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <Field label="Notizen"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
