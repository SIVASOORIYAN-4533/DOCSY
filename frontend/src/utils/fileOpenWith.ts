const getFileExtension = (fileName: string): string => {
  const value = String(fileName || "").trim().toLowerCase();
  const dotIndex = value.lastIndexOf(".");
  return dotIndex >= 0 ? value.slice(dotIndex + 1) : "";
};

export const getOpenWithApps = (mimeType: string | undefined, fileName: string): string[] => {
  const mime = String(mimeType || "").toLowerCase();
  const extension = getFileExtension(fileName);

  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg"].includes(extension)
  ) {
    return ["Photos", "Paint", "Snipping Tool"];
  }

  if (mime === "application/pdf" || extension === "pdf") {
    return ["Microsoft Edge", "Adobe Acrobat"];
  }

  if (mime.includes("word") || ["doc", "docx"].includes(extension)) {
    return ["Microsoft Word"];
  }

  if (mime.includes("excel") || mime.includes("sheet") || ["xls", "xlsx", "csv"].includes(extension)) {
    return ["Microsoft Excel"];
  }

  if (mime.includes("powerpoint") || mime.includes("presentation") || ["ppt", "pptx"].includes(extension)) {
    return ["Microsoft PowerPoint"];
  }

  if (
    mime.startsWith("text/") ||
    ["txt", "md", "json", "xml", "yaml", "yml", "log", "csv"].includes(extension)
  ) {
    return ["Notepad", "VS Code"];
  }

  return ["Default app on your device"];
};

export const canPreviewInBrowser = (mimeType: string | undefined, fileName: string): boolean => {
  const mime = String(mimeType || "").toLowerCase();
  const extension = getFileExtension(fileName);

  if (mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/")) {
    return true;
  }

  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "pdf", "txt", "md", "json", "xml"].includes(
    extension,
  );
};
