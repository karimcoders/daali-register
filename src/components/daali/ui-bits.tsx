'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Paper-styled confirmation dialog with Hindi-first labels */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="paper max-w-[92vw] sm:max-w-md border-0">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-hand text-xl text-ink">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-[15px] text-ink-soft leading-relaxed">
              {description}
              {children}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end gap-2">
          <AlertDialogCancel className="ghost-ink-btn border-ink/40 h-10 px-4 text-ink">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              destructive
                ? 'h-10 rounded-md px-4 font-hand text-base font-bold text-white'
                : 'ink-btn h-10 px-4 text-base'
            }
            style={
              destructive
                ? { background: '#b3402f', boxShadow: '0 2px 0 rgba(0,0,0,0.25)' }
                : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
