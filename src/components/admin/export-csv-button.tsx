"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads the given rows (first row = headers) as a CSV file. Read-only —
 * builds the file entirely in the browser from data already on the page. */
export function ExportCsvButton({ rows, filename }: { rows: (string | number)[][]; filename: string }) {
  function download() {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={download}>
      <Download className="h-4 w-4" /> Export CSV
    </Button>
  );
}
