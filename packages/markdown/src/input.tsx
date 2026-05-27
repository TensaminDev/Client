import { markdown } from "@codemirror/lang-markdown";
import {
  EditorState,
  Prec,
  type Extension,
  type Range,
  type SelectionRange,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { collectInlineRanges, ensureMarkdownStyles } from "./markdown";

export type InputProps = {
  ref?: HTMLDivElement;
  placeholder?: string;
  value: string;
  setValue: (value: string) => void;
  onSubmit?: () => void;
  invertEnterBehavior?: boolean;
  styled?: boolean;
  fontSize?: CSSProperties["fontSize"];
  paddingX?: CSSProperties["padding"];
  paddingY?: CSSProperties["padding"];
  className?: string;
};

type InputStyle = CSSProperties & {
  "--tm-md-content-padding"?: string;
};

function toCssLength(value: CSSProperties["padding"]): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "number" ? `${value}px` : value;
}

function toCssPadding(
  vertical: CSSProperties["padding"],
  horizontal: CSSProperties["padding"],
  styled: boolean,
): string {
  const defaultVertical = styled ? "0.25rem" : "0";
  const defaultHorizontal = styled ? "0.625rem" : "0";

  return `${toCssLength(vertical) ?? defaultVertical} ${toCssLength(horizontal) ?? defaultHorizontal}`;
}

type TokenRange = {
  from: number;
  to: number;
};

const hiddenTokenDecoration = Decoration.mark({ class: "tm-md-hidden-token" });
const strongDecoration = Decoration.mark({ class: "tm-md-strong" });
const emDecoration = Decoration.mark({ class: "tm-md-em" });
const delDecoration = Decoration.mark({ class: "tm-md-del" });
const codeDecoration = Decoration.mark({ class: "tm-md-code" });
const linkDecoration = Decoration.mark({ class: "tm-md-link" });
const codeLineDecoration = Decoration.line({ class: "tm-md-code-line" });

/**
 * Builds markdown styling decorations every time the document or cursor selection changes.
 * Token delimiters are hidden unless the cursor is currently intersecting that token range.
 */
const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance: { decorations: DecorationSet }) =>
      instance.decorations,
  },
);

/**
 * Executes Input.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Input(props: InputProps) {
  ensureMarkdownStyles();

  const shellClassName = props.styled
    ? "min-h-8 w-full min-w-0 rounded-lg border border-input bg-transparent text-base transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
    : "";

  const elementRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const ignoreSyncRef = useRef(false);
  const onSubmitRef = useRef<InputProps["onSubmit"]>(props.onSubmit);
  const invertEnterBehaviorRef = useRef(Boolean(props.invertEnterBehavior));

  useEffect(() => {
    onSubmitRef.current = props.onSubmit;
    invertEnterBehaviorRef.current = Boolean(props.invertEnterBehavior);
  }, [props.onSubmit, props.invertEnterBehavior]);

  useEffect(() => {
    if (!elementRef.current) return;

    const state = EditorState.create({
      doc: props.value,
      extensions: createEditorExtensions(
        (value) => {
          ignoreSyncRef.current = true;
          props.setValue(value);
        },
        () => props.placeholder,
        () => invertEnterBehaviorRef.current,
        () => onSubmitRef.current?.(),
      ),
    });

    viewRef.current = new EditorView({
      state,
      parent: elementRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = undefined;
    };
    // Run once to initialize/destroy the editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = viewRef.current;
    if (!editor) return;

    const next = props.value;
    const current = editor.state.doc.toString();

    if (ignoreSyncRef.current) {
      ignoreSyncRef.current = false;
      return;
    }

    if (next === current) return;

    editor.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: next,
      },
    });
  }, [props.value]);

  return (
    <div
      ref={elementRef}
      className={`tm-md-root ${shellClassName} ${props.className ?? ""}`}
      style={
        {
          fontSize: props.fontSize ?? "1rem",
          "--tm-md-content-padding": toCssPadding(
            props.paddingY,
            props.paddingX,
            Boolean(props.styled),
          ),
        } as InputStyle
      }
    />
  );
}

/**
 * Executes createEditorExtensions.
 * @param onChange Parameter onChange.
 * @param getPlaceholder Parameter getPlaceholder.
 * @param getInvertEnterBehavior Parameter getInvertEnterBehavior.
 * @param onSubmit Parameter onSubmit.
 * @returns Extension[].
 */
function createEditorExtensions(
  onChange: (value: string) => void,
  getPlaceholder: () => string | undefined,
  getInvertEnterBehavior: () => boolean,
  onSubmit: () => void,
): Extension[] {
  const editorKeymap = [
    ...defaultKeymap,
    ...historyKeymap,
    indentWithTab,
  ] as unknown as readonly KeyBinding[];

  const customEnterKeymap = keymap.of([
    {
      key: "Shift-Enter",
      run: () => {
        if (!getInvertEnterBehavior()) {
          return false;
        }

        onSubmit();
        return true;
      },
    },
    {
      key: "Enter",
      run: () => {
        if (getInvertEnterBehavior()) {
          return false;
        }

        onSubmit();
        return true;
      },
    },
  ]);

  return [
    history(),
    markdown(),
    keymap.of(editorKeymap),
    Prec.highest(customEnterKeymap),
    EditorView.lineWrapping,
    placeholder(getPlaceholder() ?? ""),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.docChanged) return;
      onChange(update.state.doc.toString());
    }),
    EditorView.theme({
      "&": {
        fontSize: "inherit",
      },
      "&.cm-editor": {
        width: "100%",
      },
    }),
    EditorView.editorAttributes.of({
      class: "tm-md-editor",
      spellcheck: "true",
      "aria-label": "Markdown input",
    }),
    markdownDecorations,
  ];
}

