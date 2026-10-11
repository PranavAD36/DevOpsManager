"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-[#1e2d4a] bg-[#0b1120]">
      <div className="flex items-center justify-between border-b border-[#1e2d4a] bg-[#101827] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-[11px] font-medium text-slate-400 transition-colors hover:text-cyan-300"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const raw = String(children ?? "");
    const language = /language-([\w-]+)/.exec(className ?? "")?.[1] ?? "";
    if (language || raw.includes("\n")) {
      return <CodeBlock language={language} code={raw.replace(/\n$/, "")} />;
    }
    return (
      <code className="rounded bg-[#0b1120] px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-200">
        {children}
      </code>
    );
  },
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mt-4 mb-2 text-base font-semibold text-white first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-sm font-semibold text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-cyan-200 first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-cyan-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-cyan-400">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-amber-400/70 bg-amber-400/5 py-2 pl-3 text-slate-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-[#1e2d4a]" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[#1e2d4a]">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[#1e2d4a] bg-[#101827] px-3 py-2 text-left font-semibold text-slate-300">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-[#1e2d4a]/60 px-3 py-2 text-slate-300">{children}</td>,
};

export default function MarkdownMessage({
  text,
  className = "text-slate-200",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={"text-sm " + className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
