// Everything that leaves the library, behind one button in its header: the images as files or a zip, and the backup.
import { BackupSection } from "@/features/library/backup-section";
import { DownloadSection } from "@/features/library/download-section";
import type { Export } from "@/features/library/use-export";
import { Sheet } from "@/ui/modal";

const FLUSH = "px-0 last:border-b-0"; // a section inside a sheet, which has its own padding

export function ExportSheet({
  open,
  onClose,
  count,
  selected,
  out,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  selected: boolean;
  out: Export;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Export">
      <DownloadSection count={count} selected={selected} out={out} className={FLUSH} />
      <BackupSection className={FLUSH} />
    </Sheet>
  );
}
