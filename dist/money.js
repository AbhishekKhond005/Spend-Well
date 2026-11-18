// Monetary values in the ledger are integer minor units, including JPY (0)
// and KWD (3). BigInt is used only during calculations; stored values are JSON-safe.
const currencyDigits = new Map();

function digitsFor(currency) {
  if (!currencyDigits.has(currency)) {
    const format = new Intl.NumberFormat("en", { style: "currency", currency });
    currencyDigits.set(
      currency,
      format.resolvedOptions().maximumFractionDigits,
    );
  }
  return currencyDigits.get(currency);
}

function decimalParts(value) {
  const match = String(value)
    .trim()
    .match(/^(\d{1,32})(?:\.(\d{0,20}))?$/);
  if (!match) throw new Error("Enter a positive decimal number.");
  const fraction = (match[2] || "").replace(/0+$/, "");
  return { units: BigInt(match[1] + fraction), places: fraction.length };
}

function safeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("This amount is too large to store accurately.");
  return number;
}

export function toMinor(value, currency = "USD") {
  const input = String(value).trim();
  const negative = input.startsWith("-");
  const { units, places } = decimalParts(negative ? input.slice(1) : input);
  const digits = digitsFor(currency);
  if (places > digits)
    throw new Error(`Use up to ${digits} decimal places for ${currency}.`);
  const minor = safeInteger(units * 10n ** BigInt(digits - places));
  return negative ? -minor : minor;
}

export function fromMinor(minor, currency = "USD") {
  if (!Number.isSafeInteger(minor))
    throw new Error("Enter a whole number of minor units.");
  const digits = digitsFor(currency);
  const value = String(Math.abs(minor)).padStart(digits + 1, "0");
  const result = digits
    ? value.slice(0, -digits) + "." + value.slice(-digits)
    : value;
  return minor < 0 ? "-" + result : result;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@-]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text))
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function exportCSV(headers, rows) {
  return (
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
