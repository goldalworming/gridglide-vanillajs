/** One undoable step. Steps are undone in reverse order, so indices recorded by a step stay valid. */
export interface UndoStep {
    readonly undo: () => void;
    readonly redo: () => void;
}

/** Linear undo/redo history: a new step clears the redo stack. */
export class UndoHistory {
    private done: UndoStep[] = [];
    private undone: UndoStep[] = [];

    constructor(private readonly limit = 100) {}

    public get canUndo(): boolean {
        return this.done.length > 0;
    }

    public get canRedo(): boolean {
        return this.undone.length > 0;
    }

    public push(step: UndoStep): void {
        this.done.push(step);
        if (this.done.length > this.limit) this.done.shift();
        this.undone = [];
    }

    public undo(): boolean {
        const step = this.done.pop();
        if (step === undefined) return false;
        step.undo();
        this.undone.push(step);
        return true;
    }

    public redo(): boolean {
        const step = this.undone.pop();
        if (step === undefined) return false;
        step.redo();
        this.done.push(step);
        return true;
    }

    public clear(): void {
        this.done = [];
        this.undone = [];
    }
}
