export type DataRecord = {
    id: string;
    data: any;
    expiresAt: number;
}

export class TempDataStore {
    entries: Map<string, DataRecord> = new Map();
    intervalId: NodeJS.Timeout | null = null;
    constructor(interval: number = 1000) {
        this.intervalId = setInterval(() => {
            this.cleanupExpiredEntries();
        }, interval);
    }

    addEntry(id: string, data: any, expiresInMs: number): void {
        const expiresAt = Date.now() + expiresInMs;
        this.entries.set(id, { id, data, expiresAt });
    }

    getEntry(id: string): DataRecord | undefined {
        return this.entries.get(id);
    }

    removeEntry(id: string): void {
        this.entries.delete(id);
    }

    cleanupExpiredEntries(): void {
        const now = Date.now();
        const toDelete: string[] = [];
        for (const [id, record] of this.entries) {
            if (record.expiresAt <= now) {
                toDelete.push(id);
            }
        }
        for (const id of toDelete) {
            this.entries.delete(id);
        }
    }
}