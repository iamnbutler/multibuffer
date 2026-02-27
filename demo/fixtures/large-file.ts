// Simulates a large file — tests excerpt selection from a big buffer.
// 500 lines of generated content.

interface Record {
  id: number;
  name: string;
  value: number;
  active: boolean;
}

function processRecord(record: Record): string {
  if (!record.active) {
    return `[SKIP] ${record.name}`;
  }
  const adjusted = record.value * 1.15;
  return `[OK] ${record.name}: ${adjusted.toFixed(2)}`;
}

function validateRecord(record: Record): boolean {
  if (record.id < 0) return false;
  if (record.name.length === 0) return false;
  if (record.value < 0 || record.value > 10000) return false;
  return true;
}

// --- Begin generated data ---

const data: Record[] = [
  { id: 0, name: "record_000", value: 42.00, active: true },
  { id: 1, name: "record_001", value: 87.50, active: false },
  { id: 2, name: "record_002", value: 123.75, active: true },
  { id: 3, name: "record_003", value: 9.99, active: true },
  { id: 4, name: "record_004", value: 500.00, active: false },
  { id: 5, name: "record_005", value: 0.01, active: true },
  { id: 6, name: "record_006", value: 999.99, active: true },
  { id: 7, name: "record_007", value: 250.50, active: false },
  { id: 8, name: "record_008", value: 75.25, active: true },
  { id: 9, name: "record_009", value: 333.33, active: true },
  { id: 10, name: "record_010", value: 1000.00, active: false },
  { id: 11, name: "record_011", value: 50.00, active: true },
  { id: 12, name: "record_012", value: 175.80, active: true },
  { id: 13, name: "record_013", value: 420.69, active: false },
  { id: 14, name: "record_014", value: 88.88, active: true },
  { id: 15, name: "record_015", value: 12.34, active: true },
  { id: 16, name: "record_016", value: 567.89, active: false },
  { id: 17, name: "record_017", value: 0.50, active: true },
  { id: 18, name: "record_018", value: 1500.00, active: true },
  { id: 19, name: "record_019", value: 99.99, active: false },
  { id: 20, name: "record_020", value: 200.00, active: true },
  { id: 21, name: "record_021", value: 350.25, active: true },
  { id: 22, name: "record_022", value: 775.00, active: false },
  { id: 23, name: "record_023", value: 15.00, active: true },
  { id: 24, name: "record_024", value: 890.10, active: true },
  { id: 25, name: "record_025", value: 45.67, active: false },
  { id: 26, name: "record_026", value: 2000.00, active: true },
  { id: 27, name: "record_027", value: 100.00, active: true },
  { id: 28, name: "record_028", value: 625.50, active: false },
  { id: 29, name: "record_029", value: 33.33, active: true },
];

// --- Processing pipeline ---

function pipeline(records: Record[]): string[] {
  return records
    .filter(validateRecord)
    .filter((r) => r.active)
    .map(processRecord)
    .sort();
}

const results = pipeline(data);

for (const result of results) {
  console.log(result);
}

// --- Statistics ---

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const activeValues = data.filter((r) => r.active).map((r) => r.value);

console.log("--- Statistics ---");
console.log(`Count:  ${activeValues.length}`);
console.log(`Mean:   ${mean(activeValues).toFixed(2)}`);
console.log(`Median: ${median(activeValues).toFixed(2)}`);
console.log(`StdDev: ${stddev(activeValues).toFixed(2)}`);
console.log(`Min:    ${Math.min(...activeValues).toFixed(2)}`);
console.log(`Max:    ${Math.max(...activeValues).toFixed(2)}`);

// --- More padding to simulate a larger file ---

function identity<T>(x: T): T { return x; }
function constant<T>(x: T): () => T { return () => x; }
function compose<A, B, C>(f: (b: B) => C, g: (a: A) => B): (a: A) => C { return (a) => f(g(a)); }
function pipe<A, B, C>(g: (a: A) => B, f: (b: B) => C): (a: A) => C { return (a) => f(g(a)); }

const double = (x: number) => x * 2;
const increment = (x: number) => x + 1;
const square = (x: number) => x * x;
const negate = (x: number) => -x;
const abs = (x: number) => Math.abs(x);
const toStr = (x: number) => String(x);
const toNumber = (x: string) => Number(x);
const isEven = (x: number) => x % 2 === 0;
const isPositive = (x: number) => x > 0;
const clamp = (min: number, max: number) => (x: number) => Math.min(max, Math.max(min, x));

export {
  data,
  pipeline,
  results,
  mean,
  median,
  stddev,
  identity,
  constant,
  compose,
  pipe,
  double,
  increment,
  square,
  negate,
  abs,
  toStr,
  toNumber,
  isEven,
  isPositive,
  clamp,
};
