"use client";

import { useState } from "react";

interface DiffViewerProps {
  filePath?: string | null;
  lineNumber?: number | null;
  description?: string | null;
  correctedCode: string;
  onSaveFix?: (updatedCode: string) => Promise<void>;
}

export default function DiffViewer({
  filePath,
  lineNumber,
  description,
  correctedCode,
  onSaveFix,
}: DiffViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(correctedCode);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!onSaveFix) return;
    setSaving(true);
    try {
      await onSaveFix(editedCode);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs font-mono">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="font-semibold text-cyan-400">Diff Preview</span>
          {filePath && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
              {filePath}
              {lineNumber ? `:${lineNumber}` : ""}
            </span>
          )}
        </div>
        {onSaveFix && (
          <button
            type="button"
            className="text-cyan-400 hover:text-cyan-300 font-sans text-xs underline"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Cancel Edit" : "Edit Code Fix"}
          </button>
        )}
      </div>

      {description && (
        <div className="mb-3 rounded bg-rose-950/30 border border-rose-900/50 p-2.5 text-rose-300">
          <span className="font-semibold text-rose-400 font-sans block mb-1">
            - Current Problem Context:
          </span>
          <p className="font-sans text-xs text-rose-200">{description}</p>
        </div>
      )}

      {isEditing ? (
        <div className="space-y-2">
          <label className="block text-emerald-400 font-sans font-semibold mb-1">
            Edit Proposed Fix Code:
          </label>
          <textarea
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none min-h-[120px]"
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
          />
          <div className="flex justify-end gap-2 font-sans">
            <button
              type="button"
              className="rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving..." : "Save Custom Fix"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded bg-emerald-950/30 border border-emerald-900/50 p-2.5 text-emerald-300">
          <span className="font-semibold text-emerald-400 font-sans block mb-1">
            + Proposed Corrected Code:
          </span>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-emerald-200">
            <code>{correctedCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
