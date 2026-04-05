import * as React from "react";

type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "em"; value: string }
  | { type: "del"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; href: string }
  | { type: "image"; alt: string; src: string };

type InlineDecorationRange = {
  from: number;
  to: number;
  className: string;
};

type InlineTokenRange = {
  from: number;
  to: number;
};

type ParagraphBlock = {
  type: "paragraph";
  text: string;
};

type HeadingBlock = {
  type: "heading";
  level: number;
  text: string;
};

type HrBlock = {
  type: "hr";
};

type BlockQuoteBlock = {
  type: "blockquote";
  text: string;
};

type CodeBlock = {
  type: "code";
  language: string;
  code: string;
};

type ListItem = {
  text: string;
  checked: boolean | null;
};

type ListBlock = {
  type: "list";
  ordered: boolean;
  items: ListItem[];
};

type TableBlock = {
  type: "table";
  headers: string[];
  rows: string[][];
};

type MarkdownBlock =
  | ParagraphBlock
  | HeadingBlock
  | HrBlock
  | BlockQuoteBlock
  | CodeBlock
  | ListBlock
  | TableBlock;

const INLINE_TOKEN_REGEX =
  /!\[([^\]]*)\]\(([^)\s]+(?:\s+"[^"]*")?)\)|\[([^\]]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)|`([^`\n]+)`|~~([^~\n]+)~~|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;

/**
 * Executes parseInlineNodes.
 * @param input Parameter input.
 * @returns InlineNode[].
 */
export function parseInlineNodes(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];

  let cursor = 0;
  let match = INLINE_TOKEN_REGEX.exec(input);

  while (match) {
    const index = match.index;
    const raw = match[0];

    if (index > cursor) {
      nodes.push({ type: "text", value: input.slice(cursor, index) });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      nodes.push({ type: "image", alt: match[1], src: normalizeUrl(match[2]) });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      nodes.push({
        type: "link",
        label: match[3],
        href: normalizeUrl(match[4]),
      });
    } else if (match[5] !== undefined) {
      nodes.push({ type: "code", value: match[5] });
    } else if (match[6] !== undefined) {
      nodes.push({ type: "del", value: match[6] });
    } else if (match[7] !== undefined || match[8] !== undefined) {
      nodes.push({ type: "strong", value: match[7] ?? match[8] ?? "" });
    } else if (match[9] !== undefined || match[10] !== undefined) {
      nodes.push({ type: "em", value: match[9] ?? match[10] ?? "" });
    } else {
      nodes.push({ type: "text", value: raw });
    }

    cursor = index + raw.length;
    match = INLINE_TOKEN_REGEX.exec(input);
  }

  if (cursor < input.length) {
    nodes.push({ type: "text", value: input.slice(cursor) });
  }

  INLINE_TOKEN_REGEX.lastIndex = 0;
  return nodes;
}

/**
 * Executes collectInlineRanges.
 * @param input Parameter input.
 * @param offset Parameter offset.
 * @returns {
  styleRanges: InlineDecorationRange[];
  tokenRanges: InlineTokenRange[];
}.
 */
