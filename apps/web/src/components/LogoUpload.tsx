"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

interface LogoUploadProps {
  name: string;
  label: string;
  hint: string;
  brandId: string;
  defaultValue: string;
}

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Logo field: paste a link, or upload a file. Uploads go straight to storage with a short-lived signed
 * URL from our server, then the server checks the file (size, real type) before it is recorded.
 */
export function LogoUpload({ name, label, hint, brandId, defaultValue }: LogoUploadProps) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setMessage(null);
    // Quick friendly checks in the browser. The server checks everything again.
    if (!ALLOWED.includes(file.type)) return setMessage({ ok: false, text: "Please choose a PNG, JPG or WebP file." });
    if (file.size > MAX_BYTES) return setMessage({ ok: false, text: "That file is over 5 MB. Please choose a smaller one." });

    setBusy(true);
    try {
      const pre = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "logo", contentType: file.type, size: file.size, brandId }),
      });
      const preJson = (await pre.json()) as { data?: { key: string; url: string; headers: Record<string, string> }; error?: { message: string } };
      if (!pre.ok || !preJson.data) throw new Error(preJson.error?.message ?? "Could not start the upload.");

      const put = await fetch(preJson.data.url, { method: "PUT", headers: preJson.data.headers, body: file });
      if (!put.ok) throw new Error("The upload did not finish. Please try again.");

      const conf = await fetch("/api/uploads/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: preJson.data.key }),
      });
      const confJson = (await conf.json()) as { data?: { key: string }; error?: { message: string } };
      if (!conf.ok || !confJson.data) throw new Error(confJson.error?.message ?? "The file did not pass our checks.");

      const domain = process.env.NEXT_PUBLIC_MEDIA_DOMAIN;
      if (domain) {
        setValue(`https://${domain}/${confJson.data.key}`);
        setMessage({ ok: true, text: "Uploaded. Press Save to keep it." });
      } else {
        setMessage({ ok: true, text: "Uploaded and checked. The public link appears here once the media domain is connected." });
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      <div className="flex gap-2">
        <input type="url" name={name} value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://" className="input text-xs flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-fill-tertiary disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload"}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
      {message && <p className={`text-[11px] mt-1 ${message.ok ? "text-primary" : "text-destructive"}`}>{message.text}</p>}
    </div>
  );
}
