import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * File picker plus window-wide drag-and-drop for `.tu` credential files.
 * UI state only; the dropped file is handed to the provided callback.
 */
export function useTuFileInput(
  onFile: (file: globalThis.File) => Promise<void>,
) {
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const openFilePicker = useCallback(() => {
    setFilePickerOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => uploadRef.current?.click()),
    );
  }, []);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      setFilePickerOpen(false);
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      await onFile(file);
    },
    [onFile],
  );

  useEffect(() => {
    const input = uploadRef.current;
    const closeFilePicker = () => setFilePickerOpen(false);
    input?.addEventListener("cancel", closeFilePicker);
    return () => input?.removeEventListener("cancel", closeFilePicker);
  }, []);

  useEffect(() => {
    let dragCounter = 0;
    const stop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const handleDragEnter = (event: DragEvent) => {
      stop(event);
      dragCounter += 1;
      if (event.dataTransfer?.items?.length) setIsDragging(true);
    };
    const handleDragLeave = (event: DragEvent) => {
      stop(event);
      dragCounter -= 1;
      if (dragCounter <= 0) setIsDragging(false);
    };
    const handleDragOver = (event: DragEvent) => {
      stop(event);
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const handleDrop = (event: DragEvent) => {
      stop(event);
      dragCounter = 0;
      setIsDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) void onFile(file);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [onFile]);

  return {
    handleFileInputChange,
    isDragging,
    openFilePicker,
    filePickerOpen,
    uploadRef,
  };
}
