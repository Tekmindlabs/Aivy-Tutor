import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createOrchestrationAgent, AgentRole, AgentState } from "@/lib/ai/agents";
import { StreamingTextResponse, LangChainStream } from 'ai';
import { prisma } from "@/lib/prisma";

// Define the ChatCompletionMessage type since it's not exported from ai/react
interface ChatCompletionMessage {
  content: string;
  role: 'user' | 'assistant' | 'system';
}

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user?.id) {
      return new Response("User not found", { status: 404 });
    }

    const { messages }: { messages: ChatCompletionMessage[] } = await req.json();
    
    if (!messages?.length) {
      return new Response("No messages provided", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1].content;
    
    // Create stream with proper arguments
    const { stream, handlers } = LangChainStream({
      experimental_streamData: true
    });

    // Create chat record
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        message: lastMessage,
        response: "",
      },
    });

    (async () => {
      try {
        const workflow = await createOrchestrationAgent();
        const initialState: AgentState = {
          messages: [lastMessage],
          currentStep: "emotional_analysis",
          emotionalState: "",
          context: {
            role: "master" as AgentRole,
            analysis: {},
            recommendations: {}
          }
        };

        const result = await workflow.execute(initialState);
        
        if (!result?.messages?.length) {
          throw new Error("Invalid response from workflow");
        }

        const response = result.messages[result.messages.length - 1];

        const chunks = response.split(/(\n\n|\n(?=[#-]))/);
        for (const chunk of chunks) {
          if (chunk.trim()) {
            await handlers.handleLLMNewToken(chunk);
          }
        }

        await handlers.handleLLMEnd();

        await prisma.chat.update({
          where: { id: chat.id },
          data: { response },
        });

      } catch (error) {
        console.error("Workflow error:", error);
        
        const errorMessage = error instanceof Error 
          ? `Error: ${error.message}`
          : "An unexpected error occurred";

        await handlers.handleLLMNewToken(errorMessage);
        await handlers.handleLLMEnd();

        await prisma.chat.update({
          where: { id: chat.id },
          data: { response: errorMessage },
        });
      }
    })();

    return new StreamingTextResponse(stream);
    
  } catch (error) {
    console.error("API error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        Chat: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    return new Response(
      JSON.stringify({ chats: user.Chat }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error("Get chats error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}