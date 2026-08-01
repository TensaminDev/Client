import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import {
  acceptCompletion,
  autocompletion,
  completionStatus,
  pickedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  EditorState,
  EditorSelection,
  Annotation,
  Compartment,
  Prec,
  Transaction,
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
  WidgetType,
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
import { createRoot, type Root } from "react-dom/client";

import { collectInlineRanges, ensureMarkdownStyles } from "./markdown";
import Emoji, {
  findEmojiShortcodes,
  getEmojiUrl,
  resolveEmoji,
  searchEmojis,
} from "./emoji";

export const MAX_RENDERED_EMOJI_OPTIONS = 100;

export type InputController = {
  focus: () => void;
  hasFocus: () => boolean;
  insertText: (text: string) => void;
};

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
  emojiFrequencies?: Readonly<Record<string, number>>;
  onEmojiSelect?: (shortcode: string) => void;
  autoFocus?: boolean;
  onControllerChange?: (controller: InputController | null) => void;
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
const externalValueSync = Annotation.define<boolean>();
const widgetRoots = new WeakMap<HTMLElement, Root>();

type EmojiRange = {
  from: number;
  shortcode: string;
  to: number;
  url: string;
};

class EmojiWidget extends WidgetType {
  readonly shortcode: string;
  readonly url: string;

  constructor(shortcode: string, url: string) {
    super();
    this.shortcode = shortcode;
    this.url = url;
  }

  eq(other: EmojiWidget) {
    return other.shortcode === this.shortcode && other.url === this.url;
  }

  toDOM() {
    const container = document.createElement("span");
    const root = createRoot(container);
    root.render(
      <Emoji className="tm-md-editor-emoji" shortcode={this.shortcode} />,
    );
    widgetRoots.set(container, root);
    return container;
  }

  destroy(dom: HTMLElement) {
    widgetRoots.get(dom)?.unmount();
    widgetRoots.delete(dom);
  }

  ignoreEvent() {
    return true;
  }
}

function codeRanges(state: EditorState) {
  const ranges: Array<{ from: number; to: number }> = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === "InlineCode" ||
        node.name === "FencedCode" ||
        node.name === "CodeBlock"
      ) {
        ranges.push({ from: node.from, to: node.to });
        return false;
      }
    },
  });

  return ranges;
}

export function findEmojiRanges(state: EditorState): EmojiRange[] {
  const document = state.doc.toString();
  const excluded = codeRanges(state);
  const ranges: EmojiRange[] = [];

  for (const match of findEmojiShortcodes(document)) {
    const { from, to } = match;
    const inCode = excluded.some((range) => from < range.to && to > range.from);
    const emoji = inCode ? undefined : match.emoji;
    const url = emoji ? getEmojiUrl(emoji.shortcode) : undefined;

    if (emoji && url) {
      ranges.push({ from, shortcode: emoji.shortcode, to, url });
    }
  }

  return ranges;
}

class EmojiPluginValue {
  decorations: DecorationSet;
  ranges: EmojiRange[];

  constructor(view: EditorView) {
    this.ranges = findEmojiRanges(view.state);
    this.decorations = this.buildDecorations();
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      syntaxTree(update.startState) !== syntaxTree(update.state)
    ) {
      this.ranges = findEmojiRanges(update.state);
      this.decorations = this.buildDecorations();
    }
  }

  private buildDecorations() {
    return Decoration.set(
      this.ranges.map((range) =>
        Decoration.replace({
          inclusive: false,
          widget: new EmojiWidget(range.shortcode, range.url),
        }).range(range.from, range.to),
      ),
      true,
    );
  }
}

