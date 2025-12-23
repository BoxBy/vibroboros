export function getToolUsage(): string {
    return `<!-- TOOL & ACTION GUIDELINES -->
<tool_usage>
## TOOLS
- \`read_file\`: Read file content. Usage: \`read_file(filePath, startLine?, endLine?)\`.
- \`write_to_file\`: Create or overwrite file. Usage: \`write_to_file(filePath, content)\`.
- \`replace_file_content\`: Apply edits. Usage: \`replace_file_content(filePath, targetContent, replacementContent)\`.
- \`list_dir\`: Explore directories. Usage: \`list_dir(dirPath, recursive?)\`.
- \`grep_search\`: Find patterns. Usage: \`grep_search(query, search_path?)\`.
- \`run_command\`: Execute shell. Usage: \`run_command(command)\`.
- \`task_boundary\`: Manage high-level task state.
- \`web_search\`: Search the internet. Usage: \`web_search(query)\`.
</tool_usage>`;
}
