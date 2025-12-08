export const messages = {
    orchestrator: {
        planFinished: "Plan finished.",
        planCompletedErrors: "Plan completed with some errors.",
        planCompletedSuccess: "Plan completed successfully.",
        routeFailed: "Failed to route request.",
        stepExecutionFailed: "Step execution failed: ",
        unknownError: "Unknown error",
        planFinishedErrors: "Plan finished with errors."
    },
    codeAnalysis: {
        noAnalysis: "No analysis found in response",
        analysisTooShort: "Analysis is too short",
        missingClarification: "Missing clarification question",
        invalidOutput: "Output must be a string (markdown) or a clarification object",
        requestingClarification: "Requesting clarification...",
        analysisFailed: "<!-- Analysis generation failed -->",
        generationFailed: (error: string) => `<!-- Failed to generate analysis: ${error} -->`
    }
};