export function collectInlineRanges(
  input: string,
  offset = 0,
): {
  styleRanges: InlineDecorationRange[];
  tokenRanges: InlineTokenRange[];
} {
  const styleRanges: InlineDecorationRange[] = [];
  const tokenRanges: InlineTokenRange[] = [];

  let match = INLINE_TOKEN_REGEX.exec(input);

  while (match) {
    const raw = match[0];
    const start = offset + match.index;
    const end = start + raw.length;

    if (match[1] !== undefined && match[2] !== undefined) {
      const openLength = 2;
      const closeLength = raw.endsWith(")") ? 1 : 0;

      const imageEnd = start + openLength + match[1].length;
      tokenRanges.push({ from: start, to: start + openLength });
      tokenRanges.push({ from: imageEnd, to: imageEnd + 1 });

      const srcStart = imageEnd + 1;
      const srcEnd = end - closeLength;
      tokenRanges.push({ from: srcStart, to: srcStart + 1 });
      tokenRanges.push({ from: srcEnd, to: srcEnd + closeLength });
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const label = match[3];
      const labelStart = start + 1;
      const labelEnd = labelStart + label.length;

      tokenRanges.push({ from: start, to: start + 1 });
      tokenRanges.push({ from: labelEnd, to: labelEnd + 1 });
      tokenRanges.push({ from: labelEnd + 1, to: labelEnd + 2 });
      tokenRanges.push({ from: end - 1, to: end });

      styleRanges.push({
        from: labelStart,
        to: labelEnd,
        className: "tm-md-link",
      });
    } else if (match[5] !== undefined) {
      const codeStart = start + 1;
      const codeEnd = end - 1;

      tokenRanges.push({ from: start, to: start + 1 });
      tokenRanges.push({ from: end - 1, to: end });
      styleRanges.push({
        from: codeStart,
        to: codeEnd,
        className: "tm-md-code",
      });
    } else if (match[6] !== undefined) {
      const contentStart = start + 2;
      const contentEnd = end - 2;

      tokenRanges.push({ from: start, to: start + 2 });
      tokenRanges.push({ from: end - 2, to: end });
      styleRanges.push({
        from: contentStart,
        to: contentEnd,
        className: "tm-md-del",
      });
    } else if (match[7] !== undefined || match[8] !== undefined) {
      const contentStart = start + 2;
      const contentEnd = end - 2;

      tokenRanges.push({ from: start, to: start + 2 });
      tokenRanges.push({ from: end - 2, to: end });
      styleRanges.push({
        from: contentStart,
        to: contentEnd,
        className: "tm-md-strong",
      });
    } else if (match[9] !== undefined || match[10] !== undefined) {
      const contentStart = start + 1;
      const contentEnd = end - 1;

      tokenRanges.push({ from: start, to: start + 1 });
      tokenRanges.push({ from: end - 1, to: end });
      styleRanges.push({
        from: contentStart,
        to: contentEnd,
        className: "tm-md-em",
      });
    }

    match = INLINE_TOKEN_REGEX.exec(input);
  }

  INLINE_TOKEN_REGEX.lastIndex = 0;
  return { styleRanges, tokenRanges };
}

/**
 * Executes parseMarkdownBlocks.
 * @param markdown Parameter markdown.
 * @returns MarkdownBlock[].
 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];

  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFence = line.match(/^```\s*([^`]*)$/);
    if (codeFence) {
      const language = (codeFence[1] ?? "").trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      continue;
    }

    if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoteLines: string[] = [quote[1]];
      index += 1;

      while (index < lines.length) {
        const next = lines[index].match(/^>\s?(.*)$/);
        if (!next) break;
        quoteLines.push(next[1]);
        index += 1;
      }

      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    const tableCandidate = readTable(lines, index);
    if (tableCandidate) {
      blocks.push(tableCandidate.block);
      index = tableCandidate.nextIndex;
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: ListItem[] = [];

      while (index < lines.length) {
        const current = lines[index];
        const match = orderedList
          ? current.match(/^\s*\d+\.\s+(.*)$/)
          : current.match(/^\s*[-*+]\s+(.*)$/);

        if (!match) break;

        const task = match[1].match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) {
          items.push({
            text: task[2],
            checked: task[1].toLowerCase() === "x",
          });
        } else {
          items.push({ text: match[1], checked: null });
        }

        index += 1;
      }

      blocks.push({ type: "list", ordered: orderedList, items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^```\s*/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

/**
 * Executes renderInline.
 * @param nodes Parameter nodes.
 * @returns React.ReactNode[].
 */
