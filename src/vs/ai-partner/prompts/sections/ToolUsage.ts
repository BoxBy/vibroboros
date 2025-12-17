export function getToolUsage(): string {
    return `<!-- TOOL & ACTION GUIDELINES -->
<tool_usage>
## TOOLS
- \`read_file\`: Read file content. Usage: \`read_file(absolute_path, startLine?, endLine?)\`.
- \`create_file\`: Create new file (e.g. repro scripts). Usage: \`create_file(file_path, content)\`.
- \`replace_file_content\`: Apply edits. **Inputs**: \`TargetFile\`, \`TargetContent\` (Match Strict), \`ReplacementContent\`.
- \`list_dir\`: Explore directories. Usage: \`list_dir(path)\`.
- \`grep_search\`: Find patterns. Usage: \`grep_search(query, search_path)\`.
- \`run_command\`: Execute shell. Usage: \`run_command(command, cwd?)\`.
- \`task_boundary\`: Manage high-level task state.
- \`search_web\`: Search the internet (if available).
</tool_usage>`;
}
