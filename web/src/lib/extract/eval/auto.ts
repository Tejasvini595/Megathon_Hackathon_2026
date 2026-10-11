import { autoExtractor } from "../llm";

/** The production extractor (LLM reader plus the decision model), for `bun --conditions react-server src/lib/extract/eval/run.ts ./auto.ts`. */
export const extract = autoExtractor;
