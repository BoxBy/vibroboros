import { SystemPromptContext } from '../types';

export const Objective = (context: SystemPromptContext) => {
    return `Task:
Respond to the user. If the request is a simple greeting, reply briefly and ask what to do next.
If you need internal analysis, include it inside <THOUGHT>...</THOUGHT> and do NOT include it in the final user-facing text.`;
};

