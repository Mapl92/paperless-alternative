"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Smartphone, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "@/components/signatures/signature-canvas";

interface Signature {
  id: string;
  name: string;
  imageFile: string;
  width: number;
  height: number;
  createdAt: string;
}

export default function SignatureManagement() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);

  // New signature dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Mobile dialog
  const [showMobileDialog, setShowMobileDialog] = useState(false);
  const [mobileName, setMobileName] = useState("");
  const [mobileUrl, setMobileUrl] = useState("");
  const [mobileToken, setMobileToken] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadSignatures = useCallback(async () => {
    try {
      const res = await fetch("/api/signatures");
      if (res.ok) setSignatures(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  // Poll for mobile signature completion
  useEffect(() => {
    if (!mobileToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/signatures/token?token=${mobileToken}`
        );
        if (res.ok) {
          const data = await res.json();
          if (!data.valid && data.reason === "used") {
            clearInterval(interval);
            setShowMobileDialog(false);
            setMobileToken("");
            setMobileUrl("");
            toast.success("Mobile Unterschrift erstellt");
            loadSignatures();
          }
        }
      } catch {
        // ignore
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [mobileToken, loadSignatures]);

  async function handleCreateSignature(imageData: string) {
    if (!newName.trim()) {
      toast.error("Name erforderlich");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, imageData }),
      });
      if (res.ok) {
        toast.success("Unterschrift gespeichert");
        setShowNewDialog(false);
        setNewName("");
        loadSignatures();
      } else {
        toast.error("Speichern fehlgeschlagen");
      }
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMobileToken() {
    if (!mobileName.trim()) {
      toast.error("Name erforderlich");
      return;
    }
    setCreatingToken(true);
    try {
      const res = await fetch("/api/signatures/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mobileName }),
      });
      if (res.ok) {
        const data = await res.json();
        setMobileUrl(data.url);
        setMobileToken(data.token);
      } else {
        toast.error("Token erstellen fehlgeschlagen");
      }
    } catch {
      toast.error("Token erstellen fehlgeschlagen");
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/signatures/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSignatures((prev) => prev.filter((s) => s.id !== id));
        toast.success("Unterschrift gelöscht");
      }
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowNewDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Neue Unterschrift
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowMobileDialog(true);
            setMobileName("");
            setMobileUrl("");
            setMobileToken("");
          }}
        >
          <Smartphone className="mr-2 h-4 w-4" />
          Mobil erstellen
        </Button>
      </div>

      {signatures.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Noch keine Unterschriften vorhanden.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {signatures.map((sig) => (
            <Card key={sig.id}>
              <CardContent className="flex items-center gap-4 py-3">
                <img
                  src={`/api/signatures/${sig.id}/image`}
                  alt={sig.name}
                  className="h-16 w-32 object-contain border rounded bg-white"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{sig.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(sig.createdAt).toLocaleDateString("de-DE")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(sig.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Signature Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Unterschrift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sigName">Name</Label>
              <Input
                id="sigName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="z.B. Max Mustermann"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Unterschrift zeichnen</Label>
              <div className="mt-1">
                <SignatureCanvas
                  onSave={handleCreateSignature}
                  saveLabel="Unterschrift speichern"
                  saving={saving}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Signing Dialog */}
      <Dialog
        open={showMobileDialog}
        onOpenChange={(open) => {
          setShowMobileDialog(open);
          if (!open) {
            setMobileToken("");
            setMobileUrl("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mobil unterschreiben</DialogTitle>
          </DialogHeader>
          {!mobileUrl ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="mobileName">Name der Unterschrift</Label>
                <Input
                  id="mobileName"
                  value={mobileName}
                  onChange={(e) => setMobileName(e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="mt-1"
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreateMobileToken}
                  disabled={creatingToken || !mobileName.trim()}
                >
                  {creatingToken && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Link generieren
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Öffne diesen Link auf deinem Smartphone, um die Unterschrift zu
                zeichnen. Der Link ist 24 Stunden gültig.
              </p>
              <div className="flex gap-2">
                <Input value={mobileUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyUrl}>
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Warte auf Unterschrift vom Smartphone...
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
