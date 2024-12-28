import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Google AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// Define different agent types
export type AgentRole = 'master' | 'emotional' | 'tutor' | 'researcher' | 'validator';

export type AgentState = {
  messages: string[];
  currentStep: string;
  emotionalState: string;
  context: {
    role: AgentRole;
    analysis: any;
    recommendations: any;
  };
};

// Create specialized agents
const createEmotionalAgent = (model: any) => async (state: AgentState) => {
  const result = await model.generateContent(`
    Analyze emotional state: "${state.messages[state.messages.length - 1]}"
  `);
  return {
    ...state,
    context: {
      ...state.context,
      analysis: { emotional: result.response.text() }
    }
  };
};

const createResearcherAgent = (model: any) => async (state: AgentState) => {
  const result = await model.generateContent(`
    Research context for: "${state.messages[state.messages.length - 1]}"
    Provide relevant educational resources and concepts.
  `);
  return {
    ...state,
    context: {
      ...state.context,
      analysis: { research: result.response.text() }
    }
  };
};

const createValidatorAgent = (model: any) => async (state: AgentState) => {
  const result = await model.generateContent(`
    Validate accuracy of response considering:
    Emotional state: ${state.context.analysis.emotional}
    Research: ${state.context.analysis.research}
  `);
  return {
    ...state,
    context: {
      ...state.context,
      recommendations: result.response.text()
    }
  };
};

// Master agent to orchestrate
const createMasterAgent = (model: any) => async (state: AgentState) => {
  const result = await model.generateContent(`
    Synthesize final response based on:
    Emotional analysis: ${state.context.analysis.emotional}
    Research context: ${state.context.analysis.research}
    Validation: ${state.context.recommendations}
    
    Create a comprehensive, empathetic, and accurate response.
  `);
  return {
    ...state,
    messages: [...state.messages, result.response.text()]
  };
};

// Create the orchestrated workflow

export const createOrchestrationAgent = async () => {

  const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Changed from "learnlm-1.5-pro-experimental" to "gemini-pro"


  const workflow = new AgentGraph()

    .addNode("emotional_analysis", createEmotionalAgent(model))

    .addNode("research", createResearcherAgent(model))

    .addNode("validation", createValidatorAgent(model))

    .addNode("master", createMasterAgent(model))

    .setEntryPoint("emotional_analysis")

    .addEdge("emotional_analysis", "research")

    .addEdge("research", "validation")

    .addEdge("validation", "master");


  return workflow;

};

// Add AgentGraph class if not already defined elsewhere
class AgentGraph {
  private nodes: Map<string, Function>;
  private edges: Map<string, string[]>;
  private entryPoint: string;

  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.entryPoint = '';
  }

  addNode(name: string, fn: Function) {
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string) {
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }
    this.edges.get(from)?.push(to);
    return this;
  }

  setEntryPoint(name: string) {
    this.entryPoint = name;
    return this;
  }

  async execute(initialState: AgentState) {
    let currentNode = this.entryPoint;
    let state = initialState;

    while (currentNode) {
      const nodeFn = this.nodes.get(currentNode);
      if (nodeFn) {
        state = await nodeFn(state);
      }

      const nextNodes = this.edges.get(currentNode) || [];
      currentNode = nextNodes[0]; // Simple linear flow
    }

    return state;
  }
}