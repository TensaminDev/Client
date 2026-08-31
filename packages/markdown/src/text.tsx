import { useMemo, type CSSProperties } from "react";

import {
  ensureMarkdownStyles,
  parseMarkdownBlocks,
  renderBlocks,
} from "./markdown";

export type TextProps = {
  value: string;
  fontSize?: CSSProperties["fontSize"];
  showEditedIndicator?: boolean;
};

/**
 * Executes Text.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Text(props: TextProps) {
  ensureMarkdownStyles();

  const blocks = useMemo(() => parseMarkdownBlocks(props.value), [props.value]);
  const renderedBlocks = useMemo(() => renderBlocks(blocks), [blocks]);

  return (
    <div className="tm-md-root" style={{ fontSize: props.fontSize }}>
      {renderedBlocks}
      {props.showEditedIndicator && (
        <span className="ml-1 text-xs text-muted-foreground">(edited)</span>
      )}
    </div>
  );
}
