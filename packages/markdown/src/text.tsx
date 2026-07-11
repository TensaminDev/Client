import * as React from "react";

import {
  ensureMarkdownStyles,
  parseMarkdownBlocks,
  renderBlocks,
} from "./markdown";

export type TextProps = {
  value: string;
};

/**
 * Executes Text.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Text(props: TextProps) {
  ensureMarkdownStyles();

  const blocks = React.useMemo(
    () => parseMarkdownBlocks(props.value),
    [props.value],
  );
  const renderedBlocks = React.useMemo(() => renderBlocks(blocks), [blocks]);

  return <div className="tm-md-root">{renderedBlocks}</div>;
}