/**
 * Executes buildDecorations.
 * @param view Parameter view.
 * @returns DecorationSet.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const selections = view.state.selection.ranges.map(
    (range: SelectionRange) => ({
      from: range.from,
      to: range.to,
    }),
  );

  let codeFenceOpen = false;

  for (
    let lineNumber = 1;
    lineNumber <= view.state.doc.lines;
    lineNumber += 1
  ) {
    const line = view.state.doc.line(lineNumber);
    const text = line.text;
    const lineFrom = line.from;
    const trimmed = text.trim();

    const fence = text.match(/^```\s*([^`]*)$/);
    if (fence) {
      const ticksStart = lineFrom + text.indexOf("```");
      const ticksEnd = ticksStart + 3;
      addHiddenToken(builder, selections, { from: ticksStart, to: ticksEnd });
      if (trimmed.length > 3) {
        addHiddenToken(builder, selections, {
          from: ticksEnd,
          to: line.to,
        });
      }
      codeFenceOpen = !codeFenceOpen;
      continue;
    }

    if (codeFenceOpen) {
      builder.push(codeLineDecoration.range(lineFrom));
      continue;
    }

    const heading = text.match(/^(#{1,6})\s+/);
    if (heading) {
      const markerLength = heading[0].length;
      addHiddenToken(builder, selections, {
        from: lineFrom,
        to: lineFrom + markerLength,
      });

      const level = heading[1].length;
      const headingClass = Decoration.mark({
        class: `tm-md-heading tm-md-h${String(level)}`,
      });
      const contentFrom = lineFrom + markerLength;
      if (contentFrom < line.to) {
        builder.push(headingClass.range(contentFrom, line.to));
      }
    }

    const quote = text.match(/^>\s?/);
    if (quote) {
      addHiddenToken(builder, selections, {
        from: lineFrom,
        to: lineFrom + quote[0].length,
      });
    }

    const unordered = text.match(/^(\s*)([-+*])\s+(?:\[( |x|X)\]\s+)?/);
    if (unordered) {
      const markerStart = lineFrom + unordered[1].length;
      const markerEnd = markerStart + unordered[2].length + 1;
      addHiddenToken(builder, selections, { from: markerStart, to: markerEnd });

      const checkbox = unordered[0].match(/\[( |x|X)\]\s+$/);
      if (checkbox) {
        const checkboxStart = lineFrom + unordered[0].lastIndexOf("[");
        addHiddenToken(builder, selections, {
          from: checkboxStart,
          to: checkboxStart + checkbox[0].length,
        });
      }
    }

    const ordered = text.match(/^(\s*)(\d+\.)\s+/);
    if (ordered) {
      const markerStart = lineFrom + ordered[1].length;
      addHiddenToken(builder, selections, {
        from: markerStart,
        to: markerStart + ordered[2].length + 1,
      });
    }

    if (/^(?:\*\s*){3,}$|^(?:-\s*){3,}$|^(?:_\s*){3,}$/.test(trimmed)) {
      if (lineFrom < line.to) {
        builder.push(
          Decoration.mark({ class: "tm-md-hr" }).range(lineFrom, line.to),
        );
      }
      continue;
    }

    const tableSeparator = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(
      text,
    );
    if (tableSeparator) {
      if (lineFrom < line.to) {
        builder.push(
          Decoration.mark({ class: "tm-md-del" }).range(lineFrom, line.to),
        );
      }
      continue;
    }

    const { styleRanges, tokenRanges } = collectInlineRanges(text, lineFrom);

    for (const range of styleRanges) {
      if (range.from >= range.to) continue;

      if (range.className === "tm-md-strong") {
        builder.push(strongDecoration.range(range.from, range.to));
      } else if (range.className === "tm-md-em") {
        builder.push(emDecoration.range(range.from, range.to));
      } else if (range.className === "tm-md-del") {
        builder.push(delDecoration.range(range.from, range.to));
      } else if (range.className === "tm-md-code") {
        builder.push(codeDecoration.range(range.from, range.to));
      } else if (range.className === "tm-md-link") {
        builder.push(linkDecoration.range(range.from, range.to));
      }
    }

    for (const token of tokenRanges) {
      addHiddenToken(builder, selections, token);
    }
  }

  return Decoration.set(builder, true);
}

/**
 * Keeps markdown syntax visible only when user selection intersects the token.
 * This preserves cursor predictability and cross-token selection while still hiding syntax during reading.
 */
function addHiddenToken(
  builder: Range<Decoration>[],
  selections: ReadonlyArray<{ from: number; to: number }>,
  token: TokenRange,
): void {
  if (token.from >= token.to) return;

  const overlapsSelection = selections.some((selection) => {
    const selectionFrom = Math.min(selection.from, selection.to);
    const selectionTo = Math.max(selection.from, selection.to);

    if (selectionFrom === selectionTo) {
      return selectionFrom >= token.from && selectionFrom <= token.to;
    }

    return selectionFrom < token.to && selectionTo > token.from;
  });

  if (overlapsSelection) return;
  builder.push(hiddenTokenDecoration.range(token.from, token.to));
}
