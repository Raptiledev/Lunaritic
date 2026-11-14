"use client";
import type { MissionConfig } from "@/types/api";

export function validate(c: MissionConfig): Record<string, string> {
  const e: Record<string, string> = {};
  const lat = Number(c.latitude), lon = Number(c.longitude), dur = Number(c.durationDays);
  if (c.latitude === "" || Number.isNaN(lat) || lat < -90 || lat > 90) e.latitude = "Enter a latitude between -90 and 90.";
  if (c.longitude === "" || Number.isNaN(lon) || lon < -180 || lon > 360) e.longitude = "Enter a longitude between -180 and 360.";
  if (!c.date) e.date = "Choose a landing date.";
  if (!c.time) e.time = "Choose a landing time (UTC).";
  if (c.durationDays === "" || Number.isNaN(dur) || dur <= 0 || dur > 60) e.durationDays = "Enter a duration between 0 and 60 days.";
  if (c.heightM !== "" && (Number.isNaN(Number(c.heightM)) || Number(c.heightM) < 0)) e.heightM = "Height must be zero or more.";
  return e;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-[11px] text-haz-high">{error}</span>
        : hint ? <span className="mt-1 block text-[11px] text-bone-faint">{hint}</span> : null}
    </label>
  );
}

export default function MissionForm({ value, onChange }: { value: MissionConfig; onChange: (c: MissionConfig) => void }) {
  const errors = validate(value);
  const set = (k: keyof MissionConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value, ...(k === "latitude" || k === "longitude" ? { siteId: undefined } : {}) });
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      <div className="col-span-2">
        <Field label="Mission name">
          <input className="input" value={value.name} onChange={set("name")} placeholder="Candidate site A" />
        </Field>
      </div>
      <Field label="Latitude (°)" error={value.latitude ? errors.latitude : undefined}>
        <input className="input num" inputMode="decimal" value={value.latitude} onChange={set("latitude")} placeholder="-89.4632" />
      </Field>
      <Field label="Longitude (°E)" hint="East-positive, 0 to 360" error={value.longitude ? errors.longitude : undefined}>
        <input className="input num" inputMode="decimal" value={value.longitude} onChange={set("longitude")} placeholder="222.510" />
      </Field>
      <Field label="Landing date (UTC)">
        <input type="date" className="input num" value={value.date} onChange={set("date")} />
      </Field>
      <Field label="Landing time (UTC)">
        <input type="time" className="input num" value={value.time} onChange={set("time")} />
      </Field>
      <Field label="Duration (days)" error={value.durationDays ? errors.durationDays : undefined}>
        <input className="input num" inputMode="decimal" value={value.durationDays} onChange={set("durationDays")} placeholder="14" />
      </Field>
      <Field label="Lander height (m)" hint="Optional. Raises the horizon observer" error={errors.heightM}>
        <input className="input num" inputMode="decimal" value={value.heightM} onChange={set("heightM")} placeholder="2" />
      </Field>
    </div>
  );
}
