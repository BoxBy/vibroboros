// This script will be run in the webview

(function () {
    const vscode = acquireVsCodeApi();
    const agentListContainer = document.getElementById('agent-list-container');
    const taskListContainer = document.getElementById('task-list-container');
    const clearTasksButton = document.getElementById('clear-tasks-button');
    const tasks = new Map();

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.command) {
            case 'updateAgents':
                renderAgentCards(message.cards);
                break;
            case 'updateTask':
                updateAndRenderTask(message.task);
                break;
            case 'removeTasks':
                removeTasksFromView(message.taskIds);
                break;
        }
    });

    clearTasksButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'clearCompletedTasks' });
    });

    function removeTasksFromView(taskIds) {
        for (const taskId of taskIds) {
            tasks.delete(taskId);
        }
        renderTaskList();
    }

    function updateAndRenderTask(task) {
        const isExpanded = tasks.get(task.id)?.isExpanded || false;
        task.isExpanded = isExpanded;
        tasks.set(task.id, task);
        renderTaskList();
    }

    function renderTaskList() {
        if (!taskListContainer) return;

        if (tasks.size === 0) {
            taskListContainer.innerHTML = '<p>No active tasks.</p>';
            return;
        }

        const sortedTasks = Array.from(tasks.values()).sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp));
        taskListContainer.innerHTML = ''; // Clear and re-render

        for (const task of sortedTasks) {
            const taskElement = document.createElement('div');
            taskElement.className = `task-item ${task.status.state}`;
            if (task.isExpanded) {
                taskElement.classList.add('expanded');
            }
            taskElement.id = `task-${task.id}`;

            const messageText = task.status.message?.parts[0]?.text || `Task submitted...`;
            const isCancellable = !['completed', 'error', 'canceled'].includes(task.status.state);

            const cancelButtonHtml = isCancellable
                ? `<button class="cancel-button" data-task-id="${task.id}" title="Cancel Task">&times;</button>`
                : '';

            const resultText = task.artifacts?.[0]?.parts.find(p => p.kind === 'text')?.text || '';

            taskElement.innerHTML = `
                <div class="task-header">
                    ${cancelButtonHtml}
                    <span class="task-id">${escapeHtml(task.id)}</span>
                    <span class="task-status">(${escapeHtml(task.status.state)})</span>
                </div>
                <div class="task-message" title="${escapeHtml(messageText)}">${escapeHtml(messageText)}</div>
                <div class="task-details">${escapeHtml(resultText)}</div>
            `;
            taskListContainer.appendChild(taskElement);
        }

        // Add event listeners
        addEventListeners();
    }

    function addEventListeners() {
        // Cancel buttons
        taskListContainer.querySelectorAll('.cancel-button').forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                vscode.postMessage({ command: 'cancelTask', taskId: button.dataset.taskId });
            });
        });

        // Task items for expanding details
        taskListContainer.querySelectorAll('.task-item').forEach(item => {
            item.addEventListener('click', () => {
                const taskId = item.id.replace('task-', '');
                const task = tasks.get(taskId);
                if (task) {
                    task.isExpanded = !task.isExpanded;
                    item.classList.toggle('expanded');
                }
            });
        });
    }

    function renderAgentCards(cards) {
        // This function remains the same
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Initial render
    renderTaskList();
}());
