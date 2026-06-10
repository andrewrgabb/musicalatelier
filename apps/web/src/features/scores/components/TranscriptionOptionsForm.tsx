/**
 * Curated Audiveris transcription options. A controlled form: the parent owns a
 * TranscriptionOptions value and gets updates via onChange. Used inline on the
 * upload page and inside the re-process dialog.
 *
 * Select fields offer a "Default" choice (leaves the field unset → Audiveris
 * default). Switches are explicit booleans initialised to Audiveris's defaults.
 */
import type { OmrEngine, TranscriptionOptions } from "@/features/scores/apis/scores";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** A sensible starting point: Audiveris defaults made explicit for the switches. */
export function defaultOptions(): TranscriptionOptions {
  return {
    switches: {
      smallHeads: false,
      crossHeads: false,
      lyrics: true,
      articulations: true,
      implicitTuplets: false,
    },
  };
}

const DEFAULT = "default"; // sentinel for "leave unset" in the selects

const SWITCHES: { key: keyof NonNullable<TranscriptionOptions["switches"]>; label: string }[] = [
  { key: "smallHeads", label: "Small note heads" },
  { key: "crossHeads", label: "Cross note heads" },
  { key: "lyrics", label: "Lyrics" },
  { key: "articulations", label: "Articulations" },
  { key: "implicitTuplets", label: "Implicit tuplets" },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: "eng", label: "English" },
  { value: "fra", label: "French" },
  { value: "deu", label: "German" },
  { value: "ita", label: "Italian" },
  { value: "spa", label: "Spanish" },
];

export function TranscriptionOptionsForm({
  engine,
  onEngineChange,
  value,
  onChange,
  disabled,
}: {
  engine: OmrEngine;
  onEngineChange: (next: OmrEngine) => void;
  value: TranscriptionOptions;
  onChange: (next: TranscriptionOptions) => void;
  disabled?: boolean;
}) {
  function set(patch: Partial<TranscriptionOptions>) {
    onChange({ ...value, ...patch });
  }
  function setSwitch(key: string, on: boolean) {
    onChange({ ...value, switches: { ...value.switches, [key]: on } });
  }

  // homr has no tunable options, so disable the Audiveris controls when it's chosen.
  const optsDisabled = disabled || engine === "homr";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="opt-engine">Engine</Label>
        <Select
          disabled={disabled}
          value={engine}
          onValueChange={(v) => onEngineChange(v as OmrEngine)}
        >
          <SelectTrigger id="opt-engine">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="audiveris">Audiveris (printed scores, PDFs, tunable)</SelectItem>
            <SelectItem value="homr">homr (tolerant of low-res, no options)</SelectItem>
          </SelectContent>
        </Select>
        {engine === "homr" && (
          <p className="text-xs text-muted-foreground">
            homr has no options — it transcribes with its built-in model.
          </p>
        )}
      </div>

      {engine !== "homr" && (
        <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opt-quality">Input quality</Label>
          <Select
            disabled={optsDisabled}
            value={value.inputQuality ?? DEFAULT}
            onValueChange={(v) =>
              set({ inputQuality: v === DEFAULT ? undefined : (v as TranscriptionOptions["inputQuality"]) })
            }
          >
            <SelectTrigger id="opt-quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT}>Default</SelectItem>
              <SelectItem value="synthetic">Synthetic (clean/born-digital)</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="poor">Poor (photos/old prints)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opt-lang">OCR language</Label>
          <Select
            disabled={optsDisabled}
            value={value.ocrLanguage ?? DEFAULT}
            onValueChange={(v) => set({ ocrLanguage: v === DEFAULT ? undefined : v })}
          >
            <SelectTrigger id="opt-lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT}>Default (English)</SelectItem>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opt-binz">Binarization</Label>
          <Select
            disabled={optsDisabled}
            value={value.binarization ?? DEFAULT}
            onValueChange={(v) =>
              set({ binarization: v === DEFAULT ? undefined : (v as TranscriptionOptions["binarization"]) })
            }
          >
            <SelectTrigger id="opt-binz">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT}>Default (adaptive)</SelectItem>
              <SelectItem value="adaptive">Adaptive</SelectItem>
              <SelectItem value="global">Global (fixed threshold)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.binarization === "global" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opt-threshold">Global threshold (0–255)</Label>
            <Input
              id="opt-threshold"
              type="number"
              min={0}
              max={255}
              disabled={optsDisabled}
              placeholder="e.g. 140"
              value={value.binarizationThreshold ?? ""}
              onChange={(e) =>
                set({
                  binarizationThreshold:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Label>Recognize</Label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SWITCHES.map((s) => (
            <label
              key={s.key}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span>{s.label}</span>
              <Switch
                disabled={optsDisabled}
                checked={value.switches?.[s.key] ?? false}
                onCheckedChange={(on) => setSwitch(s.key, on)}
              />
            </label>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
