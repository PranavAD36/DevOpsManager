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
    <div className="mt-3 rounded-xl border border-[#1e2d4a] bg-[#0c111e] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a] bg-[#101827]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-cyan-400">Diff Preview</span>
          {filePath && (
            <span className="rounded-md bg-[#1e2d4a] px-2 py-0.5 text-[11px] font-mono text-slate-400">
              {filePath}
              {lineNumber ? `:${lineNumber}` : ""}
            </span>
          )}
        </div>
        {onSaveFix && (
          <button
            type="button"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Cancel Edit" : "Edit Code Fix"}
          </button>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="px-4 py-3 border-b border-[#1e2d4a] bg-rose-950/10">
          <span className="text-xs font-semibold text-rose-400 block mb-1">
            Problem Context
          </span>
          <p className="text-xs text-rose-300/80">{description}</p>
        </div>
      )}

      {/* Code area */}
      {isEditing ? (
        <div className="p-4 space-y-3">
          <label className="block text-emerald-400 text-xs font-semibold">
            Edit Proposed Fix Code:
          </label>
          <textarea
            className="min-h-[140px] w-full rounded-lg border border-[#1e2d4a] bg-[#060913] p-3 font-mono text-xs text-slate-200 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 resize-y"
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-accent !py-1.5 !px-4 !text-xs"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving..." : "Save Custom Fix"}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-emerald-950/10 border-t border-emerald-900/20">
          <span className="text-xs font-semibold text-emerald-400 block mb-2">
            + Proposed Corrected Code
          </span>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-emerald-200/90">
            <code>{correctedCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
