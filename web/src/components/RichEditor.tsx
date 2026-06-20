import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useSettings } from "../store/settings";
import { transliterate } from "../lib/translit";

// Rich-text editor (TipTap/ProseMirror) for card fields. Transliteration is
// applied node-by-node so it never compromises formatting: the "apply ↧" button
// rewrites each text node from the global input scheme to the output scheme while
// preserving its marks (bold/italic/…). A live preview of the converted plain
// text is shown above the editor.

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** show the per-field "apply ↧" transliterate button (default true) */
  showApply?: boolean;
}

// Treat an editor with no text content as empty (avoids storing "<p></p>").
function htmlOf(editor: Editor): string {
  return editor.getText().trim() === "" ? "" : editor.getHTML();
}

export function RichEditor({ value, onChange, showApply = true }: Props) {
  const { inputScheme, outputScheme } = useSettings();

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    editorProps: {
      attributes: { class: "ss-rich dev" },
    },
    onUpdate: ({ editor }) => onChange(htmlOf(editor)),
  });

  // Sync when the value changes from outside (e.g. loading a card to edit).
  useEffect(() => {
    if (!editor) return;
    if (value !== htmlOf(editor)) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  // Transliterate every text node in place, preserving its marks.
  function applyTranslit() {
    if (!editor) return;
    const { state } = editor;
    const repls: {
      from: number;
      to: number;
      text: string;
      marks: readonly unknown[];
    }[] = [];
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        const c = transliterate(node.text, inputScheme, outputScheme);
        if (c && c !== node.text)
          repls.push({
            from: pos,
            to: pos + node.text.length,
            text: c,
            marks: node.marks,
          });
      }
    });
    if (!repls.length) return;
    let tr = state.tr;
    // apply last→first so earlier positions are unaffected by length changes
    for (let i = repls.length - 1; i >= 0; i--) {
      const r = repls[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tr = tr.replaceWith(
        r.from,
        r.to,
        state.schema.text(r.text, r.marks as any),
      );
    }
    editor.view.dispatch(tr);
    onChange(htmlOf(editor));
  }

  const preview = transliterate(editor.getText(), inputScheme, outputScheme);
  const showPreview =
    editor.getText().trim() !== "" && preview !== editor.getText();

  const btn = (active: boolean) =>
    `rounded px-2 py-0.5 text-xs ${active ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`;

  return (
    <div className="rounded border border-slate-700 bg-slate-900">
      {showPreview && (
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/40 px-2 py-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            {outputScheme}
          </span>
          <span className="dev flex-1 text-lg text-emerald-200 text-wrap whitespace-break-spaces">
            {preview}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive("bold"))}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btn(editor.isActive("italic"))} italic`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn(editor.isActive("underline"))} underline`}
        >
          U
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`${btn(editor.isActive("strike"))} line-through`}
        >
          S
        </button>
        <span className="mx-1 text-slate-700">|</span>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}
        >
          • List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))}
        >
          1. List
        </button>
        {showApply && (
          <>
            <span className="flex-1" />
            <button
              type="button"
              onClick={applyTranslit}
              title="Transliterate text (input → output scheme), keeping formatting"
              className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-emerald-50 hover:bg-emerald-600"
            >
              apply ↧
            </button>
          </>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