export function renderInline(nodes: InlineNode[]): React.ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") {
      return node.value;
    }

    if (node.type === "strong") {
      return (
        <strong key={index} className="tm-md-strong">
          {node.value}
        </strong>
      );
    }

    if (node.type === "em") {
      return (
        <em key={index} className="tm-md-em">
          {node.value}
        </em>
      );
    }

    if (node.type === "del") {
      return (
        <del key={index} className="tm-md-del">
          {node.value}
        </del>
      );
    }

    if (node.type === "code") {
      return (
        <code key={index} className="tm-md-code">
          {node.value}
        </code>
      );
    }

    if (node.type === "link") {
      return (
        <a
          key={index}
          className="tm-md-link"
          href={node.href}
          target="_blank"
          rel="noreferrer"
        >
          {node.label}
        </a>
      );
    }

    return (
      <img
        key={index}
        className="tm-md-image"
        src={node.src}
        alt={node.alt}
        loading="lazy"
        decoding="async"
      />
    );
  });
}

/**
 * Executes renderBlocks.
 * @param blocks Parameter blocks.
 * @returns React.ReactElement.
 */
export function renderBlocks(blocks: MarkdownBlock[]): React.ReactElement {
  return (
    <>
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          const className = `tm-md-heading tm-md-h${String(block.level)}`;
          if (block.level === 1)
            return (
              <h1 key={blockIndex} className={className}>
                {renderInline(parseInlineNodes(block.text))}
              </h1>
            );
          if (block.level === 2)
            return (
              <h2 key={blockIndex} className={className}>
                {renderInline(parseInlineNodes(block.text))}
              </h2>
            );
          if (block.level === 3)
            return (
              <h3 key={blockIndex} className={className}>
                {renderInline(parseInlineNodes(block.text))}
              </h3>
            );
          if (block.level === 4)
            return (
              <h4 key={blockIndex} className={className}>
                {renderInline(parseInlineNodes(block.text))}
              </h4>
            );
          if (block.level === 5)
            return (
              <h5 key={blockIndex} className={className}>
                {renderInline(parseInlineNodes(block.text))}
              </h5>
            );
          return (
            <h6 key={blockIndex} className={className}>
              {renderInline(parseInlineNodes(block.text))}
            </h6>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote key={blockIndex} className="tm-md-blockquote">
              {block.text.split("\n").map((line, lineIndex) => (
                <p key={lineIndex}>{renderInline(parseInlineNodes(line))}</p>
              ))}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <pre key={blockIndex} className="tm-md-pre">
              <code className="tm-md-codeblock" data-language={block.language}>
                {block.code}
              </code>
            </pre>
          );
        }

        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag
              key={blockIndex}
              className={block.ordered ? "tm-md-ol" : "tm-md-ul"}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="tm-md-li">
                  {item.checked !== null ? (
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled
                      className="tm-md-checkbox"
                    />
                  ) : null}
                  <span>{renderInline(parseInlineNodes(item.text))}</span>
                </li>
              ))}
            </Tag>
          );
        }

        if (block.type === "table") {
          return (
            <div key={blockIndex} className="tm-md-table-wrap">
              <table className="tm-md-table">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={headerIndex}>
                        {renderInline(parseInlineNodes(header))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>
                          {renderInline(parseInlineNodes(cell))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "hr") {
          return <hr key={blockIndex} className="tm-md-hr" />;
        }

        return (
          <p key={blockIndex} className="tm-md-p">
            {block.text.split("\n").map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(parseInlineNodes(line))}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/**
 * Executes normalizeUrl.
 * @param input Parameter input.
 * @returns string.
 */
function normalizeUrl(input: string): string {
  const value = input.trim();
  if (/^(https?:|mailto:|tel:|\/)/i.test(value)) {
    return value;
  }

  return "#";
}

/**
 * Executes splitTableRow.
 * @param row Parameter row.
 * @returns string[].
 */
function splitTableRow(row: string): string[] {
  const cleaned = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return cleaned.split("|").map((cell) => cell.trim());
}

/**
 * Executes readTable.
 * @param lines Parameter lines.
 * @param index Parameter index.
 * @returns { block: TableBlock; nextIndex: number } | null.
 */
function readTable(
  lines: string[],
  index: number,
): { block: TableBlock; nextIndex: number } | null {
  const header = lines[index] ?? "";
  const separator = lines[index + 1] ?? "";

  if (!header.includes("|") || !separator.includes("|")) {
    return null;
  }

  const separatorCells = splitTableRow(separator);
  const isSeparator = separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell));
  if (!isSeparator) {
    return null;
  }

  const headers = splitTableRow(header);
  const rows: string[][] = [];
  let cursor = index + 2;

  while (cursor < lines.length && lines[cursor].includes("|")) {
    rows.push(splitTableRow(lines[cursor]));
    cursor += 1;
  }

  return {
    block: { type: "table", headers, rows },
    nextIndex: cursor,
  };
}

export const markdownStyles = `
.tm-md-root { color: hsl(var(--foreground)); line-height: 1.55; font-size: 0.95rem; }
.tm-md-heading { margin: 0.2rem 0 0.35rem; font-weight: 700; line-height: 1.25; }
.tm-md-h1 { font-size: 1.65rem; }
.tm-md-h2 { font-size: 1.45rem; }
.tm-md-h3 { font-size: 1.25rem; }
.tm-md-h4 { font-size: 1.1rem; }
.tm-md-h5 { font-size: 1rem; }
.tm-md-h6 { font-size: 0.95rem; opacity: 0.9; }
.tm-md-p { margin: 0.25rem 0; }
.tm-md-blockquote { margin: 0.45rem 0; padding-left: 0.75rem; opacity: 0.95; }
.tm-md-blockquote p { margin: 0.2rem 0; }
.tm-md-pre { margin: 0.45rem 0; padding: 0.65rem 0.75rem; border-radius: 0.5rem; background: hsl(var(--muted)); overflow-x: auto; }
.tm-md-code, .tm-md-codeblock { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.tm-md-code { padding: 0.08rem 0.32rem; border-radius: 0.28rem; background: hsl(var(--muted)); }
.tm-md-strong { font-weight: 700; }
.tm-md-em { font-style: italic; }
.tm-md-del { text-decoration: line-through; }
.tm-md-link { color: hsl(var(--primary)); text-decoration: underline; text-underline-offset: 0.14rem; }
.tm-md-image { display: block; max-width: 100%; border-radius: 0.4rem; margin: 0.5rem 0; }
.tm-md-ul, .tm-md-ol { margin: 0.3rem 0 0.35rem 1.2rem; padding: 0; }
.tm-md-li { margin: 0.2rem 0; }
.tm-md-checkbox { margin-right: 0.5rem; vertical-align: middle; }
.tm-md-table-wrap { overflow-x: auto; margin: 0.45rem 0; }
.tm-md-table { border-collapse: collapse; width: 100%; min-width: 16rem; }
.tm-md-table th, .tm-md-table td { padding: 0.4rem 0.5rem; text-align: left; }
.tm-md-table th { background: hsl(var(--muted)); font-weight: 600; }
.tm-md-hr { margin: 0.55rem 0; }

.cm-editor.tm-md-editor { border-radius: 0.65rem; background: hsl(var(--card)); caret-color: var(--foreground); }
.cm-editor.tm-md-editor.cm-focused { outline: none; box-shadow: none; }
.cm-editor.tm-md-editor .cm-scroller { font-family: inherit; line-height: 1.55; max-height: 30vh; overflow-y: auto; overflow-x: hidden; }
.cm-editor.tm-md-editor .cm-content { caret-color: var(--foreground); }
.cm-editor.tm-md-editor .cm-content { padding: 0.7rem 0.85rem; min-height: 2.75rem; }
.cm-editor.tm-md-editor .cm-line { padding: 0 1px; color: hsl(var(--foreground)); }
.cm-editor.tm-md-editor .tm-md-hidden-token { color: transparent; opacity: 0; font-size: inherit; }
.cm-editor.tm-md-editor .tm-md-code-line { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: hsl(var(--muted)); border-radius: 0.3rem; }
`;

/**
 * Executes ensureMarkdownStyles.
 * @param none This function has no parameters.
 * @returns void.
 */
export function ensureMarkdownStyles(): void {
  if (typeof document === "undefined") return;

  const styleId = "tensamin-markdown-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = markdownStyles;
  document.head.appendChild(style);
}
