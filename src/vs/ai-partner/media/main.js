// This script will be run in the webview

(function () {
    const vscode = acquireVsCodeApi();
    const agentListContainer = document.getElementById('agent-list-container');
    const taskListContainer = document.getElementById('task-list-container');
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
        }
    });

    function updateAndRenderTask(task) {
        tasks.set(task.id, task);
        renderTaskList();
    }

    function renderTaskList() {
        if (!taskListContainer) return;

        if (tasks.size === 0) {
            taskListContainer.innerHTML = '<p>No active tasks.</p>';
            return;
        }

        taskListContainer.innerHTML = ''; // Clear and re-render
        const sortedTasks = Array.from(tasks.values()).sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp));

        for (const task of sortedTasks) {
            const taskElement = document.createElement('div');
            taskElement.className = `task-item ${task.status.state}`;
            taskElement.id = `task-${task.id}`;

            const messageText = task.status.message?.parts[0]?.text || `Task submitted...`;

            taskElement.innerHTML = `
                <div class="task-header">${escapeHtml(task.id)} (${escapeHtml(task.status.state)})</div>
                <div class="task-message" title="${escapeHtml(messageText)}">${escapeHtml(messageText)}</div>
            `;
            taskListContainer.appendChild(taskElement);
        }
    }

    function renderAgentCards(cards) {
        if (!agentListContainer) return;

        agentListContainer.innerHTML = ''; // Clear previous content

        if (!cards || cards.length === 0) {
            agentListContainer.innerHTML = '<p>No active agents found.</p>';
            return;
        }

        for (const card of cards) {
            const cardElement = document.createElement('div');
            cardElement.className = 'agent-card';

            let skillsHtml = '<ul class="skill-list">';
            for (const skill of card.skills) {
                skillsHtml += `
                    <li class="skill-item">
                        <button
                            class="skill-button"
                            data-skill-id="${skill.id}"
                            title="${escapeHtml(skill.description)}"
                        >
                            ${escapeHtml(skill.name)}
                        </button>
                    </li>`;
            }
            skillsHtml += '</ul>';

            cardElement.innerHTML = `
                <div class="agent-name">${escapeHtml(card.name)}</div>
                <p class="agent-description">${escapeHtml(card.description)}</p>
                ${skillsHtml}
            `;

            agentListContainer.appendChild(cardElement);
        }

        // Add event listeners to the newly created buttons
        agentListContainer.querySelectorAll('.skill-button').forEach(button => {
            button.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'executeSkill',
                    skillId: button.dataset.skillId,
                });
            });
        });
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
