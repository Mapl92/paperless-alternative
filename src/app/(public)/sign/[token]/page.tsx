"use client";

import { useEffect, useState, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import SignatureCanvas from "@/components/signatures/signature-canvas";

export default function MobileSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [status, setStatus] = useState<
    "loading" | "ready" | "saving" | "done" | "error"
  >("loading");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch(`/api/signatures/token?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setName(data.name);
          setStatus("ready");
        } else {
          setErrorMsg(
            data.reason === "used"
              ? "Dieser Link wurde bereits verwendet."
              : data.reason === "expired"
                ? "Dieser Link ist abgelaufen."
                : "Ungültiger Link."
          );
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMsg("Verbindungsfehler.");
        setStatus("error");
      });
  }, [token]);

  async function handleSave(imageData: string) {
    setStatus("saving");
    try {
      const res = await fetch("/api/signatures/token/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imageData }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setErrorMsg("Speichern fehlgeschlagen.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Verbindungsfehler.");
      setStatus("error");
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-center">
          {status === "done" ? "Fertig!" : "Unterschrift"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === "loading" && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Unterschrift für <strong>{name}</strong>
            </p>
            <SignatureCanvas
              onSave={handleSave}
              saveLabel="Unterschrift speichern"
            />
          </div>
        )}

        {status === "saving" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm text-muted-foreground">Wird gespeichert...</p>
          </div>
        )}

        {status === "done" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <p className="text-sm text-muted-foreground">
              Unterschrift wurde gespeichert. Du kannst dieses Fenster schließen.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
