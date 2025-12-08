/**
 * @interface CodeSummary
 * Represents a high-level summary of a source code file.
 */
export interface CodeSummary {
  /**
   * The absolute path of the file.
   */
  filePath: string;

  /**
   * The programming language of the file.
   */
  language: string;

  /**
   * A brief, human-readable description of the file's purpose.
   */
  description: string;

  /**
   * A list of major functions or classes defined in the file.
   */
  declarations: string[];

  /**
   * A list of other files that this file depends on.
   */
  dependencies: string[];
}

/**
 * @interface CallGraphNode
 * Represents a single function or method in the call graph.
 */
export interface CallGraphNode {
  /**
   * A unique identifier for the node, e.g., 'filePath#functionName'.
   */
  id: string;

  /**
   * The name of the function or method.
   */
  functionName: string;

  /**
   * The file path where the function is defined.
   */
  filePath: string;
}

/**
 * @interface CallGraphEdge
 * Represents a call from one function/method to another.
 */
export interface CallGraphEdge {
  /**
   * The ID of the node that is making the call.
   */
  from: string;

  /**
   * The ID of the node that is being called.
   */
  to: string;
}

/**
 * @interface CallGraph
 * Represents the entire call graph of the analyzed project, consisting of
 * nodes (functions) and edges (calls between them).
 */
export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}
