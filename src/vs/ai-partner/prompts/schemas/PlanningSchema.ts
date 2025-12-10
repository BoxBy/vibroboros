/**
 * JSON Schema for OrchestratorAgent's create_execution_plan function
 * Based on Structured Outputs + Function Calling best practices
 */

export interface PlanningAnalysis {
	complexity_score: number; // 1-10 scale
	requires_decomposition: boolean;
	workflow_phases: Phase[];
	reasoning: string;
}

export type Phase = 
	| 'brainstorm'
	| 'design'
	| 'implement'
	| 'document'
	| 'test'
	| 'analyze'
	| 'optimize';

export interface ExecutionStep {
	step_number: number;
	phase: Phase;
	description: string; // Specific, actionable description with explicit filenames
	target_agent: AgentName;
	dependencies: number[]; // Step numbers that must complete before this step
	estimated_time?: string; // e.g., "5min", "2hour"
}

export type AgentName =
	| 'OrchestratorAgent'
	| 'CodeEditAgent'
	| 'TestGenerationAgent'
	| 'DocumentationGenerationAgent'
	| 'ReadmeGenerationAgent'
	| 'CodeAnalysisAgent'
	| 'SecurityAnalysisAgent'
	| 'RefactoringSuggestionAgent'
	| 'BrainstormAgent'
	| 'ContextManagementAgent'
	| 'TaskDecompositionAgent'
	| 'Conversational';

export interface ExecutionPlan {
	analysis: PlanningAnalysis;
	plan: ExecutionStep[];
}

/**
 * JSON Schema for LLM Function Calling
 */
export const CREATE_EXECUTION_PLAN_SCHEMA = {
	name: 'create_execution_plan',
	description: 'Analyze user request and create multi-agent execution plan',
	parameters: {
		type: 'object',
		properties: {
			analysis: {
				type: 'object',
				properties: {
					complexity_score: {
						type: 'number',
						minimum: 1,
						maximum: 10,
						description: '1-3: Simple, 4-6: Moderate, 7-8: Complex, 9-10: Very Complex'
					},
					requires_decomposition: {
						type: 'boolean',
						description: 'Whether hierarchical decomposition is needed'
					},
					workflow_phases: {
						type: 'array',
						items: {
							type: 'string',
							enum: ['brainstorm', 'design', 'implement', 'document', 'test', 'analyze', 'optimize']
						},
						description: 'Detected phases in natural execution order'
					},
					reasoning: {
						type: 'string',
						description: 'LLM thought process for this plan'
					}
				},
				required: ['complexity_score', 'requires_decomposition', 'workflow_phases', 'reasoning']
			},
			plan: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						step_number: { 
							type: 'integer', 
							minimum: 1 
						},
						phase: {
							type: 'string',
							enum: ['brainstorm', 'design', 'implement', 'document', 'test', 'analyze', 'optimize']
						},
						description: {
							type: 'string',
							description: 'Clear, actionable step with specific filenames (e.g., "Add validateEmail() to src/utils/validation.ts")'
						},
						target_agent: {
							type: 'string',
							enum: [
								'OrchestratorAgent',
								'CodeEditAgent',
								'TestGenerationAgent',
								'DocumentationGenerationAgent',
								'ReadmeGenerationAgent',
								'CodeAnalysisAgent',
								'SecurityAnalysisAgent',
								'RefactoringSuggestionAgent',
								'BrainstormAgent',
								'ContextManagementAgent',
								'TaskDecompositionAgent',
								'Conversational'
							]
						},
						dependencies: {
							type: 'array',
							items: { type: 'integer' },
							description: 'Step numbers that must complete before this step'
						},
						estimated_time: {
							type: 'string',
							pattern: '^\\d+(sec|min|hour|day)$',
							description: 'Estimated time to complete (e.g., "5min", "2hour")'
						}
					},
					required: ['step_number', 'phase', 'description', 'target_agent', 'dependencies']
				},
				minItems: 1
			}
		},
		required: ['analysis', 'plan']
	},
	strict: true
} as const;
