/**
 * gen-todo.ts
 *
 * Reads .spool/events/*.jsonl and generates TODO.md with all open tasks,
 * grouped by stream and ordered by priority.
 *
 * Usage: bun scripts/gen-todo.ts [repo-root]
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// --- Spool event types ---

interface SpoolEventBase {
	v: number;
	op: string;
	id: string;
	ts: string;
	by: string;
	branch?: string;
}

interface CreateStreamData {
	name: string;
	description: string;
}

interface CreateData {
	title: string;
	description: string;
	priority?: string;
	stream: string;
	tags?: string[];
}

interface CompleteData {
	resolution: string;
}

interface AssignData {
	to: string | null;
}

interface CreateStreamEvent extends SpoolEventBase {
	op: "create_stream";
	d: CreateStreamData;
}

interface CreateEvent extends SpoolEventBase {
	op: "create";
	d: CreateData;
}

interface CompleteEvent extends SpoolEventBase {
	op: "complete";
	d: CompleteData;
}

interface AssignEvent extends SpoolEventBase {
	op: "assign";
	d: AssignData;
}

type SpoolEvent =
	| CreateStreamEvent
	| CreateEvent
	| CompleteEvent
	| AssignEvent
	| SpoolEventBase;

// --- State types ---

interface Task {
	id: string;
	title: string;
	priority: string;
	stream: string;
	assignee: string | null;
	status: "open" | "closed";
}

interface Stream {
	id: string;
	name: string;
}

// --- Event parsing ---

async function readAllEvents(spoolDir: string): Promise<SpoolEvent[]> {
	const eventsDir = join(spoolDir, "events");
	let files: string[];
	try {
		files = await readdir(eventsDir);
	} catch {
		console.error(`No .spool/events directory found at ${eventsDir}`);
		process.exit(1);
	}

	const jsonlFiles = files.filter((f) => f.endsWith(".jsonl")).sort();
	const events: SpoolEvent[] = [];

	for (const file of jsonlFiles) {
		const content = await readFile(join(eventsDir, file), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				// biome-ignore lint/suspicious/noExplicitAny: JSON.parse returns any; we type-narrow via op field
				events.push(JSON.parse(trimmed) as SpoolEvent);
			} catch {
				// skip malformed lines
			}
		}
	}

	return events;
}

// --- State building ---

function buildState(events: SpoolEvent[]): {
	tasks: Map<string, Task>;
	streams: Map<string, Stream>;
} {
	const tasks = new Map<string, Task>();
	const streams = new Map<string, Stream>();

	for (const event of events) {
		if (event.op === "create_stream") {
			const e = event as CreateStreamEvent;
			streams.set(e.id, { id: e.id, name: e.d.name });
		} else if (event.op === "create") {
			const e = event as CreateEvent;
			tasks.set(e.id, {
				id: e.id,
				title: e.d.title,
				priority: e.d.priority ?? "p3",
				stream: e.d.stream,
				assignee: null,
				status: "open",
			});
		} else if (event.op === "complete") {
			const task = tasks.get(event.id);
			if (task) task.status = "closed";
		} else if (event.op === "assign") {
			const e = event as AssignEvent;
			const task = tasks.get(e.id);
			if (task) task.assignee = e.d.to;
		}
	}

	return { tasks, streams };
}

// --- TODO generation ---

const PRIORITY_RANK: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

function priorityRank(p: string): number {
	return PRIORITY_RANK[p] ?? 4;
}

function generateTodo(
	tasks: Map<string, Task>,
	streams: Map<string, Stream>,
): string {
	// Collect open tasks grouped by stream
	const byStream = new Map<string, Task[]>();
	for (const task of tasks.values()) {
		if (task.status !== "open") continue;
		const list = byStream.get(task.stream) ?? [];
		list.push(task);
		byStream.set(task.stream, list);
	}

	if (byStream.size === 0) {
		return "## Todo\n\nNo open tasks.\n";
	}

	// Sort streams by their highest-priority task (lowest rank number)
	const streamEntries = [...byStream.entries()].sort(([, a], [, b]) => {
		const aRank = Math.min(...a.map((t) => priorityRank(t.priority)));
		const bRank = Math.min(...b.map((t) => priorityRank(t.priority)));
		return aRank - bRank;
	});

	const lines: string[] = ["## Todo", ""];

	for (const [streamId, streamTasks] of streamEntries) {
		const streamName = streams.get(streamId)?.name ?? streamId;

		// Sort tasks within stream by priority
		const sorted = [...streamTasks].sort(
			(a, b) => priorityRank(a.priority) - priorityRank(b.priority),
		);

		lines.push(`**${streamName}**`, "");
		for (const task of sorted) {
			const suffix = task.assignee ? ` (${task.assignee})` : "";
			lines.push(`- [ ] ${task.title}${suffix}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

// --- Main ---

async function main(): Promise<void> {
	const repoRoot = process.argv[2] ?? ".";
	const spoolDir = join(repoRoot, ".spool");
	const outputPath = join(repoRoot, "TODO.md");

	const events = await readAllEvents(spoolDir);
	const { tasks, streams } = buildState(events);
	const todo = generateTodo(tasks, streams);

	await writeFile(outputPath, todo, "utf-8");

	const openCount = [...tasks.values()].filter(
		(t) => t.status === "open",
	).length;
	const totalCount = tasks.size;
	console.log(
		`Generated ${outputPath} (${openCount} open / ${totalCount} total tasks)`,
	);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
