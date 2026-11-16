import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

/**
 * Styled replacements for the browser's confirm() and prompt().
 *
 * Call them like the originals, but awaited:
 *
 *   if (!(await confirmDialog({ title: "End this shift?" }))) return;
 *   const name = await promptDialog({ title: "Singer name", defaultValue });
 *
 * <DialogHost /> must be mounted once (it is, in App.tsx). If it is somehow
 * missing, both fall back to the native dialogs so an action is never blocked.
 */

interface BaseOpts {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** styles the confirm button as destructive */
  danger?: boolean;
}

interface PromptOpts extends BaseOpts {
  defaultValue?: string;
  placeholder?: string;
}

type Pending =
  | { kind: "confirm"; opts: BaseOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

let push: ((p: Pending) => void) | null = null;

export function confirmDialog(opts: BaseOpts): Promise<boolean> {
  if (!push) {
    return Promise.resolve(
      window.confirm([opts.title, opts.description].filter(Boolean).join("\n\n")),
    );
  }
  return new Promise((resolve) => push!({ kind: "confirm", opts, resolve }));
}

export function promptDialog(opts: PromptOpts): Promise<string | null> {
  if (!push) {
    return Promise.resolve(
      window.prompt(
        [opts.title, opts.description].filter(Boolean).join("\n\n"),
        opts.defaultValue ?? "",
      ),
    );
  }
  return new Promise((resolve) => push!({ kind: "prompt", opts, resolve }));
}

export function DialogHost() {
  const [current, setCurrent] = useState<Pending | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    push = (p) => {
      setValue(p.kind === "prompt" ? (p.opts.defaultValue ?? "") : "");
      setCurrent(p);
    };
    return () => {
      push = null;
    };
  }, []);

  const finish = (accepted: boolean) => {
    if (!current) return;
    if (current.kind === "confirm") current.resolve(accepted);
    else current.resolve(accepted ? value : null);
    setCurrent(null);
  };

  const opts = current?.opts;

  return (
    <AlertDialog
      open={!!current}
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <AlertDialogContent className="glass rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl">
            {opts?.title}
          </AlertDialogTitle>
          {opts?.description && (
            <AlertDialogDescription className="whitespace-pre-line text-sm text-muted-foreground">
              {opts.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {current?.kind === "prompt" && (
          <Input
            autoFocus
            value={value}
            placeholder={current.opts.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                finish(true);
              }
            }}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>
            {opts?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => finish(true)}
            className={
              opts?.danger
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
          >
            {opts?.confirmLabel ?? "OK"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