const emojiDecorations = ViewPlugin.fromClass(EmojiPluginValue, {
  decorations: (instance) => instance.decorations,
  provide: (plugin) =>
    EditorView.atomicRanges.of(
      (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
    ),
});

function deleteEmoji(view: EditorView, direction: "backward" | "forward") {
  const ranges = view.plugin(emojiDecorations)?.ranges ?? [];
  const deletions: Array<{ from: number; to: number }> = [];

  for (const selection of view.state.selection.ranges) {
    if (selection.empty) {
      const emoji = ranges.find((range) =>
        direction === "backward"
          ? selection.from > range.from && selection.from <= range.to
          : selection.from >= range.from && selection.from < range.to,
      );
      if (emoji) deletions.push({ from: emoji.from, to: emoji.to });
      continue;
    }

    let from = selection.from;
    let to = selection.to;
    let changed = false;

    for (const emoji of ranges) {
      if (from < emoji.to && to > emoji.from) {
        from = Math.min(from, emoji.from);
        to = Math.max(to, emoji.to);
        changed = true;
      }
    }

    if (changed) deletions.push({ from, to });
  }

  if (deletions.length === 0) return false;

  const merged = deletions
    .sort((a, b) => a.from - b.from)
    .reduce<Array<{ from: number; to: number }>>((result, deletion) => {
      const previous = result.at(-1);
      if (previous && deletion.from <= previous.to) {
        previous.to = Math.max(previous.to, deletion.to);
      } else {
        result.push({ ...deletion });
      }
      return result;
    }, []);

  view.dispatch({
    changes: merged.map((range) => ({ from: range.from, to: range.to })),
    selection: EditorSelection.cursor(merged[0].from),
    scrollIntoView: true,
    userEvent: direction === "backward" ? "delete.backward" : "delete.forward",
  });
  return true;
}

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
  const setValueRef = useRef(props.setValue);
  const onSubmitRef = useRef<InputProps["onSubmit"]>(props.onSubmit);
  const onEmojiSelectRef = useRef<InputProps["onEmojiSelect"]>(
    props.onEmojiSelect,
  );
  const invertEnterBehaviorRef = useRef(Boolean(props.invertEnterBehavior));
  const completionCompartmentRef = useRef<Compartment | null>(null);
  completionCompartmentRef.current ??= new Compartment();
  const completionCompartment = completionCompartmentRef.current;

  useEffect(() => {
    setValueRef.current = props.setValue;
    onSubmitRef.current = props.onSubmit;
    onEmojiSelectRef.current = props.onEmojiSelect;
    invertEnterBehaviorRef.current = Boolean(props.invertEnterBehavior);
  }, [
    props.onEmojiSelect,
    props.onSubmit,
    props.invertEnterBehavior,
    props.setValue,
  ]);

  useEffect(() => {
    if (!elementRef.current) return;

    const state = EditorState.create({
      doc: props.value,
      extensions: createEditorExtensions(
        (value) => {
          setValueRef.current(value);
        },
        () => props.placeholder,
        () => invertEnterBehaviorRef.current,
        () => onSubmitRef.current?.(),
        completionCompartment,
        props.emojiFrequencies,
        (shortcode) => onEmojiSelectRef.current?.(shortcode),
      ),
    });

    viewRef.current = new EditorView({
      state,
      parent: elementRef.current,
    });
    props.onControllerChange?.({
      focus: () => viewRef.current?.contentDOM.focus({ preventScroll: true }),
      hasFocus: () => viewRef.current?.hasFocus ?? false,
      insertText: (text) => {
        const editor = viewRef.current;
        if (!editor) return;
        editor.dispatch({
          ...editor.state.replaceSelection(text),
          annotations: Transaction.userEvent.of("input.type"),
          scrollIntoView: true,
        });
      },
    });
    if (props.autoFocus) viewRef.current.focus();

    return () => {
      props.onControllerChange?.(null);
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

    if (next === current) return;

    editor.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: next,
      },
      annotations: [
        externalValueSync.of(true),
        Transaction.addToHistory.of(false),
      ],
      filter: false,
    });
  }, [props.value]);

  useEffect(() => {
    const editor = viewRef.current;
    const compartment = completionCompartmentRef.current;
    if (!editor || !compartment) return;

    const wasActive = completionStatus(editor.state) === "active";
    editor.dispatch({
      effects: compartment.reconfigure(
        createEmojiAutocomplete(props.emojiFrequencies, (shortcode) =>
          onEmojiSelectRef.current?.(shortcode),
        ),
      ),
    });
    if (wasActive) startCompletion(editor);
  }, [props.emojiFrequencies]);

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
  completionCompartment: Compartment,
  emojiFrequencies: Readonly<Record<string, number>> | undefined,
  onEmojiSelect: (shortcode: string) => void,
): Extension[] {
  const editorKeymap = [
    ...defaultKeymap,
    ...historyKeymap,
    indentWithTab,
  ] as unknown as readonly KeyBinding[];

  const customEnterKeymap = keymap.of([
    {
      key: "Shift-Enter",
      run: (view) => {
        if (completionStatus(view.state) === "active") {
          return acceptCompletion(view);
        }
        if (!getInvertEnterBehavior()) {
          return false;
        }

        onSubmit();
        return true;
      },
    },
    {
      key: "Enter",
      run: (view) => {
        if (completionStatus(view.state) === "active") {
          return acceptCompletion(view);
        }
        if (getInvertEnterBehavior()) {
          return false;
        }

        onSubmit();
        return true;
      },
    },
  ]);
  const completionTabKeymap = keymap.of([
    {
      key: "Tab",
      run: (view) =>
        completionStatus(view.state) === "active"
          ? acceptCompletion(view)
          : false,
    },
  ]);
  const emojiDeletionKeymap = keymap.of([
    {
      key: "Backspace",
      run: (view) => deleteEmoji(view, "backward"),
    },
    {
      key: "Delete",
      run: (view) => deleteEmoji(view, "forward"),
    },
  ]);

  return [
    history(),
    markdown(),
    completionCompartment.of(
      createEmojiAutocomplete(emojiFrequencies, onEmojiSelect),
    ),
    emojiDecorations,
    keymap.of(editorKeymap),
    Prec.highest(completionTabKeymap),
    Prec.highest(emojiDeletionKeymap),
    Prec.highest(customEnterKeymap),
    EditorView.lineWrapping,
    placeholder(getPlaceholder() ?? ""),
    EditorView.updateListener.of((update: ViewUpdate) => {
      if (!update.docChanged) return;
      if (
        update.transactions.some(
          (transaction) => transaction.annotation(externalValueSync) === true,
        )
      ) {
        return;
      }
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

function createEmojiAutocomplete(
  frequencies: Readonly<Record<string, number>> | undefined,
  onEmojiSelect: (shortcode: string) => void,
) {
  return autocompletion({
    activateOnTyping: true,
    addToOptions: [
      {
        position: 20,
        render(completion) {
          const container = document.createElement("span");
          createRoot(container).render(
            <Emoji
              className="tm-md-completion-emoji"
              shortcode={completion.label}
            />,
          );
          return container;
        },
      },
    ],
    maxRenderedOptions: MAX_RENDERED_EMOJI_OPTIONS,
    override: [createEmojiCompletionSource(frequencies, onEmojiSelect)],
  });
}

function normalizedFrequencies(
  frequencies: Readonly<Record<string, number>> | undefined,
) {
  const normalized = new Map<string, number>();
  for (const [value, frequency] of Object.entries(frequencies ?? {})) {
    const shortcode = resolveEmoji(value)?.shortcode;
    if (!shortcode || !Number.isFinite(frequency) || frequency <= 0) continue;
    normalized.set(shortcode, (normalized.get(shortcode) ?? 0) + frequency);
  }
  return normalized;
}

export function createEmojiCompletionSource(
  frequencies?: Readonly<Record<string, number>>,
  onEmojiSelect: (shortcode: string) => void = () => undefined,
) {
  const normalized = normalizedFrequencies(frequencies);
  const maxFrequency = Math.max(0, ...normalized.values());

  return (context: CompletionContext): CompletionResult | null => {
    const token = context.matchBefore(/:[a-z0-9_+-]*$/i);
    if (!token) return null;
    if (
      codeRanges(context.state).some(
        (range) => token.from < range.to && token.to > range.from,
      )
    ) {
      return null;
    }

    const characterBefore = context.state.sliceDoc(
      Math.max(0, token.from - 1),
      token.from,
    );
    if (characterBefore && /[a-z0-9_]/i.test(characterBefore)) return null;

    const query = token.text.slice(1).toLowerCase();
    const options: Completion[] = searchEmojis(query)
      .map((emoji) => {
        const aliases = emoji.aliases.map((alias) => alias.toLowerCase());
        const matchedAlias =
          aliases.find((alias) => alias === query) ??
          aliases.find((alias) => alias.startsWith(query)) ??
          aliases.find((alias) => alias.includes(query)) ??
          emoji.name;
        const relevance = !query
          ? 0
          : matchedAlias === query
            ? 80
            : matchedAlias.startsWith(query)
              ? 40
              : 0;
        const frequency = normalized.get(emoji.shortcode) ?? 0;
        const usage =
          maxFrequency > 0
            ? (15 * Math.log1p(frequency)) / Math.log1p(maxFrequency)
            : 0;

        return {
          apply(view, completion, from, to) {
            view.dispatch({
              annotations: pickedCompletion.of(completion),
              changes: { from, insert: `${emoji.shortcode} `, to },
              selection: EditorSelection.cursor(
                from + emoji.shortcode.length + 1,
              ),
            });
            onEmojiSelect(emoji.shortcode);
          },
          boost: relevance + usage,
          displayLabel: emoji.shortcode,
          label: `:${matchedAlias}:`,
          type: "text",
          frequency,
          relevance,
        } satisfies Completion & { frequency: number; relevance: number };
      })
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          b.frequency - a.frequency ||
          (a.displayLabel ?? a.label).localeCompare(b.displayLabel ?? b.label),
      );

    return {
      from: token.from,
      options,
      validFor: /^:[a-z0-9_+-]*$/i,
    };
  };
}

export const emojiCompletionSource = createEmojiCompletionSource();

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
