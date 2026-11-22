import { InMemoryJournal } from "../../src/journal/memory.ts";
import { journalSuite } from "./suite.ts";

journalSuite("InMemoryJournal", (opts) => new InMemoryJournal(opts));
