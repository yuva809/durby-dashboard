"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders assistant answers as markdown (headers, tables, lists — real
 *  answers use these, e.g. a schedule breakdown or a bulleted low-stock
 *  list) instead of raw text. User messages stay plain text. */
export function MessageContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_table]:my-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
