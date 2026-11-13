import { Pipe, PipeTransform } from "@angular/core";
import { formatDateUa } from "../../models/client.model";

export function cleanReadingNoteText(note?: string | null): string {
  if (!note) return "";
  return note
    .replace(/\[Зима >\d+\s*кВт[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatCostValue(value: unknown): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

@Pipe({
  name: "formatDateUa",
  pure: true,
})
export class FormatDateUaPipe implements PipeTransform {
  transform(value: string | null | undefined, includeTime = true): string {
    if (!value) return "—";
    return formatDateUa(value, includeTime);
  }
}

@Pipe({
  name: "cleanReadingNote",
  pure: true,
})
export class CleanReadingNotePipe implements PipeTransform {
  transform(note?: string | null): string {
    return cleanReadingNoteText(note);
  }
}

@Pipe({
  name: "formatCost",
  pure: true,
})
export class FormatCostPipe implements PipeTransform {
  transform(value: unknown): string {
    return formatCostValue(value);
  }
}
